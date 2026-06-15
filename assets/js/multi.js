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

  let mPending=[], mTick=null, capTimers=[];
  function mClear(){ mPending.forEach(clearTimeout); mPending=[]; if(mTick){clearInterval(mTick);mTick=null;} if(pbAudioTimer){clearInterval(pbAudioTimer);pbAudioTimer=null;} if(pbRaf){cancelAnimationFrame(pbRaf);pbRaf=0;} if(pbCountTimer){clearInterval(pbCountTimer);pbCountTimer=null;} capTimers.forEach(id=>{clearTimeout(id);clearInterval(id);}); capTimers=[]; }
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
  let piCtx=null, piCanvas=null, piIsDrawer=false, piColor='#3B2D5E', piWidth=4, piLast=null, piBuf=[], piRaf=0, piUp=null;
  let ttFuse=null;   // timer de la mèche (host) : volontairement HORS de mClear (survit aux re-render de passage)
  let soloTimer=null;   // timer Solo ! (IA des bots / anti-AFK), géré à la main (hors mClear)
  let soloMySeat=-1;    // siège du joueur local (pour viser l'animation de pioche)
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
    } else if(m.t==='vote'){ const p=players.find(x=>x.id===id); if(p && phase==='lobby' && SJ.GAMES[m.g] && SJ.GAMES[m.g].playable){ p.vote=m.g; salonWinner=null; hostRefresh(); }
    } else if(m.t==='profile'){ const p=players.find(x=>x.id===id); if(p){ p.name=(m.name||p.name).slice(0,14); p.avatar=m.avatar; p.emoji=m.emoji; p.hat=m.hat; p.hatPos=m.hatPos; p.bg=m.bg; hostRefresh(); }
    } else if(m.t==='perm'){ if(M&&M.perms){ M.perms[id]={mic:!!m.mic,cam:!!m.cam}; hostRefresh(); }
    } else if(m.t==='pbresp'){ if(M&&phase==='pbplay'){ M.responses[id]={choice:m.choice,ok:m.ok,tap:m.tap,dt:m.dt}; pbMaybeResolve(); }
    } else if(m.t==='ucclue'){ if(M&&M.gameType==='undercover') ucClueSubmit(id, m.word);
    } else if(m.t==='ucvote'){ if(M&&M.gameType==='undercover') ucVoteSubmit(id, m.target);
    } else if(m.t==='pichoose'){ if(M&&M.gameType==='pictionary') piChoose(id, m.word);
    } else if(m.t==='piguess'){ if(M&&M.gameType==='pictionary') piGuess(id, m.text);
    } else if(m.t==='draw'){ if(M&&M.gameType==='pictionary'&&phase==='pidraw'&&id===piDrawer().id){ piApply(m.segs,m.c,m.w); players.forEach(p=>{ if(!p.isHost&&!p.isBot&&p.id!==id) net.sendTo(p.id,{t:'draw',segs:m.segs,c:m.c,w:m.w}); }); }
    } else if(m.t==='clear'){ if(M&&M.gameType==='pictionary'&&phase==='pidraw'&&id===piDrawer().id){ piClearCanvas(); players.forEach(p=>{ if(!p.isHost&&!p.isBot&&p.id!==id) net.sendTo(p.id,{t:'clear'}); }); }
    } else if(m.t==='soloplay'){ if(M&&M.gameType==='solo') soloPlay(id, m.i);
    } else if(m.t==='solodraw'){ if(M&&M.gameType==='solo') soloDraw(id);
    } else if(m.t==='solopass'){ if(M&&M.gameType==='solo') soloPass(id);
    } else if(m.t==='solocolor'){ if(M&&M.gameType==='solo') soloChooseColor(id, m.c);
    } else if(m.t==='solosolo'){ if(M&&M.gameType==='solo') soloCallSolo(id);
    } else if(m.t==='ttword'){ if(M&&M.gameType==='tictacmot') ttSubmit(id, m.word);
    } else if(m.t==='ttinput'){ if(M&&M.gameType==='tictacmot'&&phase==='ttplay'&&id===M.holder){ players.forEach(p=>{ if(!p.isHost&&!p.isBot&&p.id!==id) net.sendTo(p.id,{t:'ttinput',text:m.text}); }); patchTtLive(m.text); }
    } else if(m.t==='tosalon'){ toSalon();
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
    if(gameId==='solo'){ soloStart(); return; }
    if(gameId==='partybox'){ pbStart(); return; }
    if(gameId==='bluff'){ ucStart(); return; }
    if(gameId==='draw'||gameId==='pictionary'){ piStart(); return; }
    if(gameId==='tictacmot'){ ttStart(); return; }
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
      const canLaunch = players.length>=2;
      v.salon={
        spinning:salonSpinning, winner:salonWinner, canLaunch,
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
          mini:M.mini?{kind:M.mini.kind,prompt:M.mini.prompt,options:M.mini.options,colormode:M.mini.colormode,display:M.mini.display,target:M.mini.target,big:M.mini.big,micTarget:M.mini.micTarget,cells:M.mini.cells}:null,
          count: phase==='pbcount' ? { secs:M.countSecs, first:(M.round===0),
            results:(M.round>0)?players.filter(p=>(M.lastRes||{})[p.id]).map(p=>{ const r=M.lastRes[p.id]; return {name:p.name,emoji:p.emoji,bg:p.bg,you:(p.id===forId),ok:r.ok,gained:r.gained,fast:!!r.fast,out:(M.newlyOut||[]).indexOf(p.id)>=0,lives:(M.lives[p.id]||0)}; }):[] } : null,
          over: phase==='pbover' ? { earned:(M.coins[forId]||0), iWon:(M.winnerId===forId),
            ranking:players.slice().sort((a,b)=>{ const aa=(M.lives[a.id]||0)>0?1:0, ba=(M.lives[b.id]||0)>0?1:0; if(aa!==ba) return ba-aa; return (M.pts[b.id]||0)-(M.pts[a.id]||0); }).map(p=>({name:p.name,emoji:p.emoji,avatar:p.avatar,hat:p.hat,hatPos:p.hatPos,bg:p.bg,you:(p.id===forId),lives:(M.lives[p.id]||0),pts:(M.pts[p.id]||0),surv:(M.surv||{})[p.id]||0,win:(M.winnerId===p.id)})) } : null
        };
        return v;
      }
      if(M.gameType==='undercover'){
        v.gameType='undercover';
        const alive=players.filter(p=>M.alive[p.id]);
        v.uc={ round:M.round, alive:alive.length, total:players.length, myWord:M.words[forId]||'', iAmAlive:!!M.alive[forId],
          roster:players.map(p=>({id:p.id,name:p.name,emoji:p.emoji,you:(p.id===forId),alive:!!M.alive[p.id]})) };
        if(phase==='ucclue'){ v.uc.myClue=M.clues[forId]||null; v.uc.progress={done:alive.filter(p=>M.clues[p.id]!=null).length,total:alive.length}; }
        else if(phase==='ucvote'){ v.uc.clues=alive.map(p=>({id:p.id,name:p.name,emoji:p.emoji,avatar:p.avatar,hat:p.hat,hatPos:p.hatPos,bg:p.bg,you:(p.id===forId),clue:M.clues[p.id]||'…'})); v.uc.myVote=M.votes[forId]||null; v.uc.progress={done:alive.filter(p=>M.votes[p.id]!=null).length,total:alive.length}; }
        else if(phase==='ucreveal'){ v.uc.elim=M.lastElim?{name:M.lastElim.name,emoji:M.lastElim.emoji,avatar:M.lastElim.avatar,hat:M.lastElim.hat,hatPos:M.lastElim.hatPos,bg:M.lastElim.bg,role:M.lastElim.role,word:M.lastElim.word}:null; v.uc.tally=M.tally; v.uc.winners=M.winners; }
        else if(phase==='ucover'){ v.uc.winners=M.winners; v.uc.wCivil=M.wCivil; v.uc.wUnder=M.wUnder; v.uc.earned=(M.coins[forId]||0); v.uc.iWon=(M.roles[forId]===M.winners);
          v.uc.reveal=players.map(p=>({name:p.name,emoji:p.emoji,avatar:p.avatar,hat:p.hat,hatPos:p.hatPos,bg:p.bg,role:M.roles[p.id],word:M.words[p.id],you:(p.id===forId)})); }
        return v;
      }
      if(M.gameType==='pictionary'){
        v.gameType='pictionary'; const d=players[M.drawerIdx%players.length];
        if(phase==='podium'){ v.podium={ ranking:players.slice().sort((a,b)=>b.score-a.score).map(p=>({name:p.name,emoji:p.emoji,avatar:p.avatar,hat:p.hat,hatPos:p.hatPos,bg:p.bg,score:p.score,you:(p.id===forId)})), earned:(M.coins[forId]||0) }; return v; }
        v.pi={ round:M.round, rounds:M.rounds, drawerId:d.id, drawerName:d.name, iAmDrawer:(d.id===forId) };
        if(phase==='piword'){ v.pi.choices=(d.id===forId)?M.choices:null; }
        else if(phase==='pidraw'){ v.pi.secsLeft=M.secsLeft; v.pi.wordLen=M.word?M.word.length:0; v.pi.myWord=(d.id===forId)?M.word:null; v.pi.iFound=!!M.found[forId]; v.pi.feed=M.feed.slice(-8); }
        else if(phase==='pireveal'){ v.pi.word=M.word; v.pi.results=players.map(p=>({name:p.name,emoji:p.emoji,you:(p.id===forId),pts:(M.ptsRound[p.id]||0),found:!!M.found[p.id],drawer:(p.id===d.id)})); }
        return v;
      }
      if(M.gameType==='tictacmot'){
        v.gameType='tictacmot'; const alive=ttAlive(); const syl=SJ.BOMBSYL[M.sylIdx]||{s:'',hints:[]}; const holder=players.find(p=>p.id===M.holder);
        v.tt={ round:M.round, aliveCount:alive.length, total:players.length, running:M.running,
          syllable:syl.s, iAmHolder:(M.holder===forId), holderName:holder?holder.name:'?',
          feedback:M.feedback, feedbackKind:M.feedbackKind,
          ring:players.map(p=>{ const dead=(M.lives[p.id]||0)<=0; return {name:p.name,emoji:p.emoji,avatar:p.avatar,hat:p.hat,hatPos:p.hatPos,bg:p.color,
            dead, holder:(p.id===M.holder&&!dead), exploded:(phase==='ttboom'&&p.id===M.holder), you:(p.id===forId),
            hearts: dead?'💀':('❤️'.repeat(M.lives[p.id]||0)+'🖤'.repeat(Math.max(0,3-(M.lives[p.id]||0)))) }; }) };
        if(phase==='ttboom'){ const p=players.find(x=>x.id===M.holder); v.tt.boom={ name:M.boomName, emoji:p?p.emoji:'😵', color:p?p.color:'#FF5D73', out:(M.lives[M.holder]||0)<=0, you:(M.holder===forId),
          avatar:p?p.avatar:null, hat:p?p.hat:null, hatPos:p?p.hatPos:null,
          hearts:'❤️'.repeat(M.lives[M.holder]||0)+'🖤'.repeat(Math.max(0,3-(M.lives[M.holder]||0))) }; }
        if(phase==='ttover'){ const w=players.find(x=>x.id===M.winnerId); v.tt.over={ winnerName:w?w.name:'—', winnerEmoji:w?w.emoji:'🏆', winnerColor:w?w.color:'#FFC93C',
          avatar:w?w.avatar:null, hat:w?w.hat:null, hatPos:w?w.hatPos:null, rounds:M.round, earned:(M.coins[forId]||0), iWon:(M.winnerId===forId) }; }
        return v;
      }
      if(M.gameType==='solo'){
        v.gameType='solo'; const cm=SJ.SOLO.CMAP; const N=M.seats.length; const mySeat=M.seats.findIndex(s=>s.id===forId); const posSeat=mySeat<0?0:mySeat;
        const isTurn=i=>(M.turn===i && M.winnerSeat<0 && !M.needColor);
        v.solo={ round:M.round, dir:M.dir, activeColorHex:cm[M.activeColor].bg, message:M.message,
          top:{ bg:cm[M.top.color].bg, ink:cm[M.top.color].ink, corner:cm[M.top.color].corner, sym:SJ.SOLO.sym(M.top.val) },
          myTurn:(M.turn===mySeat && !M.needColor && M.winnerSeat<0),
          drawEnabled:(M.turn===mySeat && !M.needColor && M.winnerSeat<0 && M.drawn==null),
          canPass:(M.drawn!=null && M.turn===mySeat && !M.needColor && M.winnerSeat<0),
          needColor:(M.needColor && M.needColorSeat===mySeat),
          ring:M.seats.map((sp,i)=>{ const rel=((i-posSeat)%N+N)%N; const ang=(90+rel*(360/N))*Math.PI/180; const R=42; const cnt=soloCount(i);
            return { name:sp.name, emoji:sp.emoji, avatar:sp.avatar, hat:sp.hat, hatPos:sp.hatPos, bg:sp.bg||sp.color, bot:sp.bot,
              left:(50+R*Math.cos(ang))+'%', top:(50+R*Math.sin(ang))+'%', isTurn:isTurn(i), count:cnt, solo:(cnt===1), you:(i===mySeat) }; }),
          colorChoices:SJ.SOLO.COLORS.map(c=>({ c, hex:cm[c].bg, shadow:cm[c].sh, name:cm[c].name, ink:c==='Y'?'#3B2D5E':'#FFFFFF' })) };
        const myHand=(mySeat>=0?M.cards[mySeat]:null)||[];
        v.solo.hand=myHand.map((c,i)=>({ i, bg:cm[c.color].bg, ink:cm[c.color].ink, corner:cm[c.color].corner, sym:SJ.SOLO.sym(c.val),
          playable:(v.solo.myTurn && (c.color==='W'||c.color===M.activeColor||c.val===M.top.val)) }));
        v.solo.handCount=myHand.length;
        if(M.winnerSeat>=0){ const ws=M.seats[M.winnerSeat]; v.solo.winner={ name:ws.name, emoji:ws.emoji, avatar:ws.avatar, hat:ws.hat, hatPos:ws.hatPos, bg:ws.bg||ws.color, you:(M.winnerSeat===mySeat), earned:(M.coins[forId]||0) }; }
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
    if(m.t==='draw'){ if(!piIsDrawer) piApply(m.segs,m.c,m.w); return; }
    if(m.t==='clear'){ if(!piIsDrawer) piClearCanvas(); return; }
    if(m.t==='ttinput'){ patchTtLive(m.text); return; }   // ce que tape le porteur, en direct
    if(m.t==='unoanim'){ soloFlyDraw(m.seat, m.n); return; }   // anim de pioche / +2 / +4 chez les invités
  }
  function guestOnClose(){ U().toast('Connexion à l\'hôte perdue'); quitToHome(); }
  // affiche en direct (lettre par lettre + son) ce que tape le porteur, côté spectateurs
  let ttLiveLen=0;
  function patchTtLive(text){ const el=document.getElementById('tt-live'); if(!el) return; const t=String(text||'').toUpperCase();
    el.innerHTML = t ? esc(t)+'<span style="opacity:.5">▌</span>' : '<span style="opacity:.45;font-weight:700">…</span>';
    if(t.length>ttLiveLen) SJ.audio.key&&SJ.audio.key(); ttLiveLen=t.length; }

  /* ================= ACTIONS ================= */
  function act(type,payload){
    if(role==='guest'){
      if(type==='clue') net.send({t:'clue', text:payload.text});
      else if(type==='guess') net.send({t:'guess', ratio:payload.ratio});
      else if(type==='vote') net.send({t:'vote', g:payload.g});
      else if(type==='dilemma') net.send({t:'dilemma', a:payload.a, b:payload.b, pred:payload.pred});
      else if(type==='pick') net.send({t:'pick', c:payload.c});
      else if(type==='pbresp') net.send({t:'pbresp', choice:payload.choice, ok:payload.ok, tap:payload.tap, dt:payload.dt});
      else if(type==='ucclue') net.send({t:'ucclue', word:payload.word});
      else if(type==='ucvote') net.send({t:'ucvote', target:payload.target});
      else if(type==='pichoose') net.send({t:'pichoose', word:payload.word});
      else if(type==='draw') net.send({t:'draw', segs:payload.segs, c:payload.c, w:payload.w});
      else if(type==='clear') net.send({t:'clear'});
      else if(type==='piguess') net.send({t:'piguess', text:payload.text});
      else if(type==='ttword') net.send({t:'ttword', word:payload.word});
      else if(type==='ttinput') net.send({t:'ttinput', text:payload.text});
      else if(type==='soloplay') net.send({t:'soloplay', i:payload.i});
      else if(type==='solodraw') net.send({t:'solodraw'});
      else if(type==='solopass') net.send({t:'solopass'});
      else if(type==='solocolor') net.send({t:'solocolor', c:payload.c});
      else if(type==='solosolo') net.send({t:'solosolo'});
      return;
    }
    // host / solo
    if(type==='vote'){ const p=players.find(x=>x.id===myId); if(p && SJ.GAMES[payload.g] && SJ.GAMES[payload.g].playable){ p.vote=payload.g; salonWinner=null; hostRefresh(); } }
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
    else if(type==='ucgo'){ if(M&&M.gameType==='undercover'&&phase==='ucintro') ucGo(); }
    else if(type==='ucclue'){ if(M&&M.gameType==='undercover') ucClueSubmit(myId, payload.word); }
    else if(type==='ucvote'){ if(M&&M.gameType==='undercover') ucVoteSubmit(myId, payload.target); }
    else if(type==='ucnext'){ if(M&&M.gameType==='undercover'&&phase==='ucreveal') ucFinishOrNext(); }
    else if(type==='ucagain'){ if(M&&M.gameType==='undercover') ucStart(); }
    else if(type==='pichoose'){ if(M&&M.gameType==='pictionary') piChoose(myId, payload.word); }
    else if(type==='draw'){ if(M&&M.gameType==='pictionary'&&phase==='pidraw'&&net) net.broadcast({t:'draw',segs:payload.segs,c:payload.c,w:payload.w}); }
    else if(type==='clear'){ if(M&&M.gameType==='pictionary'&&phase==='pidraw'&&net) net.broadcast({t:'clear'}); }
    else if(type==='piguess'){ if(M&&M.gameType==='pictionary') piGuess(myId, payload.text); }
    else if(type==='pinext'){ if(M&&M.gameType==='pictionary'&&phase==='pireveal') piNextRound(); }
    else if(type==='ttlight'){ if(M&&M.gameType==='tictacmot'&&phase==='ttplay') ttLight(); }
    else if(type==='ttword'){ if(M&&M.gameType==='tictacmot') ttSubmit(myId, payload.word); }
    else if(type==='ttinput'){ if(M&&M.gameType==='tictacmot'&&phase==='ttplay'&&M.holder===myId&&net) net.broadcast({t:'ttinput',text:payload.text}); }
    else if(type==='ttagain'){ if(M&&M.gameType==='tictacmot') ttStart(); }
    else if(type==='soloplay'){ if(M&&M.gameType==='solo') soloPlay(myId, payload.i); }
    else if(type==='solodraw'){ if(M&&M.gameType==='solo') soloDraw(myId); }
    else if(type==='solopass'){ if(M&&M.gameType==='solo') soloPass(myId); }
    else if(type==='solocolor'){ if(M&&M.gameType==='solo') soloChooseColor(myId, payload.c); }
    else if(type==='solosolo'){ if(M&&M.gameType==='solo') soloCallSolo(myId); }
    else if(type==='soloagain'){ if(M&&M.gameType==='solo') soloAgain(); }
    else if(type==='next'){ mClear(); nextRound(); }
    else if(type==='restart'){ hostStart(M?M.gameType:'wavelength'); }
    else if(type==='tosalon'){ if(role==='guest'){ if(net) net.send({t:'tosalon'}); } else toSalon(); }   // retour au menu (n'importe qui peut, ça NE casse PAS le salon)
  }

  function leave(){ if(ttFuse){ clearTimeout(ttFuse); ttFuse=null; } if(soloTimer){ clearTimeout(soloTimer); soloTimer=null; } showMenuBtn(false); try{ if(net){ if(role==='guest') net.send({t:'leave'}); net.leave(); } }catch(e){} net=null; role='solo'; M=null; phase='lobby'; }
  function quitToHome(){ leave(); SJ.screens.home(); }
  // retour au menu des jeux (salon) SANS couper le lobby — déclenché par n'importe qui
  function toSalon(){ if(role==='guest') return; if(ttFuse){ clearTimeout(ttFuse); ttFuse=null; } mClear(); M=null; phase='lobby'; curKey=null; salonWinner=null; salonSpinning=false; coinsClaimed=false; players.forEach(p=>{ p.vote=null; }); hostRefresh(); }
  // bouton « 🏠 Menu » global affiché pendant une partie (caché au salon / accueil)
  function showMenuBtn(on){ const b=document.getElementById('gomenu'); if(b) b.style.display = on?'inline-flex':'none'; document.body.classList.toggle('in-game', !!on); }

  /* ================= RENDU UNIFIÉ ================= */
  function renderView(v){
    showMenuBtn(v.phase!=='lobby');   // « 🏠 Menu » visible dès qu'on est en jeu
    const key = `${v.phase}#${v.round||0}#${(v.proposerId&&v.proposerId===v.meId)?'P':'G'}`;
    const same = key===curKey;
    if(v.phase==='lobby'){ if(same) patchSalon(v); else { curKey=key; rLobby(v); } return; }
    if(v.phase==='pbperm'){ curKey=key; rPbPerm(v); return; }    // re-render à chaque autorisation
    if(v.phase==='guess'){ if(same) patchGuess(v); else { curKey=key; iValidated=false; rGuess(v); } return; }
    if(v.phase==='ucclue'){ if(same) patchUcProg(v); else { curKey=key; rUcClue(v); } return; }
    if(v.phase==='ucvote'){ if(same) patchUcProg(v); else { curKey=key; rUcVote(v); } return; }
    if(v.phase==='pidraw'){ if(same) patchPi(v); else { curKey=key; rPiDraw(v); } return; }   // jamais de full re-render : préserve le canvas
    if(v.phase==='ttplay'){ curKey=key; rTtPlay(v); return; }   // re-render à chaque passage ; la mèche s'anime via {t:'fuse'}
    if(v.phase==='soloplay'){ if(same) patchSolo(v); else { curKey=key; rSolo(v); } return; }   // patch (pas de flash) ; full render au changement de manche
    if(same) return;                 // propose / reveal / podium / pb : re-render seulement au changement d'état
    curKey=key;
    if(v.phase==='propose') rPropose(v);
    else if(v.phase==='reveal') rReveal(v);
    else if(v.phase==='podium') rPodium(v);
    else if(v.phase==='pbcount') rPbCount(v);
    else if(v.phase==='pbplay') rPbPlay(v);
    else if(v.phase==='pbover') rPbOver(v);
    else if(v.phase==='ucintro') rUcIntro(v);
    else if(v.phase==='ucreveal') rUcReveal(v);
    else if(v.phase==='ucover') rUcOver(v);
    else if(v.phase==='piword') rPiWord(v);
    else if(v.phase==='pireveal') rPiReveal(v);
    else if(v.phase==='ttboom') rTtBoom(v);
    else if(v.phase==='ttover') rTtOver(v);
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
      ? `<div class="row gap8" style="width:100%"><button class="btn btn--yellow grow" id="rand">${s.spinning?'🌀 Tirage…':'🎲 Hasard'}</button><button class="btn btn--teal grow" id="launch" ${s.canLaunch?'':'disabled'}>${s.winner!=null?"C'est parti ▶":"Lancer ▶"}</button></div>
         <div class="center sa-hint" style="font-size:12px;font-weight:600;color:#EADBFF">${v.players.length<2?'Partage le code — min. 2 joueurs':"L'hôte lance quand vous êtes prêts"}</div>`
      : `<div class="center" style="font-size:14px;font-weight:700;color:#EADBFF">⏳ l'hôte lance la partie…</div>`;
    const settingsPanel = host ? `<div class="salon-cfg-wrap" id="cfgwrap">
        <div class="card salon-cfg" style="display:flex;flex-direction:column;gap:10px;box-shadow:0 9px 0 #C9BBE8">
          <div class="row between" style="align-items:center"><div style="font-size:18px;font-weight:800">⚙️ Réglages de partie</div><button class="cfg-close" id="cfgclose" aria-label="Fermer">✕</button></div>
          <div class="panel lilac"><div class="panel-label">Durée</div><div class="spread" id="durs"></div></div>
          <div class="panel mint"><div class="panel-label">Thèmes</div><div class="row wrap gap8" id="packs"></div></div>
        </div>
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
              ${host?`<button class="pill lilac cfg-mobile" id="cfg" style="cursor:pointer;font-size:14px;font-weight:800">⚙️ Réglages de partie</button>`:''}
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
    app().querySelectorAll('.gcard').forEach(c=> c.onclick=()=>{ if(s.spinning) return; const gi=+c.dataset.gc; const g=s.games[gi];
      if(!g || !g.playable){ SJ.audio.click(); U().toast('🚧 Ce jeu arrive bientôt !'); return; }   // jeux « bientôt » : non sélectionnables
      SJ.audio.pop(); act('vote',{g:gi}); });
    $('#copy').onclick=()=>{ const link=location.origin+location.pathname+'?code='+(v.code||''); if(navigator.clipboard) navigator.clipboard.writeText(link); U().toast('Lien copié ! 🔗'); SJ.audio.click(); };
    $('#back').onclick=()=>{ SJ.audio.click(); quitToHome(); };
    const em=$('#editme'); if(em) em.onclick=()=>{ SJ.audio.click(); SJ.screens.avatar({then: reenterSalon}); };
    if(host){ const wrap=$('#cfgwrap'); const closeCfg=()=>{ if(wrap) wrap.classList.remove('show'); };
      const cf=$('#cfg'); if(cf) cf.onclick=()=>{ SJ.audio.click(); if(wrap) wrap.classList.add('show'); };
      const cc=$('#cfgclose'); if(cc) cc.onclick=()=>{ SJ.audio.click(); closeCfg(); };
      if(wrap) wrap.onclick=(e)=>{ if(e.target===wrap){ SJ.audio.click(); closeCfg(); } };   // clic sur le fond assombri = fermer
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
    : `<span class="gc-empty" style="font-size:12px;font-weight:700;opacity:.8;white-space:nowrap">sois le 1er 🙌</span>`; }
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
    const lb=app().querySelector('#launch'); if(lb){ lb.disabled=!s.canLaunch; lb.textContent=(s.winner!=null?"C'est parti ▶":"Lancer ▶"); }
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
    let target=salonWinner;
    if(target==null){ const counts=SJ.GAMES.map((_,i)=>players.filter(p=>p.vote===i).length); let lead=0; counts.forEach((c,i)=>{ if(c>counts[lead]) lead=i; }); target = counts[lead]>0?lead:0; }
    const g=SJ.GAMES[target];
    if(!g.playable){ U().toast(`🚧 ${g.name} arrive bientôt ! Choisis un jeu jouable 🎯`); return; }
    if(players.length<2){ U().toast('Il faut au moins 2 joueurs 😊'); return; }
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
        </div>
        ${v.iAmHost?'':'<div class="muted" style="font-size:14px;font-weight:700">en attente que l\'hôte relance…</div>'}
      </div></div></section>`);
    SJ.audio.win(); U().confetti(140);
    const a=$('#again'); if(a) a.onclick=()=>{ SJ.audio.pop(); coinsClaimed=false; act('restart'); };
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
    if(M.mini.dur) M.dur=M.mini.dur;   // certains minis (captcha) ont besoin de plus de temps
    M.responses={}; M.lifeLostBy=[]; M.newlyOut=[]; M.fastId=null;
    phase='pbplay'; curKey=null; hostRefresh();
    mAfter(Math.round(M.dur*1000)+300, ()=>{ if(phase==='pbplay') pbResolve(); });
  }
  function pbMaybeResolve(){ if(phase!=='pbplay'||!M) return; if(M.mini && M.mini.kind==='tapmash') return; /* tapmash : on attend le chrono (on peut dépasser) */ const alive=pbAlive(); if(alive.length && alive.every(p=>M.responses[p.id]!=null)) pbResolve(); }
  function pbResolve(){
    if(phase!=='pbplay') return; mClear();
    const alive=pbAlive(); const res={}; const out=[]; let fastId=null, fastDt=Infinity;
    alive.forEach(p=>{ const r=M.responses[p.id]; const dt=(r&&r.dt!=null)?r.dt:M.dur*1000; let ok=false;
      if(M.mini.kind==='choice'||M.mini.kind==='trapcolor') ok=!!(r && r.choice===M.mini.correct); else if(M.mini.kind==='tapmash') ok=!!(r && r.tap===M.mini.target); else ok=!!(r && r.ok);
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
    </div></section>`);
    $('#mic').onclick=()=>{ if(!mp.mic){ if(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia){ navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{ micStream=s; SJ.audio.click(); pbPerm(true,mp.cam); }).catch(()=>U().toast('Micro refusé 🔇')); } else U().toast('Micro indisponible'); } else { if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null;} pbPerm(false,mp.cam); } };
    $('#cam').onclick=()=>{ SJ.audio.click(); pbPerm(mp.mic,!mp.cam); };
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
      body=`<button id="mash" style="background:#FFC93C;border:3px solid #3B2D5E;border-radius:24px;padding:26px;font-size:28px;font-weight:800;box-shadow:0 8px 0 #D9A416;cursor:pointer;width:100%;font-family:inherit;color:#3B2D5E">👆 <span id="mashn">0</span> <span style="opacity:.55">/ ${m.target}</span></button>
        <div class="center" id="mashmsg" style="font-weight:800;font-size:15px;min-height:20px">&nbsp;</div>`;
    } else if(m.kind==='trapcolor'){
      const opts=(m.cells||[]).map((cell,i)=>`<button class="pbopt" data-i="${i}" style="background:${cell.bg};border:3px solid #3B2D5E;border-radius:18px;height:66px;box-shadow:0 6px 0 rgba(0,0,0,.28);cursor:pointer;color:#fff;font-weight:800;font-size:19px;font-family:inherit;text-shadow:0 1px 3px rgba(0,0,0,.55)">${esc(cell.label)}</button>`).join('');
      body=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${opts}</div>`;
    } else if(m.kind==='crie'){
      const tp=Math.round((m.micTarget||0.72)*100);
      body=`<div class="center" style="font-size:54px" id="crieface">😐</div><div class="center muted" style="font-weight:700">CRIE pour dépasser le repère 🎯</div>
        <div style="position:relative;height:28px;border:3px solid #3B2D5E;border-radius:999px;overflow:hidden;background:#fff;margin-top:16px">
          <div id="crielvl" style="height:100%;width:0;background:#2EC4B6;transition:width .04s linear"></div>
          <div style="position:absolute;top:-5px;bottom:-5px;left:${tp}%;width:4px;background:#FF5D73;border-radius:2px"></div>
          <div style="position:absolute;top:-21px;left:${tp}%;transform:translateX(-50%);font-size:16px">🎯</div>
        </div>`;
    } else if(m.kind==='captcha'){
      body=`<div id="cap-prog" class="center" style="font-size:13px;font-weight:800;color:#7A6BA8">Étape 1/5</div><div id="cap" style="min-height:172px;display:flex;flex-direction:column;gap:10px;justify-content:center"></div>`;
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
      if(m.kind==='choice'||m.kind==='trapcolor'){ app().querySelectorAll('.pbopt').forEach(b=> b.onclick=()=>{ if(answered)return; SJ.audio.pop(); app().querySelectorAll('.pbopt').forEach(x=>{ if(x!==b)x.style.opacity='.45'; }); b.style.outline='4px solid #FFC93C'; b.style.outlineOffset='2px'; done({choice:+b.dataset.i}); }); }
      else if(m.kind==='tapmash'){ let n=0; const btn=$('#mash'), lbl=$('#mashn'), msg=$('#mashmsg');
        if(btn) btn.onclick=()=>{ if(answered)return; n++; if(lbl)lbl.textContent=n; const dt=Math.round(nowMs()-t0);
          if(n<m.target){ SJ.audio.tick(); act('pbresp',{tap:n,dt}); }
          else if(n===m.target){ SJ.audio.pop(); btn.style.background='#2EC4B6'; btn.style.color='#fff'; btn.style.boxShadow='0 8px 0 #1E8B81'; if(msg){ msg.textContent='✅'; msg.style.color='#1E8B81'; } act('pbresp',{tap:n,dt}); }
          else { answered=true; btn.style.background='#FF5D73'; btn.style.color='#fff'; btn.style.boxShadow='0 8px 0 #C23A50'; if(msg){ msg.textContent='✗ trop !'; msg.style.color='#C23A50'; } act('pbresp',{tap:n,dt}); } }; }
      else if(m.kind==='crie'){ pbListenMic(m.micTarget, ()=>{ SJ.audio.pop(); done({ok:true}); }); }
      else if(m.kind==='captcha'){ runCaptcha($('#cap'), $('#cap-prog'), ()=>done({ok:true})); }
    }
    pbTicks(pb.dur);
  }
  // CAPTCHA EXTRÊME : 5 étapes de plus en plus absurdes ; onDone() quand tout est passé
  function runCaptcha(box, prog, onDone){
    if(!box) return;
    const ri=(n)=>Math.floor(Math.random()*n);
    const shuf=(a)=>{ for(let i=a.length-1;i>0;i--){ const j=ri(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; };
    const T=(fn,ms)=>{ const id=setTimeout(fn,ms); capTimers.push(id); return id; };
    const IV=(fn,ms)=>{ const id=setInterval(fn,ms); capTimers.push(id); return id; };
    let step=1;
    function adv(){ SJ.audio.pop&&SJ.audio.pop(); step++; show(); }
    function show(){
      if(step>5){ if(prog) prog.textContent='✅ vérifié !'; box.innerHTML='<div class="center pop" style="font-size:46px">✅</div><div class="center" style="font-weight:800;color:#1E8B81;font-size:18px">Humain confirmé !</div>'; SJ.audio.validate&&SJ.audio.validate(); onDone(); return; }
      if(prog) prog.textContent='Étape '+step+'/5';
      [s1,s2,s3,s4,s5][step-1]();
    }
    function s1(){   // 1 — la case classique
      box.innerHTML=`<div id="ck" style="background:#fff;border:3px solid #3B2D5E;border-radius:14px;padding:15px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;box-shadow:0 4px 0 #C9BBE8">
        <div id="ckb" style="width:30px;height:30px;border:3px solid #3B2D5E;border-radius:7px;background:#fff;flex:none;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:20px"></div>
        <div style="font-weight:700;font-size:16px;color:#3B2D5E">Je ne suis pas un robot</div><div style="margin-left:auto;font-size:22px">🤖</div></div>`;
      box.querySelector('#ck').onclick=()=>{ box.querySelector('#ckb').style.background='#2EC4B6'; box.querySelector('#ckb').textContent='✓'; T(adv,180); };
    }
    function s2(){   // 2 — sélectionne tous les robots
      const cells=shuf(['🤖','🤖','🤖','🐱','🍕','👻','🌵','🚀','🐸']); const need=cells.filter(c=>c==='🤖').length; let got=0;
      box.innerHTML=`<div class="center" style="font-size:14px;font-weight:800">Sélectionne tous les 🤖</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">${cells.map((c,i)=>`<button class="capc" data-i="${i}" data-c="${c}" style="aspect-ratio:1;border:3px solid #3B2D5E;border-radius:12px;background:#fff;font-size:26px;cursor:pointer;font-family:inherit">${c}</button>`).join('')}</div>`;
      box.querySelectorAll('.capc').forEach(b=> b.onclick=()=>{ if(b.dataset.ok) return; if(b.dataset.c==='🤖'){ b.dataset.ok='1'; b.style.background='#2EC4B6'; b.style.outline='3px solid #FFC93C'; got++; SJ.audio.tick&&SJ.audio.tick(); if(got>=need) T(adv,150); } else { b.style.animation='shake .3s'; T(()=>b.style.animation='',300); } });
    }
    function s3(){   // 3 — recopie le code déformé
      const cs='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code=''; for(let i=0;i<4;i++) code+=cs[ri(cs.length)];
      const styled=code.split('').map(ch=>`<span style="display:inline-block;transform:rotate(${ri(40)-20}deg) skewX(${ri(28)-14}deg);font-size:${26+ri(10)}px;font-weight:800;color:#3B2D5E;margin:0 3px;font-family:Caveat,cursive">${ch}</span>`).join('');
      box.innerHTML=`<div class="center" style="font-size:14px;font-weight:800">Recopie le code</div><div class="center" style="background:repeating-linear-gradient(8deg,#F4EFFF 0 6px,#fff 6px 12px);border:3px solid #3B2D5E;border-radius:12px;padding:10px">${styled}</div><input id="capcode" class="field" maxlength="4" placeholder="le code…" style="text-align:center;text-transform:uppercase;font-size:22px;font-weight:800;letter-spacing:4px">`;
      const inp=box.querySelector('#capcode'); if(inp){ inp.focus(); inp.oninput=()=>{ if((inp.value||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===code){ inp.style.borderColor='#2EC4B6'; T(adv,140); } }; }
    }
    function s4(){   // 4 — attrape le bouton fuyant
      box.innerHTML=`<div class="center" style="font-size:14px;font-weight:800">Attrape le robot ! 🏃</div><div id="capz" style="position:relative;height:150px;border:3px dashed #C9BBE8;border-radius:12px;overflow:hidden;background:#FFF8EC"></div>`;
      const z=box.querySelector('#capz'); const btn=document.createElement('button'); btn.textContent='🤖';
      btn.style.cssText='position:absolute;width:52px;height:52px;border:3px solid #3B2D5E;border-radius:50%;background:#FFC93C;font-size:25px;cursor:pointer;box-shadow:0 4px 0 #D9A416;left:10px;top:10px';
      z.appendChild(btn);
      const move=()=>{ const w=z.clientWidth||280, h=z.clientHeight||150; btn.style.left=ri(Math.max(1,w-56))+'px'; btn.style.top=ri(Math.max(1,h-56))+'px'; };
      T(move,30); IV(move,760); btn.onclick=(e)=>{ e.stopPropagation(); adv(); };
    }
    function s5(){   // 5 — trouve le seul humain
      const N=9, human=ri(N); const cells=[]; for(let i=0;i<N;i++) cells.push(i===human?'😶':'🤖');
      box.innerHTML=`<div class="center" style="font-size:14px;font-weight:800">Vite ! Clique le seul 😶 humain</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">${cells.map((c,i)=>`<button class="capc" data-i="${i}" style="aspect-ratio:1;border:3px solid #3B2D5E;border-radius:12px;background:#fff;font-size:26px;cursor:pointer;font-family:inherit">${c}</button>`).join('')}</div>`;
      box.querySelectorAll('.capc').forEach((b,i)=> b.onclick=()=>{ if(i===human){ b.style.background='#2EC4B6'; adv(); } else { b.style.animation='shake .3s'; T(()=>b.style.animation='',300); } });
    }
    show();
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
      <div class="row wrap" style="justify-content:center;gap:12px">${v.iAmHost?'<button class="btn btn--teal" id="again">Rejouer ↻</button>':''}</div>
      ${v.iAmHost?'':'<div class="muted" style="font-size:13px;font-weight:700">en attente que l\'hôte relance…</div>'}
    </div></section>`);
    if(o.iWon){ SJ.audio.win(); U().confetti(60); } else { SJ.audio.lose(); U().confetti(22); }
    if(!coinsClaimed){ SJ.store.addCoins(o.earned||0); coinsClaimed=true; }
    const a=$('#again'); if(a) a.onclick=()=>{ SJ.audio.pop(); coinsClaimed=false; act('pbagain'); };
  }

  /* ================= BLUFFE-MOI (UNDERCOVER) ================= */
  function ucAliveList(){ return players.filter(p=>M.alive[p.id]); }
  function ucStart(){
    if(players.length<3){ U().toast('Undercover : il faut au moins 3 joueurs 🙂'); return; }
    players.forEach(p=>p.score=0);
    const pair=SJ.UNDERCOVER[Math.floor(Math.random()*SJ.UNDERCOVER.length)];
    const swap=Math.random()<0.5; const wCivil=swap?pair.under:pair.civil, wUnder=swap?pair.civil:pair.under;
    const nUnder=players.length<=5?1:2;
    const idx=players.map((_,i)=>i); for(let i=idx.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [idx[i],idx[j]]=[idx[j],idx[i]]; }
    const underSet={}; for(let k=0;k<nUnder;k++) underSet[players[idx[k]].id]=true;
    M={ gameType:'undercover', wCivil, wUnder, nUnder, roles:{}, words:{}, alive:{}, round:0, clues:{}, votes:{}, lastElim:null, tally:[], winners:null, coins:{} };
    players.forEach(p=>{ const u=!!underSet[p.id]; M.roles[p.id]=u?'under':'civil'; M.words[p.id]=u?wUnder:wCivil; M.alive[p.id]=true; M.coins[p.id]=0; });
    coinsClaimed=false; phase='ucintro'; curKey=null; SJ.audio.pop(); U().confetti(16); hostRefresh();
  }
  function ucGo(){ M.round++; M.clues={}; M.votes={}; phase='ucclue'; curKey=null; hostRefresh();
    mAfter(70000, ()=>{ if(phase==='ucclue'){ ucAliveList().forEach(p=>{ if(M.clues[p.id]==null) M.clues[p.id]='…'; }); ucToVote(); } }); }
  function ucToVote(){ phase='ucvote'; curKey=null; hostRefresh(); mAfter(60000, ()=>{ if(phase==='ucvote') ucResolve(); }); }
  function ucClueSubmit(id, word){ if(phase!=='ucclue'||!M||!M.alive[id]||M.clues[id]!=null) return;
    M.clues[id]=String(word||'').slice(0,24).trim()||'…';
    if(ucAliveList().every(p=>M.clues[p.id]!=null)) ucToVote(); else hostRefresh(); }
  function ucVoteSubmit(voterId, targetId){ if(phase!=='ucvote'||!M||!M.alive[voterId]||M.votes[voterId]!=null) return;
    if(!M.alive[targetId]||targetId===voterId) return; M.votes[voterId]=targetId;
    if(ucAliveList().every(p=>M.votes[p.id]!=null)) ucResolve(); else hostRefresh(); }
  function ucResolve(){
    if(phase!=='ucvote') return; mClear();
    const counts={}; ucAliveList().forEach(p=>counts[p.id]=0);
    Object.keys(M.votes).forEach(v=>{ const t=M.votes[v]; if(counts[t]!=null) counts[t]++; });
    M.tally=ucAliveList().map(p=>({id:p.id,name:p.name,emoji:p.emoji,votes:counts[p.id]})).sort((a,b)=>b.votes-a.votes);
    let elimId=null;
    if(M.tally.length){ const top=M.tally[0].votes, tied=M.tally.filter(t=>t.votes===top); if(top>0&&tied.length===1) elimId=M.tally[0].id; }
    if(elimId){ M.alive[elimId]=false; const p=players.find(x=>x.id===elimId); M.lastElim={id:elimId,name:p.name,emoji:p.emoji,avatar:p.avatar,hat:p.hat,hatPos:p.hatPos,bg:p.bg,role:M.roles[elimId],word:M.words[elimId]}; }
    else M.lastElim=null;
    const aliveU=ucAliveList().filter(p=>M.roles[p.id]==='under').length, aliveC=ucAliveList().filter(p=>M.roles[p.id]==='civil').length;
    M.winners = aliveU===0 ? 'civil' : (aliveU>=aliveC ? 'under' : null);
    phase='ucreveal'; curKey=null; hostRefresh();
  }
  function ucFinishOrNext(){ if(M.winners) ucOver(); else ucGo(); }
  function ucOver(){ phase='ucover'; const wr=M.winners;
    players.forEach(p=>{ const win=M.roles[p.id]===wr; M.coins[p.id]=(M.coins[p.id]||0)+(win?6:1); if(win) p.score+=1; });
    curKey=null; hostRefresh(); }
  function patchUcProg(v){ const uc=v.uc; if(!uc||!uc.progress) return; const p=app().querySelector('#prog'); if(p) p.textContent=uc.progress.done; }

  function rUcIntro(v){ const uc=v.uc;
    mMount(`<section class="screen"><div class="stage" style="max-width:460px;gap:16px;align-items:stretch;text-align:center">
      <div class="card sh-pink" style="display:flex;flex-direction:column;gap:8px"><div style="font-size:24px;font-weight:800">🎭 Undercover</div>
        <div style="font-size:14px;font-weight:600;color:#3B2D5E">Presque tout le monde a le <b>même mot</b>. Un imposteur en a un <b>différent</b> ! Donne un indice pour prouver que tu connais ton mot… sans aider l'autre 🤫</div></div>
      <div class="card" style="background:#3B2D5E;color:#fff;box-shadow:0 10px 0 #1f1636;display:flex;flex-direction:column;gap:6px;align-items:center;padding:26px">
        <div style="font-size:13px;font-weight:700;color:#C9BBE8;letter-spacing:1px">TON MOT SECRET</div>
        <div class="pop" style="font-size:40px;font-weight:800">${esc(uc.myWord)}</div>
        <div style="font-size:12px;color:#C9BBE8;font-weight:700">ne le montre à personne 👀</div></div>
      ${v.iAmHost?`<button class="btn btn--coral lg block" id="go">Lancer les indices ▶</button>`:'<div class="center muted" style="font-weight:700">⏳ l\'hôte lance le 1er tour…</div>'}
    </div></section>`);
    if(v.iAmHost){ const g=$('#go'); if(g) g.onclick=()=>{ SJ.audio.click(); act('ucgo'); }; }
  }
  function rUcClue(v){ const uc=v.uc, dead=!uc.iAmAlive, mine=uc.myClue;
    mMount(`<section class="screen"><div class="stage" style="max-width:460px;gap:14px">
      <div class="row between"><span class="pill lilac" style="font-weight:800">Tour ${uc.round} · indices</span><span class="pill mint" style="font-weight:800">${uc.alive} en jeu</span></div>
      <div class="card sh-pink" id="uccard" style="display:flex;flex-direction:column;gap:12px">
        <div class="center" style="font-size:15px;font-weight:700;color:#3B2D5E">Ton mot : <b style="color:#D45D75">${esc(uc.myWord)}</b></div>
        ${dead?'<div class="center muted" style="font-weight:700;padding:10px">👻 Tu es éliminé — tu observes.</div>'
          : mine?`<div class="center" style="font-size:20px;font-weight:800;color:#2EC4B6">✅ Indice envoyé : « ${esc(mine)} »</div>`
          : `<div class="center" style="font-size:15px;font-weight:700">Donne <b>un seul mot</b> en rapport 🤫</div>
             <input id="clue" class="field" maxlength="24" placeholder="ton indice…" style="text-align:center;font-size:20px;font-weight:800">
             <button class="btn btn--teal block" id="send">Envoyer ▶</button>`}
      </div>
      <div class="center muted" style="font-weight:700"><span id="prog">${uc.progress.done}</span>/${uc.progress.total} ont donné leur indice</div>
    </div></section>`);
    if(!dead && !mine){ const inp=$('#clue'), send=$('#send');
      const go=()=>{ const w=(inp.value||'').trim(); if(!w){ U().toast('Écris un mot 🙂'); return; } SJ.audio.validate(); act('ucclue',{word:w});
        const c=$('#uccard'); if(c) c.innerHTML=`<div class="center" style="font-size:15px;font-weight:700;color:#3B2D5E">Ton mot : <b style="color:#D45D75">${esc(uc.myWord)}</b></div><div class="center" style="font-size:20px;font-weight:800;color:#2EC4B6">✅ Indice envoyé : « ${esc(w)} »</div>`; };
      if(send) send.onclick=go; if(inp){ inp.onkeydown=(e)=>{ if(e.key==='Enter') go(); }; inp.focus(); }
    }
  }
  function rUcVote(v){ const uc=v.uc, dead=!uc.iAmAlive, voted=uc.myVote;
    const cards=uc.clues.map(c=>`<button class="ucvote" data-id="${c.id}" ${(dead||c.you)?'disabled':''} style="display:flex;align-items:center;gap:10px;text-align:left;border:3px solid #3B2D5E;border-radius:16px;background:${voted===c.id?'#FFF1C9':'#fff'};padding:10px 12px;cursor:${(dead||c.you)?'default':'pointer'};box-shadow:0 5px 0 #C9BBE8;font-family:inherit;${(dead||c.you)?'opacity:.72':''}">
        ${U().ava({avatar:c.avatar,emoji:c.emoji,hat:c.hat,hatPos:c.hatPos,bg:c.bg},36)}
        <div class="grow" style="min-width:0"><div style="font-weight:800;font-size:15px;color:#3B2D5E">${c.you?'Toi':esc(c.name)}</div><div style="font-size:18px;font-weight:800;color:#D45D75">« ${esc(c.clue)} »</div></div>
        ${voted===c.id?'<span style="font-size:20px">🗳️</span>':''}</button>`).join('');
    mMount(`<section class="screen"><div class="stage" style="max-width:460px;gap:13px">
      <div class="row between"><span class="pill lilac" style="font-weight:800">Tour ${uc.round} · vote</span><span class="pill mint" style="font-weight:800">${uc.alive} en jeu</span></div>
      <div class="center" style="font-size:19px;font-weight:800">Qui est l'imposteur ? 🕵️</div>
      <div class="col" style="gap:9px">${cards}</div>
      <div class="center muted" style="font-weight:700">${dead?'👻 tu observes':`<span id="prog">${uc.progress.done}</span>/${uc.progress.total} ont voté`}</div>
    </div></section>`);
    if(!dead && !voted){ app().querySelectorAll('.ucvote').forEach(b=> b.onclick=()=>{ if(b.disabled) return; SJ.audio.validate();
      app().querySelectorAll('.ucvote').forEach(x=>{ x.style.outline='none'; if(x!==b) x.style.opacity='.55'; }); b.style.outline='4px solid #FFC93C'; b.style.outlineOffset='2px';
      act('ucvote',{target:b.dataset.id}); }); }
  }
  function rUcReveal(v){ const uc=v.uc, e=uc.elim, isUnder=e&&e.role==='under';
    const head = !e ? {t:"🤐 Égalité — personne n'est éliminé",c:'sh-purple'} : isUnder ? {t:`🎯 ${e.name} était un IMPOSTEUR !`,c:'sh-teal'} : {t:`😱 ${e.name} était un civil…`,c:'sh-coral'};
    mMount(`<section class="screen"><div class="stage" style="max-width:460px;gap:13px;align-items:stretch;text-align:center">
      <div class="card ${head.c}" style="display:flex;flex-direction:column;gap:10px;align-items:center">
        <div class="pop" style="font-size:21px;font-weight:800">${esc(head.t)}</div>
        ${e?`${U().ava({avatar:e.avatar,emoji:e.emoji,hat:e.hat,hatPos:e.hatPos,bg:e.bg},58)}<div style="font-size:15px;font-weight:700">son mot était <b style="color:${isUnder?'#1E8B81':'#C23A50'}">${esc(e.word)}</b></div>`:'<div style="font-size:14px;font-weight:700;color:#7A6BA8">Les votes étaient partagés.</div>'}
      </div>
      <div class="card" style="background:#fff;box-shadow:0 6px 0 #C9BBE8;display:flex;flex-direction:column;gap:5px"><div style="font-size:13px;font-weight:800;color:#7A6BA8">VOTES</div>${uc.tally.map(t=>`<div class="row between" style="font-size:14px;font-weight:700"><span>${esc(t.name)}</span><span>${'🗳️'.repeat(t.votes)} <b>${t.votes}</b></span></div>`).join('')}</div>
      ${uc.winners?`<div class="center" style="font-size:18px;font-weight:800;color:#9B5DE5">${uc.winners==='civil'?'🏅 Les civils ont gagné !':'🕵️ Les imposteurs gagnent !'}</div>`:''}
      ${v.iAmHost?`<button class="btn btn--purple block" id="next">${uc.winners?'Voir le résultat ▶':'Tour suivant ▶'}</button>`:'<div class="center muted" style="font-weight:700">⏳ l\'hôte continue…</div>'}
    </div></section>`);
    if(SJ.audio.reveal) SJ.audio.reveal();
    if(v.iAmHost){ const n=$('#next'); if(n) n.onclick=()=>{ SJ.audio.click(); act('ucnext'); }; }
  }
  function rUcOver(v){ const uc=v.uc;
    const rows=uc.reveal.map(p=>`<div class="row" style="gap:10px;align-items:center;background:${p.you?'#FFF1C9':'#fff'};border:3px solid #3B2D5E;border-radius:14px;padding:7px 11px;box-shadow:0 4px 0 #C9BBE8">
        ${U().ava({avatar:p.avatar,emoji:p.emoji,hat:p.hat,hatPos:p.hatPos,bg:p.bg},34)}
        <div class="grow" style="font-weight:800;font-size:15px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.you?'Toi':esc(p.name)}</div>
        <span style="font-size:12px;font-weight:800;border:2px solid #3B2D5E;border-radius:999px;padding:1px 9px;background:${p.role==='under'?'#FFE1E7':'#E4F8F6'};color:${p.role==='under'?'#D45D75':'#1E8B81'}">${p.role==='under'?'🕵️ imposteur':'🙂 civil'}</span>
        <b style="font-size:14px;color:#3B2D5E">${esc(p.word)}</b></div>`).join('');
    mMount(`<section class="screen"><div class="stage" style="max-width:480px;gap:13px;align-items:stretch;text-align:center">
      <div class="center pop" style="font-size:25px;font-weight:800">${uc.winners==='civil'?'🏅 Les civils gagnent !':'🕵️ Les imposteurs gagnent !'}</div>
      <div class="center" style="font-size:14px;font-weight:700;color:#7A6BA8">Mot civil : <b>${esc(uc.wCivil)}</b> · mot imposteur : <b>${esc(uc.wUnder)}</b></div>
      <div class="col" style="gap:7px">${rows}</div>
      <div class="center"><span class="pill paper" style="font-size:18px;font-weight:800;box-shadow:0 4px 0 #E5C96A">+${uc.earned||0} 🪙</span></div>
      <div class="row wrap" style="justify-content:center;gap:12px">${v.iAmHost?'<button class="btn btn--teal" id="again">Rejouer ↻</button>':''}</div>
      ${v.iAmHost?'':'<div class="muted" style="font-size:13px;font-weight:700">en attente que l\'hôte relance…</div>'}
    </div></section>`);
    if(uc.iWon){ SJ.audio.win(); U().confetti(55); } else { SJ.audio.lose(); U().confetti(18); }
    if(!coinsClaimed){ SJ.store.addCoins(uc.earned||0); coinsClaimed=true; }
    const a=$('#again'); if(a) a.onclick=()=>{ SJ.audio.pop(); coinsClaimed=false; act('ucagain'); };
  }

  /* ================= DESSINE & DEVINE (PICTIONARY) ================= */
  const piNorm=s=>String(s||'').toLowerCase().trim().normalize('NFD').replace(/[^a-z0-9]/g,'');   // NFD + strip non-alphanum => accent-insensitif
  function piDrawer(){ return players[M.drawerIdx%players.length]; }
  function piStart(){
    players.forEach(p=>p.score=0);
    M={ gameType:'pictionary', rounds:players.length, round:0, drawerIdx:-1, word:null, choices:[], found:{}, feed:[], ptsRound:{}, coins:{}, secsLeft:0, usedWords:[] };
    players.forEach(p=>M.coins[p.id]=0);
    coinsClaimed=false; SJ.audio.pop(); U().confetti(16); piNextRound();
  }
  function piPickWords(n){ let pool=SJ.PICTWORDS.filter(w=>!M.usedWords.includes(w)); if(pool.length<n) pool=SJ.PICTWORDS.slice(); const cp=pool.slice(), out=[]; for(let i=0;i<n&&cp.length;i++) out.push(cp.splice(Math.floor(Math.random()*cp.length),1)[0]); return out; }
  function piNextRound(){
    if(!M || M.round>=M.rounds){ goPodium(); return; }
    M.round++; M.drawerIdx=(M.round-1)%players.length;
    M.word=null; M.found={}; M.feed=[]; M.ptsRound={}; M.choices=piPickWords(3);
    phase='piword'; curKey=null; hostRefresh();
  }
  function piChoose(id, word){ if(phase!=='piword'||!M||id!==piDrawer().id) return; if(M.choices.indexOf(word)<0) return; M.word=word; M.usedWords.push(word); piBeginDraw(); }
  function piBeginDraw(){ phase='pidraw'; M.secsLeft=80; curKey=null; hostRefresh();
    mTick&&clearInterval(mTick); mTick=setInterval(()=>{ if(phase!=='pidraw'){ clearInterval(mTick); mTick=null; return; } M.secsLeft--; if(M.secsLeft<=0){ clearInterval(mTick); mTick=null; piReveal(); } else hostRefresh(); },1000); }
  function piGuess(id, text){
    if(phase!=='pidraw'||!M||M.found[id]||id===piDrawer().id) return;
    const pl=players.find(p=>p.id===id); const nm=pl?pl.name:'?';
    if(piNorm(text)===piNorm(M.word)){
      const order=Object.keys(M.found).length; M.found[id]=true; const pts=Math.max(2,6-order); M.ptsRound[id]=pts; if(pl) pl.score+=pts;
      M.feed.push({name:nm, ok:true}); SJ.audio.coin&&SJ.audio.coin();
      const gs=players.filter(p=>p.id!==piDrawer().id);
      if(gs.length && gs.every(p=>M.found[p.id])) piReveal(); else hostRefresh();
    } else { M.feed.push({name:nm, text:String(text).slice(0,24), ok:false}); if(M.feed.length>24) M.feed=M.feed.slice(-24); hostRefresh(); }
  }
  function piReveal(){ if(phase==='pireveal'||!M) return; mClear();
    const d=piDrawer(); const nFound=Object.keys(M.found).length; M.ptsRound[d.id]=Math.min(6,nFound*2); d.score+=M.ptsRound[d.id];
    players.forEach(p=>{ M.coins[p.id]=(M.coins[p.id]||0)+(M.ptsRound[p.id]||0); });
    phase='pireveal'; curKey=null; hostRefresh();
  }
  function piApply(segs,c,w){ if(!piCtx||!piCanvas||!segs) return; piCtx.strokeStyle=c||'#3B2D5E'; piCtx.lineWidth=w||4; piCtx.lineCap='round'; piCtx.lineJoin='round';
    const W=piCanvas.width,H=piCanvas.height; piCtx.beginPath(); segs.forEach(s=>{ piCtx.moveTo(s[0]*W,s[1]*H); piCtx.lineTo(s[2]*W,s[3]*H); }); piCtx.stroke(); }
  function piClearCanvas(){ if(piCtx&&piCanvas) piCtx.clearRect(0,0,piCanvas.width,piCanvas.height); }
  function piFeedHTML(feed){ return (feed||[]).map(f=> f.ok?`<div style="color:#1E8B81;font-weight:800">✅ ${esc(f.name)} a trouvé !</div>`:`<div><b>${esc(f.name)}</b> : ${esc(f.text)}</div>`).join('') || '<div class="muted">les réponses s\'affichent ici…</div>'; }
  function patchPi(v){ const pi=v.pi; if(!pi) return;
    const t=app().querySelector('#pi-timer'); if(t){ t.textContent=pi.secsLeft+'s'; t.style.background = pi.secsLeft<=10?'#FFE3E8':''; }
    const f=app().querySelector('#pi-feed'); if(f){ f.innerHTML=piFeedHTML(pi.feed); const w=f.parentElement; if(w) w.scrollTop=w.scrollHeight; }
    if(pi.iFound && app().querySelector('#pi-input')){ const gb=app().querySelector('#pi-guessbar'); if(gb) gb.outerHTML='<div class="center" id="pi-guessbar" style="font-size:18px;font-weight:800;color:#2EC4B6">✅ Trouvé ! attends les autres…</div>'; }
  }

  function rPiWord(v){ const pi=v.pi;
    if(pi.iAmDrawer){
      const btns=pi.choices.map(w=>`<button class="piword" data-w="${esc(w)}" style="border:3px solid #3B2D5E;border-radius:16px;background:#fff;padding:16px;font-size:21px;font-weight:800;box-shadow:0 6px 0 #C9BBE8;cursor:pointer;font-family:inherit;color:#3B2D5E">${esc(w)}</button>`).join('');
      mMount(`<section class="screen"><div class="stage" style="max-width:440px;gap:14px;text-align:center">
        ${U().topbar(`Tour ${pi.round}/${pi.rounds} — à toi de dessiner ✏️`,'frozen')}
        <div style="font-size:19px;font-weight:800">Choisis ton mot à faire deviner</div>
        <div class="col" style="gap:10px">${btns}</div></div></section>`);
      app().querySelectorAll('.piword').forEach(b=> b.onclick=()=>{ SJ.audio.validate(); act('pichoose',{word:b.dataset.w}); });
    } else {
      mMount(`<section class="screen"><div class="stage game card sh-teal" style="max-width:420px;gap:14px;text-align:center">
        ${U().topbar(`Tour ${pi.round}/${pi.rounds}`,'frozen')}
        <div style="font-size:50px">✏️</div>
        <div style="font-size:18px;font-weight:800"><b style="color:#1E8B81">${esc(pi.drawerName)}</b> choisit un mot…</div>
        <div class="center muted" style="font-weight:700">prépare-toi à deviner 👀</div></div></section>`);
    }
  }
  function rPiDraw(v){ const pi=v.pi, mine=pi.iAmDrawer, found=pi.iFound;
    if(piUp){ window.removeEventListener('pointerup',piUp); piUp=null; }
    const hint = mine ? `<b style="color:#1E8B81;font-size:22px;letter-spacing:2px">${esc(pi.myWord)}</b>` : `<span style="letter-spacing:7px;font-size:24px;font-weight:800">${'_ '.repeat(pi.wordLen).trim()}</span> <span class="muted" style="font-size:13px;letter-spacing:0">(${pi.wordLen} lettres)</span>`;
    const palette=['#3B2D5E','#FF5D73','#4D96FF','#2EC4B6','#FFC93C','#FFFFFF'];
    const tools = mine ? `<div class="row gap6 wrap" style="justify-content:center;align-items:center">${palette.map((c,i)=>`<button class="picol" data-c="${c}" style="width:30px;height:30px;border-radius:50%;border:3px solid #3B2D5E;background:${c};cursor:pointer;${i===0?'outline:3px solid #FFC93C;outline-offset:2px':''}"></button>`).join('')}<button class="btn btn--ghost sm" id="pi-clear">🗑️</button></div>` : '';
    const bottom = mine ? '<div class="center muted" style="font-weight:700;font-size:13px">dessine — ni mots ni lettres 🤫</div>'
      : (found ? '<div class="center" id="pi-guessbar" style="font-size:18px;font-weight:800;color:#2EC4B6">✅ Trouvé ! attends les autres…</div>'
        : `<div class="row gap8" id="pi-guessbar"><input id="pi-input" class="field" maxlength="24" placeholder="ta réponse…" style="font-size:17px;font-weight:700"><button class="btn btn--teal" id="pi-send">Deviner</button></div>`);
    mMount(`<section class="screen"><div class="stage" style="max-width:640px;gap:10px">
      <div class="row between" style="align-items:center"><span class="pill lilac" style="font-weight:800">Tour ${pi.round}/${pi.rounds}</span><span style="font-weight:800;font-size:14px">${mine?'✏️ tu dessines':'✏️ '+esc(pi.drawerName)}</span><span class="pill mint" id="pi-timer" style="font-weight:800">${pi.secsLeft}s</span></div>
      <div class="center" id="pi-word" style="font-weight:800">${hint}</div>
      <canvas id="pi-canvas" width="600" height="420" style="width:100%;height:auto;background:#fff;border:3px solid #3B2D5E;border-radius:16px;box-shadow:0 6px 0 #C9BBE8;touch-action:none;cursor:${mine?'crosshair':'default'}"></canvas>
      ${tools}
      <div class="card" style="background:#fff;box-shadow:0 5px 0 #C9BBE8;padding:8px 12px;min-height:50px;max-height:104px;overflow-y:auto"><div id="pi-feed" style="display:flex;flex-direction:column;gap:3px;font-size:13px;font-weight:600">${piFeedHTML(pi.feed)}</div></div>
      ${bottom}
    </div></section>`);
    piCanvas=$('#pi-canvas'); piCtx=piCanvas.getContext('2d'); piIsDrawer=mine; piColor='#3B2D5E'; piWidth=4;
    if(mine){
      const pt=(e)=>{ const r=piCanvas.getBoundingClientRect(); const cx=e.touches?e.touches[0].clientX:e.clientX, cy=e.touches?e.touches[0].clientY:e.clientY; return {x:(cx-r.left)/r.width, y:(cy-r.top)/r.height}; };
      let drawing=false;
      const flush=()=>{ piRaf=0; if(piBuf.length){ act('draw',{segs:piBuf,c:piColor,w:piWidth}); piBuf=[]; } };
      piCanvas.addEventListener('pointerdown',(e)=>{ e.preventDefault(); drawing=true; piLast=pt(e); });
      piCanvas.addEventListener('pointermove',(e)=>{ if(!drawing)return; e.preventDefault(); const p=pt(e); const seg=[piLast.x,piLast.y,p.x,p.y]; piApply([seg],piColor,piWidth); piBuf.push(seg); piLast=p; if(!piRaf) piRaf=requestAnimationFrame(flush); });
      piUp=()=>{ if(drawing){ drawing=false; flush(); } }; window.addEventListener('pointerup',piUp);
      app().querySelectorAll('.picol').forEach(b=> b.onclick=()=>{ piColor=b.dataset.c; app().querySelectorAll('.picol').forEach(x=>x.style.outline='none'); b.style.outline='3px solid #FFC93C'; b.style.outlineOffset='2px'; });
      const cl=$('#pi-clear'); if(cl) cl.onclick=()=>{ piClearCanvas(); act('clear'); SJ.audio.click(); };
    } else if(!found){
      const inp=$('#pi-input'), snd=$('#pi-send');
      const go=()=>{ const t=(inp.value||'').trim(); if(!t)return; inp.value=''; SJ.audio.click(); act('piguess',{text:t}); };
      if(snd) snd.onclick=go; if(inp){ inp.onkeydown=(e)=>{ if(e.key==='Enter') go(); }; }
    }
  }
  function rPiReveal(v){ const pi=v.pi;
    const rows=pi.results.filter(r=>r.found||r.drawer).sort((a,b)=>b.pts-a.pts).map(r=>`<div class="row between" style="font-size:14px;font-weight:700;background:${r.you?'#FFF1C9':'#fff'};border:2px solid #3B2D5E;border-radius:10px;padding:5px 11px"><span>${r.drawer?'✏️ ':''}${r.you?'Toi':esc(r.name)}${r.found?' ✅':''}</span><b style="color:#9B5DE5">+${r.pts}</b></div>`).join('');
    mMount(`<section class="screen"><div class="stage" style="max-width:440px;gap:13px;align-items:stretch;text-align:center">
      <div class="card sh-teal" style="display:flex;flex-direction:column;gap:6px;align-items:center"><div style="font-size:15px;font-weight:700">Le mot était</div><div class="pop" style="font-size:32px;font-weight:800;color:#1E8B81">${esc(pi.word)}</div></div>
      <div class="col" style="gap:6px">${rows||'<div class="muted" style="font-weight:700">personne n\'a trouvé 😅</div>'}</div>
      ${v.iAmHost?'<button class="btn btn--purple block" id="next">Suivant ▶</button>':'<div class="center muted" style="font-weight:700">⏳ l\'hôte continue…</div>'}
    </div></section>`);
    if(SJ.audio.reveal) SJ.audio.reveal();
    if(v.iAmHost){ const n=$('#next'); if(n) n.onclick=()=>{ SJ.audio.click(); act('pinext'); }; }
  }

  /* ================= TIC-TAC-MOT (jeu de la bombe) ================= */
  function ttAlive(){ return players.filter(p=>(M.lives[p.id]||0)>0); }
  function ttNextHolder(fromId){ const n=players.length; let idx=players.findIndex(p=>p.id===fromId); if(idx<0) idx=0;
    for(let k=0;k<n;k++){ idx=(idx+1)%n; const p=players[idx]; if((M.lives[p.id]||0)>0) return p.id; } return fromId; }
  function ttPickSyl(){ const n=SJ.BOMBSYL.length; let i; do{ i=Math.floor(Math.random()*n); } while(n>1 && i===M.sylIdx); return i; }
  function ttStart(){
    if(players.length<2){ U().toast('Tic-Tac-Mot : il faut au moins 2 joueurs 🙂'); return; }
    players.forEach(p=>p.score=0);
    M={ gameType:'tictacmot', lives:{}, holder:null, sylIdx:0, round:1, running:false,
        feedback:'', feedbackKind:'', winnerId:null, boomName:'', used:{}, coins:{} };
    players.forEach(p=>{ M.lives[p.id]=3; M.coins[p.id]=0; });
    const al=ttAlive(); M.holder=al[Math.floor(Math.random()*al.length)].id; M.sylIdx=Math.floor(Math.random()*SJ.BOMBSYL.length);
    coinsClaimed=false; phase='ttplay'; curKey=null; SJ.audio.pop(); U().confetti(14); hostRefresh();
  }
  function ttLight(){ if(!M||M.running) return;
    M.running=true; M.feedback=''; M.feedbackKind=''; M.used={};
    curKey=null; hostRefresh();
    // mèche TOTALEMENT aléatoire et CACHÉE : un seul timer, aucune barre, aucune info de durée
    // la MÊME bombe continue de tourner quand on se la passe (comme BombParty) → une manche = une vie de bombe
    const totalMs = 8000 + Math.floor(Math.random()*16000);   // 8 → 24 s, totalement aléatoire
    if(ttFuse){ clearTimeout(ttFuse); ttFuse=null; }
    ttFuse=setTimeout(()=>{ ttFuse=null; if(M&&phase==='ttplay'&&M.running) ttExplode(); }, totalMs);
  }
  function ttSubmit(id, word){
    if(phase!=='ttplay'||!M||!M.running||id!==M.holder) return;
    const w=String(word||'').toUpperCase().replace(/[^A-ZÀ-Ü]/g,''); const syl=SJ.BOMBSYL[M.sylIdx].s;
    if(w.length<2){ M.feedback='trop court !'; M.feedbackKind='bad'; hostRefresh(); return; }
    if(w.indexOf(syl)<0){ M.feedback='il faut « '+syl+' » dedans !'; M.feedbackKind='bad'; hostRefresh(); return; }
    if(M.used[w]){ M.feedback='déjà dit ! trouve un autre'; M.feedbackKind='bad'; hostRefresh(); return; }
    M.used[w]=true; M.holder=ttNextHolder(M.holder); M.sylIdx=ttPickSyl();
    M.feedback='✓ '+w+' ! passe au suivant'; M.feedbackKind='good'; SJ.audio.coin&&SJ.audio.coin();
    curKey=null; hostRefresh();   // la mèche CONTINUE (on ne touche pas à ttFuse)
  }
  function ttExplode(){
    if(!M) return; if(ttFuse){ clearTimeout(ttFuse); ttFuse=null; }
    const h=M.holder; M.lives[h]=Math.max(0,(M.lives[h]||0)-1); M.running=false;
    const p=players.find(x=>x.id===h); M.boomName=p?p.name:'?';
    const alive=ttAlive();
    if(alive.length<=1){ ttGameOver(alive[0]?alive[0].id:null); return; }
    phase='ttboom'; curKey=null; hostRefresh();   // le son d'explosion est joué côté rendu (pour tout le monde)
    mAfter(2600, ()=>{ if(phase!=='ttboom'||!M) return;
      M.round++; M.holder=ttNextHolder(h); M.sylIdx=ttPickSyl(); M.feedback=''; M.feedbackKind=''; M.running=false;
      phase='ttplay'; ttLight(); });   // relance auto la nouvelle manche
  }
  function ttGameOver(winnerId){
    if(ttFuse){ clearTimeout(ttFuse); ttFuse=null; }
    phase='ttover'; M.running=false; M.winnerId=winnerId;
    players.forEach(p=>{ const win=p.id===winnerId; M.coins[p.id]=(M.coins[p.id]||0)+(M.round*3)+(win?20:0); if(win) p.score+=1; });
    curKey=null; hostRefresh();
  }
  function ttRingPos(i,n){ const ang=(-90+i*(360/n))*Math.PI/180, r=38; return { left:(50+r*Math.cos(ang))+'%', top:(50+r*Math.sin(ang))+'%' }; }
  // cercle partagé par le jeu et l'explosion : bombe au centre + jetons autour. boom=true → l'explosion s'anime sur le jeton du porteur (tout le monde la voit)
  function ttCircleHTML(tt, boom){ const n=tt.ring.length;
    const ring=tt.ring.map((pl,i)=>{ const pos=ttRingPos(i,n); const up=parseFloat(pos.top)<46; const burst=boom&&(pl.holder||pl.exploded);
      const live=(!boom&&pl.holder&&!pl.you&&tt.running)
        ? `<div id="tt-live" style="position:absolute;left:50%;transform:translateX(-50%);${up?'bottom:100%;margin-bottom:7px':'top:100%;margin-top:7px'};z-index:7;background:#3B2D5E;color:#fff;border:2px solid #fff;border-radius:12px;padding:4px 11px;font-size:16px;font-weight:800;letter-spacing:1px;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 4px 0 rgba(0,0,0,.3)"><span style="opacity:.45;font-weight:700">…</span></div>` : '';
      return `<div style="position:absolute;top:${pos.top};left:${pos.left};transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:3px;width:78px">
        <div style="position:relative;width:56px;height:56px;border-radius:50%;border:4px solid ${pl.holder?'#FF5D73':'#3B2D5E'};background:${burst?'#FFD9DF':(pl.holder?'#FFF1C9':'#fff')};display:flex;align-items:center;justify-content:center;box-shadow:${pl.holder?'0 0 0 5px rgba(255,93,115,.35),0 4px 0 #C9BBE8':'0 4px 0 #C9BBE8'};opacity:${pl.dead?'.5':'1'}${burst?';animation:shake .35s ease-in-out infinite':''}">
          ${U().ava({avatar:pl.avatar,emoji:pl.emoji,hat:pl.hat,hatPos:pl.hatPos,bg:pl.bg},44)}
          ${burst?'<div class="pop" style="position:absolute;font-size:46px">💥</div>':(pl.holder&&!boom?'<div style="position:absolute;bottom:-9px;right:-9px;font-size:23px;animation:floaty 1.2s ease-in-out infinite">💣</div>':'')}
          ${pl.dead&&!burst?'<div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,45,94,.55);display:flex;align-items:center;justify-content:center;font-size:23px">💀</div>':''}
        </div>
        <div style="font-size:13px;font-weight:800;color:${pl.holder?'#FF5D73':'#3B2D5E'};max-width:78px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${pl.you?'Toi':esc(pl.name)}</div>
        <div style="font-size:11px;letter-spacing:1px">${pl.hearts}</div>${live}</div>`; }).join('');
    return `<div style="position:relative;width:min(330px,82vw);height:min(330px,82vw);align-self:center;margin:48px 0 54px">
      <div id="tt-bomb" style="position:absolute;top:50%;left:50%;width:42%;height:42%;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle at 38% 32%,${boom?'#7A2A3A,#3A1622':'#5A4A7A,#2A2440'});border:4px solid #3B2D5E;box-shadow:0 8px 0 #1F1638,inset 0 -6px 12px rgba(0,0,0,.4);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px${boom?';animation:shake .3s ease-in-out infinite':''}">
        <div id="tt-spark" style="position:absolute;top:-16%;right:6%;font-size:28px;animation:sparkle .5s ease-in-out infinite">${tt.running&&!boom?'🔥':''}</div>
        ${boom?'<div style="font-size:38px">💥</div>':`<div style="font-size:12px;font-weight:800;color:#FFC93C;letter-spacing:1px">UN MOT EN</div><div style="font-size:clamp(28px,9vw,46px);font-weight:800;color:#fff;line-height:.9">${esc(tt.syllable)}</div>`}
      </div>${ring}
    </div>`; }
  function ttShake(){ const s=app().querySelector('.stage'); if(s){ s.style.animation='none'; void s.offsetWidth; s.style.animation='shake .35s'; } }   // « c'est pas bon » : tout se secoue
  function rTtPlay(v){
    const tt=v.tt;
    const fbCol=tt.feedbackKind==='good'?'#1E8B81':(tt.feedbackKind==='bad'?'#FF5D73':'#A99CC9');
    const cons = (tt.iAmHolder && tt.running) ? `<div class="card" style="background:#fff;border:3px solid #3B2D5E;border-radius:20px;padding:16px;display:flex;flex-direction:column;gap:12px;box-shadow:0 6px 0 #C9BBE8">
        <div style="font-size:17px;font-weight:800">À toi ! <span style="color:#7A6BA8;font-weight:700;font-size:14px">un mot avec « ${esc(tt.syllable)} »</span></div>
        <div class="row gap8"><input id="tt-input" class="field" placeholder="tape un mot…" maxlength="24" style="flex:1;text-transform:uppercase;font-size:20px;font-weight:800"><button class="btn btn--teal" id="tt-send" style="width:62px">✓</button></div>
        <div id="tt-fb" style="min-height:22px;font-size:15px;font-weight:800;color:${fbCol}">${esc(tt.feedback||'')}</div>
      </div>`
      : (tt.running ? `<div class="center" style="font-size:16px;font-weight:800;color:#7A6BA8">💣 c'est au tour de <b style="color:#FF5D73">${esc(tt.holderName)}</b> — un mot avec « ${esc(tt.syllable)} »</div>`
        : (v.iAmHost ? `<button class="btn btn--coral lg block" id="tt-light">🔥 Allumer la mèche</button>` : `<div class="center muted" style="font-weight:700">⏳ en attente que l'hôte allume la mèche…</div>`));
    mMount(`<section class="screen"><div class="stage" style="max-width:560px;gap:14px">
      <div class="row between"><span class="pill" style="background:#3B2D5E;color:#fff;font-weight:800">Manche ${tt.round}</span><span style="font-size:15px;font-weight:700;color:#7A6BA8">${tt.aliveCount} en vie</span></div>
      ${ttCircleHTML(tt,false)}
      ${tt.running?'<div class="center" style="font-size:14px;font-weight:800;color:#C23A50">🔥 Mèche allumée — ça peut péter À TOUT MOMENT 💥</div>':''}
      ${cons}
    </div></section>`);
    ttLiveLen=0;
    if(!tt.running && v.iAmHost){ const l=$('#tt-light'); if(l) l.onclick=()=>{ SJ.audio.click(); act('ttlight'); }; }
    if(tt.iAmHolder && tt.running){ const inp=$('#tt-input'), snd=$('#tt-send'), fb=$('#tt-fb');
      const bad=(msg)=>{ if(fb){ fb.textContent=msg; fb.style.color='#FF5D73'; } ttShake(); SJ.audio.nope&&SJ.audio.nope(); };
      const go=()=>{ const w=((inp.value||'').trim()).toUpperCase().replace(/[^A-ZÀ-Ü]/g,''); const syl=(tt.syllable||'').toUpperCase();
        if(w.length<2){ bad('trop court !'); return; }
        if(w.indexOf(syl)<0){ bad('il faut « '+tt.syllable+' » dedans !'); return; }
        SJ.audio.validate&&SJ.audio.validate(); act('ttword',{word:w}); };
      if(snd) snd.onclick=go;
      if(inp){ inp.onkeydown=(e)=>{ if(e.key==='Enter') go(); };
        inp.oninput=()=>{ SJ.audio.key&&SJ.audio.key(); act('ttinput',{text:(inp.value||'')}); };
        inp.focus(); }
      if(tt.feedbackKind==='bad'){ ttShake(); SJ.audio.nope&&SJ.audio.nope(); }   // mot refusé par l'hôte (déjà dit)
    }
  }
  function rTtBoom(v){ const b=v.tt.boom||{};
    // tout le monde voit l'explosion DANS le cercle (sur le jeton du porteur). L'écran rouge n'apparaît QUE pour le joueur éliminé.
    const overlay = (b.you && b.out)
      ? `<div style="position:fixed;inset:0;background:linear-gradient(170deg,rgba(255,93,115,.97),rgba(194,58,80,.97));z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;animation:cfgFade .18s ease"><div style="text-align:center;color:#fff;display:flex;flex-direction:column;gap:14px;align-items:center"><div style="font-size:88px;animation:shake .4s ease-in-out infinite">💥</div><div style="font-size:46px;font-weight:800;text-shadow:0 4px 0 rgba(0,0,0,.28)">ÉLIMINÉ·E</div><div style="background:rgba(255,255,255,.96);border:3px solid #3B2D5E;border-radius:18px;padding:12px 20px;color:#3B2D5E;font-size:18px;font-weight:800">💀 Tu n'as plus de vies</div></div></div>`
      : '';
    mMount(`<section class="screen"><div class="stage" style="max-width:560px;gap:14px">
      <div class="row between"><span class="pill" style="background:#3B2D5E;color:#fff;font-weight:800">Manche ${v.tt.round}</span><span style="font-size:15px;font-weight:700;color:#7A6BA8">${v.tt.aliveCount} en vie</span></div>
      ${ttCircleHTML(v.tt, true)}
      <div class="center" style="font-size:17px;font-weight:800;color:#C23A50">💥 ${esc(b.name||'?')} ${b.out?'est éliminé·e 💀':'explose — perd une vie'}</div>
    </div></section>${overlay}`);
    SJ.audio.boom&&SJ.audio.boom();
    if(b.you && b.out) mAfter(420, ()=>SJ.audio.lose&&SJ.audio.lose());
  }
  function rTtOver(v){ const o=v.tt.over||{};
    mMount(`<section class="screen"><div class="stage" style="max-width:400px;align-items:center;text-align:center;gap:14px">
      <div style="font-size:22px;font-weight:800;color:#9B5DE5">🏆 Survivant·e</div>
      <div style="position:relative;width:120px;height:120px">
        <div style="position:absolute;inset:0;border-radius:50%;border:4px solid #3B2D5E;background:#FFF1C9;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 0 #E8C766;animation:floaty 1.6s ease-in-out infinite">${U().ava({avatar:o.avatar,emoji:o.winnerEmoji,hat:o.hat,hatPos:o.hatPos,bg:o.winnerColor},90)}</div>
        <div class="pop" style="position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:38px">👑</div>
      </div>
      <div style="font-size:28px;font-weight:800">${o.iWon?'Tu gagnes !':esc(o.winnerName)+' gagne !'}</div>
      <div style="font-size:16px;font-weight:700;color:#7A6BA8">A survécu à <b style="color:#3B2D5E">${o.rounds} manche${o.rounds>1?'s':''}</b> 😅</div>
      <span class="pill paper" style="font-size:18px;font-weight:800;box-shadow:0 4px 0 #E5C96A">+${o.earned||0} 🪙</span>
      <div class="row wrap" style="justify-content:center;gap:10px">${v.iAmHost?'<button class="btn btn--coral" id="again">🔁 Revanche</button>':''}</div>
      ${v.iAmHost?'':'<div class="muted" style="font-size:13px;font-weight:700">en attente que l\'hôte relance…</div>'}
    </div></section>`);
    if(o.iWon){ SJ.audio.win(); U().confetti(60); } else { SJ.audio.lose&&SJ.audio.lose(); U().confetti(16); }
    if(!coinsClaimed){ SJ.store.addCoins(o.earned||0); coinsClaimed=true; }
    const a=$('#again'); if(a) a.onclick=()=>{ SJ.audio.pop(); coinsClaimed=false; act('ttagain'); };
  }

  /* ================= UNO ! (jeu de cartes, vraies règles : paquet fini de 108) ================= */
  const SOLO_BOTS=[{name:'Tom',emoji:'🐸',color:'#2EC4B6'},{name:'Mia',emoji:'🦊',color:'#FF8FA3'},{name:'Noé',emoji:'👾',color:'#4D96FF'},{name:'Zoé',emoji:'🐱',color:'#9B5DE5'}];
  function clearSolo(){ if(soloTimer){ clearTimeout(soloTimer); soloTimer=null; } }
  function soloSeatOf(id){ return M.seats.findIndex(s=>s.id===id); }
  function soloCount(i){ return M.cards[i]?M.cards[i].length:0; }
  function soloStep(turn,steps){ const n=M.seats.length; return (((turn+M.dir*steps)%n)+n)%n; }
  function soloDrawCard(){ if(M.deck.length===0){ if(M.discard.length<=1) return null; const top=M.discard.pop(); M.deck=SJ.SOLO.shuffle(M.discard); M.discard=[top]; } return M.deck.pop()||null; }   // pioche, remélange la défausse si vide
  function soloGive(i,n){ let got=0; for(let k=0;k<n;k++){ const c=soloDrawCard(); if(c){ M.cards[i].push(c); got++; } } if(got>0) M._anim={seat:i,n:got}; }   // +2/+4 : anim de pioche vers la victime
  function soloDeal(){ M.deck=SJ.SOLO.shuffle(SJ.SOLO.makeDeck()); M.cards={};
    M.seats.forEach((s,i)=>{ M.cards[i]=M.deck.splice(0,7); });
    let ti=M.deck.findIndex(c=>c.color!=='W'&&['skip','rev','+2','+4'].indexOf(c.val)<0); if(ti<0) ti=0;   // 1re défausse = un chiffre
    const t=M.deck.splice(ti,1)[0]; M.discard=[t]; M.top=t; M.activeColor=t.color; M.drawn=null; }
  function soloStart(){
    players.forEach(p=>p.score=0);
    const seats=players.map(p=>({id:p.id,name:p.name,emoji:p.emoji,color:p.color,avatar:p.avatar,hat:p.hat,hatPos:p.hatPos,bg:p.bg,bot:false}));   // de vrais joueurs uniquement (pas de bots)
    M={ gameType:'solo', seats, cards:{}, deck:[], discard:[], top:null, activeColor:'R', turn:0, dir:1, needColor:false, needColorSeat:-1, pendingWild:null, drawn:null, message:'À toi de jouer 👇', round:1, winnerSeat:-1, coins:{} };
    soloDeal(); seats.forEach(s=>{ M.coins[s.id]=0; });
    coinsClaimed=false; phase='soloplay'; curKey=null; SJ.audio.pop(); U().confetti(12); hostRefresh(); scheduleSoloAI();
  }
  function soloAgain(){ clearSolo(); M.round=(M.round||1)+1; M.winnerSeat=-1; M.needColor=false; M.needColorSeat=-1; M.pendingWild=null; M.dir=1; M.turn=0; soloDeal(); M.message='Nouvelle donne 🎴'; coinsClaimed=false; hostRefresh(); scheduleSoloAI(); }
  function soloResolve(card){ M.discard.push(card); M.top=card; if(card.color!=='W') M.activeColor=card.color; let skip=false;
    if(card.val==='rev'){ M.dir=-M.dir; if(M.seats.length===2) skip=true; }
    else if(card.val==='skip'){ skip=true; }
    else if(card.val==='+2'){ skip=true; soloGive(soloStep(M.turn,1),2); }
    else if(card.val==='+4'){ skip=true; soloGive(soloStep(M.turn,1),4); }
    M.turn=soloStep(M.turn, skip?2:1); }
  function soloWin(seat){ clearSolo(); M.winnerSeat=seat; M.message='';
    M.seats.forEach((s,i)=>{ if(!s.bot){ const win=(i===seat); M.coins[s.id]=(M.coins[s.id]||0)+(win?15:3); const p=players.find(x=>x.id===s.id); if(p&&win) p.score+=1; } });
    hostRefresh(); soloFireAnim(); }
  function soloAfter(seat){ M.drawn=null; if(soloCount(seat)===0){ soloWin(seat); return; } hostRefresh(); soloFireAnim(); scheduleSoloAI(); }
  function scheduleSoloAI(){ clearSolo(); if(!M||phase!=='soloplay'||M.winnerSeat>=0||M.needColor) return;
    if(M.seats[M.turn].bot){ soloTimer=setTimeout(()=>{ soloTimer=null; soloAImove(); }, 1100); }
    else { soloTimer=setTimeout(()=>{ soloTimer=null; soloAutoPass(M.turn); }, 45000); } }
  function soloBotPlay(t, idx){ const hand=M.cards[t]; const card=hand.splice(idx,1)[0];
    if(card.color==='W'){ M.activeColor=SJ.SOLO.bestColor(hand); M.top=card; M.discard.push(card);   // joker : couleur choisie, puis on résout l'effet sans re-push
      let skip=false; if(card.val==='+4'){ skip=true; soloGive(soloStep(M.turn,1),4); } M.turn=soloStep(M.turn, skip?2:1);
      M.message=M.seats[t].name+' pose '+SJ.SOLO.label(card)+' ('+SJ.SOLO.CMAP[M.activeColor].name+')';
    } else { soloResolve(card); M.message=M.seats[t].name+' pose '+SJ.SOLO.label(card); }
    if(hand.length===0){ soloWin(t); return; } if(hand.length===1) M.message=M.seats[t].name+' crie UNO ! 🔔';
    hostRefresh(); soloFireAnim(); scheduleSoloAI(); }
  function soloAImove(){ if(!M||phase!=='soloplay'||M.winnerSeat>=0||M.needColor) return; const t=M.turn; if(!M.seats[t].bot) return; const hand=M.cards[t];
    let idx=-1; for(let i=0;i<hand.length;i++){ if(hand[i].color!=='W' && SJ.SOLO.playable(hand[i],M.activeColor,M.top)){ idx=i; break; } }
    if(idx<0){ for(let i=0;i<hand.length;i++){ if(hand[i].color==='W'){ idx=i; break; } } }   // sinon un joker
    if(idx>=0){ soloBotPlay(t, idx); return; }
    const c=soloDrawCard(); if(c){ hand.push(c); M._anim={seat:t,n:1}; if(SJ.SOLO.playable(c,M.activeColor,M.top)){ soloBotPlay(t, hand.length-1); return; } }
    M.message=M.seats[t].name+' pioche 🃏'; M.turn=soloStep(M.turn,1); hostRefresh(); soloFireAnim(); scheduleSoloAI(); }
  function soloAutoPass(seat){ if(!M||phase!=='soloplay'||M.turn!==seat||M.seats[seat].bot||M.winnerSeat>=0) return;
    if(M.drawn==null){ const c=soloDrawCard(); if(c){ M.cards[seat].push(c); M._anim={seat,n:1}; } } M.drawn=null; M.message=M.seats[seat].name+' (absent) passe 🃏'; M.turn=soloStep(M.turn,1); hostRefresh(); soloFireAnim(); scheduleSoloAI(); }
  function soloPlay(id, idx){ if(phase!=='soloplay'||!M||M.winnerSeat>=0||M.needColor) return;
    const seat=soloSeatOf(id); if(seat<0||seat!==M.turn) return; const hand=M.cards[seat]; if(!hand||idx<0||idx>=hand.length) return;
    const card=hand[idx]; if(!SJ.SOLO.playable(card,M.activeColor,M.top)) return;
    clearSolo(); M.drawn=null; hand.splice(idx,1);
    if(card.color==='W'){ M.top=card; M.needColor=true; M.needColorSeat=seat; M.pendingWild=card; M.message='Choisis une couleur 🌈'; hostRefresh(); return; }
    soloResolve(card); M.message='Tu poses '+SJ.SOLO.label(card);
    if(hand.length===1) M.message='Plus qu\'une carte — crie UNO ! 🔔';
    soloAfter(seat); }
  function soloDraw(id){ if(phase!=='soloplay'||!M||M.winnerSeat>=0||M.needColor) return; const seat=soloSeatOf(id); if(seat!==M.turn||M.seats[seat].bot||M.drawn!=null) return;
    clearSolo(); const c=soloDrawCard(); if(c){ M.cards[seat].push(c); M._anim={seat,n:1}; }
    if(c && SJ.SOLO.playable(c,M.activeColor,M.top)){ M.drawn=M.cards[seat].length-1; M.message='Tu as pioché — joue-la ou passe 👇'; hostRefresh(); soloFireAnim(); scheduleSoloAI(); }
    else { M.drawn=null; M.message='Tu pioches et passes 🃏'; M.turn=soloStep(M.turn,1); hostRefresh(); soloFireAnim(); scheduleSoloAI(); } }
  function soloPass(id){ if(phase!=='soloplay'||!M||M.winnerSeat>=0||M.needColor) return; const seat=soloSeatOf(id); if(seat!==M.turn||M.seats[seat].bot||M.drawn==null) return;
    clearSolo(); M.drawn=null; M.message='Tu passes ton tour ⏭️'; M.turn=soloStep(M.turn,1); hostRefresh(); scheduleSoloAI(); }
  function soloChooseColor(id, c){ if(phase!=='soloplay'||!M||!M.needColor) return; const seat=soloSeatOf(id); if(seat!==M.needColorSeat) return; if(SJ.SOLO.COLORS.indexOf(c)<0) return;
    clearSolo(); M.activeColor=c; const card=M.pendingWild; soloResolve(card); M.needColor=false; M.needColorSeat=-1; M.pendingWild=null;
    M.message='Joker → '+SJ.SOLO.CMAP[c].name; soloAfter(seat); }
  function soloCallSolo(id){ if(!M||M.winnerSeat>=0) return; const seat=soloSeatOf(id); if(seat<0) return;
    if(soloCount(seat)===1){ M.message='🔔 '+(M.seats[seat].id===myId?'Tu cries':M.seats[seat].name+' crie')+' UNO !'; hostRefresh(); } else U().toast('Crie UNO quand il te reste 1 carte 🙂'); }

  const SOLO_EMPTY='<span style="color:rgba(255,255,255,.7);font-weight:700">tu regardes la partie 👀</span>';
  function soloRingHTML(s){ return s.ring.map((pl,i)=>`<div data-soloseat="${i}" style="position:absolute;top:${pl.top};left:${pl.left};transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;width:84px">
      <div style="position:relative;display:flex;align-items:center;justify-content:center">
        <div style="width:20px;height:30px;border-radius:5px;border:2px solid #3B2D5E;background:#6A4BD6;position:absolute;transform:rotate(-14deg) translateX(-7px)"></div>
        <div style="width:20px;height:30px;border-radius:5px;border:2px solid #3B2D5E;background:#6A4BD6;position:absolute;transform:rotate(14deg) translateX(7px)"></div>
        <div style="width:54px;height:54px;border-radius:50%;border:4px solid ${pl.isTurn?'#FFC93C':'#3B2D5E'};background:${pl.isTurn?'#FFF1C9':'#fff'};display:flex;align-items:center;justify-content:center;z-index:1;${pl.isTurn?'animation:turnring 1s ease-in-out infinite;':''}">${U().ava({avatar:pl.avatar,emoji:pl.emoji,hat:pl.hat,hatPos:pl.hatPos,bg:pl.bg},44)}</div>
        ${pl.solo?'<div class="pop" style="position:absolute;top:-12px;right:-14px;background:#FFC93C;border:2px solid #3B2D5E;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:800;z-index:2">UNO!</div>':''}
      </div>
      <div style="font-size:14px;font-weight:800;color:${pl.isTurn?'#FFF1C9':'#fff'};text-shadow:0 1px 2px rgba(0,0,0,.4);max-width:84px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${pl.you?'Toi':esc(pl.name)}</div>
      <div style="background:rgba(0,0,0,.28);border:2px solid rgba(255,255,255,.4);border-radius:999px;padding:1px 11px;font-size:13px;font-weight:800;color:#fff">🂠 ${pl.count}</div></div>`).join(''); }
  function soloCardFace(c, ink, corner){ return `<div style="position:absolute;inset:13px 7px;border-radius:50% / 40%;background:rgba(255,255,255,.92)"></div><div style="position:relative;font-size:24px;font-weight:800;color:${ink}">${esc(c)}</div><div style="position:absolute;top:3px;left:5px;font-size:11px;font-weight:800;color:${corner}">${esc(c)}</div><div style="position:absolute;bottom:3px;right:5px;font-size:11px;font-weight:800;color:${corner}">${esc(c)}</div>`; }
  function soloHandHTML(s, deal){ if(!s.hand.length) return SOLO_EMPTY; return s.hand.map((c,k)=>`<button class="solocard" data-i="${c.i}" ${c.playable?'':'disabled'} style="position:relative;width:56px;height:84px;border-radius:12px;border:3px solid #3B2D5E;background:${c.bg};transform:translateY(${c.playable?'-12px':'0'});opacity:${s.myTurn?(c.playable?'1':'.55'):'.85'};box-shadow:${c.playable?'0 0 0 4px rgba(255,201,60,.55),0 9px 0 rgba(0,0,0,.3)':'0 5px 0 rgba(0,0,0,.3)'};cursor:${c.playable?'pointer':'default'};transition:transform .12s ease;font-family:inherit;flex:none${deal?`;animation:dealin .42s ease backwards;animation-delay:${k*55}ms`:''}">${soloCardFace(c.sym,c.ink,c.corner)}</button>`).join(''); }
  function soloTopHTML(s, land){ return `<div id="solo-discard" style="position:relative;width:64px;height:96px;border-radius:14px;border:3px solid #3B2D5E;background:${s.top.bg};box-shadow:0 6px 0 rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;transform:rotate(-5deg)${land?';animation:cardland .32s ease':''}"><div style="position:absolute;inset:15px 9px;border-radius:50% / 40%;background:rgba(255,255,255,.92)"></div><div style="position:relative;font-size:30px;font-weight:800;color:${s.top.ink}">${esc(s.top.sym)}</div><div style="position:absolute;top:5px;left:7px;font-size:13px;font-weight:800;color:${s.top.corner}">${esc(s.top.sym)}</div><div style="position:absolute;bottom:5px;right:7px;font-size:13px;font-weight:800;color:${s.top.corner}">${esc(s.top.sym)}</div></div>`; }
  function soloPassHTML(s){ return s.canPass ? '<button id="solo-pass" style="background:#FF8FA3;color:#3B2D5E;border:3px solid #3B2D5E;border-radius:14px;padding:7px 14px;font-size:15px;font-weight:800;box-shadow:0 5px 0 #D45D75;cursor:pointer;font-family:inherit">⏭️ Passer</button>' : ''; }
  function soloOverlaysHTML(s, iAmHost){
    const picker = s.needColor ? `<div style="position:absolute;inset:0;background:rgba(31,22,56,.72);display:flex;align-items:center;justify-content:center;z-index:5;border-radius:27px"><div style="background:#FFF8EC;border:3px solid #3B2D5E;border-radius:24px;padding:24px;display:flex;flex-direction:column;gap:14px;align-items:center;box-shadow:0 10px 0 rgba(0,0,0,.3)"><div style="font-size:22px;font-weight:800">🌈 Choisis une couleur</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${s.colorChoices.map(cc=>`<button class="solocol" data-c="${cc.c}" style="width:82px;height:82px;border-radius:18px;border:3px solid #3B2D5E;background:${cc.hex};box-shadow:0 6px 0 ${cc.shadow};cursor:pointer;font-size:16px;font-weight:800;color:${cc.ink};font-family:inherit">${esc(cc.name)}</button>`).join('')}</div></div></div>` : '';
    const winner = s.winner ? `<div style="position:absolute;inset:0;background:rgba(31,22,56,.8);display:flex;align-items:center;justify-content:center;z-index:6;border-radius:27px;padding:14px"><div class="pop" style="background:#fff;border:3px solid #3B2D5E;border-radius:28px;padding:26px;display:flex;flex-direction:column;gap:13px;align-items:center;text-align:center;box-shadow:0 12px 0 #FFC93C;max-width:330px"><div style="position:relative;width:104px;height:104px"><div style="position:absolute;inset:0;border-radius:50%;border:4px solid #3B2D5E;background:#FFF1C9;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 0 #E8C766;animation:floaty 1.6s ease-in-out infinite">${U().ava({avatar:s.winner.avatar,emoji:s.winner.emoji,hat:s.winner.hat,hatPos:s.winner.hatPos,bg:s.winner.bg},84)}</div><div class="pop" style="position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:36px">👑</div></div><div style="font-size:27px;font-weight:800">${s.winner.you?'Tu gagnes !':esc(s.winner.name)+' gagne !'}</div><div style="font-size:16px;font-weight:700;color:#7A6BA8">Plus une seule carte 🎉</div><span class="pill paper" style="font-size:16px;font-weight:800;box-shadow:0 4px 0 #E5C96A">+${s.winner.earned||0} 🪙</span>${iAmHost?'<button class="btn btn--coral block" id="soloagain">🔁 Rejouer</button>':'<div class="muted" style="font-size:13px;font-weight:700">en attente que l\'hôte relance…</div>'}</div></div>` : '';
    return picker+winner;
  }
  function soloFly(cardEl){ const disc=app().querySelector('#solo-discard'); if(!disc||!cardEl) return;
    const a=cardEl.getBoundingClientRect(), d=disc.getBoundingClientRect(); const clone=cardEl.cloneNode(true);
    clone.style.cssText='position:fixed;left:'+a.left+'px;top:'+a.top+'px;width:'+a.width+'px;height:'+a.height+'px;margin:0;z-index:300;transform:none;opacity:1;transition:transform .3s cubic-bezier(.4,0,.2,1),opacity .3s;pointer-events:none;border:3px solid #3B2D5E;border-radius:12px;background:'+(cardEl.style.background||'#fff');
    document.body.appendChild(clone); cardEl.style.visibility='hidden';
    const dx=(d.left+d.width/2)-(a.left+a.width/2), dy=(d.top+d.height/2)-(a.top+a.height/2);
    requestAnimationFrame(()=>{ clone.style.transform='translate('+dx+'px,'+dy+'px) rotate(-6deg) scale(1.05)'; clone.style.opacity='.25'; });
    setTimeout(()=>{ if(clone.parentNode) clone.remove(); }, 340); }
  // animation : n dos-de-carte volent de la pioche vers le joueur `seat` (sa main si c'est moi, sinon son jeton)
  function soloFlyDraw(seat, n){ const from=app().querySelector('#solodraw'); if(!from) return;
    const to=(seat===soloMySeat)?app().querySelector('#solo-hand'):app().querySelector('[data-soloseat="'+seat+'"]'); if(!to) return;
    const a=from.getBoundingClientRect(), b=to.getBoundingClientRect();
    const cx=a.left+a.width/2, cy=a.top+a.height/2, tx=b.left+b.width/2, ty=b.top+b.height/2, cnt=Math.min(n||1,5);
    for(let k=0;k<cnt;k++){ const card=document.createElement('div');
      card.style.cssText='position:fixed;left:'+(cx-28)+'px;top:'+(cy-42)+'px;width:56px;height:84px;border-radius:12px;border:3px solid #3B2D5E;background:linear-gradient(135deg,#6A4BD6,#9B5DE5);z-index:300;opacity:1;transition:transform .44s cubic-bezier(.3,.7,.3,1),opacity .44s;pointer-events:none;display:flex;align-items:center;justify-content:center';
      card.innerHTML='<div style="font-family:Caveat,cursive;font-size:18px;font-weight:700;color:#fff;transform:rotate(-12deg)">UNO</div>';
      document.body.appendChild(card);
      const delay=k*95, dx=tx-cx+(Math.random()*26-13), dy=ty-cy, rot=Math.random()*30-15;
      setTimeout(()=>{ requestAnimationFrame(()=>{ card.style.transform='translate('+dx+'px,'+dy+'px) rotate('+rot+'deg) scale(.7)'; card.style.opacity='.18'; }); }, delay);
      setTimeout(()=>{ if(card.parentNode) card.remove(); }, delay+480); }
    SJ.audio.tick&&SJ.audio.tick(); }
  function soloFireAnim(){ if(!M||!M._anim) return; const seat=M._anim.seat, n=M._anim.n; M._anim=null; if(net) net.broadcast({t:'unoanim',seat,n}); soloFlyDraw(seat,n); }
  function soloWire(v){ const s=v.solo;
    const dr=$('#solodraw'); if(dr) dr.onclick=()=>{ if(!s.drawEnabled) return; SJ.audio.click(); act('solodraw'); };
    app().querySelectorAll('.solocard').forEach(b=> b.onclick=()=>{ if(b.disabled) return; soloFly(b); SJ.audio.pop(); act('soloplay',{i:+b.dataset.i}); });
    app().querySelectorAll('.solocol').forEach(b=> b.onclick=()=>{ SJ.audio.click(); act('solocolor',{c:b.dataset.c}); });
    const sc=$('#solocall'); if(sc) sc.onclick=()=>{ SJ.audio.coin&&SJ.audio.coin(); act('solosolo'); };
    const ps=$('#solo-pass'); if(ps) ps.onclick=()=>{ SJ.audio.click(); act('solopass'); };
    const ag=$('#soloagain'); if(ag) ag.onclick=()=>{ SJ.audio.pop(); coinsClaimed=false; act('soloagain'); };
  }
  function soloClaim(s){ if(s.winner && !coinsClaimed){ SJ.store.addCoins(s.winner.earned||0); coinsClaimed=true; if(s.winner.you){ SJ.audio.win(); U().confetti(50); } else { SJ.audio.lose&&SJ.audio.lose(); } } }
  function patchSolo(v){ const s=v.solo; const q=sel=>app().querySelector(sel); soloMySeat=s.ring.findIndex(p=>p.you);   // mise à jour SANS tout reconstruire (plus de flash)
    const ac=q('#solo-active'); if(ac) ac.style.background=s.activeColorHex;
    const dir=q('#solo-dir'); if(dir) dir.textContent=s.dir===1?'↻':'↺';
    const rnd=q('#solo-round'); if(rnd) rnd.textContent='🎴 Manche '+s.round;
    const disc=q('#solo-discard'); if(disc) disc.outerHTML=soloTopHTML(s, true);   // la carte posée « atterrit »
    const ring=q('#solo-ring'); if(ring) ring.innerHTML=soloRingHTML(s);
    const msg=q('#solo-msg'); if(msg) msg.textContent=s.message||'';
    const hc=q('#solo-handcount'); if(hc) hc.textContent='Ta main · '+s.handCount+' carte'+(s.handCount>1?'s':'');
    const hand=q('#solo-hand'); if(hand) hand.innerHTML=soloHandHTML(s,false);
    const dg=q('#solo-drawglow'); if(dg) dg.style.boxShadow=s.drawEnabled?'0 0 0 4px rgba(255,201,60,.5)':'';
    const pw=q('#solo-passwrap'); if(pw) pw.innerHTML=soloPassHTML(s);
    const ov=q('#solo-overlays'); if(ov) ov.innerHTML=soloOverlaysHTML(s,v.iAmHost);
    soloWire(v); soloClaim(s);
  }
  function rSolo(v){ const s=v.solo; soloMySeat=s.ring.findIndex(p=>p.you);
    mMount(`<section class="screen"><div class="stage" style="max-width:560px">
      <div style="position:relative;background:radial-gradient(circle at 50% 42%,#2EC4B6 0%,#1E8B81 100%);border:3px solid #3B2D5E;border-radius:30px;box-shadow:0 10px 0 #176258;padding:clamp(14px,3vw,24px);display:flex;flex-direction:column;gap:13px;overflow:hidden;width:100%">
        <div class="row between wrap" style="gap:10px">
          <span id="solo-round" style="background:rgba(0,0,0,.22);border:2px solid rgba(255,255,255,.4);border-radius:999px;padding:4px 14px;font-size:15px;font-weight:800;color:#fff">🎴 Manche ${s.round}</span>
          <div class="row gap6"><span style="display:flex;align-items:center;gap:7px;background:#fff;border:3px solid #3B2D5E;border-radius:999px;padding:3px 12px 3px 7px;font-size:13px;font-weight:800;color:#7A6BA8">couleur<span id="solo-active" style="width:22px;height:22px;border-radius:50%;border:2px solid #3B2D5E;background:${s.activeColorHex}"></span></span><span id="solo-dir" style="background:#fff;border:3px solid #3B2D5E;border-radius:999px;padding:3px 12px;font-size:16px;font-weight:800">${s.dir===1?'↻':'↺'}</span></div>
        </div>
        <div style="position:relative;width:min(420px,86vw);height:min(420px,86vw);margin:2px auto 0">
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:14px">
            <div id="solodraw" style="display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer"><div style="position:relative;width:56px;height:84px"><div style="position:absolute;inset:0;transform:translate(4px,4px);border-radius:12px;border:3px solid #3B2D5E;background:#4A2E9E"></div><div id="solo-drawglow" style="position:absolute;inset:0;border-radius:12px;border:3px solid #3B2D5E;background:linear-gradient(135deg,#6A4BD6,#9B5DE5);display:flex;align-items:center;justify-content:center;${s.drawEnabled?'box-shadow:0 0 0 4px rgba(255,201,60,.5)':''}"><div style="font-family:Caveat,cursive;font-size:20px;font-weight:700;color:#fff;transform:rotate(-12deg)">UNO</div></div></div><div style="font-size:12px;font-weight:800;color:#fff">Pioche</div></div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:5px">${soloTopHTML(s,false)}<div style="font-size:12px;font-weight:800;color:#fff">Tas</div></div>
          </div>
          <div id="solo-ring">${soloRingHTML(s)}</div>
        </div>
        <div id="solo-msg" style="min-height:24px;text-align:center;font-size:16px;font-weight:800;color:#fff">${esc(s.message||'')}</div>
        <div style="background:rgba(0,0,0,.18);border:2px solid rgba(255,255,255,.3);border-radius:20px;padding:14px;display:flex;flex-direction:column;gap:10px">
          <div class="row between wrap" style="gap:10px"><span id="solo-handcount" style="font-size:16px;font-weight:800;color:#fff">Ta main · ${s.handCount} carte${s.handCount>1?'s':''}</span><div class="row gap6"><span id="solo-passwrap">${soloPassHTML(s)}</span><button id="solocall" style="display:flex;align-items:center;gap:6px;background:#FFC93C;color:#3B2D5E;border:3px solid #3B2D5E;border-radius:14px;padding:7px 16px;font-size:16px;font-weight:800;box-shadow:0 5px 0 #D9A416;cursor:pointer;font-family:inherit">🔔 UNO !</button></div></div>
          <div id="solo-hand" class="row" style="align-items:flex-end;justify-content:center;gap:7px;flex-wrap:wrap;min-height:90px">${soloHandHTML(s,true)}</div>
        </div>
        <div id="solo-overlays">${soloOverlaysHTML(s,v.iAmHost)}</div>
      </div></div></section>`);
    soloWire(v); soloClaim(s);
  }

  (function(){ const b=document.getElementById('gomenu'); if(b) b.onclick=()=>{ SJ.audio.click(); act('tosalon'); }; })();

  return { createHost, join, leave, act, quitToHome, _state:()=>({role,phase,players,code}) };
})();
