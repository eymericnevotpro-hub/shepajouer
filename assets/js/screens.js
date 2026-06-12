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
            <div class="ava x58" id="ava-prev">${avaInner(S.get('avatar'))}</div>
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
    $('#create').onclick = ()=>{ if(!ensurePseudo()) return; SJ.audio.pop(); session.code=code5(); lobby(); };
    $('#join').onclick = ()=>{ if(!ensurePseudo()) return; const c=$('#code-in').value.trim().toUpperCase(); if(c.length<4){ toast('Entre un code à 5 lettres'); return;} SJ.audio.pop(); session.code=c; lobby(); };
    $('#go-shop').onclick = ()=>{ SJ.audio.click(); shop(); };
    $('#rules').onclick = ()=>{ SJ.audio.click(); rules(); };
  }
  function ensurePseudo(){ const p=(S.get('pseudo')||'').trim(); if(!p){ toast('Choisis un pseudo 😊'); const f=$('#pseudo'); f&&f.focus(); return false;} return true; }

  /* ======================================================
     02 — AVATAR
     ====================================================== */
  function avatar(){
    mount(`
      <section class="screen">
        <div class="stage" style="max-width:600px">
          <div class="row"><span class="badge" style="background:#FFC93C;color:#3B2D5E;box-shadow:0 3px 0 #D9A416;transform:rotate(2deg)">02</span><h2 style="font-size:24px">Dessine ta tête</h2></div>
          <div class="card sh-yellow" style="display:flex;gap:22px;flex-wrap:wrap;justify-content:center">
            <div class="col" style="gap:14px;align-items:center;flex:1;min-width:260px">
              <div id="pad"></div>
              <div class="row wrap gap6" style="justify-content:center" id="tools"></div>
            </div>
            <div class="col" style="gap:12px;width:170px;min-width:160px">
              <div style="font-size:17px;font-weight:700">Ou pars d'un modèle :</div>
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
    // outils : couleurs + tailles + undo
    const tools=$('#tools');
    SJ.AVATAR.palette.forEach((c,i)=>{ const d=document.createElement('div'); d.className='swatch'+(i===0?' active':''); d.style.background=c; d.title=c;
      d.onclick=()=>{ pad.setColor(c); tools.querySelectorAll('.swatch').forEach(s=>s.classList.remove('active')); d.classList.add('active'); SJ.audio.click(); }; tools.appendChild(d); });
    const div1=document.createElement('div'); div1.className='divider'; tools.appendChild(div1);
    SJ.AVATAR.sizes.forEach((s,i)=>{ const b=document.createElement('div'); b.className='tool'+(i===1?' active':''); b.textContent=s.k; b.style.fontSize=(11+i*4)+'px';
      b.onclick=()=>{ pad.setBrush(s.w); tools.querySelectorAll('.tool').forEach(x=>x.classList.remove('active')); b.classList.add('active'); }; tools.appendChild(b); });
    const div2=document.createElement('div'); div2.className='divider'; tools.appendChild(div2);
    const undo=document.createElement('div'); undo.className='tool'; undo.style.width='auto'; undo.style.padding='0 10px'; undo.textContent='↩︎ oups'; undo.onclick=()=>pad.undo(); tools.appendChild(undo);
    const clr=document.createElement('div'); clr.className='tool'; clr.style.width='auto'; clr.style.padding='0 10px'; clr.textContent='🗑'; clr.onclick=()=>{pad.clear();SJ.audio.click();}; tools.appendChild(clr);
    // modèles
    const tg=$('#tmpls'); let chosen=null;
    SJ.AVATAR.templates.slice(0,5).forEach((e,i)=>{ const d=document.createElement('div'); d.className='tmpl'; d.style.background=['#FFE3E8','#FFF1C9','#E4F8F6','#EAF2FF','#F4EFFF'][i%5]; d.textContent=e;
      d.onclick=()=>{ pad.template(e); chosen=e; }; tg.appendChild(d); });
    const add=document.createElement('div'); add.className='tmpl'; add.style.border='2px dashed #A99CC9'; add.style.color='#A99CC9'; add.textContent='+';
    add.onclick=()=>{ const e=SJ.AVATAR.templates[5+Math.floor(Math.random()*5)]; pad.template(e); chosen=e; }; tg.appendChild(add);
    $('#save').onclick=()=>{ if(pad.isBlank() && chosen){ S.set('avatar',{type:'emoji',value:chosen}); }
      else if(!pad.isBlank()){ S.set('avatar',{type:'draw',value:pad.toDataURL()}); }
      else { toast('Dessine ou choisis un modèle 🎨'); return; }
      SJ.audio.validate(); confetti(30); home(); };
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

  function topbar(label, color){
    return `<div class="topbar">
      <span class="pill lilac tb-label" style="font-size:16px">${label}</span>
      <span class="pill paper tb-timer" id="timer" style="font-size:17px;font-weight:800">⏱ <span id="t">0:45</span></span></div>`;
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
          <div class="topbar"><span class="pill lilac tb-label" style="font-size:16px">Tour ${M.round}/${M.rounds} — résultats !</span><span class="pill mint tb-timer" id="nextpill" style="font-size:16px">suivant dans 5…</span></div>
          <div class="clue-bubble" style="font-size:19px">${esc(prop.name)} : ${esc(M.clue)}</div>
          <div class="cadran-wrap" id="cad"></div>
          <div class="row wrap" id="chips" style="justify-content:center;gap:10px"></div>
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
    // compte à rebours → suivant
    let n=5; const np=$('#nextpill');
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
  function shop(){
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
    const renderCats=()=> $('#cats').innerHTML=cats.map(c=>`<div class="chip catx ${c===cat?'active':''}" data-c="${c}">${c}</div>`).join('');
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
    app().querySelectorAll('.catx').forEach(x=> x.onclick=()=>{ cat=x.dataset.c; SJ.audio.click(); renderCats(); renderGrid(); });
    $('#back').onclick=()=>{ SJ.audio.click(); refreshCoins(); home(); };
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

  return { home, avatar, lobby, shop, rules, podium, start:home };
})();
