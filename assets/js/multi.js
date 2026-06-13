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
  function mClear(){ mPending.forEach(clearTimeout); mPending=[]; if(mTick){clearInterval(mTick);mTick=null;} if(pbAudioTimer){clearInterval(pbAudioTimer);pbAudioTimer=null;} if(pbRaf){cancelAnimationFrame(pbRaf);pbRaf=0;} if(pbCountTimer){clearInterval(pbCountTimer);pbCountTimer=null;} }
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
  let salonSpinning=false, salonWinner=null, lastView=null;
  let micStream=null, pbAudioTimer=null, pbRaf=0, pbCountTimer=null;
  const nowMs=()=> (window.performance&&performance.now)?performance.now():Date.now();

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
    } else if(m.t==='profile'){ const p=players.find(x=>x.id===id); if(p){ p.name=(m.name||p.name).slice(0,14); p.avatar=m.avatar; p.emoji=m.emoji; p.hat=m.hat; p.hatPos=m.hatPos; p.bg=m.bg; hostRefresh(); }
    } else if(m.t==='perm'){ if(M&&M.perms){ M.perms[id]={mic:!!m.mic,cam:!!m.cam}; hostRefresh(); }
    } else if(m.t==='pbresp'){ if(M&&phase==='pbplay'){ M.responses[id]={choice:m.choice,ok:m.ok,dt:m.dt}; pbMaybeResolve(); }
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
    if(gameId==='partybox'){ pbStart(); return; }
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
      if(M.gameType==='partybox'){
        v.gameType='partybox';
        const myLives=(M.lives[forId]||0);
        const aliveN=players.filter(p=>(M.lives[p.id]||0)>0).length;
        const board=players.slice().sort((a,b)=>(M.pts[b.id]||0)-(M.pts[a.id]||0)).map(p=>({
          name:p.name, emoji:p.emoji, avatar:p.avatar, hat:p.hat, hatPos:p.hatPos, bg:p.bg, isHost:p.isHost,
          you:(p.id===forId), lives:(M.lives[p.id]||0), dead:(M.lives[p.id]||0)<=0, pts:(M.pts[p.id]||0) }));
        v.pb={ round:M.round, dur:M.dur, myLives, iAmDead:myLives<=0, alive:aliveN, total:players.length,
          myPerm:M.perms[forId]||{mic:false,cam:false},
          perms:players.map(p=>({id:p.id,name:p.name,emoji:p.emoji,avatar:p.avatar,hat:p.hat,hatPos:p.hatPos,bg:p.bg,isHost:p.isHost,mic:(M.perms[p.id]||{}).mic,cam:(M.perms[p.id]||{}).cam})),
          board,
          mini:M.mini?{kind:M.mini.kind,prompt:M.mini.prompt,options:M.mini.options,colormode:M.mini.colormode,display:M.mini.display,target:M.mini.target,big:M.mini.big,micTarget:M.mini.micTarget}:null,
          count: phase==='pbcount' ? { secs:M.countSecs, first:(M.round===0),
            results:(M.round>0)?players.filter(p=>(M.lastRes||{})[p.id]).map(p=>{ const r=M.lastRes[p.id]; return {name:p.name,emoji:p.emoji,bg:p.bg,you:(p.id===forId),ok:r.ok,gained:r.gained,fast:!!r.fast,out:(M.newlyOut||[]).indexOf(p.id)>=0,lives:(M.lives[p.id]||0)}; }):[] } : null,
          over: phase==='pbover' ? { earned:(M.coins[forId]||0), iWon:(M.winnerId===forId),
            ranking:players.slice().sort((a,b)=>{ const aa=(M.lives[a.id]||0)>0?1:0, ba=(M.lives[b.id]||0)>0?1:0; if(aa!==ba) return ba-aa; return (M.pts[b.id]||0)-(M.pts[a.id]||0); }).map(p=>({name:p.name,emoji:p.emoji,avatar:p.avatar,hat:p.hat,hatPos:p.hatPos,bg:p.bg,you:(p.id===forId),lives:(M.lives[p.id]||0),pts:(M.pts[p.id]||0),surv:(M.surv||{})[p.id]||0,win:(M.winnerId===p.id)})) } : null
        };
        return v;
      }
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
  function guestOnState(v){ phase=v.phase; lastView=v; renderView(v); }
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
      else if(type==='pbresp') net.send({t:'pbresp', choice:payload.choice, ok:payload.ok, dt:payload.dt});
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
    else if(type==='pbstart'){ if(M&&M.gameType==='partybox') pbToCountdown(); }
    else if(type==='pbresp'){ if(M&&phase==='pbplay'){ M.responses[myId]=payload; pbMaybeResolve(); } }
    else if(type==='pbagain'){ if(M&&M.gameType==='partybox'){ players.forEach(p=>{ M.lives[p.id]=3; M.pts[p.id]=0; M.coins[p.id]=0; }); M.elim={}; M.surv={}; M.lastRes={}; M.round=0; M.lastKey=null; M.winnerId=null; coinsClaimed=false; pbToCountdown(); } }
    else if(type==='next'){ mClear(); nextRound(); }
    else if(type==='restart'){ hostStart(M?M.gameType:'wavelength'); }
  }

  function leave(){ try{ if(net){ if(role==='guest') net.send({t:'leave'}); net.leave(); } }catch(e){} net=null; role='solo'; M=null; phase='lobby'; }
  function quitToHome(){ leave(); SJ.screens.home(); }

  /* ================= RENDU UNIFIÉ ================= */
  function renderView(v){
    const key = `${v.phase}#${v.round||0}#${(v.proposerId&&v.proposerId===v.meId)?'P':'G'}`;
    const same = key===curKey;
    if(v.phase==='lobby'){ if(same) patchSalon(v); else { curKey=key; rLobby(v); } return; }
    if(v.phase==='pbperm'){ curKey=key; rPbPerm(v); return; }    // re-render à chaque autorisation
    if(v.phase==='guess'){ if(same) patchGuess(v); else { curKey=key; iValidated=false; rGuess(v); } return; }
    if(same) return;                 // propose / reveal / podium / pb : re-render seulement au changement d'état
    curKey=key;
    if(v.phase==='propose') rPropose(v);
    else if(v.phase==='reveal') rReveal(v);
    else if(v.phase==='podium') rPodium(v);
    else if(v.phase==='pbcount') rPbCount(v);
    else if(v.phase==='pbplay') rPbPlay(v);
    else if(v.phase==='pbover') rPbOver(v);
  }

  // ---------- SALON (menu principal : invite + vote du jeu) ----------
  function rLobby(v){
    const host=v.iAmHost, s=v.salon;
    const cards = s.games.map((g,i)=>`<div data-gc="${i}" class="gcard${g.playable?'':' soon'}" style="--gbg:${g.bg};--gtext:${g.text};--gshadow:${g.shadow}">
        <span class="gc-ring">${gcRingHTML(g)}</span>${g.playable?'':'<span class="gc-soon">🚧 bientôt</span>'}
        <div class="gc-head">
          <div class="gc-icon" style="transform:rotate(${g.rot})">${g.icon}</div>
          <div class="gc-meta"><span class="gc-time">⏱ ${g.time}</span><span class="gc-lead">${gcLeadHTML(g)}</span></div>
        </div>
        <div class="gc-name">${esc(g.name)}</div>
        <div class="gc-tag">${esc(g.tagline)}</div>
        <div class="gc-foot"><div class="gc-voters">${gcVotersHTML(g)}</div><span class="gc-count">🗳 ${g.count}</span></div>
      </div>`).join('');
    const avatarP = SJ.ui.myAvatarProfile();
    const actionsInner = host
      ? `<div class="row gap8" style="width:100%"><button class="btn btn--yellow grow" id="rand">${s.spinning?'🌀 Tirage…':'🎲 Hasard'}</button><button class="btn btn--teal grow" id="launch" ${v.players.length<2?'disabled':''}>${s.winner!=null?"C'est parti ▶":"Lancer ▶"}</button></div>
         <div class="center sa-hint" style="font-size:12px;font-weight:600;color:#EADBFF">${v.players.length<2?'Partage le code — min. 2 joueurs':"L'hôte lance quand vous êtes prêts"}</div>`
      : `<div class="center" style="font-size:14px;font-weight:700;color:#EADBFF">⏳ l'hôte lance la partie…</div>`;
    const settingsPanel = host ? `<div class="card salon-cfg" style="display:flex;flex-direction:column;gap:10px;box-shadow:0 9px 0 #C9BBE8">
        <div style="font-size:18px;font-weight:800">⚙️ Réglages <span style="font-size:13px;color:#7A6BA8;font-weight:700">· Longueur d'onde</span></div>
        <div class="panel lilac"><div class="panel-label">Durée</div><div class="spread" id="durs"></div></div>
        <div class="panel mint"><div class="panel-label">Thèmes</div><div class="row wrap gap8" id="packs"></div></div>
      </div>` : '';
    mMount(`
      <section class="screen salon-screen" style="justify-content:flex-start;overflow:visible">
        <div class="stage wide" style="max-width:1080px;gap:16px">
          <header class="row between wrap" style="gap:12px">
            <div class="row gap8"><div style="width:44px;height:44px;background:#FF5D73;border:3px solid #3B2D5E;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:23px;box-shadow:0 5px 0 #C23A50;transform:rotate(-4deg)">🎲</div>
              <div class="col" style="line-height:1.05"><div style="font-size:23px;font-weight:800">Shepa Jouer</div><div style="font-size:13px;font-weight:700;color:#9B5DE5">Salon de ${esc(v.hostName)}</div></div></div>
            <div class="row gap6 wrap" style="align-items:center;justify-content:flex-end">
              <button class="pill paper" id="copy" style="cursor:pointer;font-size:14px;font-weight:800;letter-spacing:2px">📨 ${esc(v.code||'')} ⎘</button>
              <span class="pill paper" style="font-size:14px;font-weight:800">🪙 ${SJ.store.get('coins')}</span>
              <button id="editme" style="display:inline-flex;align-items:center;gap:6px;background:#fff;border:3px solid #3B2D5E;border-radius:999px;padding:3px 11px 3px 4px;cursor:pointer;box-shadow:0 4px 0 #C9BBE8;font-family:inherit;font-weight:700;font-size:14px;color:#3B2D5E">${U().ava(avatarP,28)}<span style="max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(SJ.store.get('pseudo')||'moi')}</span> ✏️</button>
              ${host?`<button class="pill lilac cfg-mobile" id="cfg" style="cursor:pointer;font-size:16px">⚙️</button>`:''}
              <button class="btn btn--ghost sm" id="back">← quitter</button>
            </div>
          </header>
          <div class="row wrap" style="gap:20px;align-items:flex-start">
            <div class="col grow" style="flex:2.2;min-width:300px;gap:14px">
              <div class="row" style="align-items:baseline;gap:10px;flex-wrap:wrap"><h2 style="font-size:clamp(22px,4vw,32px);font-weight:800;text-shadow:0 4px 0 #FFD9B8">Votez pour un jeu&nbsp;!</h2><span class="caveat" style="font-size:19px">tape une carte 👆</span></div>
              <div class="games-grid">${cards}</div>
            </div>
            <div class="col" style="flex:1;min-width:270px;gap:16px">
              <div class="card sh-teal salon-players-card" style="display:flex;flex-direction:column;gap:10px">
                <div class="row between"><div style="font-size:18px;font-weight:800">👥 Joueurs</div><span class="pill mint" style="font-size:14px"><span id="salon-pcount">${v.players.length}</span>/10</span></div>
                <div id="salon-players" class="col" style="gap:9px">${playerListHTML(v)}</div>
              </div>
              ${settingsPanel}
              <div class="card salon-actions" style="background:#9B5DE5;color:#fff;box-shadow:0 9px 0 #4A2E9E">
                <div id="salon-navplayers" class="salon-navp">${navPlayersHTML(v)}</div>
                <div class="center salon-stt-block" style="min-height:40px;display:flex;flex-direction:column;justify-content:center"><div id="salon-stt" style="font-size:19px;font-weight:800;line-height:1.1">${esc(s.status.title)}</div><div id="salon-sts" style="font-size:13px;font-weight:600;color:#EADBFF">${esc(s.status.sub)}</div></div>
                ${actionsInner}
              </div>
            </div>
          </div>
        </div>
      </section>`);
    app().querySelectorAll('.gcard').forEach(c=> c.onclick=()=>{ if(s.spinning) return; SJ.audio.pop(); act('vote',{g:+c.dataset.gc}); });
    $('#copy').onclick=()=>{ const link=location.origin+location.pathname+'?code='+(v.code||''); if(navigator.clipboard) navigator.clipboard.writeText(link); U().toast('Lien copié ! 🔗'); SJ.audio.click(); };
    $('#back').onclick=()=>{ SJ.audio.click(); quitToHome(); };
    const em=$('#editme'); if(em) em.onclick=()=>{ SJ.audio.click(); SJ.screens.avatar({then: reenterSalon}); };
    if(host){ const cf=$('#cfg'); if(cf) cf.onclick=()=>{ SJ.audio.click(); const p=app().querySelector('.salon-cfg'); if(p) p.classList.toggle('show'); };
      const rb=$('#rand'); if(rb) rb.onclick=()=>act('spin');
      const lb=$('#launch'); if(lb) lb.onclick=()=>act('launch');
      renderDurs(); renderPacks(); }
  }
  function playerListHTML(v){ const s=v.salon; return v.players.map(p=>{
      const g=(p.vote!=null)?s.games[p.vote]:null;
      const tag=g?`<span style="font-size:12px;font-weight:700;color:#3B2D5E;background:${g.tint||'#fff'};border:2px solid #3B2D5E;border-radius:999px;padding:2px 9px;max-width:118px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.name)}</span>`:`<span style="font-size:12px;font-weight:700;color:#A99CC9;font-style:italic">réfléchit…</span>`;
      return `<div class="row" style="gap:10px">${U().ava({avatar:p.avatar,emoji:p.emoji,hat:p.hat,hatPos:p.hatPos,bg:p.bg},34)}<div class="grow row gap6" style="min-width:0"><span style="font-size:16px;font-weight:700">${esc(p.name)}</span>${p.you?'<span class="pill paper" style="font-size:11px;padding:0 8px">toi</span>':''}${p.isHost?'<span>👑</span>':''}</div>${tag}</div>`;
    }).join(''); }
  // bandeau compact d'avatars affiché DANS la navbar fixe sur mobile
  function navPlayersHTML(v){
    const avas=v.players.map(p=>`<span class="np-ava" title="${esc(p.name)}${p.isHost?' 👑':''}">${U().ava({avatar:p.avatar,emoji:p.emoji,hat:p.hat,hatPos:p.hatPos,bg:p.bg},30)}</span>`).join('');
    return `<span class="np-count">👥 ${v.players.length}/10</span><span class="np-list">${avas}</span>`;
  }
  function gcVotersHTML(g){ return g.voters.length
    ? `<div style="display:flex">${g.voters.map(vt=>`<span style="width:26px;height:26px;border-radius:50%;border:2px solid #3B2D5E;background:${vt.color};margin-left:-6px;display:flex;align-items:center;justify-content:center;font-size:13px">${esc(vt.emoji)}</span>`).join('')}</div>`
    : `<span style="font-size:12px;font-weight:700;opacity:.8">sois le 1er 🙌</span>`; }
  function gcLeadHTML(g){ return g.isLeader?`<span style="background:#FFC93C;color:#3B2D5E;border:2px solid #3B2D5E;border-radius:999px;padding:1px 9px;font-size:12px;font-weight:800">👑 en tête</span>`:''; }
  function gcRingHTML(g){ return g.isWinner?`<div style="position:absolute;inset:-3px;border:4px solid #FFC93C;border-radius:22px;box-shadow:0 0 0 5px rgba(255,201,60,.45);pointer-events:none"></div><div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:32px" class="pop">👑</div>`:''; }
  function patchSalon(v){
    const s=v.salon; if(!s) return;
    s.games.forEach((g,i)=>{ const card=app().querySelector('.gcard[data-gc="'+i+'"]'); if(!card) return;
      card.style.outline='none';
      const c=card.querySelector('.gc-count'); if(c) c.textContent='🗳 '+g.count;
      const vo=card.querySelector('.gc-voters'); if(vo) vo.innerHTML=gcVotersHTML(g);
      const ld=card.querySelector('.gc-lead'); if(ld) ld.innerHTML=gcLeadHTML(g);
      const rg=card.querySelector('.gc-ring'); if(rg) rg.innerHTML=gcRingHTML(g);
    });
    const pl=app().querySelector('#salon-players'); if(pl) pl.innerHTML=playerListHTML(v);
    const np=app().querySelector('#salon-navplayers'); if(np) np.innerHTML=navPlayersHTML(v);
    const pc=app().querySelector('#salon-pcount'); if(pc) pc.textContent=v.players.length;
    const stt=app().querySelector('#salon-stt'); if(stt) stt.textContent=s.status.title;
    const sts=app().querySelector('#salon-sts'); if(sts) sts.textContent=s.status.sub;
    const lb=app().querySelector('#launch'); if(lb){ lb.disabled=v.players.length<2; lb.textContent=(s.winner!=null?"C'est parti ▶":"Lancer ▶"); }
    const rb=app().querySelector('#rand'); if(rb) rb.textContent=s.spinning?'🌀 Tirage…':'🎲 Hasard';
  }
  function reenterSalon(){
    const p=profile(); curKey=null;
    if(role==='host'){ const me=players.find(x=>x.id===myId); if(me){ me.name=p.name; me.avatar=p.avatar; me.emoji=p.emoji; me.hat=p.hat; me.hatPos=p.hatPos; me.bg=p.bg; } hostRefresh(); }
    else { if(net) net.send({t:'profile', name:p.name, avatar:p.avatar, emoji:p.emoji, hat:p.hat, hatPos:p.hatPos, bg:p.bg}); if(lastView) renderView(lastView); }
  }
  function flashCard(hi){ app().querySelectorAll('.gcard').forEach(c=>{ c.style.outline=(+c.dataset.gc===hi)?'4px solid #FFC93C':'none'; c.style.outlineOffset='3px'; }); }
  function salonStatusObj(counts, lead, any){
    if(salonSpinning) return {title:'Le sort en décide…', sub:'ça tourne, ça tourne…'};
    if(salonWinner!=null){ const g=SJ.GAMES[salonWinner]; return {title:`${g.icon} ${g.name} !`, sub:'Tout le monde embarque 🎉'}; }
    if(any){ const g=SJ.GAMES[lead]; return {title:g.name, sub:`${counts[lead]} voix en tête`}; }
    return {title:'En attente des votes', sub:'Tape un jeu pour voter'};
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
      const nv=Math.max(1, v.players.length-1);   // votants = joueurs sauf l'auteur
      const opts=[]; const seen={}; for(let k=0;k<=nv;k++){ const pct=Math.round(100*k/nv); if(!seen[pct]){ seen[pct]=1; opts.push({k,pct}); } }
      const defPct=opts[Math.floor(opts.length/2)].pct;
      mMount(`<section class="screen"><div class="stage game card" style="max-width:480px;gap:13px;background:#FFF8EC;box-shadow:0 10px 0 #FFC93C">
        ${U().topbar(`Manche ${v.round}/${v.rounds} — à toi le dilemme 🖊️`, 'frozen')}
        ${scoreStrip(v)}
        <div style="font-size:20px;font-weight:800">Écris ton « Tu préfères ? »</div>
        <div class="row gap8" style="background:#E4F8F6;border:3px solid #3B2D5E;border-radius:14px;padding:8px 10px"><div style="width:34px;height:34px;background:#2EC4B6;border:3px solid #3B2D5E;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;flex:none">A</div><input id="optA" class="field" style="border:none;background:transparent;padding:0;box-shadow:none" maxlength="42" value="${esc(d.a)}" placeholder="Option A…"></div>
        <div class="center" style="font-weight:800;color:#9B5DE5">— ou —</div>
        <div class="row gap8" style="background:#FFE1E7;border:3px solid #3B2D5E;border-radius:14px;padding:8px 10px"><div style="width:34px;height:34px;background:#FF8FA3;border:3px solid #3B2D5E;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:800;flex:none">B</div><input id="optB" class="field" style="border:none;background:transparent;padding:0;box-shadow:none" maxlength="42" value="${esc(d.b)}" placeholder="Option B…"></div>
        <div class="panel" style="background:#fff;border:3px solid #3B2D5E;gap:10px;align-items:center">
          <div style="font-size:16px;font-weight:800;text-align:center">Combien des <b>${nv}</b> votant${nv>1?'s':''} choisiront <span style="color:#2EC4B6">A</span> ? 🤫</div>
          <div id="predLbl" style="width:78px;height:78px;border:4px solid #3B2D5E;border-radius:50%;background:#FFF1C9;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;box-shadow:0 5px 0 #E8C766">${defPct}%</div>
          <div class="row wrap" style="justify-content:center;gap:6px" id="predbtns">${opts.map(o=>`<button class="predb" data-p="${o.pct}" style="border:3px solid #3B2D5E;border-radius:12px;background:${o.pct===defPct?'#FFC93C':'#fff'};font-family:inherit;font-weight:800;font-size:15px;padding:6px 10px;cursor:pointer;color:#3B2D5E;line-height:1.05">${o.pct}%<br><span style="font-size:10px;opacity:.65;font-weight:700">${o.k}/${nv}</span></button>`).join('')}</div>
          <div class="muted" style="font-size:12px;font-weight:700;text-align:center">🤫 caché jusqu'à la révélation · seuls ces % sont possibles à ${nv} votant${nv>1?'s':''}</div>
        </div>
        <button class="btn btn--teal block" id="send">Envoyer aux autres ▶</button>
      </div></section>`);
      let selPct=defPct; const lbl=$('#predLbl');
      app().querySelectorAll('.predb').forEach(b=> b.onclick=()=>{ selPct=+b.dataset.p; lbl.textContent=selPct+'%'; app().querySelectorAll('.predb').forEach(x=>x.style.background='#fff'); b.style.background='#FFC93C'; SJ.audio.click(); });
      $('#send').onclick=()=>{ const a=$('#optA').value.trim()||d.a||'Option A', b=$('#optB').value.trim()||d.b||'Option B'; SJ.audio.validate(); act('dilemma',{a,b,pred:selPct}); };
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

  /* ================= PARTY BOX ================= */
  function pbStart(){
    players.forEach(p=>p.score=0);
    M={ gameType:'partybox', round:0, dur:5, mini:null, responses:{}, perms:{},
        lives:{}, pts:{}, elim:{}, surv:{}, lastRes:{}, lifeLostBy:[], newlyOut:[],
        fastId:null, lastKey:null, countSecs:3, winnerId:null, coins:{} };
    players.forEach(p=>{ M.coins[p.id]=0; M.perms[p.id]={mic:false,cam:false}; M.lives[p.id]=3; M.pts[p.id]=0; });
    coinsClaimed=false; phase='pbperm'; curKey=null; SJ.audio.pop(); hostRefresh();
  }
  function pbPerm(mic,cam){ if(role==='guest'){ if(net) net.send({t:'perm',mic,cam}); } else if(M&&M.perms){ M.perms[myId]={mic:!!mic,cam:!!cam}; hostRefresh(); } }
  function pbAlive(){ return players.filter(p=>(M.lives[p.id]||0)>0); }
  function pbSpeedPts(dt,dur){ const frac=clamp(dt/(dur*1000),0,1); return Math.round(20 + 80*(1-frac)); }   // rapide = jusqu'à 100, lent = 20
  // écran intermédiaire : scoreboard (+ résultats du tour) + compte à rebours, AVANT chaque mini
  function pbToCountdown(){
    if(pbAlive().length<=1){ pbGameOver(); return; }
    M.countSecs = M.round===0 ? 3 : 4;
    phase='pbcount'; curKey=null; hostRefresh();
    mAfter(M.countSecs*1000, pbBeginMini);
  }
  function pbBeginMini(){
    const alive=pbAlive(); if(alive.length<=1){ pbGameOver(); return; }
    M.round++; M.dur=Math.max(2.4, 5.8 - M.round*0.3);
    const allMic = alive.length>0 && alive.every(p=>(M.perms[p.id]||{}).mic);
    M.mini=SJ.PB.make(allMic, M.lastKey); M.lastKey=M.mini.key;
    M.responses={}; M.lifeLostBy=[]; M.newlyOut=[]; M.fastId=null;
    phase='pbplay'; curKey=null; hostRefresh();
    mAfter(Math.round(M.dur*1000)+300, ()=>{ if(phase==='pbplay') pbResolve(); });
  }
  function pbMaybeResolve(){ if(phase!=='pbplay'||!M) return; const alive=pbAlive(); if(alive.length && alive.every(p=>M.responses[p.id]!=null)) pbResolve(); }
  function pbResolve(){
    if(phase!=='pbplay') return; mClear();
    const alive=pbAlive(); const res={}; const out=[]; let fastId=null, fastDt=Infinity;
    alive.forEach(p=>{ const r=M.responses[p.id]; const dt=(r&&r.dt!=null)?r.dt:M.dur*1000; let ok=false;
      if(M.mini.kind==='choice') ok=!!(r && r.choice===M.mini.correct); else ok=!!(r && r.ok);
      let gained=0;
      if(ok){ gained=pbSpeedPts(dt,M.dur); M.pts[p.id]=(M.pts[p.id]||0)+gained; if(dt<fastDt){ fastDt=dt; fastId=p.id; } }
      else { M.lives[p.id]=Math.max(0,(M.lives[p.id]||0)-1); if(M.lives[p.id]===0){ M.elim[p.id]=M.round; M.surv[p.id]=M.round; out.push(p.id); } }
      res[p.id]={ok,gained,dt};
    });
    if(fastId){ M.pts[fastId]=(M.pts[fastId]||0)+10; res[fastId].gained+=10; res[fastId].fast=true; }   // bonus au + rapide
    M.lastRes=res; M.fastId=fastId;
    M.lifeLostBy=alive.filter(p=>!res[p.id].ok).map(p=>p.id); M.newlyOut=out;
    if(pbAlive().length<=1){ pbGameOver(); return; }
    pbToCountdown();
  }
  function pbGameOver(){
    phase='pbover';
    const alive=pbAlive();
    players.forEach(p=>{ M.surv[p.id]=(M.lives[p.id]>0)?M.round:(M.surv[p.id]||0); });
    M.winnerId = alive.length===1 ? alive[0].id : null;
    if(M.winnerId) M.pts[M.winnerId]=(M.pts[M.winnerId]||0)+50;       // bonus du dernier survivant
    players.forEach(p=>{ M.coins[p.id]=(M.coins[p.id]||0)+Math.round((M.pts[p.id]||0)/10); });
    curKey=null; hostRefresh();
  }
  function pbTicks(dur){ if(pbAudioTimer) clearInterval(pbAudioTimer); const iv=Math.max(110, dur*1000/9); pbAudioTimer=setInterval(()=>SJ.audio.tick(), iv); }
  // micro : il faut atteindre le repère `targetFrac` (crier fort). onReach() appelé une fois la barre au niveau.
  function pbListenMic(targetFrac, onReach){
    if(!micStream) return;
    try{ const ac=new (window.AudioContext||window.webkitAudioContext)(); const src=ac.createMediaStreamSource(micStream); const an=ac.createAnalyser(); an.fftSize=256; src.connect(an); const data=new Uint8Array(an.frequencyBinCount); let fired=false;
      const target=Math.round((targetFrac||0.72)*100);
      (function loop(){ an.getByteFrequencyData(data); let sum=0; for(let i=0;i<data.length;i++) sum+=data[i]; const avg=sum/data.length;
        const lvl=Math.min(100, avg*1.4);                      // moins sensible : il faut vraiment crier
        const bar=document.getElementById('crielvl'); if(bar){ bar.style.width=lvl+'%'; bar.style.background = lvl>=target?'#FFC93C':'#2EC4B6'; }
        const face=document.getElementById('crieface'); if(face && !fired) face.textContent = lvl>=target?'🤩':(lvl>target*0.55?'😮':'😐');
        if(lvl>=target && !fired){ fired=true; onReach(); }
        pbRaf=requestAnimationFrame(loop); })();
    }catch(e){}
  }

  function rPbPerm(v){
    const pb=v.pb, host=v.iAmHost, mp=pb.myPerm;
    const allMic=pb.perms.length>0 && pb.perms.every(p=>p.mic);
    const list=pb.perms.map(p=>`<div class="row" style="gap:10px">${U().ava({avatar:p.avatar,emoji:p.emoji,hat:p.hat,hatPos:p.hatPos,bg:p.bg},34)}<div class="grow" style="font-weight:700;font-size:17px">${esc(p.name)}${p.isHost?' 👑':''}</div><span style="font-size:17px">${p.mic?'🎤':'🔇'} ${p.cam?'📷':'·'}</span></div>`).join('');
    mMount(`<section class="screen"><div class="stage" style="max-width:520px;gap:14px">
      <div class="card" style="background:#6A4BD6;color:#fff;box-shadow:0 10px 0 #4A2E9E;display:flex;flex-direction:column;gap:6px">
        <div style="font-size:26px;font-weight:800">📦 Party Box</div>
        <div style="font-size:15px;color:#EADBFF;font-weight:600">Des mini-jeux de plus en plus rapides. <b>3 vies chacun</b> · le plus rapide marque le plus de points ⚡ · le dernier en vie gagne 🏆</div>
      </div>
      <div class="card sh-purple" style="display:flex;flex-direction:column;gap:10px">
        <div style="font-size:18px;font-weight:800">🎤 Autorisations</div>
        <div class="muted" style="font-size:13px;font-weight:600">Un type de jeu n'apparaît que si <b>tout le monde</b> l'autorise.</div>
        <div class="spread"><button class="btn ${mp.mic?'btn--teal':'btn--ghost'} grow" id="mic">🎤 Micro ${mp.mic?'✓':''}</button><button class="btn ${mp.cam?'btn--teal':'btn--ghost'} grow" id="cam">📷 Caméra ${mp.cam?'✓':''}</button></div>
        <div class="center" style="font-size:13px;font-weight:700">${allMic?'🎤 jeux de voix débloqués ✓':'🎤 jeux de voix : il manque des micros'} · 📷 jeux caméra bientôt</div>
      </div>
      <div class="card sh-teal" style="display:flex;flex-direction:column;gap:9px"><div style="font-size:18px;font-weight:800">👥 Joueurs (${pb.perms.length})</div>${list}</div>
      ${host?`<button class="btn btn--coral lg block" id="go" ${pb.perms.length<2?'disabled':''}>Démarrer la Party Box ▶</button>`:'<div class="center muted" style="font-weight:700">⏳ En attente que l\'hôte démarre…</div>'}
      <button class="btn btn--ghost sm" id="back" style="align-self:flex-start">← quitter</button>
    </div></section>`);
    $('#mic').onclick=()=>{ if(!mp.mic){ if(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia){ navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{ micStream=s; SJ.audio.click(); pbPerm(true,mp.cam); }).catch(()=>U().toast('Micro refusé 🔇')); } else U().toast('Micro indisponible'); } else { if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null;} pbPerm(false,mp.cam); } };
    $('#cam').onclick=()=>{ SJ.audio.click(); pbPerm(mp.mic,!mp.cam); };
    $('#back').onclick=()=>{ SJ.audio.click(); quitToHome(); };
    if(host){ const g=$('#go'); if(g) g.onclick=()=>act('pbstart'); }
  }
  function pbHearts(lives){ return lives>0 ? '❤️'.repeat(lives) : '💀'; }
  // scoreboard de tout le monde : trié par points (déjà trié côté view), mort = grisé + 💀
  function pbBoardHTML(board){
    return `<div class="col" style="gap:6px;width:100%">`+board.map((p,i)=>`<div class="row" style="gap:9px;align-items:center;background:${p.you?'#FFF1C9':(p.dead?'#EFE8FB':'#fff')};border:2px solid #3B2D5E;border-radius:12px;padding:5px 10px;${p.dead?'opacity:.62':''}">
        <span style="font-size:13px;font-weight:800;color:#9B5DE5;width:16px;text-align:center">${i+1}</span>
        ${U().ava({avatar:p.avatar,emoji:p.emoji,hat:p.hat,hatPos:p.hatPos,bg:p.bg},28)}
        <span class="grow" style="font-weight:700;font-size:15px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.you?'Toi':esc(p.name)}${p.dead?' 👻':''}</span>
        <span style="font-size:13px">${pbHearts(p.lives)}</span>
        <b style="color:#3B2D5E;font-size:15px;min-width:34px;text-align:right">${p.pts}</b>
      </div>`).join('')+`</div>`;
  }
  // entre chaque mini : résultats du tour + scoreboard + compte à rebours (le temps de tout voir)
  function rPbCount(v){
    const pb=v.pb, c=pb.count||{secs:3,first:true,results:[]};
    const resChips = (c.results&&c.results.length) ? `<div class="row wrap" style="justify-content:center;gap:7px">${c.results.map(x=>{
        const tag = x.out?'💀': (x.ok?(x.fast?'⚡':'✓'):'✗'); const bg = x.out?'#F0E6FF':(x.ok?'#E4F8F6':'#FFE1E7');
        return `<span class="score-chip" style="background:${bg};${x.ok?'':'color:#7A6CA8'}">${esc(x.emoji||'🙂')} ${x.you?'Toi':esc(x.name)} ${tag}${x.ok?' +'+x.gained:''}</span>`;
      }).join('')}</div>` : '';
    mMount(`<section class="screen"><div class="stage" style="max-width:480px;gap:12px;align-items:stretch">
      <div class="center" style="font-size:22px;font-weight:800">${c.first?'🎬 Préparez-vous !':`Manche ${pb.round} — résultats`}</div>
      ${resChips}
      <div class="card sh-purple" style="display:flex;flex-direction:column;gap:9px">
        <div class="row between"><div style="font-size:16px;font-weight:800">🏆 Scoreboard</div><div style="font-size:13px;font-weight:700;color:#EADBFF">${pb.alive}/${pb.total} en vie</div></div>
        ${pbBoardHTML(pb.board)}
      </div>
      <div class="center" style="font-size:15px;font-weight:800;color:#6A4BD6">Prochain jeu dans <span id="cdn" style="font-size:24px;color:#FF5D73">${c.secs}</span></div>
      <div style="height:12px;border:3px solid #3B2D5E;border-radius:999px;overflow:hidden;background:#fff"><div style="height:100%;width:100%;background:#FFC93C;animation:pbbar ${c.secs}s linear forwards"></div></div>
      ${pb.iAmDead?'<div class="center" style="color:#9B5DE5;font-weight:800;font-size:13px">👻 Spectateur — tu regardes la fin de la partie</div>':''}
    </div></section>`);
    const endAt=nowMs()+c.secs*1000, el=$('#cdn');
    if(pbCountTimer) clearInterval(pbCountTimer);
    pbCountTimer=setInterval(()=>{ const left=Math.ceil((endAt-nowMs())/1000); if(el) el.textContent=Math.max(0,left); if(left<=0){ clearInterval(pbCountTimer); pbCountTimer=null; } },200);
    SJ.audio.tick();
  }
  function rPbPlay(v){
    const pb=v.pb, m=pb.mini; if(!m) return;
    const dead=pb.iAmDead;
    const hearts = dead?'💀':('❤️'.repeat(Math.max(0,pb.myLives))+'🖤'.repeat(Math.max(0,3-pb.myLives)));
    const sudden = !dead && pb.myLives===1;
    let body='';
    if(m.kind==='choice'){
      const opts=m.options.map((o,i)=> m.colormode
        ? `<button class="pbopt" data-i="${i}" style="background:${o};border:3px solid #3B2D5E;border-radius:18px;height:70px;box-shadow:0 6px 0 rgba(0,0,0,.25);cursor:pointer"></button>`
        : `<button class="pbopt" data-i="${i}" style="background:#fff;border:3px solid #3B2D5E;border-radius:18px;padding:16px;font-size:${m.big?32:22}px;font-weight:800;box-shadow:0 6px 0 #C9BBE8;cursor:pointer;font-family:inherit;color:#3B2D5E">${esc(o)}</button>`).join('');
      body=`${m.display?`<div class="center" style="font-size:34px;letter-spacing:3px;word-break:break-word">${esc(m.display)}</div>`:''}<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${opts}</div>`;
    } else if(m.kind==='tapmash'){
      body=`<button id="mash" style="background:#FFC93C;border:3px solid #3B2D5E;border-radius:24px;padding:28px;font-size:28px;font-weight:800;box-shadow:0 8px 0 #D9A416;cursor:pointer;width:100%;font-family:inherit;color:#3B2D5E">TAPE ! <span id="mashn">0/${m.target}</span></button>`;
    } else if(m.kind==='crie'){
      const tp=Math.round((m.micTarget||0.72)*100);
      body=`<div class="center" style="font-size:54px" id="crieface">😐</div><div class="center muted" style="font-weight:700">CRIE pour dépasser le repère 🎯</div>
        <div style="position:relative;height:28px;border:3px solid #3B2D5E;border-radius:999px;overflow:hidden;background:#fff;margin-top:16px">
          <div id="crielvl" style="height:100%;width:0;background:#2EC4B6;transition:width .04s linear"></div>
          <div style="position:absolute;top:-5px;bottom:-5px;left:${tp}%;width:4px;background:#FF5D73;border-radius:2px"></div>
          <div style="position:absolute;top:-21px;left:${tp}%;transform:translateX(-50%);font-size:16px">🎯</div>
        </div>`;
    }
    const foot = dead?'<div class="center" style="color:#9B5DE5;font-weight:800;font-size:13px">💀 Éliminé — tu regardes les autres jouer</div>'
      : (sudden?'<div class="center" style="color:#C23A50;font-weight:800;font-size:14px">💀 DERNIÈRE VIE !</div>'
        :'<div class="center" style="font-size:12px;font-weight:700;color:#7A6BA8">⚡ plus tu réponds vite, plus tu marques de points</div>');
    mMount(`<section class="screen"><div class="stage" style="max-width:480px;gap:12px">
      <div class="row between"><span class="pill lilac" style="font-size:15px;font-weight:800">Manche ${pb.round}</span>${dead?'<span style="font-size:15px;font-weight:800;color:#9B5DE5">👻 Spectateur</span>':`<span style="font-size:22px">${hearts}</span>`}</div>
      <div style="height:14px;border:3px solid #3B2D5E;border-radius:999px;overflow:hidden;background:#fff"><div style="height:100%;width:100%;background:${sudden?'#FF5D73':'#9B5DE5'};animation:pbbar ${pb.dur}s linear forwards"></div></div>
      <div class="card ${sudden?'sh-coral':'sh-purple'}" style="display:flex;flex-direction:column;gap:14px${sudden?';animation:shake .5s':''};${dead?'opacity:.7;pointer-events:none':''}">
        <div class="center" style="font-size:26px;font-weight:800">${esc(m.prompt)}</div>${body}
      </div>
      ${foot}
      <details><summary style="cursor:pointer;font-weight:800;font-size:13px;color:#6A4BD6;text-align:center;list-style:none">🏆 scoreboard</summary><div style="margin-top:8px">${pbBoardHTML(pb.board)}</div></details>
    </div></section>`);
    if(!dead){
      const t0=nowMs(); let answered=false;
      const done=(extra)=>{ if(answered)return; answered=true; act('pbresp', Object.assign({dt:Math.round(nowMs()-t0)}, extra)); };
      if(m.kind==='choice'){ app().querySelectorAll('.pbopt').forEach(b=> b.onclick=()=>{ if(answered)return; SJ.audio.pop(); app().querySelectorAll('.pbopt').forEach(x=>{ if(x!==b)x.style.opacity='.45'; }); b.style.outline='4px solid #FFC93C'; b.style.outlineOffset='2px'; done({choice:+b.dataset.i}); }); }
      else if(m.kind==='tapmash'){ let n=0; const btn=$('#mash'), lbl=$('#mashn'); if(btn) btn.onclick=()=>{ if(answered)return; n++; if(lbl)lbl.textContent=n+'/'+m.target; SJ.audio.tick(); if(n>=m.target){ btn.style.background='#2EC4B6'; btn.style.color='#fff'; done({ok:true}); } }; }
      else if(m.kind==='crie'){ pbListenMic(m.micTarget, ()=>{ SJ.audio.pop(); done({ok:true}); }); }
    }
    pbTicks(pb.dur);
  }
  function rPbOver(v){
    const pb=v.pb, o=pb.over||{ranking:[],earned:0,iWon:false};
    const rows=o.ranking.map((p,i)=>{ const medal=p.win?'👑':(i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.');
      return `<div class="row" style="gap:10px;align-items:center;background:${p.you?'#FFF1C9':'#fff'};border:3px solid #3B2D5E;border-radius:14px;padding:7px 11px;box-shadow:0 4px 0 ${p.you?'#E5C96A':'#C9BBE8'}">
        <span style="font-size:19px;font-weight:800;width:30px;text-align:center">${medal}</span>
        ${U().ava({avatar:p.avatar,emoji:p.emoji,hat:p.hat,hatPos:p.hatPos,bg:p.bg},34)}
        <div class="grow" style="font-weight:800;font-size:15px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.you?'Toi':esc(p.name)}${p.win?' 🏆':''}</div>
        <span style="font-size:13px">${p.lives>0?'❤️'.repeat(p.lives):'💀'}</span>
        <b style="color:#9B5DE5;font-size:16px;min-width:42px;text-align:right">${p.pts} pt</b>
      </div>`; }).join('');
    const winner=o.ranking.find(p=>p.win);
    mMount(`<section class="screen"><div class="stage" style="max-width:480px;gap:13px;align-items:stretch;text-align:center">
      <div class="center pop" style="font-size:26px;font-weight:800">🏆 ${winner?(winner.you?'Tu gagnes !':esc(winner.name)+' gagne !'):'Fin de la Party Box'}</div>
      <div class="col" style="gap:7px">${rows}</div>
      <div class="center"><span class="pill paper" style="font-size:18px;font-weight:800;box-shadow:0 4px 0 #E5C96A">+${o.earned||0} 🪙</span></div>
      <div class="row wrap" style="justify-content:center;gap:12px">${v.iAmHost?'<button class="btn btn--teal" id="again">Rejouer ↻</button>':''}<button class="btn btn--ghost" id="quit">Quitter</button></div>
      ${v.iAmHost?'':'<div class="muted" style="font-size:13px;font-weight:700">en attente que l\'hôte relance…</div>'}
    </div></section>`);
    if(o.iWon){ SJ.audio.win(); U().confetti(60); } else { SJ.audio.lose(); U().confetti(22); }
    if(!coinsClaimed){ SJ.store.addCoins(o.earned||0); coinsClaimed=true; }
    const a=$('#again'); if(a) a.onclick=()=>{ SJ.audio.pop(); coinsClaimed=false; act('pbagain'); };
    $('#quit').onclick=()=>{ SJ.audio.click(); quitToHome(); };
  }

  return { createHost, join, leave, act, quitToHome, _state:()=>({role,phase,players,code}) };
})();
