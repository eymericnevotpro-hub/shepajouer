/* ============================================================
   AUDIO — petits effets synthétisés (Web Audio, aucun fichier)
   ============================================================ */
window.SJ = window.SJ || {};

SJ.audio = (function(){
  let ctx = null;
  let muted = !!(SJ.store && SJ.store.get('settings').muted);

  function ac(){
    if (!ctx){ try{ ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; } }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // une note simple avec enveloppe
  function tone(freq, dur, {type='sine', gain=0.18, slideTo=null, delay=0}={}){
    const a = ac(); if(!a || muted) return;
    const t0 = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, {gain=0.15, delay=0, hp=800}={}){
    const a = ac(); if(!a || muted) return;
    const t0 = a.currentTime + delay;
    const n = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, n, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<n;i++) d[i] = (Math.random()*2-1) * (1 - i/n);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type='highpass'; f.frequency.value=hp;
    const g = a.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(a.destination);
    src.start(t0);
  }
  const seq = (notes)=> notes.forEach(([f,d,delay,type])=> tone(f,d,{delay,type:type||'triangle',gain:0.16}));

  const API = {
    unlock(){ ac(); },
    isMuted(){ return muted; },
    setMuted(m){ muted = m; if(SJ.store) SJ.store.setIn('settings','muted',m); },
    toggle(){ this.setMuted(!muted); return muted; },

    click(){ tone(420, .05, {type:'triangle', gain:.10}); },
    tick(){ tone(1300, .015, {type:'square', gain:.045}); },              // glisse du cadran
    pop(){ tone(540, .09, {type:'triangle', gain:.16, slideTo:880}); },
    validate(){ seq([[660,.09,0],[990,.12,.07]]); },
    drop(){ tone(300,.14,{type:'sine',gain:.16,slideTo:200}); },          // wobble aiguille
    reveal(){ noise(.25,{gain:.10,hp:500}); tone(523,.18,{delay:.05,type:'sine',gain:.12,slideTo:784}); },
    score(pts){
      if (pts>=4){ seq([[784,.1,0],[1047,.1,.08],[1319,.18,.16]]); }
      else if (pts>0){ seq([[659,.1,0],[880,.12,.08]]); }
      else { tone(200,.22,{type:'sawtooth',gain:.12,slideTo:120}); }      // +0 « pschitt »
    },
    coin(){ tone(1175,.06,{type:'square',gain:.12}); tone(1568,.10,{delay:.05,type:'square',gain:.12}); },
    key(){ tone(1500+Math.random()*600,.018,{type:'square',gain:.05}); },                 // frappe clavier satisfaisante
    nope(){ tone(196,.13,{type:'sawtooth',gain:.14,slideTo:120}); noise(.05,{gain:.05,hp:300}); },  // « c'est pas bon »
    win(){ seq([[523,.12,0],[659,.12,.1],[784,.12,.2],[1047,.28,.3]]); noise(.4,{gain:.06,delay:.3,hp:300}); },
    lose(){ seq([[392,.16,0,'sawtooth'],[330,.16,.14,'sawtooth'],[247,.3,.28,'sawtooth']]); },
  };
  return API;
})();
