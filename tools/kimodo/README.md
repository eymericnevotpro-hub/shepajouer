# Kimodo → Marshmallow : animer le perso avec du TEXTE

NVIDIA Kimodo (texte → mouvement 3D) est **installé et fonctionnel** sur cette
machine, et **aucun compte / token Hugging Face n'est nécessaire** (contournement
en place : copie publique du Llama). Tout a été testé de bout en bout.

```
texte → Kimodo (BVH SOMA) → retarget Blender → assets/marshmallow_<nom>.glb → emote
```

---

## ⚡ Créer une animation en UNE commande

Dans un terminal Ubuntu :
```bash
wsl -d Ubuntu -u root
bash /mnt/c/Users/BRICKOUILLE/Documents/ShepaJouer/tools/kimodo/make_emote.sh "a cowboy tips his hat" tiphat 3.0
```
- `$1` = prompt en **anglais** · `$2` = nom de fichier · `$3` = durée (s).
- Ça génère le mouvement, le retargete sur le marshmallow, et écrit
  `assets/marshmallow_tiphat.glb`. Le script affiche ensuite **la ligne à coller**
  dans `EMOTES` (src/character.js). Touche correspondante en jeu = l'anim joue.

Idées de prompts : *tips his hat*, *quick-draw a pistol and holster it*, *victory dance*,
*wave hello*, *sit down and cross arms*, *reload a rifle*, *clap hands*, *bow*.

> Déjà fait : `wave` (touche **1**) — `assets/marshmallow_wave.glb`.

---

## Comment ça marche (pour info)

1. **Install** (faite) : `install_wsl.sh` → Python 3.12 + PyTorch CUDA 12.8 (RTX 5090)
   + Kimodo dans `/root/kimodo/.venv`. `install_blender_wsl.sh` → Blender 4.2.
2. **Encodeur de texte sans token** (fait) : `setup_textencoder.py` télécharge la copie
   publique `NousResearch/Meta-Llama-3-8B-Instruct` (identique au modèle gated) + les
   encodeurs McGill-NLP + le modèle SOMA, et les met en cache. La génération tourne en
   `HF_HUB_OFFLINE=1` → jamais de mur « gated ».
3. **Génération** : `kimodo_gen "..." --model Kimodo-SOMA-RP-v1 --bvh --bvh_standard_tpose`
   → un BVH (squelette SOMA `somaskel77`).
4. **Retarget** : `retarget_marshmallow.py` (Blender headless) mappe le BVH sur notre rig
   via `soma_to_marshmallow.json` (22/22 os) et exporte le GLB.
5. **Jeu** : table `EMOTES` dans `src/character.js` → touche 1-9, joué sur l'avatar,
   visible des autres joueurs.

## Fichiers
- `make_emote.sh` ← **l'outil à utiliser** (texte → GLB).
- `install_wsl.sh`, `install_blender_wsl.sh`, `setup_textencoder.py` — install (déjà exécutés).
- `retarget_marshmallow.py`, `soma_to_marshmallow.json` — le retarget.
- `anim.sh` — génère juste le BVH (sans retarget), si besoin.
- `smplx_to_marshmallow.json` — mapping alternatif (voie SMPL-X, non utilisée).

## Pièges
- Prompts en **anglais** (le modèle est entraîné en anglais).
- Pieds qui glissent / anim trop rapide : ajuste `dur`, ou calibre le `timeScale`
  comme walk/run (voir MEMORY).
- Bras tordus sur une anim : ouvre le BVH dans Blender + addon **Rokoko** pour un
  retarget manuel (recalcule mieux les offsets de pose).
- Note licence : on utilise un mirror public des poids Llama-3 (usage perso).
