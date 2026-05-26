/* global React */
// =====================================================================
// GAME 3 — CRACHOIR (original)
// A mot rare ou expression bizarre est posé. Chaque joueur invente une
// définition crédible. Toutes les défs (vraie + bluffs) sont mélangées.
// Chacun vote pour celle qu'il pense vraie.
//   +2 si tu trouves la vraie
//   +1 par vote qui tombe sur ton bluff
// 5 manches. Plus de points = victoire.
// =====================================================================

const CRACHOIR_DECK = [
  {
    word: "Crapaudine",
    real: "Petite pièce de métal sur laquelle pivote un gond de porte.",
    bots: [
      "Maladie de la peau qui rend les pieds verruqueux.",
      "Insulte affectueuse qu'on lance à un enfant turbulent.",
      "Plante grimpante à fleurs jaunâtres et odeur de marécage.",
    ],
  },
  {
    word: "Esbroufer",
    real: "Frimer, en faire des tonnes pour impressionner.",
    bots: [
      "Éternuer plusieurs fois de suite très bruyamment.",
      "Cuire un œuf en le faisant tournoyer dans la poêle.",
      "Glisser sur du verglas en battant des bras.",
    ],
  },
  {
    word: "Vétiver",
    real: "Plante tropicale dont la racine est utilisée en parfumerie.",
    bots: [
      "Verbe vieilli pour 'tergiverser', hésiter sans arrêt.",
      "Petit oiseau migrateur à plumage gris-bleu.",
      "Type de tissu rêche utilisé pour les sacs de jute.",
    ],
  },
  {
    word: "Tartouille",
    real: "Sauce épaisse et grasse, souvent mal réussie.",
    bots: [
      "Petit chien errant, dans le parler du Sud-Ouest.",
      "Mauvaise blague faite à un copain au réveil.",
      "Bruit que fait une grenouille en sautant dans l'eau.",
    ],
  },
  {
    word: "Cabotin",
    real: "Acteur qui en fait trop, ou personne qui joue la comédie.",
    bots: [
      "Petit cabanon de pêcheur sur une plage normande.",
      "Vin local servi tiède dans les bistrots auvergnats.",
      "Chapeau rond porté par les apprentis pâtissiers.",
    ],
  },
  {
    word: "Zinzolin",
    real: "Couleur d'un violet rougeâtre, entre lilas et bordeaux.",
    bots: [
      "Petit instrument à cordes du folklore corse.",
      "Personne agitée qui parle pour ne rien dire.",
      "Plat de pâtes farcies de la cuisine niçoise.",
    ],
  },
  {
    word: "Bredouille",
    real: "État de quelqu'un qui rentre les mains vides.",
    bots: [
      "Marais où l'on chasse le canard à la nuit tombée.",
      "Bouillie épaisse à base de châtaignes.",
      "Excuse mal préparée qu'on bafouille sous le stress.",
    ],
  },
];

function Game3({ players, onExit }) {
  const [round, setRound] = React.useState(0);
  const [phase, setPhase] = React.useState("write"); // write | vote | reveal | done
  const [scores, setScores] = React.useState(players.map(() => 0));
  const [yourBluff, setYourBluff] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [answers, setAnswers] = React.useState([]); // shuffled: { text, authorIdx, isReal }
  const [yourVote, setYourVote] = React.useState(null); // index in answers
  const [botVotes, setBotVotes] = React.useState({});

  const youIdx = players.findIndex((p) => p.you);
  const current = CRACHOIR_DECK[round % CRACHOIR_DECK.length];

  // When player submits or after delay, assemble answers
  const proceedToVote = (yourText) => {
    const text = yourText && yourText.trim() ? yourText.trim() : "[reste muet]";
    const list = [];
    // Real answer (authorIdx = -1 = "truth")
    list.push({ text: current.real, authorIdx: -1, isReal: true });
    // Bot fakes (we have up to 3 bots; pick first N from current.bots)
    const botPlayers = players.map((p, i) => ({ p, i })).filter((x) => !x.p.you);
    botPlayers.forEach(({ i }, idx) => {
      list.push({ text: current.bots[idx % current.bots.length], authorIdx: i, isReal: false });
    });
    // Your fake
    list.push({ text, authorIdx: youIdx, isReal: false });
    // Shuffle
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    setAnswers(list);
    setPhase("vote");
    // bots vote (weighted: mostly random, slight preference to pick non-real)
    const votes = {};
    players.forEach((p, i) => {
      if (p.you) return;
      // bots avoid voting for their own answer
      const valid = list.map((a, idx) => ({ a, idx })).filter((x) => x.a.authorIdx !== i);
      // 35% chance to pick the real one
      const realIdx = list.findIndex((a) => a.isReal);
      const pick = Math.random() < 0.35
        ? realIdx
        : valid[Math.floor(Math.random() * valid.length)].idx;
      votes[i] = pick;
    });
    setBotVotes(votes);
  };

  const submitBluff = () => {
    setSubmitted(true);
    setTimeout(() => proceedToVote(yourBluff), 600);
  };

  // Auto-submit if user delays > 25s (skip to vote)
  React.useEffect(() => {
    if (phase !== "write") return;
    const t = setTimeout(() => {
      if (!submitted) submitBluff();
    }, 25000);
    return () => clearTimeout(t);
  }, [phase, submitted, yourBluff]);

  const submitVote = (idx) => {
    setYourVote(idx);
    // Score
    const newScores = [...scores];
    // Your vote scoring
    if (answers[idx].isReal) newScores[youIdx] += 2;
    // Bots' votes scoring
    Object.entries(botVotes).forEach(([botIdxStr, voteIdx]) => {
      const botIdx = parseInt(botIdxStr, 10);
      if (answers[voteIdx].isReal) newScores[botIdx] += 2;
    });
    // Bluff scoring — count votes per author
    const allVotes = { [youIdx]: idx, ...Object.fromEntries(Object.entries(botVotes).map(([k, v]) => [parseInt(k, 10), v])) };
    Object.values(allVotes).forEach((voteIdx) => {
      const author = answers[voteIdx].authorIdx;
      if (author !== -1 && !answers[voteIdx].isReal) {
        newScores[author] += 1;
      }
    });
    setScores(newScores);
    setPhase("reveal");
  };

  const nextRound = () => {
    if (round + 1 >= 5) {
      setPhase("done");
      return;
    }
    setRound(round + 1);
    setYourBluff("");
    setSubmitted(false);
    setAnswers([]);
    setYourVote(null);
    setBotVotes({});
    setPhase("write");
  };

  const highest = Math.max(...scores);
  const winners = scores.map((s, i) => ({ s, i })).filter((x) => x.s === highest);

  // Tally votes per answer
  const tally = React.useMemo(() => {
    if (phase !== "reveal") return {};
    const counts = {};
    answers.forEach((_, i) => { counts[i] = []; });
    counts[yourVote]?.push(youIdx);
    Object.entries(botVotes).forEach(([botIdx, voteIdx]) => {
      counts[voteIdx]?.push(parseInt(botIdx, 10));
    });
    return counts;
  }, [phase, answers, yourVote, botVotes]);

  return (
    <div className="game-overlay fade-in">
      <div className="game-head">
        <div>
          <div className="game-title">
            CRA<span className="accent">CHOIR</span>
          </div>
          <div className="game-sub">manche {round + 1}/5 · bluff les autres · démasque la vraie déf</div>
        </div>
        <button className="btn xs ghost" onClick={onExit}>← Quitter la table</button>
      </div>

      <div className="game-body">
        <div className="game-main">
          <div className="crachoir-prompt">
            <div className="q">« {current.word} »</div>
            <div className="sub">// définis ce mot — ou démasque-le</div>
          </div>

          {phase === "write" && (
            <>
              <textarea
                className="crachoir-input"
                rows={3}
                placeholder="Invente une définition crédible…"
                value={yourBluff}
                onChange={(e) => setYourBluff(e.target.value)}
                disabled={submitted}
                style={{ resize: "none" }}
                autoFocus
              />
              <button
                className="btn acid"
                disabled={submitted || yourBluff.trim().length < 4}
                onClick={submitBluff}
              >
                {submitted ? "envoyé ✓ on attend les autres…" : "Soumettre mon bluff"}
              </button>
              <div className="muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase" }}>
                + de votes sur ton bluff = + de points
              </div>
            </>
          )}

          {phase === "vote" && (
            <>
              <div className="muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase" }}>
                // laquelle est la vraie ?
              </div>
              <div className="crachoir-answers">
                {answers.map((a, i) => (
                  <button
                    key={i}
                    className="crachoir-answer"
                    onClick={() => submitVote(i)}
                  >
                    <span style={{ flex: 1 }}>{a.text}</span>
                    <span className="author">{String.fromCharCode(65 + i)}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {phase === "reveal" && (
            <>
              <div className="crachoir-answers">
                {answers.map((a, i) => {
                  const voters = tally[i] || [];
                  return (
                    <div
                      key={i}
                      className={`crachoir-answer ${a.isReal ? "real" : "bluff"} ${i === yourVote ? "picked" : ""}`}
                      style={{ cursor: "default" }}
                    >
                      <span style={{ flex: 1 }}>
                        {a.text}
                        <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>
                          {a.isReal
                            ? "✓ VRAIE DÉFINITION"
                            : `bluff de ${a.authorIdx === youIdx ? "toi" : players[a.authorIdx]?.name}`}
                          {voters.length > 0 && (
                            <> · voté par {voters.map((v) => players[v].name).join(", ")}</>
                          )}
                        </div>
                      </span>
                      <span className="author">{String.fromCharCode(65 + i)}</span>
                    </div>
                  );
                })}
              </div>
              <button className="btn acid" onClick={nextRound}>
                {round + 1 >= 5 ? "Voir le classement" : "Manche suivante →"}
              </button>
            </>
          )}

          {phase === "done" && (
            <>
              <div className="game-title center"><span className="accent">FIN</span></div>
              <div className="panel" style={{ minWidth: 380 }}>
                <div className="panel-title">// classement final</div>
                <div className="player-list">
                  {scores
                    .map((s, i) => ({ s, i }))
                    .sort((a, b) => b.s - a.s)
                    .map(({ s, i }) => (
                      <div key={i} className={`player-row ${i === youIdx ? "you" : ""}`}>
                        <span className="name">
                          {winners.some((w) => w.i === i) ? "👑 " : ""}{players[i].name}
                        </span>
                        <span className="score">{s} pts</span>
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
            <div className="panel-title">// scores</div>
            <div className="player-list">
              {players.map((p, i) => (
                <div key={i} className={`player-row ${i === youIdx ? "you" : ""}`}>
                  <span className="name">{p.name}</span>
                  <span className="score">{scores[i]} pts</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="panel-title">// règles</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.7, color: "var(--ink-2)" }}>
              <div>1. invente une déf crédible</div>
              <div>2. vote pour la vraie</div>
              <div style={{ marginTop: 8, color: "var(--ink-3)" }}>+2 si tu trouves la vraie</div>
              <div style={{ color: "var(--ink-3)" }}>+1 par vote sur ton bluff</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Game3 });
