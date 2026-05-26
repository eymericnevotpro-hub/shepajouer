/* global React */
// =====================================================================
// GAME 2 — TOZ!
// Reflex slap game. Cards flip onto the pile every ~1.4s.
// SLAP when:
//   - same number appears twice in a row (DOUBLE)
//   - a ★ star card appears (BONUS)
// DO NOT slap when:
//   - 💣 bomb card appears (penalty)
//   - any other card
// Fastest correct slap = +1. Wrong slap = -1. First to 7 wins.
// =====================================================================

function makeTozCard() {
  const r = Math.random();
  if (r < 0.07) return { kind: "bomb", label: "💣", rot: rand(-12, 12) };
  if (r < 0.18) return { kind: "star", label: "★", rot: rand(-12, 12) };
  return { kind: "num", label: String(1 + Math.floor(Math.random() * 9)), rot: rand(-12, 12) };
}
function rand(a, b) { return a + Math.random() * (b - a); }

function Game2({ players, onExit }) {
  const [pile, setPile] = React.useState(() => [makeTozCard()]);
  const [scores, setScores] = React.useState(players.map(() => 0));
  const [feedback, setFeedback] = React.useState(null); // { text, color }
  const [over, setOver] = React.useState(false);
  const [lockedFor, setLockedFor] = React.useState(null); // playerIdx who already slapped this card
  const [running, setRunning] = React.useState(true);
  const pileRef = React.useRef(pile);
  pileRef.current = pile;
  const scoresRef = React.useRef(scores);
  scoresRef.current = scores;
  const lockedRef = React.useRef(lockedFor);
  lockedRef.current = lockedFor;

  const youIdx = players.findIndex((p) => p.you);

  // Compute current slap state for the top card
  const currentState = React.useMemo(() => {
    if (pile.length === 0) return { slappable: false, reason: "" };
    const top = pile[pile.length - 1];
    const prev = pile[pile.length - 2];
    if (top.kind === "bomb") return { slappable: false, reason: "bomb", danger: true };
    if (top.kind === "star") return { slappable: true, reason: "star" };
    if (top.kind === "num" && prev && prev.kind === "num" && prev.label === top.label) {
      return { slappable: true, reason: "double" };
    }
    return { slappable: false, reason: "none" };
  }, [pile]);

  // Auto deal cards
  React.useEffect(() => {
    if (over || !running) return;
    const iv = setInterval(() => {
      setPile((p) => {
        const next = [...p.slice(-5), makeTozCard()];
        return next;
      });
      setLockedFor(null);
    }, 1700);
    return () => clearInterval(iv);
  }, [over, running]);

  // Bots try to slap
  React.useEffect(() => {
    if (!currentState.slappable) return;
    if (over) return;
    const bots = players.map((p, i) => ({ p, i })).filter((x) => !x.p.you);
    // each bot has a reaction time
    const timers = bots.map(({ p, i }) => {
      const reaction = 350 + Math.random() * 900;
      return setTimeout(() => {
        if (lockedRef.current !== null) return;
        // bots also occasionally false-slap on bombs (handled in separate effect below)
        slap(i, true);
      }, reaction);
    });
    return () => timers.forEach(clearTimeout);
  }, [currentState.slappable, pile]);

  // Bots may MIS-slap on bombs sometimes
  React.useEffect(() => {
    if (currentState.reason !== "bomb") return;
    if (over) return;
    const bots = players.map((p, i) => ({ p, i })).filter((x) => !x.p.you);
    const timers = bots.map(({ i }) => {
      if (Math.random() < 0.15) {
        return setTimeout(() => {
          if (lockedRef.current !== null) return;
          slap(i, true);
        }, 400 + Math.random() * 600);
      }
      return null;
    }).filter(Boolean);
    return () => timers.forEach(clearTimeout);
  }, [pile]);

  const slap = (playerIdx, isBot = false) => {
    if (over) return;
    if (lockedRef.current !== null) return;
    setLockedFor(playerIdx);
    const valid = currentState.slappable;
    setScores((s) => {
      const next = [...s];
      next[playerIdx] += valid ? 1 : -1;
      // win check
      if (next[playerIdx] >= 7) { setOver(true); }
      return next;
    });
    setFeedback({
      who: players[playerIdx].name,
      text: valid ? "TOZ!" : (currentState.reason === "bomb" ? "BOOM 💥" : "RATÉ"),
      good: valid,
    });
    setTimeout(() => setFeedback(null), 600);
  };

  // Keyboard listener: space = slap for you
  React.useEffect(() => {
    const onDown = (e) => {
      if (e.key === " ") { e.preventDefault(); slap(youIdx); }
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, [pile, over]);

  const winnerIdx = scores.findIndex((s) => s >= 7);

  return (
    <div className="game-overlay fade-in">
      <div className="game-head">
        <div>
          <div className="game-title pink">
            T<span className="accent">O</span>Z<span className="accent">!</span>
          </div>
          <div className="game-sub">slap les doubles & étoiles · évite les bombes · 7 pts pour gagner</div>
        </div>
        <button className="btn xs ghost" onClick={onExit}>← Quitter la table</button>
      </div>

      <div className="game-body">
        <div className="game-main">
          <div className="toz-stage">
            <div className="toz-pile">
              {pile.slice(-4).map((c, i, arr) => {
                const isTop = i === arr.length - 1;
                return (
                  <div
                    key={`${c.label}-${i}-${pile.length}`}
                    className={`toz-card ${c.kind === "bomb" ? "bomb" : ""} ${c.kind === "star" ? "bonus" : ""} ${isTop ? "flipped-top" : ""}`}
                    style={{
                      transform: `translate(${(i - arr.length + 1) * 4}px, ${(i - arr.length + 1) * -4}px) rotate(${c.rot}deg)`,
                      zIndex: i,
                      opacity: isTop ? 1 : 0.7,
                    }}
                  >
                    {c.label}
                  </div>
                );
              })}
            </div>
            {feedback && (
              <div className="toz-feedback" style={{ color: feedback.good ? "var(--acid)" : "var(--red)" }}>
                {feedback.text}
              </div>
            )}
          </div>

          {!over && (
            <>
              <button
                className="toz-slap-btn"
                disabled={lockedFor !== null}
                onClick={() => slap(youIdx)}
              >
                SLAP! [espace]
              </button>
              <div className="muted" style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", textAlign: "center" }}>
                slap si <span style={{ color: "var(--acid)" }}>★</span> ou nombre doublé · pas si <span style={{ color: "var(--red)" }}>💣</span>
              </div>
            </>
          )}

          {over && winnerIdx !== -1 && (
            <>
              <div className="game-title pink center"><span className="accent">{players[winnerIdx].name}</span> remporte la manche!</div>
              <button className="btn acid" onClick={onExit}>Retour au squat</button>
            </>
          )}
        </div>

        <div className="game-side">
          <div className="panel">
            <div className="panel-title">// scores</div>
            <div className="player-list">
              {players.map((p, i) => (
                <div key={i} className={`player-row ${i === youIdx ? "you" : ""}`}>
                  <span className="name">{p.name}</span>
                  <span className="score">{scores[i]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">// règles express</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.7, color: "var(--ink-2)" }}>
              <div><span className="toz-tile" style={{ width: 24, height: 24, fontSize: 14 }}>7</span> + <span className="toz-tile" style={{ width: 24, height: 24, fontSize: 14 }}>7</span> = SLAP</div>
              <div style={{ marginTop: 6 }}><span className="toz-tile" style={{ width: 24, height: 24, fontSize: 14, background: "var(--acid)", color: "#000" }}>★</span> = SLAP</div>
              <div style={{ marginTop: 6 }}><span className="toz-tile" style={{ width: 24, height: 24, fontSize: 14, background: "var(--red)", color: "#fff" }}>💣</span> = TOUCHE PAS</div>
              <div style={{ marginTop: 10, color: "var(--ink-3)" }}>correct +1 · raté −1 · ★→7pts</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Game2 });
