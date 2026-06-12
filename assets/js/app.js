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

    // deep-link ?code=XXXX → l'invité arrive direct sur l'étape "crée ton perso + pseudo"
    const code = new URLSearchParams(location.search).get('code');
    if (code) SJ.screens.joinProfile(code.toUpperCase().slice(0,5));
    else SJ.screens.home();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
