/* global React */
// =====================================================================
// GAME 1 — Cha-Pas-Possible 🦤
// Bidding / bluff: a question with a numeric answer is revealed.
// Players take turns naming a number STRICTLY HIGHER than the previous.
// Anyone can challenge "Cha-Pas-Possible!" → if last bid was too high,
// the bidder takes a Dodo card; otherwise the challenger takes one.
// Fewest dodos after 10 rounds wins.
// =====================================================================

const DODO_DECK = [
  { q: "Combien de fois par jour, en moyenne, un humain cligne-t-il des yeux ?", a: 14400 },
  { q: "Combien de cheveux a en moyenne un adulte sur la tête ?", a: 100000 },
  { q: "Combien de marches a la tour Eiffel jusqu'au sommet ?", a: 1665 },
  { q: "En combien de langues le mot 'mama' désigne-t-il une mère ?", a: 89 },
  { q: "Combien de pétales a en moyenne une marguerite ?", a: 34 },
  { q: "Combien de pas fait un adulte par jour en moyenne ?", a: 7000 },
  { q: "Combien de fois un enfant rit-il par jour en moyenne ?", a: 300 },
  { q: "Combien de bactéries vivent sur un téléphone portable ?", a: 25127 },
  { q: "Combien de mots prononce un humain par jour en moyenne ?", a: 16000 },
  { q: "Combien de fois bat un cœur de colibri par minute ?", a: 1260 },
  { q: "Combien d'os a un nouveau-né ?", a: 270 },
  { q: "Combien de fois la Terre tourne autour du Soleil par siècle ?", a: 100 },
];

function shuffleDeck(deck) {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, 10);
}

function Game1({ players, onExit }) {
  const [deck, setDeck] = React.useState(() => shuffleDeck(DODO_DECK));
  const [round, setRound] = React.useState(0);
  const [bids, setBids] = React.useState([]); // [{playerIdx, value}]
  const [turn, setTurn] = React.useState(0); // player index
  const [scores, setScores] = React.useState(players.map(() => 0));
  const [phase, setPhase] = React.useState("bidding"); // bidding | revealed | done
  const [reveal, setReveal] = React.useState(null); // {winnerIdx, message}
  const [bidInput, setBidInput] = React.useState("");
  const [log, setLog] = React.useState([]);

  const current = deck[round];
  const lastBid = bids[bids.length - 1];
  const youIdx = players.findIndex((p) => p.you);

  const pushLog = (entry) => setLog((l) => [...l.slice(-30), entry]);

  // AI turn: after a delay, bots either bid or challenge
  React.useEffect(() => {
    if (phase !== "bidding") return;
    if (turn === youIdx) return;
    const bot = players[turn];
    const t = setTimeout(() => {
      const lv = lastBid ? lastBid.value : 0;
      // Bot decides: if last bid > likely answer * 1.2, challenge
      const trueAns = current.a;
      const tooHigh = lv > trueAns * 1.1;
      const shouldChallenge = lastBid && (tooHigh ? Math.random() < 0.7 : Math.random() < 0.18);
      if (shouldChallenge) {
        challenge(turn);
      } else {
        // bid: slightly above last, sometimes much above (bluff)
        const baseMin = lv + 1;
        const bluffy = Math.random() < 0.25;
        const target = bluffy ? Math.floor(lv * 1.5 + 10) : Math.floor(lv + Math.max(1, lv * 0.18) + Math.random() * 8);
        const value = Math.max(baseMin, target);
        placeBid(turn, value);
      }
    }, 900 + Math.random() * 800);
    return () => clearTimeout(t);
  }, [turn, phase, bids.length]);

  const placeBid = (playerIdx, value) => {
    pushLog({ who: players[playerIdx].name, you: playerIdx === youIdx, text: `mise : ${value}` });
    setBids((b) => [...b, { playerIdx, value }]);
    setTurn((t) => (t + 1) % players.length);
  };

  const challenge = (challengerIdx) => {
    if (!lastBid) return;
    setPhase("revealed");
    const truth = current.a;
    const tooHigh = lastBid.value > truth;
    const loserIdx = tooHigh ? lastBid.playerIdx : challengerIdx;
    setScores((s) => {
      const next = [...s];
      next[loserIdx] += 1;
      return next;
    });
    setReveal({
      loserIdx,
      tooHigh,
      challengerIdx,
      bidderIdx: lastBid.playerIdx,
      bidValue: lastBid.value,
      truth,
    });
    pushLog({
      who: players[challengerIdx].name,
      you: challengerIdx === youIdx,
      text: `lance "Cha-pas-possible !"`,
    });
    pushLog({
      system: true,
      text: tooHigh
        ? `${players[lastBid.playerIdx].name} prend 1 🦤 (annonce trop haute)`
        : `${players[challengerIdx].name} prend 1 🦤 (annonce valide)`,
    });
  };

  const nextRound = () => {
    if (round + 1 >= deck.length) {
      setPhase("done");
      return;
    }
    setRound(round + 1);
    setBids([]);
    setReveal(null);
    setPhase("bidding");
    // challenger starts next round
    setTurn(reveal?.challengerIdx ?? 0);
    setBidInput("");
  };

  const submitYourBid = () => {
    const v = parseInt(bidInput, 10);
    if (isNaN(v)) return;
    const min = lastBid ? lastBid.value + 1 : 1;
    if (v < min) return;
    placeBid(youIdx, v);
    setBidInput("");
  };

  const lowest = Math.min(...scores);
  const winners = scores.map((s, i) => ({ i, s })).filter((x) => x.s === lowest);

  return (
    <div className="game-overlay fade-in">
      <div className="game-head">
        <div>
          <div className="game-title yellow">
            Cha-Pas-<span className="accent">Possible</span> 🦤
          </div>
          <div className="game-sub">manche {round + 1}/10 · moins de dodos = victoire</div>
        </div>
        <button className="btn xs ghost" onClick={onExit}>← Quitter la table</button>
      </div>

      <div className="game-body">
        <div className="game-main">
          {phase === "bidding" && (
            <>
              <div className="duck-card">
                <div className="badge">🦤</div>
                <div className="card-label">// question</div>
                <div className="card-q">{current.q}</div>
                <div className="card-foot">
                  <span>n°{round + 1}</span>
                  <span>cha-pas-possible</span>
                </div>
              </div>

              <div className="bid-stack">
                {bids.slice(-4).map((b, i, arr) => (
                  <div
                    key={i}
                    className={`bid-row ${i === arr.length - 1 ? "latest" : ""} ${b.playerIdx === youIdx ? "you" : ""}`}
                  >
                    <span>{players[b.playerIdx].name}</span>
                    <span className="num">{b.value}</span>
                  </div>
                ))}
                {bids.length === 0 && (
                  <div className="muted" style={{ fontSize: 12, fontFamily: "var(--font-mono)", textAlign: "center", padding: 12 }}>
                    Personne n'a encore misé…
                  </div>
                )}
              </div>

              {turn === youIdx ? (
                <div className="col" style={{ alignItems: "center", gap: 8 }}>
                  <div className="muted" style={{ fontSize: 12, fontFamily: "var(--font-mono)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                    À toi de jouer
                  </div>
                  <div className="bid-input-row">
                    <input
                      className="bid-input"
                      type="number"
                      value={bidInput}
                      onChange={(e) => setBidInput(e.target.value)}
                      placeholder={lastBid ? `> ${lastBid.value}` : "1+"}
                      autoFocus
                    />
                    <button className="btn acid sm" onClick={submitYourBid}>Miser</button>
                    <button
                      className="btn pink sm"
                      disabled={!lastBid}
                      onClick={() => challenge(youIdx)}
                    >
                      Cha-pas-possible !
                    </button>
                  </div>
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 13, fontFamily: "var(--font-mono)", letterSpacing: "0.15em" }}>
                  // {players[turn].name} réfléchit…
                </div>
              )}
            </>
          )}

          {phase === "revealed" && reveal && (
            <>
              <div className="duck-card revealed">
                <div className="badge">🦤</div>
                <div className="card-label">// la vraie réponse</div>
                <div className="card-answer">{reveal.truth.toLocaleString("fr-FR")}</div>
                <div className="card-foot">
                  <span>annoncé : {reveal.bidValue.toLocaleString("fr-FR")}</span>
                  <span>{reveal.tooHigh ? "TROP HAUT" : "VALIDE"}</span>
                </div>
              </div>
              <div style={{ fontSize: 18, fontFamily: "var(--font-mono)", textAlign: "center" }}>
                {reveal.tooHigh
                  ? <><span style={{ color: "var(--pink)" }}>{players[reveal.bidderIdx].name}</span> a abusé. 1 🦤 dans la besace.</>
                  : <><span style={{ color: "var(--pink)" }}>{players[reveal.challengerIdx].name}</span> a défié trop tôt. 1 🦤.</>
                }
              </div>
              <button className="btn acid" onClick={nextRound}>
                {round + 1 >= deck.length ? "Voir le classement" : "Manche suivante →"}
              </button>
            </>
          )}

          {phase === "done" && (
            <>
              <div className="game-title yellow center"><span className="accent">FIN</span> DE PARTIE</div>
              <div className="panel" style={{ minWidth: 380 }}>
                <div className="panel-title">// classement final</div>
                <div className="player-list">
                  {scores
                    .map((s, i) => ({ s, i }))
                    .sort((a, b) => a.s - b.s)
                    .map(({ s, i }) => (
                      <div key={i} className={`player-row ${i === youIdx ? "you" : ""}`}>
                        <span className="name">
                          {winners.some((w) => w.i === i) ? "👑 " : ""}{players[i].name}
                        </span>
                        <span className="score">{s} 🦤</span>
                      </div>
                    ))}
                </div>
              </div>
              <button className="btn acid" onClick={onExit}>Retour au squat</button>
            </>
          )}
        </div>

        <div className="game-side">
          <div className="panel">
            <div className="panel-title">// scores · dodos</div>
            <div className="player-list">
              {players.map((p, i) => (
                <div key={i} className={`player-row ${i === youIdx ? "you" : ""} ${turn === i && phase === "bidding" ? "turn" : ""}`}>
                  <span className="name">{p.name}</span>
                  <span className="score">{scores[i]} 🦤</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">// table parlante</div>
            <div className="log">
              {log.length === 0 && <div className="log-entry system">_ silence radio _</div>}
              {log.slice().reverse().slice(0, 12).map((l, i) => (
                <div key={i} className={`log-entry ${l.system ? "system" : ""} ${l.you ? "you" : ""}`}>
                  {l.system ? l.text : <><span className="who">{l.who}</span> {l.text}</>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Game1 });
