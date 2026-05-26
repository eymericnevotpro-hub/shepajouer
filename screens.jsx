/* global React */
// =====================================================================
// SCREENS — Home + Lobby
// =====================================================================

function HomeScreen({ onHost, onJoin }) {
  const [mode, setMode] = React.useState(null); // null | "host" | "join"
  const [code, setCode] = React.useState("");

  return (
    <div className="screen home fade-in">
      <div className="home-logo">
        <div className="line1">SHEPA</div>
        <div className="line2">JOUER</div>
      </div>
      <div className="home-sub">// party games · squat virtuel · entre potes</div>

      {mode === null && (
        <div className="home-actions fade-in">
          <button className="btn acid" onClick={() => setMode("host")}>+ Créer une partie</button>
          <button className="btn ghost" onClick={() => setMode("join")}>Rejoindre avec un code</button>
        </div>
      )}

      {mode === "host" && (
        <div className="home-actions fade-in">
          <div style={{ color: "var(--ink-2)", fontSize: 13, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.2em", textAlign: "center" }}>
            Génération d'un code privé…
          </div>
          <button className="btn acid" onClick={onHost}>OK, on y va</button>
          <button className="btn xs ghost" onClick={() => setMode(null)}>← Annuler</button>
        </div>
      )}

      {mode === "join" && (
        <div className="home-actions fade-in">
          <input
            className="input"
            placeholder="CODE PARTIE"
            value={code}
            maxLength={6}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          />
          <button className="btn acid" disabled={code.length < 4} onClick={() => onJoin(code)}>Rejoindre</button>
          <button className="btn xs ghost" onClick={() => setMode(null)}>← Annuler</button>
        </div>
      )}

      {/* tiny decorative voxel sprites in the corners */}
      <div style={{ position: "absolute", left: 40, bottom: 40, opacity: 0.45, transform: "scale(0.7)" }}>
        <VoxelCharacter config={{ skin: "#e6b88a", hair: "#ff70a0", hairStyle: "mohawk", shirt: "#d94aa0", pants: "#2a2a35", head: "round", accessory: "glasses" }} cell={10} />
      </div>
      <div style={{ position: "absolute", right: 40, bottom: 40, opacity: 0.45, transform: "scale(0.7) scaleX(-1)" }}>
        <VoxelCharacter config={{ skin: "#c4895a", hair: "#1a1410", hairStyle: "cap", shirt: "#7ad94a", pants: "#1f3a5c", head: "square", accessory: "cigar" }} cell={10} />
      </div>
    </div>
  );
}

// =====================================================================
// Lobby — show invite code + players, host can start
// =====================================================================

function LobbyScreen({ code, you, friends, onStart, onLeave }) {
  const [copied, setCopied] = React.useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="screen lobby fade-in">
      <div className="lobby-header">
        <span>SALON · {code}</span>
        <button className="btn xs ghost" onClick={onLeave}>← Quitter</button>
      </div>

      <div className="lobby-card">
        <div className="lobby-code-block">
          <div className="lobby-code-label">// invite tes potes avec ce code</div>
          <div className="lobby-code">{code}</div>
          <button className="btn sm acid" onClick={copy}>{copied ? "Copié ✓" : "Copier le code"}</button>
          <div className="muted" style={{ fontSize: 12, fontFamily: "var(--font-mono)", marginTop: 4 }}>
            shepa-jouer.io/p/{code.toLowerCase()}
          </div>
        </div>

        <div className="lobby-players">
          <div className="lobby-code-label">// joueurs présents ({friends.length + 1}/8)</div>
          <div className="lobby-player-row you">
            <span className="lobby-dot"></span>
            <span className="lobby-player-name">{you.name}</span>
            <span className="lobby-player-tag">toi · hôte</span>
          </div>
          {friends.map((f) => (
            <div key={f.id} className="lobby-player-row">
              <span className="lobby-dot"></span>
              <span className="lobby-player-name">{f.name}</span>
              <span className="lobby-player-tag">{f.tag || "prêt"}</span>
            </div>
          ))}
          {friends.length < 3 && (
            <div className="lobby-player-row" style={{ borderStyle: "dashed", color: "var(--ink-3)" }}>
              <span style={{ width: 8, height: 8 }}></span>
              <span className="lobby-player-name muted">en attente…</span>
              <span className="lobby-player-tag">_</span>
            </div>
          )}
        </div>
      </div>

      <div className="row" style={{ gap: 12 }}>
        <button className="btn acid" onClick={onStart}>Entrer dans le squat →</button>
      </div>
    </div>
  );
}

Object.assign(window, { HomeScreen, LobbyScreen });
