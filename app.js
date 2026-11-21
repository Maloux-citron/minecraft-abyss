/* =====================================================================
 *  MINECRAFT ABYSS — fond d'écran animé (Three.js / WebGL)
 *  Un skin Minecraft coule lentement des eaux ensoleillées jusqu'à la fosse
 *  des Mariannes. Compatible Wallpaper Engine (web) + navigateur.
 * ===================================================================== */
(() => {
'use strict';

/* ----------------------------------------------------------------------
 *  Réglages
 * -------------------------------------------------------------------- */
const DEFAULTS = {
  speed: 0.35, volume: 0.5, sound: true, pose: 'drift', arms: 'auto', palette: 'ocean',
  bloom: 1, bubbles: 1, quality: 'high', grain: 0.6, scale: 100, autoScale: true,
  hud: true, hudPos: 'br', loop: true, life: true, lamp: true,
  offset: 0, username: '', skinFile: ''
};
const S = Object.assign({}, DEFAULTS);
const STORE_KEY = 'mcabyss.v2';
const IN_WE = { v: false };

function loadStore() {
  try { Object.assign(S, JSON.parse(localStorage.getItem(STORE_KEY) || '{}')); } catch (e) {}
}
function saveStore() {
  if (IN_WE.v) return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {}
}
loadStore();

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);

/* ----------------------------------------------------------------------
 *  Constantes monde
 * -------------------------------------------------------------------- */
const FOV = 38;
const CAM_Z = 6.6;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const M_PER_UNIT = 6;          // 1 unité de scroll = 6 m de profondeur
const BASE_V = 1.5;            // unités / seconde (vitesse visuelle)
const START_SCROLL = 1.4;      // on commence juste sous la surface
const MAX_DEPTH = 10935;       // Challenger Deep

/* ----------------------------------------------------------------------
 *  Renderer
 * -------------------------------------------------------------------- */
const canvas = $('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
} catch (e) {
  $('err').style.display = 'flex';
  throw e;
}
renderer.setClearColor(0x01060d, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a5070, 0.05);
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
camera.position.set(0, 0.1, CAM_Z);
camera.lookAt(0, 0.1, 0);

let rtScene, rtA, rtB, W = 1, H = 1, pixelK = 1;

const dyn = { s: 1 };            // échelle dynamique (ajustée automatiquement pour rester fluide)
let qualityHook = null;
function qualityPR() {
  const dpr = window.devicePixelRatio || 1;
  let base = S.quality === 'low' ? Math.min(dpr, 0.75) : S.quality === 'med' ? Math.min(dpr, 1) : Math.min(dpr, 1.5);
  return Math.max(0.3, base * clamp(S.scale / 100, 0.4, 1) * (S.autoScale ? dyn.s : 1));
}

function buildTargets() {
  if (rtScene) { rtScene.dispose(); rtA.dispose(); rtB.dispose(); }
  const ms = S.quality === 'low' ? 0 : S.quality === 'med' ? 2 : 4;
  rtScene = new THREE.WebGLRenderTarget(W, H, { samples: ms, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const bw = Math.max(2, Math.floor(W / 4)), bh = Math.max(2, Math.floor(H / 4));
  const o = { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  rtA = new THREE.WebGLRenderTarget(bw, bh, o);
  rtB = new THREE.WebGLRenderTarget(bw, bh, o);
}

function resize() {
  renderer.setPixelRatio(qualityPR());
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  W = size.x; H = size.y;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  pixelK = H / (2 * TAN);
  buildTargets();
  if (U) { U.pointK.value = pixelK; U.aspect.value = W / H; }
  applyOffset();
  if (qualityHook) qualityHook();
}

/* ----------------------------------------------------------------------
 *  Uniformes partagés
 * -------------------------------------------------------------------- */
const U = {
  time: { value: 0 }, scroll: { value: START_SCROLL }, aspect: { value: 1 }, pointK: { value: 1000 },
  vel: { value: 0 }, lampOn: { value: 0 },
  player: { value: new THREE.Vector3() }
};

/* ----------------------------------------------------------------------
 *  Environnement (couleurs selon la profondeur)
 * -------------------------------------------------------------------- */
const KF = [
  { d: 0,     top: [.55, .90, .95], mid: [.10, .62, .80], bot: [.03, .36, .58], rays: 1.00, snow: .90, fog: .030, sun: 1.00 },
  { d: 40,    top: [.30, .78, .92], mid: [.05, .50, .72], bot: [.02, .28, .50], rays: .90,  snow: .90, fog: .035, sun: .95 },
  { d: 150,   top: [.10, .55, .80], mid: [.02, .34, .58], bot: [.01, .18, .38], rays: .60,  snow: .70, fog: .040, sun: .70 },
  { d: 350,   top: [.03, .30, .56], mid: [.01, .17, .38], bot: [0, .08, .22],   rays: .30,  snow: .50, fog: .045, sun: .35 },
  { d: 700,   top: [.01, .15, .35], mid: [0, .08, .22],   bot: [0, .03, .10],   rays: .12,  snow: .35, fog: .050, sun: .12 },
  { d: 1200,  top: [0, .07, .20],   mid: [0, .035, .11],  bot: [0, .012, .05],  rays: .04,  snow: .25, fog: .055, sun: .03 },
  { d: 2500,  top: [0, .035, .09],  mid: [0, .018, .05],  bot: [0, .006, .025], rays: 0,    snow: .18, fog: .060, sun: 0 },
  { d: 6000,  top: [.006, .022, .05], mid: [.003, .012, .03], bot: [.002, .006, .016], rays: 0, snow: .15, fog: .065, sun: 0 },
  { d: 10935, top: [.014, .02, .03], mid: [.008, .012, .02], bot: [.004, .006, .01], rays: 0,  snow: .15, fog: .070, sun: 0 }
];
const PALETTES = {
  ocean:  [1, 1, 1],
  tropic: [.62, 1.12, .98],
  green:  [.50, 1.12, .66],
  violet: [1.18, .62, 1.30]
};
const env = { top: [0, 0, 0], mid: [0, 0, 0], bot: [0, 0, 0], rays: 1, snow: 1, fog: .03, sun: 1 };
function envAt(d) {
  let i = 0;
  while (i < KF.length - 2 && d > KF[i + 1].d) i++;
  const a = KF[i], b = KF[i + 1];
  const t = clamp((d - a.d) / (b.d - a.d), 0, 1);
  const pm = PALETTES[S.palette] || PALETTES.ocean;
  for (const k of ['top', 'mid', 'bot']) {
    for (let c = 0; c < 3; c++) env[k][c] = clamp(lerp(a[k][c], b[k][c], t) * pm[c], 0, 1);
  }
  env.rays = lerp(a.rays, b.rays, t);
  env.snow = lerp(a.snow, b.snow, t);
  env.fog = lerp(a.fog, b.fog, t);
  env.sun = lerp(a.sun, b.sun, t);
  return env;
}

/* ----------------------------------------------------------------------
 *  GLSL commun
 * -------------------------------------------------------------------- */
const NOISE = `
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+vec2(7.1,3.7); a*=.5; } return s; }
`;

/* ----------------------------------------------------------------------
 *  Fond : dégradé d'eau + surface + rayons de lumière
 * -------------------------------------------------------------------- */
const bgMat = new THREE.ShaderMaterial({
  depthTest: false, depthWrite: false,
  uniforms: {
    uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uBot: { value: new THREE.Color() },
    uTime: U.time, uScroll: U.scroll, uAspect: U.aspect,
    uRays: { value: 1 }, uSun: { value: 1 }, uSurf: { value: 2 }
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy*.5+.5; gl_Position = vec4(position.xy, 1., 1.); }`,
  fragmentShader: `
    varying vec2 vUv;
    uniform vec3 uTop, uMid, uBot; uniform float uTime, uScroll, uAspect, uRays, uSun, uSurf;
    ${NOISE}
    void main(){
      vec2 uv = vUv;
      vec3 col = mix(uBot, uMid, smoothstep(0., .5, uv.y));
      col = mix(col, uTop, smoothstep(.42, 1., uv.y));

      // turbidité : grandes nappes qui montent avec la chute
      vec2 p = vec2(uv.x*uAspect, uv.y - uScroll*.012) * 1.7;
      float n = fbm(p + vec2(uTime*.012, 0.));
      col *= .86 + .30*n;

      // rayons de lumière (convergent vers le soleil au-dessus)
      float sx = (uv.x-.5)*uAspect;
      float a = sx + (1.-uv.y)*.42 + .10*sin(uTime*.045);
      float beams = noise(vec2(a*7.,  uTime*.05))*.55 + noise(vec2(a*19.+3., uTime*.08))*.30 + noise(vec2(a*41.+9., uTime*.11))*.15;
      beams = smoothstep(.38, .88, beams);
      float vf = pow(uv.y, 1.5);
      col += vec3(.55,.92,1.) * beams * vf * uRays * .60;

      // halo du soleil
      float g = length(vec2(sx*.6, (1.-uv.y)*1.05));
      col += vec3(.65,.95,1.) * exp(-g*g*1.6) * uSun * .38;

      // surface vue d'en dessous
      if (uSurf < 1.6) {
        float edge = uSurf + (fbm(vec2(uv.x*uAspect*5.+uTime*.18, uTime*.07))-.5)*.05
                           + sin(uv.x*uAspect*23.+uTime*1.3)*.003;
        float mask = smoothstep(edge-.004, edge+.014, uv.y);
        float sp = pow(noise(vec2(uv.x*uAspect*55.+uTime*.6, (uv.y-edge)*90.)), 3.)*2.2;
        vec3 surf = vec3(.80,.97,1.) * (.78 + .32*fbm(vec2(uv.x*uAspect*9.-uTime*.2, uv.y*14.))) + sp*.18;
        float below = exp(-max(edge-uv.y, 0.)*9.);
        col += vec3(.45,.85,1.) * below * .35 * step(uv.y, edge);
        col = mix(col, surf, mask);
      }
      gl_FragColor = vec4(col, 1.);
    }`
});
const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
bgMesh.frustumCulled = false; bgMesh.renderOrder = -100;
scene.add(bgMesh);

/* ----------------------------------------------------------------------
 *  Lumières
 * -------------------------------------------------------------------- */
const hemi = new THREE.HemisphereLight(0x88ccff, 0x04101e, 0.9);
const sunL = new THREE.DirectionalLight(0xe8ffff, 1.0);
sunL.position.set(2.2, 6, 3.2);
const rimL = new THREE.DirectionalLight(0x3aa8ff, 0.0);
rimL.position.set(-3, 2, -4);
const bioAmb = new THREE.AmbientLight(0x0a1a30, 0.5);
const lamp = new THREE.PointLight(0xfff0d0, 0, 14, 1.4);
scene.add(hemi, sunL, rimL, bioAmb, lamp);

/* ----------------------------------------------------------------------
 *  Skin Minecraft : texture + personnage 3D
 * -------------------------------------------------------------------- */
function paintDefaultSkin() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const R = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
  const SK = '#c28f6b', SKD = '#a97652', HAIR = '#3a2716', HAIR2 = '#4a331e', SHIRT = '#1aa7b0', SHIRT2 = '#148a93',
        PANT = '#3b3f9a', PANT2 = '#2f3380', SHOE = '#6b6b70', SHOE2 = '#55555a';
  const box = (u, v, w, h, d, cols) => {
    R(u + d, v, w, d, cols.top); R(u + d + w, v, w, d, cols.bottom);
    R(u, v + d, d, h, cols.right); R(u + d, v + d, w, h, cols.front);
    R(u + d + w, v + d, d, h, cols.left); R(u + 2 * d + w, v + d, w, h, cols.back);
  };
  const same = (c) => ({ top: c, bottom: c, right: c, front: c, left: c, back: c });
  // tête
  box(0, 0, 8, 8, 8, { top: HAIR, bottom: SKD, right: SK, front: SK, left: SK, back: HAIR });
  R(0, 8, 8, 3, HAIR); R(4, 11, 4, 1, HAIR);            // côté droit
  R(16, 8, 8, 3, HAIR); R(16, 11, 4, 1, HAIR);          // côté gauche
  R(8, 8, 8, 2, HAIR); R(8, 10, 1, 1, HAIR); R(15, 10, 1, 1, HAIR); // frange
  R(24, 8, 8, 6, HAIR2); R(24, 14, 8, 2, SK);            // arrière
  R(9, 12, 2, 1, '#ffffff'); R(10, 12, 1, 1, '#3d2f8f'); R(13, 12, 2, 1, '#ffffff'); R(13, 12, 1, 1, '#3d2f8f');
  R(11, 13, 2, 1, SKD); R(10, 14, 4, 1, '#8a5440');      // nez, bouche
  // corps
  box(16, 16, 8, 12, 4, same(SHIRT));
  R(16, 16, 8, 4, SKD); R(20, 16, 8, 4, SHIRT2);
  R(20, 20, 8, 12, SHIRT); R(20, 30, 8, 2, SHIRT2);
  // bras (droit 40,16 / gauche 32,48)
  for (const [u, v] of [[40, 16], [32, 48]]) {
    box(u, v, 4, 12, 4, same(SK));
    R(u + 4, v, 4, 4, SHIRT);
    R(u, v + 4, 16, 4, SHIRT);
    R(u + 4, v + 4 + 4, 4, 0, SK);
    R(u, v + 8, 16, 1, SHIRT2);
    R(u + 8, v, 4, 4, SKD);
  }
  // jambes (droite 0,16 / gauche 16,48)
  for (const [u, v] of [[0, 16], [16, 48]]) {
    box(u, v, 4, 12, 4, same(PANT));
    R(u, v + 4 + 9, 16, 3, SHOE); R(u + 8, v, 4, 4, SHOE2); R(u, v + 4 + 11, 16, 1, SHOE2);
    R(u + 4, v, 4, 4, PANT2);
  }
  // grain de pixel
  const id = x.getImageData(0, 0, 64, 64), dat = id.data;
  for (let i = 0; i < 4096; i++) {
    if (dat[i * 4 + 3] === 0) continue;
    const px = i % 64, py = (i / 64) | 0;
    let h = Math.sin(px * 12.9898 + py * 78.233) * 43758.5453; h -= Math.floor(h);
    const n = (h - .5) * 14;
    dat[i * 4] = clamp(dat[i * 4] + n, 0, 255); dat[i * 4 + 1] = clamp(dat[i * 4 + 1] + n, 0, 255); dat[i * 4 + 2] = clamp(dat[i * 4 + 2] + n, 0, 255);
  }
  x.putImageData(id, 0, 0);
  return c;
}

/** Convertit une image en canvas de skin « moderne » (carré). Gère 64×32 et les skins HD. */
function buildSkinCanvas(img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || (h !== w && h * 2 !== w)) throw new Error('Format de skin non reconnu (' + w + '×' + h + ')');
  const k = w / 64;
  const out = document.createElement('canvas'); out.width = out.height = 64 * k;
  const x = out.getContext('2d'); x.imageSmoothingEnabled = false;
  x.drawImage(img, 0, 0);
  if (h * 2 === w) {                              // ancien format 64×32 → on mirroite bras/jambe gauche
    const src = document.createElement('canvas'); src.width = out.width; src.height = out.height;
    src.getContext('2d').drawImage(out, 0, 0);
    const flip = (sx, sy, sw, sh, dx, dy) => {
      x.save(); x.translate((dx + sw) * k, dy * k); x.scale(-1, 1);
      x.drawImage(src, sx * k, sy * k, sw * k, sh * k, 0, 0, sw * k, sh * k); x.restore();
    };
    const limb = (su, sv, du, dv) => {
      flip(su + 4, sv, 4, 4, du + 4, dv);               // dessus
      flip(su + 8, sv, 4, 4, du + 8, dv);               // dessous
      flip(su, sv + 4, 4, 12, du + 8, dv + 4);          // côté droit → côté gauche
      flip(su + 4, sv + 4, 4, 12, du + 4, dv + 4);      // face
      flip(su + 8, sv + 4, 4, 12, du, dv + 4);          // côté gauche → côté droit
      flip(su + 12, sv + 4, 4, 12, du + 12, dv + 4);    // dos
    };
    limb(0, 16, 16, 48);   // jambe
    limb(40, 16, 32, 48);  // bras
    // « Notch hack » : sur les vieux skins, la zone du chapeau pleine et opaque est ignorée
    try {
      const hat = x.getImageData(Math.floor(32 * k), 0, Math.floor(32 * k), Math.floor(16 * k)).data;
      let opaque = true;
      for (let i = 3; i < hat.length; i += 4) if (hat[i] < 128) { opaque = false; break; }
      if (opaque) x.clearRect(32 * k, 0, 32 * k, 16 * k);
    } catch (e) { /* canvas verrouillé : on garde tel quel */ }
  }
  // Lecture des pixels : échoue si le navigateur a marqué l'image « non sûre » (fichier local) -> on refuse
  // proprement plutôt que de casser le rendu WebGL. Sert aussi à régler l'éclairage (skins très clairs).
  let gain = 1;
  try {
    const d = x.getImageData(0, 0, out.width, out.height).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 200) { sum += (d[i] * .30 + d[i + 1] * .59 + d[i + 2] * .11) / 255; n++; }
    }
    if (n) gain = clamp(.5 / (sum / n), .55, 1);
  } catch (e) { throw new Error('Image inaccessible (sécurité du navigateur)'); }
  return { canvas: out, k, modern: h === w, gain };
}

function detectSlim(cv, k, modern) {
  if (!modern) return false;
  try {
    const d = cv.getContext('2d').getImageData(Math.floor(54 * k), Math.floor(20 * k), Math.max(1, Math.floor(k)), Math.floor(12 * k)).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
    return true;
  } catch (e) { return false; }
}

// UV d'une boîte Minecraft (dépliage standard du skin)
function boxUV(geo, u, v, w, h, d) {
  const uv = geo.attributes.uv;
  const faces = [
    [u + d + w, v + d, d, h],          // +x  (flanc gauche du perso)
    [u, v + d, d, h],                  // -x  (flanc droit)
    [u + d, v, w, d],                  // +y  dessus
    [u + d + w, v, w, d],              // -y  dessous
    [u + d, v + d, w, h],              // +z  face
    [u + 2 * d + w, v + d, w, h]       // -z  dos
  ];
  for (let f = 0; f < 6; f++) {
    const [fx, fy, fw, fh] = faces[f];
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i, a = uv.getX(idx), b = uv.getY(idx);
      uv.setXY(idx, (fx + a * fw) / 64, 1 - (fy + (1 - b) * fh) / 64);
    }
  }
}

const player = new THREE.Group();   // position / inclinaison / rotation
const model = new THREE.Group();    // échelle 1/16 (1 px = 1/16 unité)
model.scale.setScalar(1 / 16);
player.add(model);
scene.add(player);

let skinTex = null, baseMat, overMat;
function makeMats(tex) {
  const base = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5 });
  const over = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.02 });
  return [base, over];
}

const parts = {};     // head, body, armR, armL, legR, legL  (pivots)
const meshes = {};    // meshes à reconstruire
let slimNow = null;

function makeBox(w, h, d, uvB, inflate, mat) {
  const g = new THREE.BoxGeometry(w + inflate, h + inflate, d + inflate);
  boxUV(g, uvB[0], uvB[1], w, h, d);
  return new THREE.Mesh(g, mat);
}

function buildPlayer(slim) {
  slimNow = slim;
  const aw = slim ? 3 : 4;
  const defs = [
    // nom, w,h,d, uvBase, uvOver, position pivot, décalage du mesh
    ['head',  8, 8, 8, [0, 0],   [32, 0],  [0, 8, 0],            [0, 4, 0],  1.0],
    ['body',  8, 12, 4, [16, 16], [16, 32], [0, 2, 0],            [0, 0, 0],  0.5],
    ['armR',  aw, 12, 4, [40, 16], [40, 32], [-(4 + aw / 2), 6, 0], [0, -4, 0], 0.5],
    ['armL',  aw, 12, 4, [32, 48], [48, 48], [(4 + aw / 2), 6, 0],  [0, -4, 0], 0.5],
    ['legR',  4, 12, 4, [0, 16],  [0, 32],  [-2, -4, 0],          [0, -6, 0], 0.5],
    ['legL',  4, 12, 4, [16, 48], [0, 48],  [2, -4, 0],           [0, -6, 0], 0.5]
  ];
  for (const [name, w, h, d, uvB, uvO, pp, mp, infl] of defs) {
    let pivot = parts[name];
    if (!pivot) { pivot = new THREE.Group(); parts[name] = pivot; model.add(pivot); }
    pivot.position.set(pp[0], pp[1], pp[2]);
    if (meshes[name]) { meshes[name].forEach(m => { pivot.remove(m); m.geometry.dispose(); }); }
    const b = makeBox(w, h, d, uvB, 0, baseMat);
    const o = makeBox(w, h, d, uvO, infl, overMat);
    b.position.set(mp[0], mp[1], mp[2]); o.position.copy(b.position);
    pivot.add(b, o);
    meshes[name] = [b, o];
  }
}

function setSkinFromCanvas(cv, k, modern) {
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.anisotropy = 1; tex.needsUpdate = true;
  const old = skinTex; skinTex = tex;
  if (!baseMat) { [baseMat, overMat] = makeMats(tex); }
  else { baseMat.map = tex; overMat.map = tex; baseMat.needsUpdate = overMat.needsUpdate = true; }
  if (old) old.dispose();
  const auto = detectSlim(cv, k, modern);
  const slim = S.arms === 'slim' || (S.arms === 'auto' && auto);
  S._autoSlim = auto;
  if (slim !== slimNow) buildPlayer(slim);
}

let lastSkin = null, defaultPack = null, skinGain = 1;
function applySkinCanvasPack(pack) { lastSkin = pack; skinGain = pack.gain || 1; setSkinFromCanvas(pack.canvas, pack.k, pack.modern); }
function useDefaultSkin() { if (defaultPack) applySkinCanvasPack(defaultPack); }
function refreshArms() {
  if (!lastSkin) return;
  const slim = S.arms === 'slim' || (S.arms === 'auto' && S._autoSlim);
  if (slim !== slimNow) buildPlayer(slim);
}

function loadImage(url, cors) {
  return new Promise((res, rej) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('chargement impossible'));
    img.src = url;
  });
}
let toastT = 0;
function setStatus(t, bad) {
  const s = $('status'); if (s) { s.textContent = t || ''; s.style.color = bad ? '#fb9' : '#9fe'; }
  const k = $('toast');
  if (k && bad && t) { k.textContent = t; k.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { k.style.opacity = 0; }, 7000); }
}

async function useImage(img, label) {
  try {
    const pack = buildSkinCanvas(img);
    applySkinCanvasPack(pack);
    setStatus('Skin chargé : ' + label);
    return true;
  } catch (e) { setStatus(e.message, true); return false; }
}
async function loadSkinByName(name) {
  name = (name || '').trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) { setStatus('Pseudo invalide (3-16 caractères : lettres, chiffres, _)', true); return false; }
  setStatus('Recherche de « ' + name + ' »…');
  const urls = ['https://minotar.net/skin/' + name, 'https://mc-heads.net/skin/' + name];
  for (const u of urls) {
    try { const img = await loadImage(u, true); if (await useImage(img, name)) return true; } catch (e) { /* suivant */ }
  }
  setStatus('Impossible de récupérer ce skin (réseau ?). Utilise un fichier PNG.', true);
  return false;
}
// Wallpaper Engine donne un chemin disque (C:\...), parfois relatif au projet : on essaie plusieurs formes.
function pathCandidates(path) {
  let p = String(path || '').trim().replace(/\\/g, '/');
  if (!p) return [];
  const enc = (s) => (/%[0-9a-f]{2}/i.test(s) ? s : encodeURI(s).replace(/#/g, '%23'));
  if (/^(file:|https?:|data:|blob:)/i.test(p)) return [p];
  if (/^[A-Za-z]:\//.test(p) || p.startsWith('//')) return ['file:///' + enc(p), 'file:///' + p];
  return [enc(p), 'file:///' + enc(p.replace(/^\/+/, ''))];
}
function xhrBlob(url) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('GET', url); x.responseType = 'blob';
    x.onload = () => ((x.status === 0 || x.status === 200) && x.response && x.response.size > 0 ? res(x.response) : rej(new Error('xhr')));
    x.onerror = () => rej(new Error('xhr'));
    x.send();
  });
}
async function loadImageSmart(url) {
  // 1) lecture des octets -> blob local : pas de canvas « non sûr »
  if (!/^(https?:|data:|blob:)/i.test(url)) {
    try {
      const obj = URL.createObjectURL(await xhrBlob(url));
      try { return await loadImage(obj, false); } finally { setTimeout(() => URL.revokeObjectURL(obj), 5000); }
    } catch (e) { /* on tente l'image directe */ }
  }
  return loadImage(url, /^https?:/i.test(url));
}
let skinReq = 0;
async function loadSkinFromPath(path, label) {
  const my = ++skinReq;
  for (const url of pathCandidates(path)) {
    try {
      const img = await loadImageSmart(url);
      if (my !== skinReq) return false;
      if (await useImage(img, label || 'fichier')) return true;
    } catch (e) { /* candidat suivant */ }
  }
  if (my === skinReq) setStatus('Skin illisible : ' + String(path).split(/[\\/]/).pop() + ' (skin par défaut conservé)', true);
  return false;
}
async function loadSkinFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  try { const img = await loadImage(url, false); await useImage(img, file.name); }
  catch (e) { setStatus('Fichier illisible', true); }
  URL.revokeObjectURL(url);
}

// skin par défaut (peint en code, aucun asset Mojang)
{
  const cv = paintDefaultSkin();
  const tex0 = new THREE.CanvasTexture(cv);
  tex0.magFilter = tex0.minFilter = THREE.NearestFilter; tex0.generateMipmaps = false;
  [baseMat, overMat] = makeMats(tex0);
  skinTex = tex0;
  lastSkin = defaultPack = { canvas: cv, k: 1, modern: true, gain: 1 };
  S._autoSlim = false;
  buildPlayer(false);
}

/* ----------------------------------------------------------------------
 *  Particules : neige marine, plancton bioluminescent, bulles
 * -------------------------------------------------------------------- */
const PARTICLE_VS = `
  uniform float uTime, uScroll, uK, uH, uSizeMul, uTwinkle, uReact, uReactR;
  uniform vec3 uReactPos;
  attribute vec4 aR;
  varying float vA;
  void main(){
    vec3 p = position;
    p.y = mod(p.y + uScroll, uH) - uH*.5;
    p.x += sin(uTime*(.2+.3*aR.y) + aR.z*40.)*.35;
    p.z += cos(uTime*(.17+.25*aR.y) + aR.z*30.)*.30;
    p.y += sin(uTime*.5 + aR.w*30.)*.05;
    vec4 mv = modelViewMatrix*vec4(p,1.);
    float dist = max(-mv.z, .2);
    float blur = clamp(abs(dist-6.8)/9., 0., 1.);
    float size = (.010 + aR.x*.030) * (1. + blur*2.4) * uSizeMul * uK / dist;
    gl_PointSize = clamp(size, 1., 36.);
    float a = (1. - blur*.55) * (.30 + .70*aR.w) * smoothstep(.3, 2., dist);
    float tw = .5 + .5*sin(uTime*(1.+aR.y*3.) + aR.z*60.);
    a *= mix(1., tw, uTwinkle);
    float rd = length(p - uReactPos);
    a *= 1. + uReact*exp(-rd*rd*uReactR);
    vA = a;
    gl_Position = projectionMatrix*mv;
  }`;
const PARTICLE_FS = `
  uniform vec3 uColor; uniform float uBright; varying float vA;
  void main(){
    vec2 c = gl_PointCoord*2.-1.; float r = dot(c,c);
    if (r > 1.) discard;
    float a = exp(-r*3.2) * vA * uBright;
    gl_FragColor = vec4(uColor, a);
  }`;

function makeParticles(n, opts) {
  const pos = new Float32Array(n * 3), r = new Float32Array(n * 4);
  const Hh = 34;
  for (let i = 0; i < n; i++) {
    const z = rnd(-opts.zfar, opts.znear);
    const half = (CAM_Z - z) * TAN * 2.8;
    pos[i * 3] = rnd(-half, half); pos[i * 3 + 1] = rnd(0, Hh); pos[i * 3 + 2] = z;
    for (let j = 0; j < 4; j++) r[i * 4 + j] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aR', new THREE.BufferAttribute(r, 4));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: U.time, uScroll: U.scroll, uK: U.pointK, uH: { value: Hh },
      uSizeMul: { value: opts.size }, uTwinkle: { value: opts.twinkle }, uReact: { value: opts.react }, uReactR: { value: opts.reactR },
      uReactPos: U.player, uColor: { value: new THREE.Color(opts.color) }, uBright: { value: 1 }
    },
    vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false; pts.renderOrder = 5;
  scene.add(pts);
  return pts;
}
const snow = makeParticles(2600, { zfar: 28, znear: 5, size: 1, twinkle: 0, react: 0, reactR: .35, color: 0xcfeeff });
const plankton = makeParticles(650, { zfar: 22, znear: 4, size: 1.7, twinkle: .85, react: 5, reactR: .30, color: 0x38ffd8 });

// Bulles
const bubbleMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: {
    uTime: U.time, uK: U.pointK, uVel: U.vel, uEmit: U.player, uAmount: { value: 1 },
    uTint: { value: new THREE.Color(0xaaddff) }, uBright: { value: 1 }, uLamp: U.lampOn
  },
  vertexShader: `
    uniform float uTime, uK, uVel, uAmount; uniform vec3 uEmit;
    attribute vec4 aR; varying float vA;
    void main(){
      float period = 2.4;
      float age = fract(uTime/period*(.8+.4*aR.y) + aR.w*13.37)*period;
      float rs = .55 + .55*aR.w + uVel*1.05;
      float ey = mix(-.75, .95, aR.y);
      vec3 p;
      p.y = uEmit.y + ey + age*rs;
      p.x = uEmit.x + (aR.x-.5)*.85 + sin(age*3.2 + aR.w*20.)*.06*(1.+age) + (aR.x-.5)*age*.35;
      p.z = uEmit.z + (aR.y-.5)*.9 + .25;
      vec4 mv = modelViewMatrix*vec4(p,1.);
      float dist = max(-mv.z, .2);
      float rad = (.014 + .05*aR.w*aR.w) * (1. + age*.10);
      gl_PointSize = clamp(rad*2.*uK/dist, 2., 40.);
      float act = step(aR.z, uAmount);
      vA = act * smoothstep(0., .2, age) * (1. - smoothstep(period*.55, period*.98, age));
      gl_Position = projectionMatrix*mv;
    }`,
  fragmentShader: `
    uniform vec3 uTint; uniform float uBright, uLamp; varying float vA;
    void main(){
      vec2 c = gl_PointCoord*2.-1.; c.y = -c.y;
      float r = length(c);
      if (r > 1.) discard;
      float rim = smoothstep(.55,.93,r) * (1.-smoothstep(.93,1.,r));
      float hl  = smoothstep(.34,.0,length(c-vec2(-.42,.42)));
      float hl2 = smoothstep(.20,.0,length(c-vec2(.45,-.40)))*.5;
      float body = .07*(1.-r*r);
      float a = (rim*.55 + hl*.9 + hl2 + body) * vA;
      vec3 col = mix(uTint, vec3(1.), .55) * uBright;
      gl_FragColor = vec4(col, a);
    }`
});
const bubbleGeo = (() => {
  const n = 420, pos = new Float32Array(n * 3), r = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) r[i * 4 + j] = Math.random();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aR', new THREE.BufferAttribute(r, 4));
  return g;
})();
const bubbles = new THREE.Points(bubbleGeo, bubbleMat);
bubbles.frustumCulled = false; bubbles.renderOrder = 8;
scene.add(bubbles);

// moins de particules sur les qualités légères (gros gain de FPS : ce sont des sprites additifs très « overdraw »)
qualityHook = () => {
  const f = S.quality === 'high' ? 1 : S.quality === 'med' ? 0.6 : 0.3;
  snow.geometry.setDrawRange(0, Math.floor(2600 * f));
  plankton.geometry.setDrawRange(0, Math.floor(650 * f));
  bubbles.geometry.setDrawRange(0, Math.floor(420 * f));
};
qualityHook();

/* ----------------------------------------------------------------------
 *  Créatures : bancs de poissons, requins (silhouettes), méduses lumineuses
 * -------------------------------------------------------------------- */
const sil = {
  uColor: { value: new THREE.Color(0x001018) }, uFogColor: { value: new THREE.Color(0x0a5070) },
  uFog: { value: .04 }, uTime: U.time, uAlpha: { value: 1 }
};
function silMat(amp, freq) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true,
    uniforms: Object.assign({}, sil, { uAmp: { value: amp }, uFreq: { value: freq } }),
    vertexShader: `
      uniform float uTime, uAmp, uFreq; varying float vDist;
      void main(){
        vec3 p = position;
        float ph = modelMatrix[3].x*1.7 + modelMatrix[3].y*2.3;
        #ifdef USE_INSTANCING
          ph = instanceMatrix[3].x*1.7 + instanceMatrix[3].y*2.3;
        #endif
        p.y += sin(uTime*uFreq + ph - p.x*3.) * uAmp * (.5 - .5*p.x);
        vec4 lp = vec4(p,1.);
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
        #endif
        vec4 mv = modelViewMatrix*lp;
        vDist = -mv.z;
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor, uFogColor; uniform float uFog, uAlpha; varying float vDist;
      void main(){
        float f = 1. - exp(-pow(uFog*vDist, 2.));
        gl_FragColor = vec4(mix(uColor, uFogColor, f), uAlpha);
      }`
  });
}
const fishShape = (() => {
  const s = new THREE.Shape();
  s.moveTo(1, 0);
  s.bezierCurveTo(.72, .30, .10, .36, -.35, .17);
  s.lineTo(-.55, .08); s.lineTo(-1, .34); s.lineTo(-.86, 0); s.lineTo(-1, -.34); s.lineTo(-.55, -.08); s.lineTo(-.35, -.17);
  s.bezierCurveTo(.10, -.36, .72, -.30, 1, 0);
  return new THREE.ShapeGeometry(s, 8);
})();
const sharkShape = (() => {
  const s = new THREE.Shape();
  s.moveTo(1, 0);
  s.bezierCurveTo(.82, .09, .5, .16, .16, .17);
  s.lineTo(.04, .17); s.lineTo(-.07, .42); s.lineTo(-.22, .15);
  s.bezierCurveTo(-.5, .09, -.75, .06, -.93, .035);
  s.lineTo(-1.1, .32); s.lineTo(-.98, .0); s.lineTo(-1.04, -.22); s.lineTo(-.9, -.03);
  s.bezierCurveTo(-.6, -.07, -.35, -.10, -.12, -.15);
  s.lineTo(.0, -.36); s.lineTo(.24, -.15);
  s.bezierCurveTo(.5, -.15, .82, -.10, 1, 0);
  return new THREE.ShapeGeometry(s, 10);
})();

const fishMat = silMat(.10, 9), sharkMat = silMat(.05, 1.6);
const creatures = [];
const lifeGroup = new THREE.Group(); scene.add(lifeGroup);

// ---- bancs
// un seul draw call par banc (InstancedMesh) : beaucoup moins de travail CPU par image
const schools = [], dummy = new THREE.Object3D();
for (let i = 0; i < 4; i++) {
  const n = 16;
  const im = new THREE.InstancedMesh(fishShape, fishMat, n);
  im.frustumCulled = false; lifeGroup.add(im);
  const fish = [];
  for (let j = 0; j < n; j++) {
    fish.push({ off: new THREE.Vector3(rnd(-2.4, 2.4), rnd(-1, 1), rnd(-1.6, 1.6)), ph: rnd(0, 6.28), sc: rnd(.32, .5) });
  }
  const s = { im, fish, Y: 0, x: 0, z: -8, dir: 1, speed: 1.5, on: false, kind: 'school' };
  schools.push(s); creatures.push(s);
}
// ---- requins
const sharks = [];
for (let i = 0; i < 2; i++) {
  const m = new THREE.Mesh(sharkShape, sharkMat); lifeGroup.add(m);
  const s = { m, Y: 0, x: 0, z: -24, dir: 1, speed: .9, sc: 6, on: false, kind: 'shark' };
  sharks.push(s); creatures.push(s);
}

// ---- méduses
const JELLY_COLORS = [[.2, .9, 1], [.95, .3, 1], [1, .55, .22], [.4, 1, .6], [.55, .5, 1]];
function makeJelly() {
  const group = new THREE.Group();
  const col = new THREE.Color();
  const u = { uTime: U.time, uColor: { value: col }, uPulse: { value: 0 }, uGlow: { value: 1 } };
  const bellGeo = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * .52);
  bellGeo.scale(1, .8, 1);
  const bellMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: u,
    vertexShader: `
      uniform float uPulse; varying vec3 vN, vV, vP;
      void main(){
        vec3 p = position; float s = sin(uPulse);
        p.xz *= 1. + .20*s*(1. - p.y/.8);
        p.y *= 1. - .14*s;
        vP = p;
        vec4 mv = modelViewMatrix*vec4(p,1.);
        vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uGlow; varying vec3 vN, vV, vP;
      void main(){
        float fr = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float ribs = .55 + .45*sin(atan(vP.z, vP.x)*12.);
        float core = smoothstep(.0, .8, vP.y) * .25;
        vec3 c = uColor * (.30 + 1.25*fr + core) * ribs;
        gl_FragColor = vec4(c*uGlow, (.14 + .62*fr + core*.5) * uGlow);
      }`
  });
  const bell = new THREE.Mesh(bellGeo, bellMat);
  group.add(bell);

  // tentacules (segments de lignes)
  const N = 16, SEG = 14, L = 2.6;
  const pos = [], aT = [], aPh = [];
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 + rnd(-.1, .1), rad = rnd(.35, .85), ph = rnd(0, 6.28), len = L * rnd(.55, 1);
    for (let s = 0; s < SEG; s++) {
      for (const t of [s / SEG, (s + 1) / SEG]) {
        pos.push(Math.cos(ang) * rad, -.04 - t * len, Math.sin(ang) * rad);
        aT.push(t); aPh.push(ph);
      }
    }
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
  tg.setAttribute('aPh', new THREE.Float32BufferAttribute(aPh, 1));
  const tMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: u,
    vertexShader: `
      attribute float aT, aPh; uniform float uTime, uPulse; varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime*1.3 + aPh + aT*5. + uPulse*.4)*.16*aT;
        p.z += cos(uTime*1.1 + aPh*1.3 + aT*4.)*.12*aT;
        p.xz *= 1. + .10*sin(uPulse)*(1.-aT);
        vA = (1. - aT*.85) * .8;
        gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.);
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uGlow; varying float vA;
      void main(){ gl_FragColor = vec4(uColor*uGlow*1.2, vA*.7*uGlow); }`
  });
  const tent = new THREE.LineSegments(tg, tMat);
  group.add(tent);
  return { group, u, bellMat, tMat };
}
const jellies = [];
for (let i = 0; i < 9; i++) {
  const j = makeJelly(); lifeGroup.add(j.group);
  Object.assign(j, { Y: 0, x: 0, z: -8, sc: 1, ph: rnd(0, 6.28), on: false, drift: rnd(-.2, .2), kind: 'jelly' });
  jellies.push(j); creatures.push(j);
}

function halfH(z) { return (CAM_Z - z) * TAN; }

function respawn(c, firstTime) {
  const ahead = firstTime ? rnd(-4, 26) : rnd(10, 36);
  c.Y = U.scroll.value + ahead + (c.kind === 'shark' ? 8 : 0);
  const d = c.Y * M_PER_UNIT;
  if (c.kind === 'school') {
    c.on = d < 1300 && S.life && Math.random() < .85;
    c.z = rnd(-14, -4); c.dir = Math.random() < .5 ? 1 : -1;
    c.speed = rnd(1.2, 2.4);
    c.x = -c.dir * (halfH(c.z) * camera.aspect + 5);
    c.sc = rnd(.8, 1.2);
    c.off = rnd(0, 6.28);
  } else if (c.kind === 'shark') {
    c.on = d > 120 && d < 1600 && S.life && Math.random() < .8;
    c.z = rnd(-30, -20); c.dir = Math.random() < .5 ? 1 : -1; c.speed = rnd(.6, 1.1);
    c.sc = rnd(4.5, 7);
    c.x = -c.dir * (halfH(c.z) * camera.aspect + c.sc + 2);
  } else {
    c.on = d > 140 && d < 7000 && S.life && Math.random() < .9;
    c.z = Math.random() < .25 ? rnd(-1.5, 2.2) : rnd(-16, -3);
    c.sc = c.z > -2 ? rnd(.25, .5) : rnd(.5, 1.5);
    let xr = halfH(c.z) * camera.aspect * .95;
    c.x = rnd(-xr, xr);
    if (c.z > -3 && Math.abs(c.x - player.position.x) < 1.6) c.x += (c.x < player.position.x ? -1 : 1) * 2.4;
    c.u.uColor.value.setRGB(...JELLY_COLORS[(Math.random() * JELLY_COLORS.length) | 0]);
    c.ph = rnd(0, 6.28); c.drift = rnd(-.25, .25);
  }
}
creatures.forEach(c => respawn(c, true));

function updateCreatures(dt, e, dMeters) {
  const t = U.time.value, scroll = U.scroll.value;
  // couleurs silhouettes
  const dark = .22 + .25 * e.sun;
  sil.uColor.value.setRGB(e.mid[0] * dark, e.mid[1] * dark, e.mid[2] * dark);
  sil.uFogColor.value.setRGB(e.mid[0], e.mid[1], e.mid[2]);
  sil.uFog.value = .036 + e.fog * .2;

  const glow = lerp(.3, 1.25, smooth(100, 1400, dMeters));
  for (const c of creatures) {
    const y = scroll - c.Y;
    if (c.kind === 'school') {
      const lim = halfH(c.z) + 4;
      c.x += c.dir * c.speed * dt;
      if (y > lim || Math.abs(c.x) > halfH(c.z) * camera.aspect + 9) { respawn(c); continue; }
      c.im.visible = c.on;
      if (!c.on) continue;
      const cy = y + Math.sin(t * .3 + c.off) * .5, ry = c.dir > 0 ? 0 : Math.PI;
      for (let j = 0; j < c.fish.length; j++) {
        const f = c.fish[j], o = f.off;
        dummy.position.set(c.x + o.x + Math.sin(t * .8 + f.ph) * .35, cy + o.y + Math.cos(t * .6 + f.ph * 1.3) * .25, c.z + o.z + Math.sin(t * .5 + f.ph) * .3);
        dummy.rotation.set(0, ry, Math.sin(t * 2 + f.ph) * .08);
        dummy.scale.setScalar(f.sc * c.sc);
        dummy.updateMatrix();
        c.im.setMatrixAt(j, dummy.matrix);
      }
      c.im.instanceMatrix.needsUpdate = true;
    } else if (c.kind === 'shark') {
      c.x += c.dir * c.speed * dt;
      if (y > halfH(c.z) + 8 || Math.abs(c.x) > halfH(c.z) * camera.aspect + c.sc * 1.4 + 4) { respawn(c); continue; }
      c.m.visible = c.on;
      if (!c.on) continue;
      c.m.position.set(c.x, y + Math.sin(t * .25 + c.sc) * .6, c.z);
      c.m.rotation.y = c.dir > 0 ? 0 : Math.PI;
      c.m.rotation.z = Math.sin(t * .35 + c.sc) * .04;
      c.m.scale.set(c.sc, c.sc, 1);
    } else {
      const pulse = t * 2.0 + c.ph;
      c.u.uPulse.value = pulse;
      c.Y -= (.10 + Math.max(0, Math.sin(pulse)) * .55) * dt;   // nage vers le haut par à-coups
      c.x += c.drift * dt;
      if (y > halfH(c.z) + 4) { respawn(c); continue; }
      c.group.visible = c.on;
      if (!c.on) continue;
      c.u.uGlow.value = glow;
      c.group.position.set(c.x, y, c.z);
      c.group.scale.setScalar(c.sc);
      c.group.rotation.set(Math.sin(t * .3 + c.ph) * .12, t * .1 + c.ph, Math.cos(t * .25 + c.ph) * .1);
    }
  }
}

/* ----------------------------------------------------------------------
 *  Post-traitement : bloom + distorsion + vignette + grain
 * -------------------------------------------------------------------- */
const fsScene = new THREE.Scene();
const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fsMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
fsMesh.frustumCulled = false; fsScene.add(fsMesh);
const FS_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

const brightMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, uThr: { value: .72 } }, vertexShader: FS_VS,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uThr;
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(max(c.r, c.g), c.b);
      float k = smoothstep(uThr, uThr + .35, l); gl_FragColor = vec4(c*k, 1.); }`
});
const blurMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: FS_VS,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 uDir;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb * .2270270270;
      c += (texture2D(tDiffuse, vUv + uDir*1.3846153846).rgb + texture2D(tDiffuse, vUv - uDir*1.3846153846).rgb) * .3162162162;
      c += (texture2D(tDiffuse, vUv + uDir*3.2307692308).rgb + texture2D(tDiffuse, vUv - uDir*3.2307692308).rgb) * .0702702703;
      gl_FragColor = vec4(c, 1.); }`
});
const finalMat = new THREE.ShaderMaterial({
  uniforms: {
    tScene: { value: null }, tBloom: { value: null }, uTime: U.time, uAspect: U.aspect,
    uBloom: { value: 1 }, uGrain: { value: .6 }, uFade: { value: 1 }, uDistort: { value: .002 }, uVig: { value: .55 },
    uRes: { value: new THREE.Vector2(1, 1) }
  },
  vertexShader: FS_VS,
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D tScene, tBloom; uniform vec2 uRes;
    uniform float uTime, uAspect, uBloom, uGrain, uFade, uDistort, uVig;
    float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
    void main(){
      vec2 uv = vUv;
      uv += vec2(sin(uv.y*17. + uTime*.8), cos(uv.x*13. + uTime*.65)) * uDistort;
      vec2 cc = uv - .5; float r2 = dot(cc*vec2(uAspect*.55, 1.), cc*vec2(uAspect*.55, 1.));
      vec3 col;
      col.r = texture2D(tScene, uv + cc*.006*r2*2.).r;
      col.g = texture2D(tScene, uv).g;
      col.b = texture2D(tScene, uv - cc*.006*r2*2.).b;
      col += texture2D(tBloom, uv).rgb * uBloom;
      col *= 1. - uVig * smoothstep(.10, .62, r2);
      float g = hash(vUv*uRes + fract(uTime)*91.7) + hash(vUv*uRes*1.37 + fract(uTime*1.3)*47.3);
      col += (g - 1.) * uGrain * .045;
      col = mix(col, col*col*(3.-2.*col), .35);       // légère courbe en S
      gl_FragColor = vec4(col * uFade, 1.);
    }`
});
function pass(mat, target) {
  fsMesh.material = mat;
  renderer.setRenderTarget(target);
  renderer.render(fsScene, fsCam);
}
function renderPost(bloomAmt) {
  renderer.setRenderTarget(rtScene);
  renderer.render(scene, camera);
  let bloomTex = rtA.texture;
  if (bloomAmt > 0.001 && S.quality !== 'low') {
    brightMat.uniforms.tDiffuse.value = rtScene.texture; pass(brightMat, rtA);
    const tx = 1 / rtA.width, ty = 1 / rtA.height;
    const iters = S.quality === 'high' ? 2 : 1;
    for (let i = 0; i < iters; i++) {
      const sc = iters === 1 ? 1.7 : (i === 0 ? 1 : 2.2);
      blurMat.uniforms.tDiffuse.value = rtA.texture; blurMat.uniforms.uDir.value.set(tx * sc, 0); pass(blurMat, rtB);
      blurMat.uniforms.tDiffuse.value = rtB.texture; blurMat.uniforms.uDir.value.set(0, ty * sc); pass(blurMat, rtA);
    }
  } else bloomAmt = 0;
  finalMat.uniforms.tScene.value = rtScene.texture;
  finalMat.uniforms.tBloom.value = bloomTex;
  finalMat.uniforms.uBloom.value = bloomAmt;
  finalMat.uniforms.uRes.value.set(W, H);
  pass(finalMat, null);
}

/* ----------------------------------------------------------------------
 *  HUD
 * -------------------------------------------------------------------- */
const hud = $('hud'), gauge = $('gauge'), gMark = $('gMark');
[200, 1000, 4000, 6000].forEach(d => {
  const i = document.createElement('i'); i.style.top = (Math.sqrt(d / MAX_DEPTH) * 100) + '%'; gauge.appendChild(i);
});
function zoneName(d) {
  if (d >= 10900) return 'Challenger Deep · fosse des Mariannes';
  if (d < 200) return 'Zone épipélagique · lumière du soleil';
  if (d < 1000) return 'Zone mésopélagique · crépuscule';
  if (d < 4000) return 'Zone bathypélagique · minuit';
  if (d < 6000) return 'Zone abyssopélagique · abysses';
  return 'Zone hadale · fosse océanique';
}
let hudT = 0;
function updateHud(dt, d) {
  hudT -= dt; if (hudT > 0) return; hudT = .1;
  const dm = Math.min(d, MAX_DEPTH);
  $('hDepth').textContent = Math.round(dm).toLocaleString('fr-FR');
  $('hZone').textContent = zoneName(dm);
  const temp = 2 + 20 * Math.exp(-dm / 180);
  $('hMeta').textContent = 'Pression ' + Math.round(1 + dm / 10).toLocaleString('fr-FR') + ' atm  ·  ' + temp.toFixed(1).replace('.', ',') + ' °C';
  gMark.style.top = (Math.sqrt(dm / MAX_DEPTH) * 100) + '%';
}
function applyHud() {
  hud.className = S.hudPos + (S.hud ? '' : ' hidden');
  gauge.className = (S.hudPos.endsWith('l') ? 'l' : 'r') + (S.hud ? '' : ' hidden');
}

/* ----------------------------------------------------------------------
 *  Animation du personnage
 * -------------------------------------------------------------------- */
function applyOffset() {
  const hw = CAM_Z * TAN * camera.aspect;
  player.userData.baseX = (S.offset / 100) * hw;
}
const tmpV = new THREE.Vector3();
function animatePlayer(t, dt) {
  const k = 1 - Math.exp(-dt * 3);
  let yaw = 0, pitch = 0, roll = 0;
  const pose = S.pose;
  if (pose === 'head') {
    roll = Math.PI + Math.sin(t * .23) * .10;
    pitch = Math.sin(t * .17) * .10;
    yaw = Math.sin(t * .10) * .9 + .25;
  } else if (pose === 'spin') {
    yaw = t * .38; pitch = .10 + Math.sin(t * .2) * .08; roll = Math.sin(t * .17 + 2) * .08;
  } else if (pose === 'tumble') {
    pitch = t * .22; yaw = Math.sin(t * .11) * .8 + .3; roll = Math.sin(t * .13) * .15;
  } else {
    yaw = Math.sin(t * .13) * .85 + Math.sin(t * .071 + 1) * .35 + .15;
    pitch = .06 + Math.sin(t * .21) * .08; roll = Math.sin(t * .17 + 2) * .09;
  }
  const r = player.rotation; r.order = 'YXZ';
  if (pose === 'tumble' || pose === 'spin') { r.y = yaw; r.x = pitch; r.z = roll; }
  else { r.y += (yaw - r.y) * k; r.x += (pitch - r.x) * k; r.z += (roll - r.z) * k; }
  const bx = player.userData.baseX || 0;
  player.position.set(bx + Math.sin(t * .31) * .10, Math.sin(t * .55) * .07, 0);

  // membres : traînée / flottaison
  const arm = (side, ph) => {
    const raise = .55 + .22 * Math.sin(t * .9 + ph) + .10 * Math.sin(t * 2.1 + ph * 2);
    return [side * raise, -.18 + .22 * Math.sin(t * .7 + ph + 1)];
  };
  const [azR, axR] = arm(-1, 0), [azL, axL] = arm(1, 1.7);
  parts.armR.rotation.set(axR, 0, azR);
  parts.armL.rotation.set(axL, 0, azL);
  const kick = Math.sin(t * .85);
  parts.legR.rotation.set(.16 * kick + .06, 0, -.10 - .05 * Math.sin(t * .6));
  parts.legL.rotation.set(-.16 * kick + .06, 0, .10 + .05 * Math.sin(t * .6 + 1));
  parts.head.rotation.set(.10 + Math.sin(t * .5) * .08, Math.sin(t * .29) * .28, Math.sin(t * .23) * .05);
  parts.body.rotation.set(Math.sin(t * .4) * .03, 0, 0);

  U.player.value.set(player.position.x, player.position.y, 0);
}

/* ----------------------------------------------------------------------
 *  Boucle principale
 * -------------------------------------------------------------------- */
const st = { time: 0, cycle: 0, vel: 0, fade: 0, ending: false, depth: 0 };
let paused = false, fpsCap = 0, lastFrame = 0, accum = 0;

function resetCycle() {
  U.scroll.value = START_SCROLL; st.cycle = 0; st.vel = 0; st.ending = false; st.fade = 0;
  creatures.forEach(c => respawn(c, true));
}

function update(dt) {
  st.time += dt; st.cycle += dt;
  U.time.value = st.time;

  // vitesse (accélération douce au départ)
  const target = BASE_V * S.speed * smooth(0, 7, st.cycle) * (.25 + .75 * smooth(0, 7, st.cycle));
  st.vel += (target - st.vel) * Math.min(1, dt * .8);
  U.scroll.value += st.vel * dt;
  U.vel.value += (st.vel - U.vel.value) * Math.min(1, dt * 2);

  const depth = U.scroll.value * M_PER_UNIT;
  st.depth = depth;

  // fondus d'entrée / sortie
  if (!st.ending) st.fade = Math.min(1, st.fade + dt / 2.5);
  if (S.loop && depth > MAX_DEPTH + 80 && !st.ending) st.ending = true;
  if (st.ending) { st.fade -= dt / 3.2 * 1.0; if (st.fade <= 0) resetCycle(); }

  const e = envAt(Math.min(depth, MAX_DEPTH));

  // fond
  bgMat.uniforms.uTop.value.setRGB(...e.top); bgMat.uniforms.uMid.value.setRGB(...e.mid); bgMat.uniforms.uBot.value.setRGB(...e.bot);
  bgMat.uniforms.uRays.value = e.rays; bgMat.uniforms.uSun.value = e.sun;
  const surfH = U.scroll.value;                              // hauteur de la surface au-dessus de la caméra
  const surfUv = .5 + .5 * surfH / (14 * TAN);
  bgMat.uniforms.uSurf.value = surfUv > 1.5 ? 2 : surfUv;

  // brouillard & lumières
  scene.fog.color.setRGB(...e.mid); scene.fog.density = e.fog;
  hemi.color.setRGB(clamp(e.top[0] * 1.2 + .03, 0, 1), clamp(e.top[1] * 1.2 + .05, 0, 1), clamp(e.top[2] * 1.2 + .08, 0, 1));
  hemi.groundColor.setRGB(e.bot[0], e.bot[1], e.bot[2]);
  hemi.intensity = .35 + e.sun * .75;
  const flick = 1 + (Math.sin(st.time * 1.7) * .5 + Math.sin(st.time * 2.9 + 1) * .5) * .06 * e.sun;
  sunL.intensity = (.05 + 1.0 * e.sun) * flick;
  sunL.color.setRGB(.82 + e.sun * .1, 1, 1);
  rimL.intensity = .25 + .4 * (1 - e.sun);
  rimL.color.setRGB(e.top[0] * 2 + .05, e.top[1] * 3 + .25, e.top[2] * 3 + .6);
  bioAmb.intensity = .35 + .5 * (1 - e.sun);
  const lampF = S.lamp ? smooth(150, 700, depth) : 0;
  U.lampOn.value = lampF;
  // skins très clairs : on baisse l'éclairage pour éviter le blanc surexposé
  hemi.intensity *= skinGain; sunL.intensity *= skinGain; rimL.intensity *= skinGain; bioAmb.intensity *= skinGain;
  lamp.intensity = lampF * 0.95 * skinGain;
  lamp.position.set(player.position.x + .6, 1.1, 3.4);

  animatePlayer(st.time, dt);
  const surfFactor = smooth(0, 120, depth);

  // particules
  snow.material.uniforms.uBright.value = (.35 + e.snow * .9) * (.55 + .45 * (1 - e.sun) + .2);
  snow.material.uniforms.uColor.value.setRGB(lerp(.85, .75, 1 - e.sun), lerp(.97, .90, 1 - e.sun), 1);
  snow.material.uniforms.uReact.value = lampF * 3.2;
  plankton.material.uniforms.uBright.value = smooth(120, 900, depth) * 1.5;
  plankton.visible = S.life && plankton.material.uniforms.uBright.value > .01;
  const burst = Math.exp(-st.cycle / 9);
  bubbleMat.uniforms.uAmount.value = clamp(S.bubbles * (.22 + 1.05 * burst), 0, 1);
  bubbles.visible = S.bubbles > .01;
  bubbleMat.uniforms.uTint.value.setRGB(clamp(e.top[0] + .4, 0, 1), clamp(e.top[1] + .4, 0, 1), clamp(e.top[2] + .4, 0, 1));
  bubbleMat.uniforms.uBright.value = clamp(.25 + e.sun * .85 + lampF * .6, 0, 1.3);

  lifeGroup.visible = S.life;
  if (S.life) updateCreatures(dt, e, depth);

  // post
  finalMat.uniforms.uFade.value = clamp(st.fade, 0, 1);
  finalMat.uniforms.uGrain.value = S.grain;
  finalMat.uniforms.uDistort.value = .0012 + .0022 * (1 - surfFactor * .6);
  bloomNow = S.bloom * (.30 + .85 * (1 - e.sun));

  updateHud(dt, depth);

  if (window.Ambience) {
    window.Ambience.enabled = S.sound; window.Ambience.volume = S.volume;
    window.Ambience.update(dt, Math.min(depth, MAX_DEPTH), st.fade);
    const hint = $('soundHint');
    if (hint) hint.style.display = (window.Ambience.needsGesture && S.sound && !IN_WE.v) ? 'block' : 'none';
  }
}
let bloomNow = 1;

// Ajustement automatique de la résolution : si le PC n'arrive pas à tenir la cadence, on baisse un peu
// la résolution de rendu (invisible avec le grain/bloom) ; s'il a de la marge, on la remonte.
const perf = { n: 0, sum: 0, minAvg: 1e9, okRuns: 0, noUpUntil: 0 };
function adaptScale(ms, now) {
  if (!S.autoScale || st.time < 4) return;
  perf.n++; perf.sum += ms;
  if (perf.n < 90) return;
  const avg = perf.sum / perf.n; perf.n = 0; perf.sum = 0;
  perf.minAvg = Math.min(perf.minAvg, avg);
  const target = fpsCap > 0 ? 1000 / fpsCap : perf.minAvg;
  if (avg > target * 1.3 && avg > 20 && dyn.s > 0.55) {
    dyn.s = Math.max(0.55, dyn.s - 0.1); perf.noUpUntil = now + 90000; perf.okRuns = 0; resize();
  } else if (avg < target * 1.08) {
    if (++perf.okRuns >= 5 && dyn.s < 1 && now > perf.noUpUntil) { dyn.s = Math.min(1, dyn.s + 0.1); perf.okRuns = 0; resize(); }
  } else perf.okRuns = 0;
}

function frame(now) {
  requestAnimationFrame(frame);
  // Pause uniquement sur ordre de Wallpaper Engine (setPaused). On ne se fie pas à document.hidden :
  // si le navigateur est vraiment caché, requestAnimationFrame s'arrête de lui-même.
  if (paused) { lastFrame = now; return; }
  // limite de FPS : on mesure le temps écoulé depuis la dernière image *dessinée* (sinon l'animation tourne au ralenti)
  if (fpsCap > 0 && now - lastFrame < 1000 / fpsCap - 2) return;
  const dt = Math.min(.1, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
  adaptScale(dt * 1000, now);
  try {
    update(dt || .016);
    renderPost(bloomNow);
    errCount = 0;
  } catch (err) {
    // un skin qui casse le rendu ne doit jamais figer le fond d'écran : retour au skin par défaut
    console.error(err);
    renderer.setRenderTarget(null);
    if (errCount === 0) { const k = $('errbox'); if (k) { k.style.display = 'block'; k.textContent = 'Erreur de rendu : ' + (err && err.message ? err.message : err); } }
    try { renderer.render(scene, camera); } catch (e2) { /* au moins on évite l'écran figé */ }
    if (++errCount === 2 && lastSkin !== defaultPack) { useDefaultSkin(); setStatus('Ce skin a posé problème, skin par défaut remis', true); }
  }
}
let errCount = 0;

/* ----------------------------------------------------------------------
 *  Interface (navigateur) + Wallpaper Engine
 * -------------------------------------------------------------------- */
function syncPanel() {
  $('sArms').value = S.arms; $('sPose').value = S.pose; $('sPal').value = S.palette; $('sQ').value = S.quality;
  $('sVolume').value = S.volume; $('sSound').checked = S.sound;
  $('sScale').value = S.scale; $('sAuto').checked = S.autoScale;
  $('sSpeed').value = S.speed; $('sBloom').value = S.bloom; $('sBubbles').value = S.bubbles;
  $('sHud').checked = S.hud; $('sLoop').checked = S.loop; $('sLife').checked = S.life; $('sLamp').checked = S.lamp;
  $('uName').value = S.username || '';
}
function bindPanel() {
  $('gear').onclick = () => $('panel').classList.toggle('open');
  const sel = (id, key, fn) => $(id).addEventListener('change', (e) => { S[key] = e.target.value; fn && fn(); saveStore(); });
  sel('sArms', 'arms', refreshArms); sel('sPose', 'pose'); sel('sPal', 'palette'); sel('sQ', 'quality', resize);
  const rng = (id, key) => $(id).addEventListener('input', (e) => { S[key] = parseFloat(e.target.value); saveStore(); });
  rng('sSpeed', 'speed'); rng('sBloom', 'bloom'); rng('sBubbles', 'bubbles');
  const chk = (id, key, fn) => $(id).addEventListener('change', (e) => { S[key] = e.target.checked; fn && fn(); saveStore(); });
  rng('sVolume', 'volume'); chk('sSound', 'sound');
  $('sScale').addEventListener('change', (e) => { S.scale = parseFloat(e.target.value); resize(); saveStore(); });
  chk('sAuto', 'autoScale', () => { dyn.s = 1; resize(); });
  chk('sHud', 'hud', applyHud); chk('sLoop', 'loop'); chk('sLife', 'life'); chk('sLamp', 'lamp');
  $('uLoad').onclick = async () => { S.username = $('uName').value.trim(); if (await loadSkinByName(S.username)) saveStore(); };
  $('uName').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('uLoad').click(); });
  $('uFile').addEventListener('change', (e) => loadSkinFile(e.target.files[0]));
  $('bFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); };
  $('bRestart').onclick = resetCycle;
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'h' || e.key === 'H') { S.hud = !S.hud; applyHud(); syncPanel(); saveStore(); }
    if (e.key === 'f' || e.key === 'F') $('bFull').click();
  });
  // glisser-déposer
  const drop = $('drop'); let depth = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; drop.classList.add('on'); });
  window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; drop.classList.remove('on'); } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => { e.preventDefault(); depth = 0; drop.classList.remove('on'); const f = e.dataTransfer.files[0]; if (f) loadSkinFile(f); });
}

// --- Wallpaper Engine ---
window.wallpaperPropertyListener = {
  applyUserProperties(p) {
    IN_WE.v = true; document.body.classList.add('we');
    const v = (k) => (p[k] !== undefined ? p[k].value : undefined);
    let x;
    if ((x = v('speed')) !== undefined) S.speed = x;
    if ((x = v('volume')) !== undefined) S.volume = x / 100;
    if ((x = v('sound')) !== undefined) S.sound = x;
    if ((x = v('pose')) !== undefined) S.pose = x;
    if ((x = v('arms')) !== undefined) { S.arms = x; refreshArms(); }
    if ((x = v('palette')) !== undefined) S.palette = x;
    if ((x = v('bloom')) !== undefined) S.bloom = x;
    if ((x = v('bubbles')) !== undefined) S.bubbles = x;
    if ((x = v('grain')) !== undefined) S.grain = x;
    if ((x = v('offset')) !== undefined) { S.offset = x; applyOffset(); }
    if ((x = v('hud')) !== undefined) S.hud = x;
    if ((x = v('hudpos')) !== undefined) S.hudPos = x;
    if ((x = v('loop')) !== undefined) S.loop = x;
    if ((x = v('life')) !== undefined) S.life = x;
    if ((x = v('lamp')) !== undefined) S.lamp = x;
    let needResize = false;
    if ((x = v('quality')) !== undefined && x !== S.quality) { S.quality = x; needResize = true; }
    if ((x = v('scale')) !== undefined && x !== S.scale) { S.scale = x; needResize = true; }
    if ((x = v('autoscale')) !== undefined && x !== S.autoScale) { S.autoScale = x; dyn.s = 1; needResize = true; }
    if (needResize) resize();
    applyHud();
    // skin : le fichier prime sur le pseudo
    if (p.skinfile !== undefined || p.username !== undefined) {
      const f = p.skinfile !== undefined ? p.skinfile.value : S.skinFile;
      const u = p.username !== undefined ? (p.username.value || '').trim() : S.username;
      if (p.skinfile !== undefined) S.skinFile = f || '';
      if (p.username !== undefined) S.username = u;
      if (S.skinFile) loadSkinFromPath(S.skinFile, 'fichier');
      else if (S.username) loadSkinByName(S.username);
      else { skinReq++; useDefaultSkin(); }
    }
  },
  applyGeneralProperties(p) { if (p.fps !== undefined) fpsCap = p.fps; },
  setPaused(v) { paused = !!v; if (window.Ambience) window.Ambience.setPaused(paused); }
};

/* ----------------------------------------------------------------------
 *  Démarrage
 * -------------------------------------------------------------------- */
window.addEventListener('resize', resize);
resize();
bindPanel(); syncPanel(); applyHud();
resetCycle();
update(0.016);
if (S.username && !IN_WE.v) loadSkinByName(S.username);
requestAnimationFrame((t) => { lastFrame = t; frame(t); });

// debug / captures
window.__abyss = { S, st, U, player, creatures, resetCycle, loadSkinFromPath, capture() { update(0.016); renderPost(bloomNow); const t = document.createElement('canvas'); t.width = 640; t.height = 360; t.getContext('2d').drawImage(canvas, 0, 0, 640, 360); return t.toDataURL('image/jpeg', 0.9); }, jump(d) { U.scroll.value = d / M_PER_UNIT; st.cycle = Math.max(st.cycle, 12); st.vel = BASE_V; st.fade = 1; creatures.forEach(c => respawn(c, true)); } };
})();
