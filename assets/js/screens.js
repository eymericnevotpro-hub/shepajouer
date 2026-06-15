/* ============================================================
   SCREENS — rendu des 8 écrans + navigation + boucle de manche
   ============================================================ */
window.SJ = window.SJ || {};

SJ.screens = (function(){
  const app = () => document.getElementById('app');
  const S = SJ.store;
  let pending = [];      // setTimeout en cours
  let ticker = null;     // timer de phase
  let session = { code:null, botCount:3 };

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function clearTimers(){ pending.forEach(clearTimeout); pending=[]; if(ticker){clearInterval(ticker); ticker=null;} }
  function after(ms, fn){ const id=setTimeout(fn,ms); pending.push(id); return id; }
  function mount(html){ clearTimers(); const a=app(); a.innerHTML=html; a.scrollTop=0; return a; }
  function $(sel){ return app().querySelector(sel); }
  function code5(){ const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<5;i++) s+=A[Math.floor(Math.random()*A.length)]; return s; }

  function avaInner(av){ if(av && av.type==='draw') return `<img src="${esc(av.value)}" alt="">`; return esc(av && av.value ? av.value : '🙂'); }
  function youEmoji(){ const av=S.get('avatar'); return av && av.type==='emoji' ? av.value : '⭐'; }

  // avatar + chapeau positionné — le rond ne coupe pas le chapeau (il peut dépasser)
  // p = { avatar, emoji, hat (glyph), hatPos {x,y,s,r}, bg }
  function avaBox(p, px){
    p = p || {}; const av = p.avatar || {type:'emoji', value:p.emoji||'🙂'};
    const base = av.type==='draw' ? `<img src="${esc(av.value)}" alt="" style="width:100%;height:100%;object-fit:cover">` : esc(av.value || p.emoji || '🙂');
    const bg = p.bg || '#FFF8EC';
    let hatEl = '';
    if (p.hat){ const h = p.hatPos || {x:0,y:-0.72,s:0.66,r:0};
      hatEl = `<span style="position:absolute;left:${(50+(h.x||0)*50)}%;top:${(50+(h.y||0)*50)}%;font-size:${((h.s||0.66)*px)}px;line-height:1;transform:translate(-50%,-50%) rotate(${h.r||0}deg);pointer-events:none">${esc(p.hat)}</span>`; }
    return `<span style="position:relative;display:inline-block;width:${px}px;height:${px}px;flex:none;vertical-align:middle">`
      + `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;border:3px solid #3B2D5E;border-radius:50%;overflow:hidden;background:${bg};font-size:${Math.round(px*0.46)}px">${base}</span>`
      + hatEl + `</span>`;
  }
  // profil avatar du joueur local (avatar + chapeau équipé + fond)
  function myAvatarProfile(){
    const eq = S.get('equipped'); const hatItem = eq.hat ? SJ.shopItem(eq.hat) : null;
    return { avatar:S.get('avatar'), emoji:youEmoji(), hat:hatItem?hatItem.glyph:'', hatPos:eq.hatPos, bg:eq.bg||null };
  }

  /* ---------- toast & confetti ---------- */
  function toast(msg){
    const t=document.createElement('div'); t.textContent=msg;
    t.style.cssText='position:fixed;left:50%;bottom:84px;transform:translateX(-50%);background:#3B2D5E;color:#fff;font-family:Baloo 2;font-weight:700;padding:10px 20px;border-radius:999px;z-index:80;box-shadow:0 5px 0 rgba(0,0,0,.2);animation:popIn .3s both';
    document.body.appendChild(t); setTimeout(()=>{t.style.transition='opacity .3s';t.style.opacity='0';},1500); setTimeout(()=>t.remove(),1900);
  }
  function confetti(n=80){
    const host=document.getElementById('confetti'); const cols=['#FF5D73','#FFC93C','#2EC4B6','#9B5DE5','#4D96FF','#FF8FA3'];
    for(let i=0;i<n;i++){ const c=document.createElement('div'); c.className='conf';
      c.style.left=Math.random()*100+'vw'; c.style.top=(-10-Math.random()*20)+'vh';
      c.style.background=cols[i%cols.length]; c.style.transform=`rotate(${Math.random()*360}deg)`;
      c.style.animationDuration=(1.6+Math.random()*1.6)+'s'; c.style.animationDelay=(Math.random()*.5)+'s';
      host.appendChild(c); setTimeout(()=>c.remove(),3600);
    }
  }

  /* ======================================================
     01 — ACCUEIL
     ====================================================== */
  function home(){
    const coins=S.get('coins'), pseudo=S.get('pseudo')||'';
    mount(`
      <section class="screen">
        <div class="blob" style="top:-40px;left:-30px;width:150px;height:150px;background:#FFC93C;opacity:.45"></div>
        <div class="blob" style="bottom:-60px;right:-40px;width:200px;height:200px;background:#2EC4B6;opacity:.3"></div>
        <div class="stage" style="align-items:center;text-align:center;gap:22px">
          <div class="title-xl floaty">Shepa Jouer&nbsp;!</div>
          <div class="muted" style="font-size:18px;font-weight:700;max-width:440px">Un indice, un cadran, vise juste 🎯 — jeu d'ambiance entre potes.</div>
          <div class="row" style="justify-content:center;flex-wrap:wrap">
            <span id="ava-prev">${avaBox(myAvatarProfile(),58)}</span>
            <input id="pseudo" class="field" style="width:230px" maxlength="14" placeholder="Ton pseudo…" value="${esc(pseudo)}">
            <button class="caveat" id="go-ava" style="background:none;border:none;text-decoration:underline;cursor:pointer;font-size:18px">changer de tête →</button>
          </div>
          <div class="col" style="gap:14px;width:min(340px,90vw)">
            <button class="btn btn--coral lg block" id="create">🎉 Créer une partie</button>
            <div class="spread">
              <button class="btn btn--teal grow" id="join">Rejoindre</button>
              <input id="code-in" class="field code" style="width:140px" maxlength="5" placeholder="CODE">
            </div>
          </div>
          <div class="row" style="justify-content:center;flex-wrap:wrap;font-size:16px">
            <span class="pill paper">🪙 <span id="coins">${coins}</span></span>
            <button class="pill lilac" id="go-shop" style="cursor:pointer">🛍️ boutique</button>
            <button class="pill mint" id="rules" style="cursor:pointer">❓ règles</button>
          </div>
        </div>
      </section>`);
    $('#pseudo').addEventListener('input', e=> S.set('pseudo', e.target.value.trim()));
    $('#go-ava').onclick = ()=>{ SJ.audio.click(); avatar(); };
    $('#create').onclick = ()=>{ if(!ensurePseudo()) return; SJ.audio.pop(); SJ.room.createHost(); };
    $('#join').onclick = ()=>{ const c=$('#code-in').value.trim().toUpperCase(); if(c.length<4){ toast('Entre un code à 5 lettres'); return;} SJ.audio.pop(); joinProfile(c); };
    $('#go-shop').onclick = ()=>{ SJ.audio.click(); shop(); };
    $('#rules').onclick = ()=>{ SJ.audio.click(); rules(); };
  }
  function ensurePseudo(){ const p=(S.get('pseudo')||'').trim(); if(!p){ toast('Choisis un pseudo 😊'); const f=$('#pseudo'); f&&f.focus(); return false;} return true; }

  /* ======================================================
     02 — AVATAR
     ====================================================== */
  function avatar(opts){
    opts=opts||{}; const done=()=>(opts.then?opts.then():home());
    mount(`
      <section class="screen">
        <div class="stage" style="max-width:620px">
          <div class="row between" style="align-items:center"><div class="row gap8" style="align-items:center"><span class="badge" style="background:#FFC93C;color:#3B2D5E;box-shadow:0 3px 0 #D9A416;transform:rotate(2deg)">02</span><h2 style="font-size:24px">Crée ta tête</h2></div><button class="pill lilac" id="ava-shop" style="cursor:pointer;font-weight:800;font-size:14px">🛍️ boutique</button></div>
          <div class="card sh-yellow" style="display:flex;gap:22px;flex-wrap:wrap;justify-content:center">
            <div class="col" style="gap:12px;align-items:center;flex:1;min-width:270px">
              <div id="pad" style="position:relative;line-height:0"></div>
              <div class="seg" id="mode">
                <button class="seg-btn active" data-m="draw" type="button">✏️ Dessiner</button>
                <button class="seg-btn" data-m="hat" type="button">🎩 Chapeau</button>
              </div>
              <!-- outils DESSIN -->
              <div id="tools-draw" class="col" style="gap:11px;width:100%;align-items:center">
                <div class="row wrap gap6" style="justify-content:center" id="swatches"></div>
                <div class="row" style="gap:11px;align-items:center;width:100%;max-width:300px"><span style="font-size:19px">✏️</span><input type="range" id="brush" class="rng" min="2" max="42" value="12" style="flex:1"><span style="flex:none;width:46px;height:46px;display:flex;align-items:center;justify-content:center"><span id="brushdot" style="border-radius:50%;background:#3B2D5E;display:block"></span></span></div>
                <div class="row gap6" style="justify-content:center"><button class="tool" id="undo" type="button" style="width:auto;padding:0 12px;font-size:14px">↩︎ annuler</button><button class="tool" id="clr" type="button" style="width:auto;padding:0 12px;font-size:14px">🗑 effacer</button></div>
              </div>
              <!-- outils CHAPEAU -->
              <div id="tools-hat" class="col" style="gap:11px;width:100%;align-items:center;display:none">
                <div class="row wrap gap6" style="justify-content:center;align-items:center" id="hats"></div>
                <div class="row" style="gap:10px;align-items:center;width:100%;max-width:300px"><span style="font-size:14px;font-weight:700;min-width:54px">↔️ taille</span><input type="range" id="hsize" class="rng" min="25" max="145" value="66" style="flex:1"></div>
                <div class="row" style="gap:10px;align-items:center;width:100%;max-width:300px"><span style="font-size:14px;font-weight:700;min-width:54px">🔄 angle</span><input type="range" id="hrot" class="rng" min="-180" max="180" value="0" style="flex:1"></div>
                <div class="caveat" id="hathint" style="font-size:15px">glisse le chapeau sur ta tête 🎩 (il peut dépasser !)</div>
              </div>
            </div>
            <div class="col" style="gap:12px;width:170px;min-width:160px">
              <div style="font-size:16px;font-weight:700">Ou pars d'un modèle :</div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px" id="tmpls"></div>
              <div class="grow"></div>
              <button class="btn btn--teal block" id="save">C'est moi ✓</button>
            </div>
          </div>
          <button class="btn btn--ghost sm" id="back" style="align-self:flex-start">← retour</button>
        </div>
      </section>`);
    const pad = SJ.avatar.makePad({size:250});
    $('#pad').appendChild(pad.canvas);
    const savedAv = S.get('avatar');
    if(savedAv && savedAv.type==='draw' && savedAv.value){ pad.loadDataURL(savedAv.value); }   // recharge le dessin existant

    // ---- couleurs ----
    const sw=$('#swatches');
    SJ.AVATAR.palette.forEach((c,i)=>{ const d=document.createElement('div'); d.className='swatch'+(i===0?' active':''); d.style.background=c; d.title=c;
      d.onclick=()=>{ pad.setColor(c); sw.querySelectorAll('.swatch').forEach(s=>s.classList.remove('active')); d.classList.add('active'); SJ.audio.click(); }; sw.appendChild(d); });
    // ---- taille du crayon : slider + aperçu en direct ----
    const brush=$('#brush'), dot=$('#brushdot');
    const setBrush=(w)=>{ pad.setBrush(w); const d=Math.max(4,Math.min(34,w)); dot.style.width=d+'px'; dot.style.height=d+'px'; };
    brush.oninput=()=>{ setBrush(+brush.value); SJ.audio.tick(); }; setBrush(12);
    $('#undo').onclick=()=>{ pad.undo(); };
    $('#clr').onclick=()=>{ pad.clear(); SJ.audio.click(); };
    // ---- modèles ----
    const tg=$('#tmpls'); let chosen=null;
    SJ.AVATAR.templates.slice(0,5).forEach((e,i)=>{ const d=document.createElement('div'); d.className='tmpl'; d.style.background=['#FFE3E8','#FFF1C9','#E4F8F6','#EAF2FF','#F4EFFF'][i%5]; d.textContent=e;
      d.onclick=()=>{ pad.template(e); chosen=e; }; tg.appendChild(d); });
    const add=document.createElement('div'); add.className='tmpl'; add.style.border='2px dashed #A99CC9'; add.style.color='#A99CC9'; add.textContent='+';
    add.onclick=()=>{ const e=SJ.AVATAR.templates[5+Math.floor(Math.random()*5)]; pad.template(e); chosen=e; }; tg.appendChild(add);

    // ---- chapeau : glisser (position) + sliders (taille / angle) ----
    const padEl=$('#pad'); let hp=Object.assign({x:0,y:-0.72,s:0.66,r:0}, S.get('equipped').hatPos||{}); let handle=null; let mode='draw';
    const hatGlyph=()=>{ const id=S.get('equipped').hat; const it=id?SJ.shopItem(id):null; return it?it.glyph:''; };
    const clampN=v=>Math.max(-1.45,Math.min(1.45,v));
    function placeHandle(){ if(!handle) return; const r=padEl.getBoundingClientRect(); const px=r.width||250;
      handle.style.left=(50+hp.x*50)+'%'; handle.style.top=(50+hp.y*50)+'%'; handle.style.fontSize=(hp.s*px)+'px'; handle.style.transform=`translate(-50%,-50%) rotate(${hp.r}deg)`; }
    function saveHat(){ S.equip('hatPos',{x:+hp.x.toFixed(3),y:+hp.y.toFixed(3),s:+hp.s.toFixed(3),r:hp.r}); }
    function applyMode(){ const drawing=mode==='draw';
      pad.canvas.style.pointerEvents = drawing?'auto':'none';                 // en mode chapeau, on ne dessine pas
      if(handle){ handle.style.pointerEvents = drawing?'none':'auto'; handle.style.opacity = drawing?'.8':'1'; }  // en mode dessin, on dessine SOUS le chapeau
      $('#tools-draw').style.display = drawing?'flex':'none';
      $('#tools-hat').style.display = drawing?'none':'flex';
      $('#mode').querySelectorAll('.seg-btn').forEach(b=> b.classList.toggle('active', b.dataset.m===mode));
      const hint=$('#hathint'); if(hint) hint.textContent = hatGlyph()? 'glisse le chapeau sur ta tête 🎩 (il peut dépasser !)' : 'choisis un chapeau ci-dessus 👆';
    }
    function renderHandle(){ if(handle){handle.remove();handle=null;} const g=hatGlyph(); if(!g){ applyMode(); return; }
      handle=document.createElement('div'); handle.textContent=g;
      handle.style.cssText='position:absolute;cursor:grab;user-select:none;line-height:1;z-index:3;touch-action:none;filter:drop-shadow(0 2px 0 rgba(0,0,0,.18))';
      padEl.appendChild(handle); placeHandle();
      let drag=false;
      handle.addEventListener('pointerdown',e=>{ if(mode!=='hat')return; e.preventDefault(); drag=true; handle.style.cursor='grabbing'; try{handle.setPointerCapture(e.pointerId);}catch(_){} SJ.audio.tick(); });
      handle.addEventListener('pointermove',e=>{ if(!drag)return; e.preventDefault(); const r=padEl.getBoundingClientRect(); hp.x=clampN((e.clientX-r.left)/r.width*2-1); hp.y=clampN((e.clientY-r.top)/r.height*2-1); placeHandle(); });
      handle.addEventListener('pointerup',()=>{ if(!drag)return; drag=false; handle.style.cursor='grab'; saveHat(); });
      applyMode();
    }
    function renderHats(){ const wrap=$('#hats'); const eqHat=S.get('equipped').hat; const owned=S.get('owned').filter(id=>id.indexOf('hat-')===0);
      let html=`<div class="tmpl" data-hat="" style="background:${eqHat?'#fff':'#FFC93C'};font-size:12px;width:auto;height:34px;padding:0 10px;font-weight:800">aucun</div>`;
      owned.forEach(id=>{ const it=SJ.shopItem(id); if(it) html+=`<div class="tmpl" data-hat="${id}" style="background:${eqHat===id?'#FFC93C':'#fff'};font-size:20px">${it.glyph}</div>`; });
      wrap.innerHTML=html;
      wrap.querySelectorAll('[data-hat]').forEach(x=> x.onclick=()=>{ S.equip('hat', x.dataset.hat||null); SJ.audio.click(); renderHandle(); renderHats(); });
    }
    // sliders chapeau
    const hsize=$('#hsize'), hrot=$('#hrot');
    hsize.value=Math.round(hp.s*100); hrot.value=Math.round(hp.r);
    hsize.oninput=()=>{ hp.s=(+hsize.value)/100; placeHandle(); saveHat(); };
    hrot.oninput=()=>{ hp.r=+hrot.value; placeHandle(); saveHat(); };
    // toggle dessin / chapeau
    $('#mode').querySelectorAll('.seg-btn').forEach(b=> b.onclick=()=>{ mode=b.dataset.m; SJ.audio.click(); applyMode(); });
    renderHats(); renderHandle();

    $('#save').onclick=()=>{ if(!pad.isBlank()){ S.set('avatar',{type:'draw',value:pad.toDataURL()}); }
      else if(chosen){ S.set('avatar',{type:'emoji',value:chosen}); }
      else if(!S.get('avatar')){ toast('Dessine ou choisis un modèle 🎨'); return; }
      SJ.audio.validate(); confetti(30); done(); };
    $('#back').onclick=()=>{ SJ.audio.click(); done(); };
    $('#ava-shop').onclick=()=>{ SJ.audio.click(); shop({then: ()=>avatar(opts)}); };   // boutique → retour à l'éditeur d'avatar
  }

  /* ---------- étape profil avant de rejoindre (invité) ---------- */
  function joinProfile(code){
    const av=S.get('avatar'), pseudo=S.get('pseudo')||'';
    mount(`
      <section class="screen">
        <div class="blob" style="top:-40px;right:-30px;width:150px;height:150px;background:#FF8FA3;opacity:.4"></div>
        <div class="stage" style="max-width:440px;align-items:center;text-align:center;gap:18px">
          <div class="title-xl" style="font-size:40px">Rejoindre 🎈</div>
          <div class="muted" style="font-weight:700">Partie <b style="color:#FF5D73;letter-spacing:4px">${esc(code)}</b> — crée ton perso pour entrer</div>
          <span id="ava-prev">${avaBox(myAvatarProfile(),58)}</span>
          <input id="pseudo" class="field" style="width:240px" maxlength="14" placeholder="Ton pseudo…" value="${esc(pseudo)}">
          <div class="row gap8" style="justify-content:center">
            <button class="btn btn--ghost sm" id="draw">✏️ dessiner ma tête</button>
            <button class="btn btn--ghost sm" id="emoji">🎲 emoji</button>
          </div>
          <button class="btn btn--coral lg block" id="go" style="max-width:300px">Rejoindre la partie ▶</button>
          <div id="status" class="muted" style="font-weight:700;min-height:22px"></div>
          <button class="btn btn--ghost sm" id="back">← annuler</button>
        </div>
      </section>`);
    $('#pseudo').addEventListener('input', e=> S.set('pseudo', e.target.value.trim()));
    $('#draw').onclick=()=>{ SJ.audio.click(); avatar({then:()=>joinProfile(code)}); };
    $('#emoji').onclick=()=>{ const e=SJ.AVATAR.templates[Math.floor(Math.random()*SJ.AVATAR.templates.length)]; S.set('avatar',{type:'emoji',value:e}); $('#ava-prev').innerHTML=avaBox(myAvatarProfile(),58); SJ.audio.pop(); };
    $('#go').onclick=()=>{ const p=(S.get('pseudo')||'').trim(); if(!p){ toast('Choisis un pseudo 😊'); $('#pseudo').focus(); return; }
      $('#status').textContent='Connexion à la partie…'; SJ.audio.pop();
      SJ.room.join(code, (err)=>{ $('#status').textContent = err==='not-found'?'😕 Aucune partie avec ce code':err==='timeout'?'⏳ Hôte introuvable — réessaie':'Connexion échouée'; SJ.audio.lose(); }); };
    $('#back').onclick=()=>{ SJ.audio.click(); home(); };
  }

  /* ======================================================
     03 — LOBBY
     ====================================================== */
  function lobbyBots(){ return SJ.BOTS.slice(0, session.botCount); }
  function lobby(){
    const pseudo=S.get('pseudo')||'Toi'; const st=S.get('settings');
    mount(`
      <section class="screen">
        <div class="stage wide">
          <div class="card sh-teal" style="gap:18px;display:flex;flex-direction:column">
            <div class="row between wrap" style="gap:10px">
              <div style="font-size:22px;font-weight:800">La partie de <span style="color:#FF5D73">${esc(pseudo)}</span> 🎈</div>
              <div class="row gap8">
                <div class="pill paper" style="font-size:26px;font-weight:800;letter-spacing:6px;border-style:dashed">${esc(session.code||code5())}</div>
                <button class="btn btn--ghost sm" id="copy">copier le lien ⎘</button>
              </div>
            </div>
            <div class="row wrap" style="gap:18px;align-items:stretch">
              <div class="panel paper" style="flex:1.3;min-width:240px">
                <div class="row between"><span class="panel-label">Joueurs — <span id="pcount"></span>/10</span>
                  <span class="row gap6"><button class="tool" id="bot-minus">−</button><span style="font-size:14px;font-weight:700" class="muted">bots</span><button class="tool" id="bot-plus">+</button></span></div>
                <div id="players" class="col" style="gap:10px"></div>
              </div>
              <div class="col" style="flex:1;gap:14px;min-width:240px">
                <div class="panel lilac">
                  <div class="panel-label">Durée de la partie</div>
                  <div class="spread" id="durs"></div>
                </div>
                <div class="panel mint">
                  <div class="panel-label">Thèmes</div>
                  <div class="row wrap gap8" id="packs"></div>
                </div>
                <div class="grow"></div>
                <button class="btn btn--coral lg block" id="start">Lancer la partie ▶</button>
              </div>
            </div>
          </div>
          <div class="hint">↳ multi en ligne par code : phase 2 (les potes pop dans la liste en temps réel). Pour l'instant : toi + des bots, jouable direct !</div>
          <button class="btn btn--ghost sm" id="back" style="align-self:flex-start">← retour</button>
        </div>
      </section>`);
    renderPlayers(); renderDurs(); renderPacks();
    $('#copy').onclick=()=>{ const link=location.origin+location.pathname+'?code='+(session.code||''); (navigator.clipboard?navigator.clipboard.writeText(link):0); toast('Lien copié ! 🔗'); SJ.audio.click(); };
    $('#bot-plus').onclick=()=>{ session.botCount=Math.min(7,session.botCount+1); SJ.audio.pop(); renderPlayers(); };
    $('#bot-minus').onclick=()=>{ session.botCount=Math.max(1,session.botCount-1); SJ.audio.click(); renderPlayers(); };
    $('#start').onclick=()=>{ startMatch(); };
    $('#back').onclick=()=>{ SJ.audio.click(); home(); };
  }
  function renderPlayers(){
    const host={ name:S.get('pseudo')||'Toi', avatar:S.get('avatar'), emoji:youEmoji() };
    const rows=[`<div class="row"><div class="ava x40">${avaInner(host.avatar)}</div><div class="grow" style="font-size:20px;font-weight:700">${esc(host.name)} 👑</div><div style="color:#2EC4B6;font-weight:700;font-size:15px">hôte</div></div>`];
    lobbyBots().forEach(b=> rows.push(`<div class="row"><div class="ava x40" style="background:#E4F8F6">${b.emoji}</div><div class="grow" style="font-size:20px;font-weight:700">${esc(b.name)}</div><div style="color:#2EC4B6;font-weight:700;font-size:15px">prêt !</div></div>`));
    $('#players').innerHTML=rows.join('');
    $('#pcount').textContent=1+session.botCount;
  }
  function renderDurs(){
    const st=S.get('settings');
    $('#durs').innerHTML=SJ.DURATIONS.map(d=>`<div class="dur" data-id="${d.id}" style="flex:1;text-align:center;font-weight:${d.id===st.durationId?800:700};border:3px solid #3B2D5E;border-radius:12px;padding:8px 0;cursor:pointer;background:${d.id===st.durationId?'#9B5DE5':'#fff'};color:${d.id===st.durationId?'#fff':'#3B2D5E'};box-shadow:${d.id===st.durationId?'0 4px 0 #6E3CB0':'none'}">${d.label}<br><span style="font-size:13px;opacity:.85">${d.rounds} tours</span></div>`).join('');
    app().querySelectorAll('.dur').forEach(x=> x.onclick=()=>{ S.setIn('settings','durationId',x.dataset.id); SJ.audio.click(); renderDurs(); });
  }
  function renderPacks(){
    const st=S.get('settings');
    $('#packs').innerHTML=SJ.PACKS.map(p=>`<div class="chip pack ${st.packs.includes(p.id)?'active':''}" data-id="${p.id}">${esc(p.label)}</div>`).join('');
    app().querySelectorAll('.pack').forEach(x=> x.onclick=()=>{ let packs=S.get('settings').packs.slice(); const id=x.dataset.id;
      if(packs.includes(id)) packs=packs.filter(p=>p!==id); else packs.push(id);
      if(!packs.length) packs=[id]; S.setIn('settings','packs',packs); SJ.audio.click(); renderPacks(); });
  }

  /* ======================================================
     MATCH — boucle de manche
     ====================================================== */
  function startMatch(){
    const st=S.get('settings'); const dur=SJ.DURATIONS.find(d=>d.id===st.durationId)||SJ.DURATIONS[1];
    SJ.game.newMatch({ rounds:dur.rounds, packs:st.packs, bots:lobbyBots(),
      host:{ name:S.get('pseudo')||'Toi', avatar:S.get('avatar'), emoji:youEmoji() } });
    SJ.audio.pop(); confetti(24); nextRoundOrEnd();
  }
  function nextRoundOrEnd(){
    if (SJ.game.isOver()){ podium(); return; }
    SJ.game.startRound(); playRound();
  }

  function topbar(label, mode){
    const timer = mode==='frozen'
      ? `<span class="pill tb-timer" style="font-size:16px;background:#E4F8F6">⏱ <span style="opacity:.7">❄️ en pause</span></span>`
      : `<span class="pill paper tb-timer" id="timer" style="font-size:17px;font-weight:800">⏱ <span id="t">0:45</span></span>`;
    return `<div class="topbar"><span class="pill lilac tb-label" style="font-size:16px">${label}</span>${timer}</div>`;
  }
  function startTimer(sec, onEnd){
    let t=sec; const set=()=>{ const el=$('#t'); if(el) el.textContent=`${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`; };
    set(); ticker=setInterval(()=>{ t--; if(t<=5){ const p=$('#timer'); if(p) p.style.background='#FFE3E8'; } set(); if(t<=0){ clearInterval(ticker); ticker=null; onEnd&&onEnd(); } },1000);
  }

  function playRound(){
    const M=SJ.game.state(); const th=M.theme;
    if (SJ.game.youAreProposer()) return roundProposer(M,th);
    return roundGuesser(M,th);
  }

  // 04 — PROPOSEUR
  function roundProposer(M,th){
    mount(`
      <section class="screen">
        <div class="stage game card sh-purple" style="gap:14px">
          ${topbar(`Tour ${M.round}/${M.rounds} — c'est <b style="color:#9B5DE5">toi</b> le proposeur !`)}
          <div class="cadran-wrap" id="cad"></div>
          <div class="theme-card"><div class="theme-pole" style="text-align:left">${esc(th.el)} ${esc(th.left)}</div><div class="muted" style="font-size:14px;font-weight:700;white-space:nowrap">← carte thème →</div><div class="theme-pole" style="text-align:right">${esc(th.right)} ${esc(th.er)}</div></div>
          <div class="spread"><input id="clue" class="field grow" placeholder="Ton indice… ex : « un bain tiède »" maxlength="40"><button class="btn btn--purple" id="send" style="width:140px">Envoyer 🚀</button></div>
          <div class="hint">↳ la zone cible n'est visible que par toi. Trouve l'indice parfait pour viser le centre !</div>
        </div>
      </section>`);
    const cad=SJ.cadran.make({theme:th}); cad.setTarget(M.target); cad.showTarget(true);
    $('#cad').appendChild(cad.el);
    const submit=()=>{ const v=$('#clue').value.trim(); M.clue=v||'…'; SJ.audio.validate(); reveal(); };
    $('#send').onclick=submit;
    $('#clue').addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
    startTimer(45, submit);
  }

  // 05 — DEVINEUR
  function roundGuesser(M,th){
    const prop=SJ.game.proposer();
    mount(`
      <section class="screen">
        <div class="stage game card sh-purple" style="gap:14px">
          ${topbar(`Tour ${M.round}/${M.rounds} — indice de <b style="color:#FF5D73">${esc(prop.name)}</b>`)}
          <div class="clue-bubble">${esc(M.clue)}</div>
          <div class="cadran-wrap" id="cad"></div>
          <div class="row" style="gap:14px">
            <div class="row grow gap8" style="font-weight:700;color:#7A6BA8;font-size:15px"><span id="valdots"></span><span id="valtxt"></span></div>
            <button class="btn btn--coral" id="val" style="width:200px">Je valide ! ✓</button>
          </div>
          <div class="hint">↳ glisse l'aiguille au doigt — chacun vise en privé 🪀</div>
        </div>
      </section>`);
    const cad=SJ.cadran.make({theme:th, needleColor:S.get('equipped').needle}); cad.setTarget(M.target); cad.showTarget(false);
    cad.setNeedle(0.5); cad.enableDrag(()=>{});
    $('#cad').appendChild(cad.el);
    // simulate other guessers validating
    const others=SJ.game.guessers().filter(p=>!p.isYou); let validated=0; const total=others.length+1;
    const renderVal=()=>{ $('#valtxt').textContent=`${validated}/${total} ont validé`;
      $('#valdots').innerHTML=others.slice(0,3).map((p,i)=>`<span class="ava x40" style="width:30px;height:30px;font-size:14px;background:${p.color};margin-left:${i?-8:0}px">${esc(p.emoji||'🙂')}</span>`).join(''); };
    renderVal();
    others.forEach((_,i)=> after(1200+i*900+Math.random()*800, ()=>{ validated=Math.min(total-1,validated+1); renderVal(); SJ.audio.tick(); }));
    const doValidate=()=>{ SJ.game.setGuess('you', cad.getNeedle()); SJ.audio.validate(); reveal(); };
    $('#val').onclick=doValidate;
    startTimer(60, doValidate);
  }

  // 06 — RÉVÉLATION
  function reveal(){
    const M=SJ.game.state(); const th=M.theme; SJ.game.finalizeRound();
    const prop=SJ.game.proposer();
    mount(`
      <section class="screen">
        <div class="stage game card sh-purple" style="gap:14px;overflow:hidden;position:relative">
          <div class="topbar"><span class="pill lilac tb-label" style="font-size:16px">Tour ${M.round}/${M.rounds} — résultats !</span><span class="pill mint tb-timer" id="nextpill" style="font-size:16px">suivant dans 8…</span></div>
          <div class="clue-bubble" style="font-size:19px">${esc(prop.name)} : ${esc(M.clue)}</div>
          <div class="cadran-wrap" id="cad"></div>
          <div class="row wrap" id="chips" style="justify-content:center;gap:10px"></div>
          <button class="btn btn--purple sm" id="next" style="align-self:center">Tour suivant ▶</button>
        </div>
      </section>`);
    const cad=SJ.cadran.make({theme:th}); cad.setTarget(M.target);
    $('#cad').appendChild(cad.el);
    SJ.audio.reveal();
    cad.reveal(SJ.game.revealNeedles(), ()=> showChips());
    function showChips(){
      const order=SJ.game.state().players.slice().sort((a,b)=>(M.ptsRound[b.id]||0)-(M.ptsRound[a.id]||0));
      const wrap=$('#chips'); if(!wrap) return;
      order.forEach((p,i)=> after(i*180, ()=>{ const pts=M.ptsRound[p.id]||0;
        const bg = pts>=4?'#E4F8F6':pts>=2?'#FFF1C9':'#FFF';
        const tail = pts>=4?' 🎯':pts===0?' 💨':'';
        const d=document.createElement('div'); d.className='score-chip'; d.style.background=bg; if(pts===0) d.style.color='#A99CC9';
        const who = p.isYou?'Toi':esc(p.name);
        d.innerHTML=`${esc(p.emoji||'🙂')} ${who} <b>+${pts}</b>${tail}${p.id===prop.id?' 🎤':''}`;
        wrap.appendChild(d); SJ.audio.coin();
      }));
    }
    // bouton manuel + compte à rebours → suivant
    $('#next').onclick=()=>{ SJ.audio.click(); clearTimers(); nextRoundOrEnd(); };
    let n=8; const np=$('#nextpill');
    ticker=setInterval(()=>{ n--; if(np) np.textContent=`suivant dans ${n}…`; if(n<=0){ clearInterval(ticker); ticker=null; nextRoundOrEnd(); } },1000);
  }

  /* ======================================================
     07 — PODIUM
     ====================================================== */
  function podium(){
    const rk=SJ.game.ranking(); const win=rk[0]; const earned=SJ.game.awardCoins();
    const bar=(p,h,col,rank)=>`<div class="col" style="align-items:center;gap:6px">
        ${rank===1?'<div style="font-size:26px">👑</div>':''}
        <div class="ava x52" style="${rank===1?'box-shadow:0 0 0 5px #FFC93C;':''}background:#fff">${avaInner(p.avatar||{type:'emoji',value:p.emoji})}</div>
        <div style="font-size:${rank===1?18:16}px;font-weight:${rank===1?800:700}">${p.isYou?'Toi':esc(p.name)} · ${p.score}</div>
        <div class="podium-base" style="height:${h}px;background:${col};${rank===1?'font-size:30px':'font-size:24px'}">${rank}</div></div>`;
    const second=rk[1], third=rk[2];
    mount(`
      <section class="screen">
        <div class="stage" style="max-width:600px;align-items:center;text-align:center">
          <div class="card sh-blue" style="display:flex;flex-direction:column;align-items:center;gap:16px">
            <div style="font-size:30px;font-weight:800;transform:rotate(-1.5deg)" class="pop">🎉 ${win.isYou?'Tu gagnes':esc(win.name)+' gagne'} !</div>
            <div class="row" style="align-items:flex-end;gap:12px">
              ${second?bar(second,70,'#C9BBE8',2):''}
              ${bar(win,105,'#FFC93C',1)}
              ${third?bar(third,48,'#FFD9B8',3):''}
            </div>
            ${rk[3]?`<div class="muted" style="font-weight:700">${rk.slice(3).map(p=>`${esc(p.emoji||'🙂')} ${p.isYou?'Toi':esc(p.name)} · ${p.score}`).join('  ·  ')} — pas loin !</div>`:''}
            <div class="row wrap" style="justify-content:center;gap:12px">
              <span class="pill paper" style="font-size:18px;font-weight:800;box-shadow:0 4px 0 #E5C96A">+${earned} 🪙 gagnées !</span>
              <button class="btn btn--teal" id="again">Rejouer ↻</button>
              <button class="btn btn--ghost" id="quit">Quitter</button>
            </div>
          </div>
        </div>
      </section>`);
    SJ.audio.win(); confetti(140);
    $('#again').onclick=()=>{ SJ.audio.pop(); startMatch(); };
    $('#quit').onclick=()=>{ SJ.audio.click(); refreshCoins(); home(); };
  }

  /* ======================================================
     08 — BOUTIQUE
     ====================================================== */
  function shop(opts){
    const back = (opts && typeof opts.then==='function') ? opts.then : home;   // retour paramétrable (accueil, salon, ou éditeur d'avatar)
    let cat='Chapeaux';
    mount(`
      <section class="screen">
        <div class="stage" style="max-width:600px">
          <div class="card sh-pink" style="gap:16px;display:flex;flex-direction:column">
            <div class="row between"><div style="font-size:24px;font-weight:800">La boutique</div><div class="pill paper" style="font-size:19px;font-weight:800;box-shadow:0 4px 0 #E5C96A">🪙 <span id="scoins">${S.get('coins')}</span></div></div>
            <div class="row wrap gap8" id="cats"></div>
            <div class="shop-grid" id="grid"></div>
            <div class="hint">↳ les 🪙 se gagnent en jouant (fin de manche + podium), jamais en payant.</div>
          </div>
          <button class="btn btn--ghost sm" id="back" style="align-self:flex-start">← retour</button>
        </div>
      </section>`);
    const cats=Object.keys(SJ.SHOP);
    function renderCats(){
      $('#cats').innerHTML=cats.map(c=>`<div class="chip catx ${c===cat?'active':''}" data-c="${c}">${c}</div>`).join('');
      app().querySelectorAll('.catx').forEach(x=> x.onclick=()=>{ cat=x.dataset.c; SJ.audio.click(); renderCats(); renderGrid(); });
    }
    const slot=c=>({Chapeaux:'hat',Fonds:'bg',Aiguilles:'needle',Confettis:'confetti'}[c]);
    function renderGrid(){
      const items=SJ.SHOP[cat]; const eq=S.get('equipped'); const sl=slot(cat);
      $('#grid').innerHTML=items.map(it=>{
        const owned=S.owns(it.id)||it.price===0;
        const equipped = sl==='hat' ? eq.hat===it.id : sl==='bg' ? eq.bg===(it.swatch||it.id) : sl==='needle' ? eq.needle===it.swatch : eq.confetti===it.id;
        const glyph = it.glyph ? `<div class="shop-glyph">${it.glyph}</div>` : `<div class="shop-glyph" style="width:40px;height:40px;border-radius:50%;border:3px solid #3B2D5E;background:${it.swatch}"></div>`;
        const tag = it.rare?`<div class="tag">rare ✨</div>`:'';
        const foot = equipped?`<div class="price got">équipé ✓</div>` : owned?`<div class="price got" style="background:#9B5DE5">utiliser</div>` : `<div class="price">🪙 ${it.price}</div>`;
        return `<div class="shop-item ${owned?'owned':''}" data-id="${it.id}">${tag}${glyph}<div style="font-size:15px;font-weight:700">${esc(it.name)}</div>${foot}</div>`;
      }).join('');
      app().querySelectorAll('.shop-item').forEach(x=> x.onclick=()=> buy(x.dataset.id));
    }
    function buy(id){
      const it=SJ.shopItem(id); const sl=slot(it.cat); const owned=S.owns(id)||it.price===0;
      if(!owned){ if(S.get('coins')<it.price){ toast('Pas assez de 🪙 — joue une partie !'); SJ.audio.lose(); return; }
        S.addCoins(-it.price); S.own(id); SJ.audio.coin(); confetti(24); toast(`${it.name} débloqué ! 🎉`); }
      // équiper
      const val = (sl==='bg') ? it.swatch : (sl==='needle') ? it.swatch : id;
      const cur=S.get('equipped'); const isOn = sl==='hat'?cur.hat===id : sl==='bg'?cur.bg===val : sl==='needle'?cur.needle===val : cur.confetti===id;
      S.equip(sl, isOn && sl!=='needle' && sl!=='confetti' ? null : val);
      SJ.audio.pop(); $('#scoins').textContent=S.get('coins'); renderGrid();
    }
    renderCats(); renderGrid();
    $('#back').onclick=()=>{ SJ.audio.click(); refreshCoins(); back(); };
  }

  /* ---------- règles ---------- */
  function rules(){
    const o=document.createElement('div');
    o.style.cssText='position:fixed;inset:0;background:rgba(59,45,94,.5);z-index:70;display:flex;align-items:center;justify-content:center;padding:20px;animation:popIn .25s both';
    o.innerHTML=`<div class="card sh-purple" style="max-width:460px;background:#fff">
      <h2 style="font-size:24px;margin-bottom:10px">Comment jouer ?</h2>
      <div style="font-weight:600;line-height:1.5;font-size:16px">
        <p>🎤 <b>Le proposeur</b> reçoit un thème (ex. ❄️ Froid → Chaud 🔥) et une <b>cible placée au hasard</b> sur le cadran. Il donne <b>un indice à l'oral / écrit</b> pour viser cette zone.</p>
        <p>🎯 <b>Les devineurs</b> glissent leur aiguille là où ils pensent que la cible se cache.</p>
        <p>🏅 <b>Score</b> : plus on est proche du centre, plus on marque — zones <b>+4 / +3 / +2</b>. Le proposeur gagne si les autres trouvent.</p>
        <p>🪙 On gagne des pièces en jouant, pour débloquer chapeaux & co dans la boutique.</p>
      </div>
      <button class="btn btn--purple block" id="ok" style="margin-top:14px">C'est parti !</button>
    </div>`;
    document.body.appendChild(o);
    o.querySelector('#ok').onclick=()=>{ SJ.audio.pop(); o.remove(); };
    o.onclick=e=>{ if(e.target===o) o.remove(); };
  }

  function refreshCoins(){ const c=document.getElementById('coins'); if(c) c.textContent=S.get('coins'); }

  // helpers partagés avec multi.js
  SJ.ui = { mount, esc, $, after, clearTimers, confetti, toast, avaInner, avaBox, ava:avaBox, myAvatarProfile, youEmoji, code5, topbar, startTimer };
  return { home, avatar, joinProfile, shop, rules, start:home };
})();
