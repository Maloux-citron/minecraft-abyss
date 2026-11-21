# Minecraft Abyss

Fond d'écran animé en 3D temps réel (WebGL / Three.js) : ton skin Minecraft coule lentement de la surface
ensoleillée jusqu'à **10 935 m** (fosse des Mariannes), puis recommence. Compatible **Wallpaper Engine** (type « web »)
et n'importe quel navigateur.

> Projet de fan, non officiel. Non affilié à Mojang Studios ni à Microsoft. « Minecraft » est une marque de Mojang Synergies AB.
> Aucun fichier Mojang n'est inclus : le skin par défaut est dessiné en code.

## Ce que tu vois en descendant
- **0 – 200 m** : surface vue d'en dessous, rayons de soleil, bancs de poissons, requins en silhouette
- **200 – 1 000 m** : crépuscule, méduses lumineuses, la lampe de plongeur s'allume
- **1 000 m et plus** : noir total, neige marine, plancton bioluminescent, méduses
- Compteur de profondeur, pression (atm) et température en direct
- Ambiance sonore relaxante 100 % synthétisée (aucun bruit blanc, aucun fichier audio) : houle tonale, nappe douce, bulles, notes cristallines, chants de baleine

## Installation
### Wallpaper Engine
1. Copie le dossier dans `…\steamapps\common\wallpaper_engine\projects\myprojects\`
2. Ouvre Wallpaper Engine → **Installés** → « Minecraft Abyss » (ou *Ouvrir un fond d'écran → Depuis un fichier* → `project.json`).
3. Règle le skin (fichier PNG ou pseudo Java), la pose, la vitesse, la palette, la qualité, le volume…

### Navigateur
Ouvre `index.html` (ou double-clique `Lancer.bat` pour le plein écran sous Edge/Chrome).
Bouton ⚙ en haut à droite : pseudo, fichier ou glisser-déposer d'un PNG, réglages. Touches : **H** = masquer la profondeur, **F** = plein écran.
Clique une fois sur la page pour activer le son (règle des navigateurs).

## Skins
Formats gérés : 64×64 (Steve / Alex — bras fins détectés automatiquement), anciens 64×32, skins HD.
Le chargement par pseudo envoie uniquement le pseudo à minotar.net / mc-heads.net pour récupérer l'image.

## Performances
Qualité Basse/Moyenne/Haute, résolution du rendu réglable et ajustement automatique. La limite de FPS est celle de
Wallpaper Engine (Paramètres → Performances).

## Structure
| Fichier | Rôle |
|---|---|
| `index.html` | page, HUD, panneau de réglages |
| `app.js` | moteur : océan, skin 3D, particules, créatures, post-traitement |
| `ambience.js` | ambiance sonore synthétisée (Web Audio) |
| `project.json` | propriétés Wallpaper Engine |
| `three.min.js` | Three.js r149 (MIT) |

## Licence
Code sous licence MIT (voir `LICENSE`). Three.js © les auteurs de Three.js, licence MIT.
