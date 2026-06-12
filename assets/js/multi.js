/* ============================================================
   MULTI (SJ.room) — partie host-autoritaire + rendu unifié.
   L'hôte fait tourner le moteur et diffuse un "view" sanitisé ;
   les invités affichent ce view et renvoient leurs actions.
   Le même renderView() sert pour l'hôte, les invités… et le solo.
   ============================================================ */
window.SJ = window.SJ || {};

SJ.room = (function(){
  const U = () => SJ.ui;
  function app(){ return document.getElementById('app'); }
  function $(s){ return app().querySelector(s); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  let mPending=[], mTick=null;
  function mClear(){ mPending.forEach(clearTimeout); mPending=[]; if(mTick){clearInterval(mTick);mTick=null;} }
  function mMount(html){ mClear(); app().innerHTML=html; app().scrollTop=0; }
  function mAfter(ms,fn){ const id=setTimeout(fn,ms); mPending.push(id); return id; }

  // ---- état ----
  let role='solo', code=null, net=null, myId='host';
  let players=[];                 // {id,name,avatar,emoji,color,isHost,isBot,score}
  let settings={durationId:'normale', packs:['classique']};
  let M=null;                     // {rounds,round,proposerIdx,theme,target,clue,guesses,validated,ptsRound,coins,pool,used}
  let phase='lobby';
  let curKey=null, curCad=null, iValidated=false, coinsClaimed=false;
  let botCount=0;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function randn(){ let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
  function profile(){ return { name:(SJ.store.get('pseudo')||'Toi'), avatar:SJ.store.get('avatar'), emoji:(SJ.store.get('avatar')&&SJ.store.get('avatar').type==='emoji'?SJ.store.get('avatar').value:'⭐') }; }
  function colorAt(i){ return SJ.PLAYER_COLORS[i % SJ.PLAYER_COLORS.length]; }

  /* ================= HÔTE ================= */
  function createHost(){
    role='host'; myId='host'; coinsClaimed=false;
    settings = { durationId:SJ.store.get('settings').durationId, packs:SJ.store.get('settings').packs.slice() };
    const p=profile(); players=[{ id:'host', name:p.name, avatar:p.avatar, emoji:p.emoji, color:colorAt(0), isHost:true, isBot:false, score:0 }];
    botCount=0; phase='lobby'; M=null; curKey=null;
    code = U().code5();
    net = SJ.net.create({ onConn:hostOnConn, onMsg:hostOnMsg, onLeave:hostOnLeave });
    net.host(code, ()=>{}, (err)=>{ if(err==='id-taken'){ code=U().code5(); net.leave(); net=SJ.net.create({onConn:hostOnConn,onMsg:hostOnMsg,onLeave:hostOnLeave}); net.host(code,()=>{}); } });
    hostRefresh();
  }
  function setBots(n){ // ajuste le nombre de bots (solo / appoint)
    n=clamp(n,0,7); const cur=players.filter(p=>p.isBot).length;
    if(n>cur){ for(let i=cur;i<n;i++){ const b=SJ.BOTS[i%SJ.BOTS.length]; players.push({ id:'bot'+i, name:b.name, avatar:{type:'emoji',value:b.emoji}, emoji:b.emoji, color:b.color, isHost:false, isBot:true, score:0, sigma:0.05+Math.random()*0.09 }); } }
    else if(n<cur){ let rm=cur-n; for(let i=players.length-1;i>=0&&rm>0;i--){ if(players[i].isBot){ players.splice(i,1); rm--; } } }
    botCount=n; hostRefresh();
  }
  function hostOnConn(id){ /* attend le message 'join' avec le profil */ U().toast('Quelqu\'un arrive…'); }
  function hostOnMsg(id, m){
    if(m.t==='join'){
      if(!players.find(p=>p.id===id)){
        players.push({ id, name:(m.name||'Pote').slice(0,14), avatar:m.avatar, emoji:m.emoji||'🙂', color:colorAt(players.length), isHost:false, isBot:false, score:0 });
        SJ.audio.pop(); U().toast(`${m.name||'Un·e pote'} a rejoint !`);
        hostRefresh();
      }
    } else if(m.t==='guess'){
      if(phase==='guess' && M && M.guesses[id]==null && id!==proposer().id){ M.guesses[id]=clamp(m.ratio,0,1); M.validated[id]=true; hostRefresh(); checkDone(); }
    } else if(m.t==='clue'){
      if(phase==='propose' && M && proposer().id===id){ M.clue=(m.text||'…').slice(0,40); startGuess(); }
    } else if(m.t==='leave'){ hostOnLeave(id); }
  }
  function hostOnLeave(id){
    const was=players.find(p=>p.id===id); players=players.filter(p=>p.id!==id);
    if(was) U().toast(`${was.name} est parti·e`);
    if(M){ delete M.guesses[id]; delete M.validated[id];
      if(phase!=='lobby' && proposer() && proposer().id===id){ // le proposeur est parti → on saute le tour
        nextRound(); return;
      }
      if(phase==='guess') checkDone();
    }
    hostRefresh();
  }

  function hostStart(){
    const real=players.length;
    if(real<2){ U().toast('Il faut au moins 2 joueurs 😊'); return; }
    const dur=SJ.DURATIONS.find(d=>d.id===settings.durationId)||SJ.DURATIONS[1];
    const pool=[]; (settings.packs.length?settings.packs:['classique']).forEach(id=>(SJ.THEMES[id]||[]).forEach(t=>pool.push(t)));
    players.forEach(p=>p.score=0);
    M={ rounds:dur.rounds, round:0, proposerIdx:-1, theme:null, target:.5, clue:'', guesses:{}, validated:{}, ptsRound:{}, coins:{}, pool, used:[] };
    players.forEach(p=>M.coins[p.id]=0);
    coinsClaimed=false; SJ.audio.pop(); U().confetti(20);
    nextRound();
  }
  function proposer(){ return players[M.proposerIdx % players.length]; }
  function guessers(){ return players.filter((_,i)=> i!==(M.proposerIdx%players.length)); }
  function pickTheme(){ let a=M.pool.filter(t=>!M.used.includes(t)); if(!a.length){ M.used=[]; a=M.pool.slice(); } const t=a[Math.floor(Math.random()*a.length)]; M.used.push(t); return t; }

  function nextRound(){
    if(!M || M.round>=M.rounds){ goPodium(); return; }
    M.round++; M.proposerIdx=(M.round-1)%players.length;
    M.theme=pickTheme(); M.target=clamp(0.12+Math.random()*0.76,0,1);
    M.clue=''; M.guesses={}; M.validated={}; M.ptsRound={};
    phase='propose'; iValidated=false;
    const prop=proposer();
    if(prop.isBot){ M.clue=SJ.botClue(M.theme,M.target); mAfter(1600,()=>{ if(phase==='propose') startGuess(); }); }
    hostRefresh();
  }
  function startGuess(){
    phase='guess'; iValidated=false;
    // bots devinent (avec un peu de retard pour le feeling)
    guessers().forEach((p,i)=>{ if(p.isBot){ mAfter(900+i*700+Math.random()*900,()=>{ if(phase==='guess'&&M.guesses[p.id]==null){ M.guesses[p.id]=clamp(M.target+randn()*(p.sigma||0.09),0,1); M.validated[p.id]=true; hostRefresh(); checkDone(); } }); } });
    hostRefresh();
    // timer de sécurité : on révèle au bout de 45s même si tout le monde n'a pas validé
    mTick && clearInterval(mTick);
    let t=45; mTick=setInterval(()=>{ t--; const el=$('#t'); if(el)el.textContent=`0:${String(Math.max(0,t)).padStart(2,'0')}`; if(t<=0){ clearInterval(mTick); mTick=null; finalize(); } },1000);
  }
  function checkDone(){ if(phase!=='guess') return; const g=guessers(); if(g.every(p=>M.guesses[p.id]!=null)) finalize(); }
  function finalize(){
    if(phase==='reveal') return;
    mClear();
    let best=0;
    guessers().forEach(p=>{ const g=M.guesses[p.id]; const pts=(g==null)?0:SJ.scoreFor(g,M.target); M.ptsRound[p.id]=pts; p.score+=pts; best=Math.max(best,pts); });
    const prop=proposer(); M.ptsRound[prop.id]=best; prop.score+=best;
    players.forEach(p=>{ const c=(M.ptsRound[p.id]||0)*3 + ((M.ptsRound[p.id]>=4)?5:0); M.coins[p.id]=(M.coins[p.id]||0)+c; });
    phase='reveal'; hostRefresh();
    let n=8; mTick=setInterval(()=>{ n--; const np=$('#nextpill'); if(np)np.textContent=`suivant dans ${n}…`; if(n<=0){ clearInterval(mTick); mTick=null; nextRound(); } },1000);
  }
  function goPodium(){ phase='podium'; hostRefresh(); }

  // diffuse un view par destinataire (cible cachée sauf au proposeur / à la révélation)
  function buildView(forId){
    const v={ phase, code, meId:forId, iAmHost:(forId==='host'), rounds:M?M.rounds:0, round:M?M.round:0,
      players:players.map(p=>({id:p.id,name:p.name,avatar:p.avatar,emoji:p.emoji,color:p.color,isHost:p.isHost,isBot:p.isBot,score:p.score})),
      settings, hostName:(players[0]&&players[0].name)||'?' };
    if(M){
      const prop=proposer();
      v.proposerId=prop.id; v.proposerName=prop.name; v.theme=M.theme; v.clue=M.clue;
      v.myTarget=((phase==='propose'||phase==='guess')&&prop.id===forId)?M.target:null;
      const gs=guessers();
      v.guessProgress={ validated:gs.filter(p=>M.guesses[p.id]!=null).length, total:gs.length };
      if(phase==='reveal'){
        v.reveal={ target:M.target,
          needles:gs.map(p=>({id:p.id, ratio:M.guesses[p.id]==null?0.5:M.guesses[p.id], color:p.color, emoji:p.emoji, pts:M.ptsRound[p.id], you:(p.id===forId)})),
          chips:players.slice().sort((a,b)=>(M.ptsRound[b.id]||0)-(M.ptsRound[a.id]||0)).map(p=>({name:p.name,emoji:p.emoji,pts:M.ptsRound[p.id]||0,you:(p.id===forId),prop:(p.id===prop.id)})) };
      }
      if(phase==='podium'){
        v.podium={ ranking:players.slice().sort((a,b)=>b.score-a.score).map(p=>({name:p.name,emoji:p.emoji,avatar:p.avatar,score:p.score,you:(p.id===forId)})),
          earned:(M.coins[forId]||0) };
      }
    }
    return v;
  }
  function hostRefresh(){
    renderView(buildView(myId));
    players.forEach(p=>{ if(!p.isBot && !p.isHost) net.sendTo(p.id, {t:'view', view:buildView(p.id)}); });
  }

  /* ================= INVITÉ ================= */
  function join(c, onFail){
    role='guest'; code=c; phase='lobby'; coinsClaimed=false; curKey=null;
    const p=profile();
    net = SJ.net.create({ onState:guestOnState, onMsg:guestOnMsg, onClose:guestOnClose });
    net.join(c, ()=> net.send({ t:'join', name:p.name, avatar:p.avatar, emoji:p.emoji }), onFail);
  }
  function guestOnState(v){ phase=v.phase; renderView(v); }
  function guestOnMsg(_id,m){ if(m.t==='kicked'){ U().toast('Tu as été retiré de la partie'); quitToHome(); } }
  function guestOnClose(){ U().toast('Connexion à l\'hôte perdue'); quitToHome(); }

  /* ================= ACTIONS ================= */
  function act(type,payload){
    if(role==='guest'){
      if(type==='clue') net.send({t:'clue', text:payload.text});
      else if(type==='guess') net.send({t:'guess', ratio:payload.ratio});
      return;
    }
    // host / solo
    if(type==='start') hostStart();
    else if(type==='clue'){ if(M){ M.clue=(payload.text||'…').slice(0,40); startGuess(); } }
    else if(type==='guess'){ if(M){ M.guesses[myId]=clamp(payload.ratio,0,1); M.validated[myId]=true; hostRefresh(); checkDone(); } }
    else if(type==='next'){ mClear(); nextRound(); }
    else if(type==='restart'){ hostStart(); }
  }

  function leave(){ try{ if(net){ if(role==='guest') net.send({t:'leave'}); net.leave(); } }catch(e){} net=null; role='solo'; M=null; phase='lobby'; }
  function quitToHome(){ leave(); SJ.screens.home(); }

  /* ================= RENDU UNIFIÉ ================= */
  function renderView(v){
    const key = `${v.phase}#${v.round||0}#${(v.proposerId&&v.proposerId===v.meId)?'P':'G'}`;
    const same = key===curKey;
    if(v.phase==='lobby'){ if(same) patchLobby(v); else { curKey=key; rLobby(v); } return; }
    if(v.phase==='guess'){ if(same) patchGuess(v); else { curKey=key; iValidated=false; rGuess(v); } return; }
    if(same) return;                 // propose / reveal / podium : re-render seulement au changement d'état
    curKey=key;
    if(v.phase==='propose') rPropose(v);
    else if(v.phase==='reveal') rReveal(v);
    else if(v.phase==='podium') rPodium(v);
  }

  // ---------- LOBBY ----------
  function rLobby(v){
    const host = v.iAmHost;
    mMount(`
      <section class="screen">
        <div class="stage wide">
          <div class="card sh-teal" style="gap:18px;display:flex;flex-direction:column">
            <div class="row between wrap" style="gap:10px">
              <div style="font-size:22px;font-weight:800">La partie de <span style="color:#FF5D73">${esc(v.hostName)}</span> 🎈</div>
              <div class="row gap8">
                <div class="pill paper" style="font-size:26px;font-weight:800;letter-spacing:6px;border-style:dashed">${esc(v.code||'')}</div>
                <button class="btn btn--ghost sm" id="copy">copier le lien ⎘</button>
              </div>
            </div>
            <div class="row wrap" style="gap:18px;align-items:stretch">
              <div class="panel paper" style="flex:1.3;min-width:240px">
                <div class="row between"><span class="panel-label">Joueurs — <span id="pcount">${v.players.length}</span></span>
                  ${host?`<span class="row gap6"><button class="tool" id="bmin">−</button><span style="font-size:13px;font-weight:700" class="muted">bots</span><button class="tool" id="bplus">+</button></span>`:''}</div>
                <div id="players" class="col" style="gap:10px">${playersRows(v)}</div>
              </div>
              <div class="col" style="flex:1;gap:14px;min-width:240px">
                ${host?`
                <div class="panel lilac"><div class="panel-label">Durée de la partie</div><div class="spread" id="durs"></div></div>
                <div class="panel mint"><div class="panel-label">Thèmes</div><div class="row wrap gap8" id="packs"></div></div>
                <div class="grow"></div>
                <button class="btn btn--coral lg block" id="start" ${v.players.length<2?'disabled':''}>Lancer la partie ▶</button>
                ${v.players.length<2?'<div class="center muted" style="font-size:14px;font-weight:700">Partage le code — il faut au moins 2 joueurs</div>':''}
                `:`
                <div class="panel lilac center" style="justify-content:center;min-height:160px"><div style="font-size:19px;font-weight:700">⏳ En attente que l'hôte<br>lance la partie…</div></div>
                `}
              </div>
            </div>
          </div>
          <div class="hint">↳ partage le lien : tes potes apparaissent ici en direct dès qu'ils rejoignent 🎈</div>
          <button class="btn btn--ghost sm" id="back" style="align-self:flex-start">← quitter</button>
        </div>
      </section>`);
    $('#copy').onclick=()=>{ const link=location.origin+location.pathname+'?code='+(v.code||''); if(navigator.clipboard) navigator.clipboard.writeText(link); U().toast('Lien copié ! 🔗'); SJ.audio.click(); };
    $('#back').onclick=()=>{ SJ.audio.click(); quitToHome(); };
    if(host){
      $('#bplus').onclick=()=>{ setBots(players.filter(p=>p.isBot).length+1); };
      $('#bmin').onclick=()=>{ setBots(players.filter(p=>p.isBot).length-1); };
      $('#start').onclick=()=>{ act('start'); };
      renderDurs(); renderPacks();
    }
  }
  function playersRows(v){
    return v.players.map(p=>`<div class="row"><div class="ava x40" style="background:${p.isBot?'#E4F8F6':'#FFC93C'}">${U().avaInner(p.avatar||{type:'emoji',value:p.emoji})}</div>
      <div class="grow" style="font-size:20px;font-weight:700">${esc(p.name)}${p.isHost?' 👑':''}</div>
      <div style="color:#2EC4B6;font-weight:700;font-size:15px">${p.isBot?'bot':p.isHost?'hôte':'prêt !'}</div></div>`).join('');
  }
  function patchLobby(v){ const pe=$('#players'); if(pe) pe.innerHTML=playersRows(v); const pc=$('#pcount'); if(pc) pc.textContent=v.players.length;
    const st=$('#start'); if(st){ st.disabled=v.players.length<2; } }
  function renderDurs(){ const e=$('#durs'); if(!e)return; e.innerHTML=SJ.DURATIONS.map(d=>`<div class="dur" data-id="${d.id}" style="flex:1;text-align:center;font-weight:${d.id===settings.durationId?800:700};border:3px solid #3B2D5E;border-radius:12px;padding:8px 0;cursor:pointer;background:${d.id===settings.durationId?'#9B5DE5':'#fff'};color:${d.id===settings.durationId?'#fff':'#3B2D5E'};box-shadow:${d.id===settings.durationId?'0 4px 0 #6E3CB0':'none'}">${d.label}<br><span style="font-size:13px;opacity:.85">${d.rounds} tours</span></div>`).join('');
    app().querySelectorAll('.dur').forEach(x=>x.onclick=()=>{ settings.durationId=x.dataset.id; SJ.store.setIn('settings','durationId',x.dataset.id); SJ.audio.click(); renderDurs(); }); }
  function renderPacks(){ const e=$('#packs'); if(!e)return; e.innerHTML=SJ.PACKS.map(p=>`<div class="chip pk ${settings.packs.includes(p.id)?'active':''}" data-id="${p.id}">${esc(p.label)}</div>`).join('');
    app().querySelectorAll('.pk').forEach(x=>x.onclick=()=>{ let ps=settings.packs.slice(); const id=x.dataset.id; if(ps.includes(id))ps=ps.filter(z=>z!==id); else ps.push(id); if(!ps.length)ps=[id]; settings.packs=ps; SJ.store.setIn('settings','packs',ps); SJ.audio.click(); renderPacks(); }); }

  // ---------- PROPOSE ----------
  function rPropose(v){
    const th=v.theme, mine=v.proposerId===v.meId;
    if(mine){
      mMount(`<section class="screen"><div class="stage game card sh-purple" style="gap:14px">
        ${U().topbar(`Tour ${v.round}/${v.rounds} — c'est <b style="color:#9B5DE5">toi</b> le proposeur !`)}
        <div class="cadran-wrap" id="cad"></div>
        <div class="theme-card"><div class="theme-pole" style="text-align:left">${esc(th.el)} ${esc(th.left)}</div><div class="muted" style="font-size:14px;font-weight:700;white-space:nowrap">← carte thème →</div><div class="theme-pole" style="text-align:right">${esc(th.right)} ${esc(th.er)}</div></div>
        <div class="spread"><input id="clue" class="field grow" placeholder="Ton indice… ex : « un bain tiède »" maxlength="40"><button class="btn btn--purple" id="send" style="width:140px">Envoyer 🚀</button></div>
        <div class="hint">↳ la cible n'est visible que par toi. Trouve l'indice parfait pour viser le centre !</div>
      </div></section>`);
      curCad=SJ.cadran.make({theme:th}); curCad.setTarget(v.myTarget); curCad.showTarget(true); $('#cad').appendChild(curCad.el);
      const go=()=>{ const t=$('#clue').value.trim(); SJ.audio.validate(); act('clue',{text:t||'…'}); };
      $('#send').onclick=go; $('#clue').addEventListener('keydown',e=>{ if(e.key==='Enter') go(); });
    } else {
      mMount(`<section class="screen"><div class="stage game card sh-purple" style="gap:14px">
        ${U().topbar(`Tour ${v.round}/${v.rounds}`)}
        <div class="cadran-wrap" id="cad"></div>
        <div class="theme-card"><div class="theme-pole" style="text-align:left">${esc(th.el)} ${esc(th.left)}</div><div class="muted" style="font-size:14px;font-weight:700;white-space:nowrap">← thème →</div><div class="theme-pole" style="text-align:right">${esc(th.right)} ${esc(th.er)}</div></div>
        <div class="clue-bubble" style="background:#F4EFFF;box-shadow:0 5px 0 #C9BBE8">💭 ${esc(v.proposerName)} réfléchit à un indice…</div>
      </div></section>`);
      curCad=SJ.cadran.make({theme:th}); curCad.showTarget(false); curCad.hideHidden(); $('#cad').appendChild(curCad.el);
    }
  }

  // ---------- GUESS ----------
  function rGuess(v){
    const th=v.theme, mine=v.proposerId===v.meId;
    if(mine){
      mMount(`<section class="screen"><div class="stage game card sh-purple" style="gap:14px">
        ${U().topbar(`Tour ${v.round}/${v.rounds} — les autres devinent…`)}
        <div class="clue-bubble">${esc(v.clue)}</div>
        <div class="cadran-wrap" id="cad"></div>
        <div class="center muted" style="font-weight:700"><span id="prog">${v.guessProgress.validated}/${v.guessProgress.total}</span> ont validé · révélation auto</div>
      </div></section>`);
      curCad=SJ.cadran.make({theme:th}); if(v.myTarget!=null){ curCad.setTarget(v.myTarget); curCad.showTarget(true); } else { curCad.showTarget(false); curCad.hideHidden(); } $('#cad').appendChild(curCad.el);
      return;
    }
    mMount(`<section class="screen"><div class="stage game card sh-purple" style="gap:14px">
      ${U().topbar(`Tour ${v.round}/${v.rounds} — indice de <b style="color:#FF5D73">${esc(v.proposerName)}</b>`)}
      <div class="clue-bubble">${esc(v.clue)}</div>
      <div class="cadran-wrap" id="cad"></div>
      <div class="row" style="gap:14px"><div class="grow center muted" style="font-weight:700"><span id="prog">${v.guessProgress.validated}/${v.guessProgress.total}</span> ont validé</div>
        <button class="btn btn--coral" id="val" style="width:200px">Je valide ! ✓</button></div>
      <div class="hint">↳ glisse l'aiguille au doigt — chacun vise en privé 🪀</div>
    </div></section>`);
    curCad=SJ.cadran.make({theme:th, needleColor:SJ.store.get('equipped').needle}); curCad.showTarget(false); curCad.setNeedle(0.5); curCad.enableDrag(()=>{}); $('#cad').appendChild(curCad.el);
    $('#val').onclick=()=>{ if(iValidated)return; iValidated=true; SJ.audio.validate();
      const b=$('#val'); if(b){ b.textContent='validé ✓'; b.disabled=true; b.classList.remove('btn--coral'); b.classList.add('btn--teal'); }
      act('guess',{ratio:curCad.getNeedle()}); };
  }
  function patchGuess(v){ const p=$('#prog'); if(p) p.textContent=`${v.guessProgress.validated}/${v.guessProgress.total}`; }

  // ---------- REVEAL ----------
  function rReveal(v){
    const r=v.reveal; if(!r){ return; }
    mMount(`<section class="screen"><div class="stage game card sh-purple" style="gap:14px;position:relative">
      <div class="topbar"><span class="pill lilac tb-label" style="font-size:16px">Tour ${v.round}/${v.rounds} — résultats !</span><span class="pill mint tb-timer" id="nextpill" style="font-size:16px">suivant…</span></div>
      <div class="clue-bubble" style="font-size:19px">${esc(v.proposerName)} : ${esc(v.clue)}</div>
      <div class="cadran-wrap" id="cad"></div>
      <div class="row wrap" id="chips" style="justify-content:center;gap:10px"></div>
      ${v.iAmHost?'<button class="btn btn--purple sm" id="next" style="align-self:center">Tour suivant ▶</button>':''}
    </div></section>`);
    const cad=SJ.cadran.make({theme:v.theme, tall:true}); cad.setTarget(r.target); $('#cad').appendChild(cad.el);
    SJ.audio.reveal();
    cad.reveal(r.needles, showChips);
    function showChips(){ const w=$('#chips'); if(!w)return; r.chips.forEach((c,i)=> mAfter(i*170,()=>{ const bg=c.pts>=4?'#E4F8F6':c.pts>=2?'#FFF1C9':'#FFF'; const tail=c.pts>=4?' 🎯':c.pts===0?' 💨':''; const d=document.createElement('div'); d.className='score-chip'; d.style.background=bg; if(c.pts===0)d.style.color='#A99CC9'; d.innerHTML=`${esc(c.emoji||'🙂')} ${c.you?'Toi':esc(c.name)} <b>+${c.pts}</b>${tail}${c.prop?' 🎤':''}`; w.appendChild(d); SJ.audio.coin(); })); }
    if(v.iAmHost){ const nb=$('#next'); if(nb) nb.onclick=()=>{ SJ.audio.click(); act('next'); }; }
  }

  // ---------- PODIUM ----------
  function rPodium(v){
    const pod=v.podium, rk=pod.ranking, win=rk[0];
    if(!coinsClaimed){ SJ.store.addCoins(pod.earned||0); coinsClaimed=true; }
    const bar=(p,h,col,rank)=>`<div class="col" style="align-items:center;gap:6px">${rank===1?'<div style="font-size:26px">👑</div>':''}
      <div class="ava x52" style="${rank===1?'box-shadow:0 0 0 5px #FFC93C;':''}background:#fff">${U().avaInner(p.avatar||{type:'emoji',value:p.emoji})}</div>
      <div style="font-size:${rank===1?18:16}px;font-weight:${rank===1?800:700}">${p.you?'Toi':esc(p.name)} · ${p.score}</div>
      <div class="podium-base" style="height:${h}px;background:${col};font-size:${rank===1?30:24}px">${rank}</div></div>`;
    mMount(`<section class="screen"><div class="stage" style="max-width:600px;align-items:center;text-align:center">
      <div class="card sh-blue" style="display:flex;flex-direction:column;align-items:center;gap:16px">
        <div style="font-size:30px;font-weight:800;transform:rotate(-1.5deg)" class="pop">🎉 ${win.you?'Tu gagnes':esc(win.name)+' gagne'} !</div>
        <div class="row" style="align-items:flex-end;gap:12px">${rk[1]?bar(rk[1],70,'#C9BBE8',2):''}${bar(win,105,'#FFC93C',1)}${rk[2]?bar(rk[2],48,'#FFD9B8',3):''}</div>
        ${rk[3]?`<div class="muted" style="font-weight:700">${rk.slice(3).map(p=>`${esc(p.emoji||'🙂')} ${p.you?'Toi':esc(p.name)} · ${p.score}`).join('  ·  ')} — pas loin !</div>`:''}
        <div class="row wrap" style="justify-content:center;gap:12px">
          <span class="pill paper" style="font-size:18px;font-weight:800;box-shadow:0 4px 0 #E5C96A">+${pod.earned||0} 🪙 gagnées !</span>
          ${v.iAmHost?'<button class="btn btn--teal" id="again">Rejouer ↻</button>':''}
          <button class="btn btn--ghost" id="quit">Quitter</button>
        </div>
        ${v.iAmHost?'':'<div class="muted" style="font-size:14px;font-weight:700">en attente que l\'hôte relance…</div>'}
      </div></div></section>`);
    SJ.audio.win(); U().confetti(140);
    const a=$('#again'); if(a) a.onclick=()=>{ SJ.audio.pop(); coinsClaimed=false; act('restart'); };
    $('#quit').onclick=()=>{ SJ.audio.click(); quitToHome(); };
  }

  return { createHost, join, leave, act, quitToHome, _state:()=>({role,phase,players,code}) };
})();
