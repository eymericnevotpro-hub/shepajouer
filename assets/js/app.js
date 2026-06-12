/* ============================================================
   APP — démarrage
   ============================================================ */
(function(){
  function boot(){
    const mute = document.getElementById('mute');
    const sync = ()=>{ mute.textContent = SJ.audio.isMuted() ? '🔇' : '🔊'; };
    sync();
    mute.addEventListener('click', ()=>{ const m = SJ.audio.toggle(); sync(); if(!m) SJ.audio.pop(); });

    // débloque l'audio au 1er geste (politique navigateur)
    window.addEventListener('pointerdown', ()=> SJ.audio.unlock(), {once:true});

    SJ.screens.home();

    // deep-link ?code=XXXX → pré-remplit le champ Rejoindre
    const code = new URLSearchParams(location.search).get('code');
    if (code){ const f = document.getElementById('code-in'); if (f) f.value = code.toUpperCase().slice(0,5); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
