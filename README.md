# Shepa Jouer

Jeu d'ambiance entre potes type **« longueur d'onde » / Wavelength** : un proposeur reçoit un thème (ex. ❄️ Froid → Chaud 🔥) et une **cible placée au hasard** sur un demi-cercle ; il donne un indice, les autres glissent leur aiguille pour viser la zone. Plus on est proche du centre, plus on marque (zones **+4 / +3 / +2**).

Style **« 3D bouncy coloré »** (palette bonbon, typo Baloo, boutons 3D « poussés ») — implémenté pixel-perfect depuis un handoff Claude Design.

## Lancer en local

Site statique, aucun build :

```bash
npx http-server . -p 8765 -c-1
# puis ouvre http://localhost:8765
```

## Les écrans (8)

Accueil · Avatar (à dessiner) · Lobby (code + réglages) · Proposeur · Devineur · Révélation · Podium · Boutique.

## Comment ça marche

- **Le proposeur** voit le thème, sa cible est **tirée au hasard**, il écrit/dit un indice.
- **Les devineurs** placent leur aiguille (glisser au doigt/souris), avec wobble élastique.
- **Score** : écart angulaire à la cible → +4 (≤5°), +3 (≤15°), +2 (≤25°), sinon 0. Le proposeur marque si les autres trouvent.
- **Pièces 🪙** gagnées en jouant → boutique (chapeaux, fonds, aiguilles, confettis). Jamais en payant.
- **Durée** : Courte (7 tours) · Normale (10) · Longue (15).

## Mode de jeu

- **v1 (en prod)** : jouable en **solo + bots** sur un seul appareil. Crée une partie → un code est généré pour inviter (le multi en ligne arrive en phase 2).
- **Phase 2** : multijoueur en ligne **par code** via WebRTC P2P (PeerJS), sans backend — les potes rejoignent et pop dans le lobby en temps réel.

## Stack

- HTML + CSS + JS vanilla (aucun build, aucune dépendance)
- Web Audio API pour les effets sonores (synthétisés, aucun fichier)
- Canvas pour l'avatar à dessiner · localStorage pour pseudo / pièces / items
- Déployé sur Vercel comme site statique

## Structure

```
index.html              # shell
assets/css/styles.css   # design system « bouncy »
assets/js/
  data.js     # thèmes (packs), boutique, avatars, bots
  store.js    # persistance localStorage
  audio.js    # effets sonores Web Audio
  cadran.js   # demi-cercle interactif + scoring
  avatar.js   # zone de dessin
  game.js     # moteur de partie (manches, bots, scores)
  screens.js  # rendu des 8 écrans + navigation
  app.js      # démarrage
```

## Archives

- `western/` — précédent prototype « Far West » (Three.js 3D + PeerJS).
- `.archive/` — ancien prototype Skool (mini-jeux + squat voxel).
