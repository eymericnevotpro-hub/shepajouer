# Motion Capture Webcam → Marshmallow

Anime le personnage du jeu avec **tes propres mouvements** filmés par la webcam,
enregistre-les, et associe-les à une touche (emote). **Pas de retargeting, pas de
Kimodo** : on pilote directement notre squelette.

```
webcam → MediaPipe Pose (squelette 3D) → on oriente chaque os → enregistrement → GLB → emote
```

## Utilisation

1. Lance le serveur local du jeu (le static sur le port 8765).
2. Ouvre **http://localhost:8765/tools/mocap/capture.html**
   (la caméra marche sur `localhost` sans HTTPS).
3. Clique **« Activer la caméra »** → autorise l'accès. (1er lancement : télécharge
   le modèle MediaPipe, quelques secondes.)
4. Mets-toi **face à la caméra, tout le corps visible**. Le marshmallow copie tes
   mouvements en direct. (Case **« Effet miroir »** si la gauche/droite est inversée.)
5. Clique **« ● Enregistrer »**, fais ton mouvement, clique **« ■ Stop »**.
6. **« ▶ Rejouer »** pour vérifier en boucle.
7. Donne un **nom** à l'emote puis **« 💾 Exporter GLB »** → télécharge
   `marshmallow_<nom>.glb`.

## Brancher dans le jeu

1. Mets le `.glb` dans `assets/`.
2. Ajoute une ligne dans `EMOTES` (`src/character.js`) :
   ```js
   { key: "2", name: "<nom>", url: "assets/marshmallow_<nom>.glb", dur: <durée s> },
   ```
3. En jeu, la touche joue ton mouvement (et les autres joueurs le voient).

👉 Ou **envoie-moi le GLB** (ou dis-moi le nom + la durée) et je le branche.

## Comment ça marche (technique)
- `capture.html` : Three.js (marshmallow) + MediaPipe `PoseLandmarker` (33 points 3D).
- `MAP` associe chaque os (`LeftArm`, `LeftForeArm`, jambes, `Spine02`, `Head`…) à un
  segment de landmarks (épaule→coude, coude→poignet, hanche→genou…).
- Chaque frame : on calcule la direction du segment et on aligne l'axe de l'os dessus
  (méthode parent-frame, `setFromUnitVectors` + conversion bone-local), avec lissage
  (slerp) pour réduire le tremblement.
- L'enregistrement capture le quaternion de chaque os piloté par frame → `QuaternionKeyframeTrack`
  → `AnimationClip` « mocap » → export GLB via `GLTFExporter`.

## Notes / limites
- Le marshmallow a des **bras courts** : les mouvements sont fidèles en direction mais
  l'amplitude visuelle est réduite.
- Seules les ROTATIONS sont capturées (pas le déplacement du corps) — le perso reste sur
  place, ce qui est exactement ce qu'il faut pour une emote.
- La tête est rejouée mais en jeu le regard joueur peut la surcharger.
- Validé : pilotage (bras levés→haut, T-pose→horizontal), enregistrement→clip 10 pistes,
  export GLB « mocap » valide. Le flux webcam est à tester côté utilisateur (pas de caméra
  en dev).
