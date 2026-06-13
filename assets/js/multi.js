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
  // affiche l'horloge (devinette) ou le compte à rebours de révélation — utilisé par hôte ET invités
  function showClock(sec, rev){
    if(rev){ const np=$('#nextpill'); if(np) np.textContent=`suivant dans ${Math.max(0,sec)}…`; return; }
    const el=$('#t'); if(el) el.textContent=`0:${String(Math.max(0,sec)).padStart(2,'0')}`;
    const tp=$('#timer'); if(tp) tp.style.background = sec<=5 ? '#FFE3E8' : '';
  }

  // ---- état ----
  let role='solo', code=null, net=null, myId='host';
  let players=[];                 // {id,name,avatar,emoji,color,isHost,isBot,score}
  let settings={durationId:'normale', packs:['classique']};
  let M=null;                     // {rounds,round,proposerIdx,theme,target,clue,guesses,validated,ptsRound,coins,pool,used}
  let phase='lobby';
  let curKey=null, curCad=null, iValidated=false, coinsClaimed=false;
  let salonSpinning=false, salonWinner=null;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function randn(){ let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
  function profile(){ const a=SJ.ui.myAvatarProfile(); return { name:(SJ.store.get('pseudo')||'Toi'), avatar:a.avatar, emoji:a.emoji, hat:a.hat, hatPos:a.hatPos, bg:a.bg }; }
  function colorAt(i){ return SJ.PLAYER_COLORS[i % SJ.PLAYER_COLORS.length]; }

  /* ================= HÔTE ================= */
  function createHost(){
    role='host'; myId='host'; coinsClaimed=false;
    settings = { durationId:SJ.store.get('settings').durationId, packs:SJ.store.get('settings').packs.slice() };
    const p=profile(); players=[{ id:'host', name:p.name, avatar:p.avatar, emoji:p.emoji, hat:p.hat, hatPos:p.hatPos, bg:p.bg, color:colorAt(0), isHost:true, score:0, vote:null }];
    phase='lobby'; M=null; curKey=null; salonSpinning=false; salonWinner=null;
    code = U().code5();
    net = SJ.net.create({ onConn:hostOnConn, onMsg:hostOnMsg, onLeave:hostOnLeave });
    net.host(code, ()=>{}, (err)=>{ if(err==='id-taken'){ code=U().code5(); net.leave(); net=SJ.net.create({onConn:hostOnConn,onMsg:hostOnMsg,onLeave:hostOnLeave}); net.host(code,()=>{}); } });
    hostRefresh();
  }
  function hostOnConn(id){ /* attend le message 'join' avec le profil */ U().toast('Quelqu\'un arrive…'); }
  function hostOnMsg(id, m){
    if(m.t==='join'){
      if(!players.find(p=>p.id===id)){
        players.push({ id, name:(m.name||'Pote').slice(0,14), avatar:m.avatar, emoji:m.emoji||'🙂', hat:m.hat, hatPos:m.hatPos, bg:m.bg, color:colorAt(players.length), isHost:false, score:0, vote:null });
        SJ.audio.pop(); U().toast(`${m.name||'Un·e pote'} a rejoint !`);
        hostRefresh();
      }
    } else if(m.t==='guess'){
      if(phase==='guess' && M && M.guesses[id]==null && id!==proposer().id){ M.guesses[id]=clamp(m.ratio,0,1); M.validated[id]=true; hostRefresh(); checkDone(); }
    } else if(m.t==='clue'){
      if(phase==='propose' && M && proposer().id===id){ M.clue=(m.text||'…').slice(0,40); startGuess(); }
    } else if(m.t==='dilemma'){ if(M && phase==='propose' && proposer().id===id){ M.dilemma={a:(m.a||'Option A').slice(0,42), b:(m.b||'Option B').slice(0,42)}; M.pred=clamp(Math.round(m.pred),0,100); startGuess(); }
    } else if(m.t==='pick'){ if(M && phase==='guess' && M.votes[id]==null && id!==proposer().id){ M.votes[id]=m.c; hostRefresh(); checkDone(); }
    } else if(m.t==='vote'){ const p=players.find(x=>x.id===id); if(p && phase==='lobby'){ p.vote=m.g; salonWinner=null; hostRefresh(); }
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

  function hostStart(gameId){
    const real=players.length;
    if(real<2){ U().toast('Il faut au moins 2 joueurs 😊'); return; }
    const dur=SJ.DURATIONS.find(d=>d.id===settings.durationId)||SJ.DURATIONS[1];
    const pool=[]; (settings.packs.length?settings.packs:['classique']).forEach(id=>(SJ.THEMES[id]||[]).forEach(t=>pool.push(t)));
    players.forEach(p=>p.score=0);
    M={ gameType:gameId||'wavelength', rounds:dur.rounds, round:0, proposerIdx:-1, theme:null, target:.5, clue:'', guesses:{}, validated:{}, ptsRound:{}, coins:{}, pool, used:[],
        dilemma:null, pred:null, realA:null, votes:{} };
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
    M.clue=''; M.guesses={}; M.validated={}; M.ptsRound={}; M.votes={}; M.pred=null; M.realA=null;
    if(M.gameType==='tupreferes'){ M.dilemma=SJ.DILEMMAS[Math.floor(Math.random()*SJ.DILEMMAS.length)]; }
    else { M.theme=pickTheme(); M.target=Math.random(); }   // toute la plage : peut coller le bord
    phase='propose'; iValidated=false;
    hostRefresh();
  }
  function startGuess(){
    phase='guess'; iValidated=false;
    hostRefresh();
    // timer de sécurité : on révèle au bout de 45s même si tout le monde n'a pas validé
    mTick && clearInterval(mTick);
    let t=45; mTick=setInterval(()=>{ t--; showClock(t,false); if(net) net.broadcast({t:'clk',s:Math.max(0,t)}); if(t<=0){ clearInterval(mTick); mTick=null; finalize(); } },1000);
  }
  function checkDone(){ if(phase!=='guess') return; const g=guessers();
    const done = M.gameType==='tupreferes' ? g.every(p=>M.votes[p.id]!=null) : g.every(p=>M.guesses[p.id]!=null);
    if(done) finalize(); }
  function finalize(){
    if(phase==='reveal') return;
    mClear();
    if(M.gameType==='tupreferes'){ finalizeTP(); }
    else {
      let best=0;
      guessers().forEach(p=>{ const g=M.guesses[p.id]; const pts=(g==null)?0:SJ.scoreFor(g,M.target); M.ptsRound[p.id]=pts; p.score+=pts; best=Math.max(best,pts); });
      const prop=proposer(); M.ptsRound[prop.id]=best; prop.score+=best;
      players.forEach(p=>{ const c=(M.ptsRound[p.id]||0)*3 + ((M.ptsRound[p.id]>=4)?5:0); M.coins[p.id]=(M.coins[p.id]||0)+c; });
    }
    phase='reveal'; hostRefresh();
    let n=8; mTick=setInterval(()=>{ n--; showClock(n,true); if(net) net.broadcast({t:'clk',s:Math.max(0,n),rev:true}); if(n<=0){ clearInterval(mTick); mTick=null; nextRound(); } },1000);
  }
  function finalizeTP(){
    const gs=guessers(); const a=gs.filter(p=>M.votes[p.id]==='A').length; const tot=gs.filter(p=>M.votes[p.id]!=null).length;
    M.realA = tot ? Math.round(100*a/tot) : 50;
    const prop=proposer(); const ecart=Math.abs(M.realA - (M.pred==null?50:M.pred));
    const pts=Math.max(0, Math.round(100 - ecart*4));
    M.ptsRound[prop.id]=pts; prop.score+=pts;
    gs.forEach(p=>{ const ok=M.votes[p.id]!=null; M.ptsRound[p.id]=ok?15:0; if(ok) p.score+=15; });   // votants : +15 participation
    players.forEach(p=>{ M.coins[p.id]=(M.coins[p.id]||0)+Math.round((M.ptsRound[p.id]||0)/8); });
  }
  function goPodium(){ phase='podium'; hostRefresh(); }

  // diffuse un view par destinataire (cible cachée sauf au proposeur / à la révélation)
  function buildView(forId){
    const v={ phase, code, meId:forId, iAmHost:(forId==='host'), rounds:M?M.rounds:0, round:M?M.round:0,
      players:players.map(p=>({id:p.id,name:p.name,avatar:p.avatar,emoji:p.emoji,hat:p.hat,hatPos:p.hatPos,bg:p.bg,color:p.color,isHost:p.isHost,score:p.score,vote:p.vote})),
      settings, hostName:(players[0]&&players[0].name)||'?' };
    if(phase==='lobby'){
      const counts=SJ.GAMES.map((_,i)=>players.filter(p=>p.vote===i).length);
      let lead=0; counts.forEach((c,i)=>{ if(c>counts[lead]) lead=i; });
      const any=counts[lead]>0;
      v.salon={
        spinning:salonSpinning, winner:salonWinner,
        games:SJ.GAMES.map((g,i)=>({ id:g.id,name:g.name,icon:g.icon,tagline:g.tagline,time:g.time,bg:g.bg,shadow:g.shadow,text:g.text,rot:g.rot,tint:g.tint,playable:!!g.playable,
          count:counts[i], voters:players.filter(p=>p.vote===i).map(p=>({emoji:p.emoji,color:p.color})),
          isWinner:salonWinner===i, isLeader:!salonSpinning&&salonWinner==null&&any&&i===lead })),
        status: salonStatusObj(counts, lead, any)
      };
    }
    if(M){
      const prop=proposer(); const gs=guessers();
      v.gameType=M.gameType; v.proposerId=prop.id; v.proposerName=prop.name;
      if(phase==='podium'){
        v.podium={ ranking:players.slice().sort((a,b)=>b.score-a.score).map(p=>({name:p.name,emoji:p.emoji,avatar:p.avatar,hat:p.hat,hatPos:p.hatPos,bg:p.bg,score:p.score,you:(p.id===forId)})),
          earned:(M.coins[forId]||0) };
      } else if(M.gameType==='tupreferes'){
        v.dilemma=M.dilemma;
        v.myPred=((phase==='propose'||phase==='guess')&&prop.id===forId)?M.pred:null;
        v.myPick=M.votes[forId]||null;
        v.guessProgress={ validated:gs.filter(p=>M.votes[p.id]!=null).length, total:gs.length };
        if(phase==='reveal'){
          const ec=Math.abs((M.realA==null?50:M.realA)-(M.pred==null?50:M.pred));
          const verdict = ec===0?'🎯 Dans le mille !':ec<=5?'🔥 Tout proche !':ec<=15?'🙂 Pas mal':ec<=30?'😬 Loin…':'🥶 Complètement à côté';
          v.reveal={ tp:true, realA:M.realA, pred:M.pred, verdict, points:M.ptsRound[prop.id]||0, authorName:prop.name, dilemma:M.dilemma,
            teamA:gs.filter(p=>M.votes[p.id]==='A').map(p=>({emoji:p.emoji,color:p.color})),
            teamB:gs.filter(p=>M.votes[p.id]==='B').map(p=>({emoji:p.emoji,color:p.color})) };
        }
      } else {
        v.theme=M.theme; v.clue=M.clue;
        v.myTarget=((phase==='propose'||phase==='guess')&&prop.id===forId)?M.target:null;
        v.guessProgress={ validated:gs.filter(p=>M.guesses[p.id]!=null).length, total:gs.length };
        if(phase==='reveal'){
          v.reveal={ target:M.target,
            needles:gs.map(p=>({id:p.id, ratio:M.guesses[p.id]==null?0.5:M.guesses[p.id], color:p.color, emoji:p.emoji, hat:p.hat, hatPos:p.hatPos, pts:M.ptsRound[p.id], you:(p.id===forId)})),
            chips:players.slice().sort((a,b)=>(M.ptsRound[b.id]||0)-(M.ptsRound[a.id]||0)).map(p=>({name:p.name,emoji:p.emoji,pts:M.ptsRound[p.id]||0,you:(p.id===forId),prop:(p.id===prop.id)})) };
        }
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
    net.join(c, ()=> net.send({ t:'join', name:p.name, avatar:p.avatar, emoji:p.emoji, hat:p.hat, hatPos:p.hatPos, bg:p.bg }), onFail);
  }
  function guestOnState(v){ phase=v.phase; renderView(v); }
  function guestOnMsg(_id,m){
    if(m.t==='kicked'){ U().toast('Tu as été retiré de la partie'); quitToHome(); return; }
    if(m.t==='clk'){ showClock(m.s, !!m.rev); return; }
    if(m.t==='flash'){ flashCard(m.hi); return; }
  }
  function guestOnClose(){ U().toast('Connexion à l\'hôte perdue'); quitToHome(); }

  /* ================= ACTIONS ================= */
  function act(type,payload){
    if(role==='guest'){
      if(type==='clue') net.send({t:'clue', text:payload.text});
      else if(type==='guess') net.send({t:'guess', ratio:payload.ratio});
      else if(type==='vote') net.send({t:'vote', g:payload.g});
      else if(type==='dilemma') net.send({t:'dilemma', a:payload.a, b:payload.b, pred:payload.pred});
      else if(type==='pick') net.send({t:'pick', c:payload.c});
      return;
    }
    // host / solo
    if(type==='vote'){ const p=players.find(x=>x.id===myId); if(p){ p.vote=payload.g; salonWinner=null; hostRefresh(); } }
    else if(type==='spin') startSpin();
    else if(type==='launch') doLaunch();
    else if(type==='start') hostStart('wavelength');
    else if(type==='clue'){ if(M){ M.clue=(payload.text||'…').slice(0,40); startGuess(); } }
    else if(type==='guess'){ if(M){ M.guesses[myId]=clamp(payload.ratio,0,1); M.validated[myId]=true; hostRefresh(); checkDone(); } }
    else if(type==='dilemma'){ if(M){ M.dilemma={a:(payload.a||'Option A').slice(0,42), b:(payload.b||'Option B').slice(0,42)}; M.pred=clamp(Math.round(payload.pred),0,100); startGuess(); } }
    else if(type==='pick'){ if(M && phase==='guess'){ M.votes[myId]=payload.c; hostRefresh(); checkDone(); } }
    else if(type==='next'){ mClear(); nextRound(); }
    else if(type==='restart'){ hostStart(M?M.gameType:'wavelength'); }
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

  // ---------- SALON (menu principal : invite + vote du jeu) ----------
  function rLobby(v){
    const host=v.iAmHost, s=v.salon;
    const cards = s.games.map((g,i)=>{
      const winRing = g.isWinner?`<div style="position:absolute;inset:-3px;border:4px solid #FFC93C;border-radius:22px;box-shadow:0 0 0 5px rgba(255,201,60,.45);pointer-events:none"></div><div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:32px" class="pop">👑</div>`:'';
      const leadBadge = g.isLeader?`<span style="background:#FFC93C;color:#3B2D5E;border:2px solid #3B2D5E;border-radius:999px;padding:1px 9px;font-size:12px;font-weight:800">👑 en tête</span>`:'';
      const soon = g.playable?'':`<span style="position:absolute;top:-9px;right:-6px;background:#3B2D5E;color:#fff;border:2px solid #3B2D5E;border-radius:999px;padding:1px 9px;font-size:11px;font-weight:800;transform:rotate(6deg);z-index:1">🚧 bientôt</span>`;
      const voters = g.voters.length
        ? `<div style="display:flex">${g.voters.map(vt=>`<span style="width:26px;height:26px;border-radius:50%;border:2px solid #3B2D5E;background:${vt.color};margin-left:-6px;display:flex;align-items:center;justify-content:center;font-size:13px">${esc(vt.emoji)}</span>`).join('')}</div>`
        : `<span style="font-size:12px;font-weight:700;opacity:.8">sois le 1er 🙌</span>`;
      return `<div data-gc="${i}" class="gcard" style="position:relative;background:${g.bg};color:${g.text};border:3px solid #3B2D5E;border-radius:22px;padding:16px;box-shadow:0 8px 0 ${g.shadow};cursor:pointer;display:flex;flex-direction:column;gap:9px;min-height:188px;${g.playable?'':'opacity:.93'}">
        ${winRing}${soon}
        <div class="row between" style="align-items:flex-start">
          <div style="width:50px;height:50px;background:rgba(255,255,255,.88);border:3px solid #3B2D5E;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 4px 0 rgba(59,45,94,.35);transform:rotate(${g.rot})">${g.icon}</div>
          <div class="col" style="align-items:flex-end;gap:5px">
            <span style="background:rgba(255,255,255,.88);color:#3B2D5E;border:2px solid #3B2D5E;border-radius:999px;padding:1px 9px;font-size:12px;font-weight:800">⏱ ${g.time}</span>
            ${leadBadge}
          </div>
        </div>
        <div style="font-size:20px;font-weight:800;line-height:1.05">${esc(g.name)}</div>
        <div style="font-size:13px;font-weight:600;opacity:.92;flex:1;line-height:1.25">${esc(g.tagline)}</div>
        <div class="row between" style="min-height:28px">
          <div style="padding-left:6px">${voters}</div>
          <span style="background:#fff;color:#3B2D5E;border:2px solid #3B2D5E;border-radius:999px;padding:2px 11px;font-size:14px;font-weight:800;box-shadow:0 3px 0 rgba(59,45,94,.4)">🗳 ${g.count}</span>
        </div>
      </div>`;
    }).join('');

    const playerList = v.players.map(p=>{
      const g = (p.vote!=null) ? s.games[p.vote] : null;
      const tag = g ? `<span style="font-size:12px;font-weight:700;color:#3B2D5E;background:${g.tint||'#fff'};border:2px solid #3B2D5E;border-radius:999px;padding:2px 9px;max-width:128px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.name)}</span>`
                  : `<span style="font-size:12px;font-weight:700;color:#A99CC9;font-style:italic">réfléchit…</span>`;
      return `<div class="row" style="gap:10px">${U().ava({avatar:p.avatar,emoji:p.emoji,hat:p.hat,hatPos:p.hatPos,bg:p.bg},36)}
        <div class="grow row gap6" style="min-width:0"><span style="font-size:17px;font-weight:700">${esc(p.name)}</span>${p.you?'<span class="pill paper" style="font-size:11px;padding:0 8px">toi</span>':''}${p.isHost?'<span>👑</span>':''}</div>
        ${tag}</div>`;
    }).join('');

    mMount(`
      <section class="screen" style="justify-content:flex-start;overflow:visible">
        <div class="stage wide" style="max-width:1080px;gap:18px">
          <header class="row between wrap" style="gap:14px">
            <div class="row gap8"><div style="width:46px;height:46px;background:#FF5D73;border:3px solid #3B2D5E;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 5px 0 #C23A50;transform:rotate(-4deg)">🎲</div>
              <div class="col" style="line-height:1.05"><div style="font-size:24px;font-weight:800">Shepa Jouer</div><div style="font-size:14px;font-weight:700;color:#9B5DE5">Salon de ${esc(v.hostName)}</div></div></div>
            <div class="row gap8">
              <span class="pill paper" style="font-size:16px;font-weight:800">🪙 ${SJ.store.get('coins')}</span>
              ${host?`<button class="pill lilac" id="cfg" style="cursor:pointer;font-size:15px">⚙️ réglages</button>`:''}
              <button class="btn btn--ghost sm" id="back">← quitter</button>
            </div>
          </header>
          <div class="row wrap" style="gap:20px;align-items:flex-start">
            <div class="col grow" style="flex:2.2;min-width:300px;gap:14px">
              <div class="row" style="align-items:baseline;gap:10px;flex-wrap:wrap"><h2 style="font-size:clamp(24px,4vw,34px);font-weight:800;text-shadow:0 4px 0 #FFD9B8">Votez pour un jeu&nbsp;!</h2><span class="caveat" style="font-size:20px">tape une carte 👆</span></div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(214px,1fr));gap:16px">${cards}</div>
            </div>
            <div class="col" style="flex:1;min-width:280px;gap:16px">
              <div class="card sh-blue" style="gap:12px">
                <div style="font-size:18px;font-weight:800">📨 Invite tes amis</div>
                <div style="border:3px dashed #3B2D5E;border-radius:14px;padding:8px 0;text-align:center;font-size:28px;font-weight:800;letter-spacing:6px;background:#F4EFFF">${esc(v.code||'')}</div>
                <button class="btn btn--blue block" id="copy">⎘ Copier le lien</button>
              </div>
              <div class="card sh-teal" style="gap:10px">
                <div class="row between"><div style="font-size:18px;font-weight:800">👥 Joueurs</div><span class="pill mint" style="font-size:14px">${v.players.length}/10</span></div>
                ${playerList}
              </div>
              <div class="card" style="gap:12px;background:#9B5DE5;color:#fff;box-shadow:0 9px 0 #4A2E9E">
                <div class="center" style="min-height:44px;display:flex;flex-direction:column;justify-content:center">
                  <div style="font-size:20px;font-weight:800;line-height:1.1">${esc(s.status.title)}</div>
                  <div style="font-size:14px;font-weight:600;color:#EADBFF">${esc(s.status.sub)}</div>
                </div>
                ${host?`<button class="btn btn--yellow block" id="rand">${s.spinning?'🌀 Tirage…':'🎲 Le hasard décide'}</button>
                <button class="btn btn--teal block" id="launch" ${v.players.length<2?'disabled':''}>${s.winner!=null?"C'est parti ▶":"Lancer la partie ▶"}</button>
                ${v.players.length<2?'<div class="center" style="font-size:12px;font-weight:700;color:#EADBFF">Partage le code — il faut au moins 2 joueurs</div>':'<div class="center" style="font-size:12px;font-weight:600;color:#EADBFF">L\'hôte lance quand tout le monde est prêt</div>'}`
                :`<div class="center" style="font-size:14px;font-weight:700;color:#EADBFF">⏳ L'hôte choisit et lance la partie…</div>`}
              </div>
            </div>
          </div>
        </div>
      </section>`);
    app().querySelectorAll('.gcard').forEach(c=> c.onclick=()=>{ if(s.spinning) return; SJ.audio.pop(); act('vote',{g:+c.dataset.gc}); });
    $('#copy').onclick=()=>{ const link=location.origin+location.pathname+'?code='+(v.code||''); if(navigator.clipboard) navigator.clipboard.writeText(link); U().toast('Lien copié ! 🔗'); SJ.audio.click(); };
    $('#back').onclick=()=>{ SJ.audio.click(); quitToHome(); };
    if(host){ const cf=$('#cfg'); if(cf) cf.onclick=()=>{ SJ.audio.click(); salonSettings(); };
      const rb=$('#rand'); if(rb) rb.onclick=()=>act('spin');
      const lb=$('#launch'); if(lb) lb.onclick=()=>act('launch'); }
  }
  function patchLobby(v){ rLobby(v); }   // le salon se re-rend entièrement (aucun input en cours)
  function flashCard(hi){ app().querySelectorAll('.gcard').forEach(c=>{ c.style.outline=(+c.dataset.gc===hi)?'4px solid #FFC93C':'none'; c.style.outlineOffset='3px'; }); }
  function salonStatusObj(counts, lead, any){
    if(salonSpinning) return {title:'Le sort en décide…', sub:'ça tourne, ça tourne…'};
    if(salonWinner!=null){ const g=SJ.GAMES[salonWinner]; return {title:`${g.icon} ${g.name} !`, sub:'Tout le monde embarque 🎉'}; }
    if(any){ const g=SJ.GAMES[lead]; return {title:g.name, sub:`${counts[lead]} voix en tête`}; }
    return {title:'En attente des votes', sub:'Tape un jeu pour voter'};
  }
  function salonSettings(){
    const o=document.createElement('div');
    o.style.cssText='position:fixed;inset:0;background:rgba(59,45,94,.5);z-index:70;display:flex;align-items:center;justify-content:center;padding:20px;animation:popIn .25s both';
    o.innerHTML=`<div class="card sh-purple" style="max-width:420px;background:#fff;display:flex;flex-direction:column;gap:14px">
      <h2 style="font-size:22px">⚙️ Réglages — Longueur d'onde</h2>
      <div class="panel lilac"><div class="panel-label">Durée de la partie</div><div class="spread" id="durs"></div></div>
      <div class="panel mint"><div class="panel-label">Thèmes</div><div class="row wrap gap8" id="packs"></div></div>
      <button class="btn btn--purple block" id="ok">OK</button></div>`;
    document.body.appendChild(o);
    renderDurs(); renderPacks();
    o.querySelector('#ok').onclick=()=>{ SJ.audio.pop(); o.remove(); };
    o.onclick=e=>{ if(e.target===o) o.remove(); };
  }
  function startSpin(){
    if(salonSpinning) return; salonSpinning=true; salonWinner=null; hostRefresh();
    let ticks=0; const total=22+Math.floor(Math.random()*7);
    mTick && clearInterval(mTick);
    mTick=setInterval(()=>{ ticks++; const hi=Math.floor(Math.random()*SJ.GAMES.length); flashCard(hi); if(net) net.broadcast({t:'flash',hi}); SJ.audio.tick();
      if(ticks>=total){ clearInterval(mTick); mTick=null; const pl=SJ.GAMES.map((g,i)=>i).filter(i=>SJ.GAMES[i].playable); salonWinner=pl[Math.floor(Math.random()*pl.length)]; salonSpinning=false; SJ.audio.win(); U().confetti(40); hostRefresh(); } },85);
  }
  function doLaunch(){
    if(salonSpinning) return;
    if(players.length<2){ U().toast('Il faut au moins 2 joueurs 😊'); return; }
    let target=salonWinner;
    if(target==null){ const counts=SJ.GAMES.map((_,i)=>players.filter(p=>p.vote===i).length); let lead=0; counts.forEach((c,i)=>{ if(c>counts[lead]) lead=i; }); target = counts[lead]>0?lead:0; }
    const g=SJ.GAMES[target];
    if(!g.playable){ U().toast(`🚧 ${g.name} arrive bientôt ! Choisis un jeu jouable 🎯`); return; }
    hostStart(g.id);
  }
  function renderDurs(){ const e=document.getElementById('durs'); if(!e)return; e.innerHTML=SJ.DURATIONS.map(d=>`<div class="dur" data-id="${d.id}" style="flex:1;text-align:center;font-weight:${d.id===settings.durationId?800:700};border:3px solid #3B2D5E;border-radius:12px;padding:8px 0;cursor:pointer;background:${d.id===settings.durationId?'#9B5DE5':'#fff'};color:${d.id===settings.durationId?'#fff':'#3B2D5E'};box-shadow:${d.id===settings.durationId?'0 4px 0 #6E3CB0':'none'}">${d.label}<br><span style="font-size:13px;opacity:.85">${d.rounds} tours</span></div>`).join('');
    document.querySelectorAll('.dur').forEach(x=>x.onclick=()=>{ settings.durationId=x.dataset.id; SJ.store.setIn('settings','durationId',x.dataset.id); SJ.audio.click(); renderDurs(); }); }
  function renderPacks(){ const e=document.getElementById('packs'); if(!e)return; e.innerHTML=SJ.PACKS.map(p=>`<div class="chip pk ${settings.packs.includes(p.id)?'active':''}" data-id="${p.id}">${esc(p.label)}</div>`).join('');
    document.querySelectorAll('.pk').forEach(x=>x.onclick=()=>{ let ps=settings.packs.slice(); const id=x.dataset.id; if(ps.includes(id))ps=ps.filter(z=>z!==id); else ps.push(id); if(!ps.length)ps=[id]; settings.packs=ps; SJ.store.setIn('settings','packs',ps); SJ.audio.click(); renderPacks(); }); }

  // ---------- PROPOSE ----------
  function rPropose(v){
    if(v.gameType==='tupreferes') return rProposeTP(v);
    const th=v.theme, mine=v.proposerId===v.meId;
    if(mine){
      mMount(`<section class="screen"><div class="stage game card sh-purple" style="gap:14px">
        ${U().topbar(`Tour ${v.round}/${v.rounds} — c'est <b style="color:#9B5DE5">toi</b> le proposeur !`, 'frozen')}
        ${scoreStrip(v)}
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
        ${U().topbar(`Tour ${v.round}/${v.rounds}`, 'frozen')}
        ${scoreStrip(v)}
        <div class="cadran-wrap" id="cad"></div>
        <div class="theme-card"><div class="theme-pole" style="text-align:left">${esc(th.el)} ${esc(th.left)}</div><div class="muted" style="font-size:14px;font-weight:700;white-space:nowrap">← thème →</div><div class="theme-pole" style="text-align:right">${esc(th.right)} ${esc(th.er)}</div></div>
        <div class="clue-bubble" style="background:#F4EFFF;box-shadow:0 5px 0 #C9BBE8">💭 ${esc(v.proposerName)} réfléchit à un indice…</div>
      </div></section>`);
      curCad=SJ.cadran.make({theme:th}); curCad.showTarget(false); curCad.hideHidden(); $('#cad').appendChild(curCad.el);
    }
  }

  // ---------- GUESS ----------
  function rGuess(v){
    if(v.gameType==='tupreferes') return rGuessTP(v);
    const th=v.theme, mine=v.proposerId===v.meId;
    if(mine){
      mMount(`<section class="screen"><div class="stage game card sh-purple" style="gap:14px">
        ${U().topbar(`Tour ${v.round}/${v.rounds} — les autres devinent…`)}
        ${scoreStrip(v)}
        <div class="clue-bubble">${esc(v.clue)}</div>
        <div class="cadran-wrap" id="cad"></div>
        <div class="center muted" style="font-weight:700"><span id="prog">${v.guessProgress.validated}/${v.guessProgress.total}</span> ont validé · révélation auto</div>
      </div></section>`);
      curCad=SJ.cadran.make({theme:th}); if(v.myTarget!=null){ curCad.setTarget(v.myTarget); curCad.showTarget(true); } else { curCad.showTarget(false); curCad.hideHidden(); } $('#cad').appendChild(curCad.el);
      return;
    }
    mMount(`<section class="screen"><div class="stage game card sh-purple" style="gap:14px">
      ${U().topbar(`Tour ${v.round}/${v.rounds} — indice de <b style="color:#FF5D73">${esc(v.proposerName)}</b>`)}
      ${scoreStrip(v)}
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

  // mini tableau des scores affiché en permanence pendant la partie (trié, "Toi" + proposeur 🎤 mis en avant)
  function scoreStrip(v){
    if(!v.players || !v.players.length) return '';
    const rows=v.players.slice().sort((a,b)=>b.score-a.score).map(p=>{
      const me=p.id===v.meId, prop=p.id===v.proposerId;
      return `<span style="display:inline-flex;align-items:center;gap:5px;background:${me?'#FFF1C9':'#fff'};border:2px solid #3B2D5E;border-radius:999px;padding:2px 11px 2px 3px;font-size:13px;font-weight:700;white-space:nowrap">`
        +`${U().ava({avatar:p.avatar,emoji:p.emoji,bg:p.bg},22)}`
        +`<span>${prop?'🎤 ':''}${me?'Toi':esc(p.name)}</span><b style="color:#9B5DE5">${p.score}</b></span>`;
    }).join('');
    return `<div class="row wrap" style="justify-content:center;gap:6px;width:100%">${rows}</div>`;
  }

  // ---------- REVEAL ----------
  function rReveal(v){
    if(v.gameType==='tupreferes') return rRevealTP(v);
    const r=v.reveal; if(!r){ return; }
    mMount(`<section class="screen"><div class="stage game card sh-purple" style="gap:14px;position:relative">
      <div class="topbar"><span class="pill lilac tb-label" style="font-size:16px">Tour ${v.round}/${v.rounds} — résultats !</span><span class="pill mint tb-timer" id="nextpill" style="font-size:16px">suivant…</span></div>
      ${scoreStrip(v)}
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

  // ---------- TU PRÉFÈRES (propose / guess / reveal) ----------
  function rProposeTP(v){
    const d=v.dilemma||{a:'',b:''}, mine=v.proposerId===v.meId;
    if(mine){
      mMount(`<section class="screen"><div class="stage game card" style="max-width:480px;gap:13px;background:#FFF8EC;box-shadow:0 10px 0 #FFC93C">
        ${U().topbar(`Manche ${v.round}/${v.rounds} — à toi le dilemme 🖊️`, 'frozen')}
        ${scoreStrip(v)}
        <div style="font-size:20px;font-weight:800">Écris ton « Tu préfères ? »</div>
        <div class="row gap8" style="background:#E4F8F6;border:3px solid #3B2D5E;border-radius:14px;padding:8px 10px"><div style="width:34px;height:34px;background:#2EC4B6;border:3px solid #3B2D5E;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;flex:none">A</div><input id="optA" class="field" style="border:none;background:transparent;padding:0;box-shadow:none" maxlength="42" value="${esc(d.a)}" placeholder="Option A…"></div>
        <div class="center" style="font-weight:800;color:#9B5DE5">— ou —</div>
        <div class="row gap8" style="background:#FFE1E7;border:3px solid #3B2D5E;border-radius:14px;padding:8px 10px"><div style="width:34px;height:34px;background:#FF8FA3;border:3px solid #3B2D5E;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:800;flex:none">B</div><input id="optB" class="field" style="border:none;background:transparent;padding:0;box-shadow:none" maxlength="42" value="${esc(d.b)}" placeholder="Option B…"></div>
        <div class="panel" style="background:#fff;border:3px solid #3B2D5E;gap:10px;align-items:center">
          <div style="font-size:16px;font-weight:800;text-align:center">Quel % choisira <span style="color:#2EC4B6">A</span> ? 🤫</div>
          <div id="predLbl" style="width:80px;height:80px;border:4px solid #3B2D5E;border-radius:50%;background:#FFF1C9;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;box-shadow:0 5px 0 #E8C766">50%</div>
          <input id="pred" type="range" min="0" max="100" value="50" style="width:100%">
          <div class="muted" style="font-size:13px;font-weight:700;text-align:center">🤫 ta prédiction reste cachée jusqu'à la révélation</div>
        </div>
        <button class="btn btn--teal block" id="send">Envoyer aux autres ▶</button>
      </div></section>`);
      const pr=$('#pred'), lbl=$('#predLbl'); pr.oninput=()=>{ lbl.textContent=pr.value+'%'; };
      $('#send').onclick=()=>{ const a=$('#optA').value.trim()||d.a||'Option A', b=$('#optB').value.trim()||d.b||'Option B'; SJ.audio.validate(); act('dilemma',{a,b,pred:+pr.value}); };
    } else {
      mMount(`<section class="screen"><div class="stage game card sh-pink" style="max-width:460px;gap:14px">
        ${U().topbar(`Manche ${v.round}/${v.rounds}`, 'frozen')}
        ${scoreStrip(v)}
        <div class="clue-bubble" style="background:#F4EFFF;box-shadow:0 5px 0 #C9BBE8">🖊️ ${esc(v.proposerName)} écrit un dilemme…</div>
        <div class="center muted" style="font-weight:700;padding:16px">prépare-toi à voter 🤔</div>
      </div></section>`);
    }
  }
  function rGuessTP(v){
    const d=v.dilemma||{a:'',b:''}, mine=v.proposerId===v.meId;
    if(mine){
      mMount(`<section class="screen"><div class="stage game card sh-pink" style="max-width:460px;gap:14px">
        ${U().topbar(`Manche ${v.round}/${v.rounds} — les autres votent…`)}
        ${scoreStrip(v)}
        <div class="row gap8"><div class="grow center" style="background:#E4F8F6;border:3px solid #3B2D5E;border-radius:14px;padding:12px;font-weight:800">A · ${esc(d.a)}</div><div class="grow center" style="background:#FFE1E7;border:3px solid #3B2D5E;border-radius:14px;padding:12px;font-weight:800">B · ${esc(d.b)}</div></div>
        <div class="center muted" style="font-weight:700"><span id="prog">${v.guessProgress.validated}/${v.guessProgress.total}</span> ont voté</div>
      </div></section>`);
      return;
    }
    const picked=v.myPick;
    mMount(`<section class="screen"><div class="stage game card sh-pink" style="max-width:420px;gap:12px">
      ${U().topbar(`Manche ${v.round}/${v.rounds} — dilemme de <b style="color:#FF5D73">${esc(v.proposerName)}</b>`)}
      ${scoreStrip(v)}
      <div class="center" style="font-size:24px;font-weight:800">Tu préfères… ?</div>
      <button class="tpopt" data-c="A" style="position:relative;border:3px solid #3B2D5E;border-radius:18px;background:#2EC4B6;color:#fff;padding:22px 14px;font-size:20px;font-weight:800;box-shadow:0 7px 0 #1E8B81;cursor:pointer;${picked==='A'?'outline:4px solid #FFC93C;outline-offset:3px':''}">${esc(d.a)}${picked==='A'?' ✅':''}</button>
      <div class="center" style="font-weight:800;color:#9B5DE5">VS</div>
      <button class="tpopt" data-c="B" style="position:relative;border:3px solid #3B2D5E;border-radius:18px;background:#FF8FA3;color:#3B2D5E;padding:22px 14px;font-size:20px;font-weight:800;box-shadow:0 7px 0 #D45D75;cursor:pointer;${picked==='B'?'outline:4px solid #FFC93C;outline-offset:3px':''}">${esc(d.b)}${picked==='B'?' ✅':''}</button>
      <div class="center muted" style="font-weight:700"><span id="prog">${v.guessProgress.validated}/${v.guessProgress.total}</span> ont voté</div>
    </div></section>`);
    if(picked) iValidated=true;
    app().querySelectorAll('.tpopt').forEach(b=> b.onclick=()=>{ if(iValidated) return; iValidated=true; SJ.audio.validate();
      app().querySelectorAll('.tpopt').forEach(x=>{ if(x!==b) x.style.opacity='.5'; }); b.style.outline='4px solid #FFC93C'; b.style.outlineOffset='3px';
      act('pick',{c:b.dataset.c}); });
  }
  function rRevealTP(v){
    const r=v.reveal||{}, d=r.dilemma||{a:'',b:''}, realA=r.realA==null?50:r.realA, pred=r.pred==null?50:r.pred;
    mMount(`<section class="screen"><div class="stage game card sh-purple" style="max-width:480px;gap:15px">
      <div class="topbar"><span class="pill lilac tb-label" style="font-size:16px">Manche ${v.round}/${v.rounds} — verdict !</span><span class="pill mint tb-timer" id="nextpill" style="font-size:16px">suivant…</span></div>
      ${scoreStrip(v)}
      <div class="center" style="font-size:17px;font-weight:800">${esc(d.a)} <span style="color:#9B5DE5">vs</span> ${esc(d.b)}</div>
      <div class="col" style="gap:7px">
        <div class="row between" style="font-size:15px;font-weight:800"><span style="color:#1E8B81">A · ${realA}%</span><span style="color:#D45D75">${100-realA}% · B</span></div>
        <div style="position:relative;height:50px;border:3px solid #3B2D5E;border-radius:14px;overflow:hidden;background:#FFE1E7;margin-top:14px">
          <div style="position:absolute;inset:0 auto 0 0;width:${realA}%;background:#2EC4B6;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;color:#fff;font-weight:800">${realA>14?realA+'%':''}</div>
          <div style="position:absolute;top:-3px;bottom:-3px;left:${pred}%;border-left:4px dashed #3B2D5E"></div>
          <div style="position:absolute;top:-16px;left:${pred}%;transform:translateX(-50%);background:#FFC93C;border:3px solid #3B2D5E;border-radius:999px;padding:0 8px;font-size:12px;font-weight:800;white-space:nowrap;box-shadow:0 3px 0 #D9A416">${esc(r.authorName||'')} ${pred}%</div>
        </div>
      </div>
      <div class="row gap8">
        <div class="panel" style="flex:1;background:#E4F8F6;border:3px solid #3B2D5E;gap:6px"><span style="font-size:13px;font-weight:800;color:#1E8B81">Team A</span><div class="row wrap" style="gap:5px">${(r.teamA||[]).map(x=>`<span style="width:28px;height:28px;border-radius:50%;border:2px solid #3B2D5E;background:${x.color};display:flex;align-items:center;justify-content:center;font-size:14px">${esc(x.emoji)}</span>`).join('')||'<span class="muted" style="font-size:12px">—</span>'}</div></div>
        <div class="panel" style="flex:1;background:#FFE1E7;border:3px solid #3B2D5E;gap:6px"><span style="font-size:13px;font-weight:800;color:#D45D75">Team B</span><div class="row wrap" style="gap:5px">${(r.teamB||[]).map(x=>`<span style="width:28px;height:28px;border-radius:50%;border:2px solid #3B2D5E;background:${x.color};display:flex;align-items:center;justify-content:center;font-size:14px">${esc(x.emoji)}</span>`).join('')||'<span class="muted" style="font-size:12px">—</span>'}</div></div>
      </div>
      <div class="card" style="background:#9B5DE5;color:#fff;box-shadow:0 6px 0 #4A2E9E;flex-direction:row;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px">
        <div class="col"><span style="font-size:13px;color:#EADBFF">${esc(r.authorName||'')} : prédit ${pred}% · réel ${realA}%</span><span style="font-size:21px;font-weight:800">${esc(r.verdict||'')}</span></div>
        <div style="background:#FFC93C;color:#3B2D5E;border:3px solid #3B2D5E;border-radius:12px;padding:6px 14px;font-size:22px;font-weight:800">+${r.points||0}</div>
      </div>
      ${v.iAmHost?'<button class="btn btn--purple sm" id="next" style="align-self:center">Manche suivante ▶</button>':''}
    </div></section>`);
    SJ.audio.reveal();
    if(v.iAmHost){ const nb=$('#next'); if(nb) nb.onclick=()=>{ SJ.audio.click(); act('next'); }; }
  }

  // ---------- PODIUM ----------
  function rPodium(v){
    const pod=v.podium, rk=pod.ranking, win=rk[0];
    if(!coinsClaimed){ SJ.store.addCoins(pod.earned||0); coinsClaimed=true; }
    const bar=(p,h,col,rank)=>`<div class="col" style="align-items:center;gap:6px">${rank===1?'<div style="font-size:26px">👑</div>':''}
      <span style="${rank===1?'border-radius:50%;box-shadow:0 0 0 5px #FFC93C;':''}display:inline-block">${U().ava({avatar:p.avatar,emoji:p.emoji,hat:p.hat,hatPos:p.hatPos,bg:p.bg},52)}</span>
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
