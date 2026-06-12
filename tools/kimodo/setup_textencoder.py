"""Prépare l'encodeur de texte de Kimodo SANS compte Hugging Face gated :
on télécharge une copie PUBLIQUE et identique du Llama-3 (NousResearch) + les
encodeurs publics McGill-NLP + le modèle de mouvement SOMA, puis on fait passer
la copie publique pour `meta-llama/...` dans le cache HF (poids identiques).
Ensuite la génération tourne en mode hors-ligne (HF_HUB_OFFLINE=1)."""
import os, glob, shutil
from huggingface_hub import snapshot_download

HUB = os.path.expanduser("~/.cache/huggingface/hub")

def dl(repo, **kw):
    print(f">> download {repo}", flush=True)
    p = snapshot_download(repo, **kw)
    print(f"   -> {p}", flush=True)
    return p

nous = dl("NousResearch/Meta-Llama-3-8B-Instruct")          # ungated, identical weights
mntp = dl("McGill-NLP/LLM2Vec-Meta-Llama-3-8B-Instruct-mntp")
sup  = dl("McGill-NLP/LLM2Vec-Meta-Llama-3-8B-Instruct-mntp-supervised")
soma = dl("nvidia/Kimodo-SOMA-RP-v1")                        # motion model (open license)

# Make NousResearch masquerade as the gated meta-llama repo in the HF cache.
meta_dir = os.path.join(HUB, "models--meta-llama--Meta-Llama-3-8B-Instruct")
snap = os.path.join(meta_dir, "snapshots", "main")
os.makedirs(snap, exist_ok=True)
os.makedirs(os.path.join(meta_dir, "refs"), exist_ok=True)
with open(os.path.join(meta_dir, "refs", "main"), "w") as f:
    f.write("main")
for name in os.listdir(nous):
    dst = os.path.join(snap, name)
    if not os.path.lexists(dst):
        os.symlink(os.path.join(nous, name), dst)
print("meta-llama cache files:", sorted(os.listdir(snap)), flush=True)

# Make sure the adapter dirs have tokenizer files (copy from the mirror if missing).
for d in (mntp, sup):
    has_tok = any(os.path.exists(os.path.join(d, f))
                  for f in ("tokenizer.json", "tokenizer.model", "tokenizer_config.json"))
    if not has_tok:
        for f in glob.glob(os.path.join(nous, "token*")) + glob.glob(os.path.join(nous, "special_tokens*")):
            shutil.copy(f, d)
        print(f"   copied tokenizer into {d}", flush=True)

print("SETUP_DONE", flush=True)
