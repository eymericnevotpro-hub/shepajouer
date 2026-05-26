# Shepa Jouer

Party games · squat virtuel · entre potes.

Un jeu en ligne où on crée un personnage en voxel, on atterrit dans un squat 2.5D avec des potes, et on joue à des mini-jeux ensemble.

## Lancer en local

C'est un site statique. Ouvre `index.html` dans un navigateur, ou sers le dossier avec n'importe quel serveur HTTP :

```bash
python -m http.server 8000
# puis visite http://localhost:8000
```

## Jouer

1. **Accueil** — crée une partie ou rejoins avec un code
2. **Créateur** — customise ton perso voxel (pseudo, tête, coupe, couleurs, accessoire)
3. **Lobby** — partage le code avec tes potes
4. **Squat** — WASD pour bouger, E pour interagir avec une table
5. **Mini-jeux** :
   - 🦤 **Cha-Pas-Possible** — bluff/enchères numériques
   - 💥 **Toz!** — réflexe : slap les doubles & les étoiles, évite les bombes
   - 🎤 **Crachoir** — bluff de définitions

## Stack

- HTML + CSS + JSX (Babel standalone)
- React 18 chargé depuis CDN
- Polices Google Fonts (Bungee, Space Grotesk, DM Mono)
- Aucune build step nécessaire

## Déploiement

Déployé sur Vercel comme site statique.
