// Assemble le tuto : intègre les images en base64 et produit
//  - index.html           : page autonome (à ouvrir dans un navigateur / GitHub Pages)
//  - tuto-artifact.html   : même contenu sans <html>/<head>/<body> (pour la publication en Artifact)
const fs = require('fs'), path = require('path');
const root = __dirname;
let src = fs.readFileSync(path.join(root, 'src', 'tuto.src.html'), 'utf8');
const imgs = { __S1__: 's1-surface.jpg', __S2__: 's2-twilight.jpg', __S3__: 's3-midnight.jpg', __S4__: 's4-hadal.jpg' };
for (const [k, f] of Object.entries(imgs)) {
  const b64 = fs.readFileSync(path.join(root, 'img', f)).toString('base64');
  src = src.split(k).join('data:image/jpeg;base64,' + b64);
}
fs.writeFileSync(path.join(root, 'tuto-artifact.html'), src);
const standalone = '<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  src.replace('<title>Tuto Minecraft Abyss</title>', '<title>Tuto Minecraft Abyss</title>')
     .replace(/<main class="wrap">/, '</head>\n<body>\n<main class="wrap">') + '\n</body>\n</html>\n';
fs.writeFileSync(path.join(root, 'index.html'), standalone);
console.log('ok', (fs.statSync(path.join(root, 'index.html')).size / 1024) | 0, 'Ko');
