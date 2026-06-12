/* ============================================================
   GAME — moteur de partie (solo + bots, pass-and-play local)
   Boucle : proposeur → indice → devineurs → révélation → score
   ============================================================ */
window.SJ = window.SJ || {};

SJ.game = (function(){
  let M = null; // match courant

  function randn(){ // Box-Muller
    let u=0,v=0; while(!u) u=Math.random(); while(!v) v=Math.random();
    return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  }
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

  function newMatch({rounds, packs, host, bots}){
    const players = [];
    players.push(Object.assign({ id:'you', isYou:true, isBot:false, score:0, coins:0 }, host));
    bots.forEach((b,i)=> players.push({ id:'b'+i, isYou:false, isBot:true, name:b.name, avatar:{type:'emoji',value:b.emoji}, emoji:b.emoji, color:b.color, score:0, coins:0, sigma: 0.05 + Math.random()*0.09 }));
    players.forEach((p,i)=> p.color = p.color || SJ.PLAYER_COLORS[i % SJ.PLAYER_COLORS.length]);
    // pool de thèmes
    const pool = [];
    (packs && packs.length ? packs : ['classique']).forEach(id => (SJ.THEMES[id]||[]).forEach(t => pool.push(t)));
    M = { players, rounds, round:0, pool, used:[], proposerIdx:-1, theme:null, target:.5, clue:'', guesses:{}, ptsRound:{}, coinsTally:0 };
    return M;
  }

  function pickTheme(){
    let avail = M.pool.filter(t => !M.used.includes(t));
    if (!avail.length){ M.used = []; avail = M.pool.slice(); }
    const t = avail[Math.floor(Math.random()*avail.length)];
    M.used.push(t); return t;
  }

  function startRound(){
    M.round++;
    M.proposerIdx = (M.round - 1) % M.players.length;
    M.theme = pickTheme();
    M.target = clamp(0.12 + Math.random()*0.76, 0, 1); // cible aléatoire (après le thème)
    M.clue = '';
    M.guesses = {}; M.ptsRound = {};
    if (proposer().isBot) M.clue = SJ.botClue(M.theme, M.target);
    return M;
  }

  function proposer(){ return M.players[M.proposerIdx]; }
  function guessers(){ return M.players.filter((_,i)=> i !== M.proposerIdx); }

  function botGuesses(){
    guessers().forEach(p => { if (p.isBot && M.guesses[p.id]==null) M.guesses[p.id] = clamp(M.target + randn()*p.sigma, 0, 1); });
  }
  function setGuess(id, ratio){ M.guesses[id] = clamp(ratio,0,1); }

  function finalizeRound(){
    botGuesses();
    let best = 0;
    guessers().forEach(p => {
      const g = M.guesses[p.id]; const pts = (g==null) ? 0 : SJ.scoreFor(g, M.target);
      M.ptsRound[p.id] = pts; p.score += pts; best = Math.max(best, pts);
    });
    // le proposeur marque selon la réussite des autres
    const prop = proposer(); M.ptsRound[prop.id] = best; prop.score += best;
    // pièces du tour
    M.players.forEach(p => { const c = (M.ptsRound[p.id]||0)*3 + ((M.ptsRound[p.id]>=4)?5:0); p.coins += c; M.coinsTally += c; });
    return M.ptsRound;
  }

  function revealNeedles(){
    return guessers().map(p => ({ ratio: M.guesses[p.id]==null ? 0.5 : M.guesses[p.id], color:p.color, emoji:p.emoji || (p.avatar&&p.avatar.type==='emoji'?p.avatar.value:'•'), name:p.isYou?'Toi':p.name, pts:M.ptsRound[p.id], you:!!p.isYou }));
  }

  function ranking(){ return M.players.slice().sort((a,b)=> b.score - a.score); }

  return {
    newMatch, startRound, finalizeRound,
    state:()=>M,
    proposer, guessers, botGuesses, setGuess, revealNeedles, ranking,
    youAreProposer:()=> proposer().isYou,
    isOver:()=> M.round >= M.rounds,
    awardCoins(){ const total = M.coinsTally; SJ.store.addCoins(total); return total; },
  };
})();
