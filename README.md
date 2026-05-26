# Shepa Jouer

Mini-monde 3D entre potes — caméra 3ᵉ personne, ZQSD + saut, invitation par code.

## Lancer en local

Site statique. Sers le dossier avec n'importe quel HTTP server :

```bash
python -m http.server 8765
# puis ouvre http://localhost:8765
```

## Contrôles

- **ZQSD / WASD / flèches** : bouger
- **Espace** : sauter
- **Caméra** : 3ᵉ personne, suit le perso

## Multijoueur

WebRTC P2P via PeerJS — pas de backend.

1. Joueur A clique **Créer une partie** → reçoit un code à 5 caractères
2. A partage le code (bouton "copier")
3. Joueur B colle le code dans **Rejoindre avec un code**
4. Position synchronisée en temps réel (~20Hz)

Le broker PeerJS public sert juste à la négociation initiale; ensuite c'est du WebRTC direct.

## Stack

- HTML + CSS + JS vanilla (aucun build)
- [Three.js](https://threejs.org/) — rendu 3D
- [PeerJS](https://peerjs.com/) — multijoueur P2P
- Déployé sur Vercel comme site statique

## Archive

L'ancien prototype Skool (3 mini-jeux + squat 2.5D voxel) est conservé dans `.archive/` pour référence.
