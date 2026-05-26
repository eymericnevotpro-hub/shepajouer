/* global React, VoxelCharacter */
// =====================================================================
// SQUAT — 2.5D isometric environment
// =====================================================================

const TILE_W = 96;
const TILE_H = 48;

// world is GRID_W x GRID_H, in tile units. (0,0) is back-top.
const GRID_W = 14;
const GRID_H = 10;

// project world (x,y) into screen offset relative to world center
function project(x, y) {
  return {
    sx: (x - y) * (TILE_W / 2),
    sy: (x + y) * (TILE_H / 2),
  };
}

// =====================================================================
// Props — drawn as SVG sprites at tile positions
// =====================================================================

function Syringe({ rot = 0 }) {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: `rotate(${rot}deg)` }}>
      <rect x="6" y="20" width="18" height="6" fill="#d8d8e0" stroke="#0a0a0c" strokeWidth="1.5" />
      <rect x="22" y="20" width="10" height="6" fill="#e0a8c8" stroke="#0a0a0c" strokeWidth="1.5" opacity="0.85" />
      <rect x="32" y="22" width="3" height="2" fill="#0a0a0c" />
      <rect x="35" y="22.5" width="6" height="1" fill="#9090a0" stroke="#0a0a0c" strokeWidth="0.5" />
      <rect x="14" y="14" width="3" height="6" fill="#0a0a0c" />
    </svg>
  );
}

function BeerCan({ tint = "#d9c44a" }) {
  return (
    <svg width="22" height="32" viewBox="0 0 22 32">
      <ellipse cx="11" cy="30" rx="9" ry="2" fill="rgba(0,0,0,0.4)" />
      <rect x="3" y="8" width="16" height="20" fill={tint} stroke="#0a0a0c" strokeWidth="1.5" />
      <rect x="3" y="14" width="16" height="2" fill="#0a0a0c" />
      <rect x="3" y="8" width="16" height="3" fill="#9a8830" stroke="#0a0a0c" strokeWidth="1.5" />
      <rect x="3" y="22" width="16" height="2" fill="#0a0a0c" opacity="0.3" />
    </svg>
  );
}

function PizzaBox() {
  return (
    <svg width="50" height="34" viewBox="0 0 50 34">
      <polygon points="6,18 44,18 48,28 2,28" fill="#c4895a" stroke="#0a0a0c" strokeWidth="1.5" />
      <polygon points="6,18 44,18 40,12 10,12" fill="#e6b88a" stroke="#0a0a0c" strokeWidth="1.5" />
      <text x="25" y="25" textAnchor="middle" fontFamily="DM Mono" fontSize="6" fill="#0a0a0c" fontWeight="700">PIZZA</text>
    </svg>
  );
}

function Mattress() {
  return (
    <svg width="120" height="60" viewBox="0 0 120 60">
      <polygon points="20,15 100,15 115,40 5,40" fill="#3a3530" stroke="#0a0a0c" strokeWidth="2" />
      <polygon points="20,15 100,15 105,25 15,25" fill="#5a504a" stroke="#0a0a0c" strokeWidth="2" />
      <rect x="35" y="22" width="6" height="3" fill="#0a0a0c" opacity="0.5" />
      <rect x="55" y="22" width="6" height="3" fill="#0a0a0c" opacity="0.5" />
      <rect x="75" y="22" width="6" height="3" fill="#0a0a0c" opacity="0.5" />
      <polygon points="40,18 70,18 75,28 35,28" fill="#a04030" stroke="#0a0a0c" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}

function Speaker() {
  return (
    <svg width="60" height="100" viewBox="0 0 60 100">
      <rect x="6" y="14" width="48" height="76" fill="#0a0a0c" stroke="#34343f" strokeWidth="2" />
      <rect x="6" y="14" width="48" height="6" fill="#1a1a1f" stroke="#34343f" strokeWidth="2" />
      <circle cx="30" cy="42" r="12" fill="#1a1a1f" stroke="#5a5a6a" strokeWidth="2" />
      <circle cx="30" cy="42" r="6" fill="#0a0a0c" />
      <circle cx="30" cy="72" r="8" fill="#1a1a1f" stroke="#5a5a6a" strokeWidth="2" />
      <circle cx="30" cy="72" r="3" fill="#0a0a0c" />
    </svg>
  );
}

// =====================================================================
// Walls + tags (graffiti)
// =====================================================================

function WallPanel({ side, length, tag }) {
  // side: "left" or "right"; length in tiles
  // Render the wall as a parallelogram-ish polygon, with graffiti on it
  const wallH = 220;
  const W = length * (TILE_W / 2);

  // Left wall faces toward camera from back-left → comes down-right.
  // We'll use SVG for crispness.
  const points = side === "left"
    ? `0,0 ${W},${TILE_H / 2 * length} ${W},${TILE_H / 2 * length + wallH} 0,${wallH}`
    : `0,${TILE_H / 2 * length} ${W},0 ${W},${wallH} 0,${TILE_H / 2 * length + wallH}`;

  return (
    <svg
      width={W}
      height={TILE_H / 2 * length + wallH}
      style={{ overflow: "visible" }}
    >
      <defs>
        <pattern id={`brick-${side}`} x="0" y="0" width="48" height="24" patternUnits="userSpaceOnUse">
          <rect width="48" height="24" fill="#2a2624" />
          <rect width="48" height="24" fill="#1f1c1a" opacity="0.0" />
          <line x1="0" y1="12" x2="48" y2="12" stroke="#0a0a0c" strokeWidth="1" opacity="0.6" />
          <line x1="0" y1="24" x2="48" y2="24" stroke="#0a0a0c" strokeWidth="1" opacity="0.6" />
          <line x1="24" y1="0" x2="24" y2="12" stroke="#0a0a0c" strokeWidth="1" opacity="0.6" />
          <line x1="0" y1="12" x2="0" y2="24" stroke="#0a0a0c" strokeWidth="1" opacity="0.6" />
          <line x1="48" y1="12" x2="48" y2="24" stroke="#0a0a0c" strokeWidth="1" opacity="0.6" />
        </pattern>
      </defs>
      <polygon points={points} fill={`url(#brick-${side})`} stroke="#0a0a0c" strokeWidth="2" />
      {/* damp/dirt overlay */}
      <polygon points={points} fill={side === "left" ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.15)"} />
      {/* graffiti */}
      {tag && (
        <text
          x={W * 0.5}
          y={wallH * 0.55}
          fill={tag.color}
          fontFamily="Bungee, sans-serif"
          fontSize={tag.size || 64}
          textAnchor="middle"
          transform={`rotate(${side === "left" ? -8 : 8} ${W * 0.5} ${wallH * 0.55})`}
          style={{
            paintOrder: "stroke",
            stroke: "#0a0a0c",
            strokeWidth: 4,
            letterSpacing: "2px",
          }}
        >
          {tag.text}
        </text>
      )}
    </svg>
  );
}

// =====================================================================
// Game table marker
// =====================================================================

function GameTable({ label, color, prompt, showPrompt }) {
  return (
    <div className="squat-zone-marker">
      {showPrompt && <div className="squat-zone-prompt">{prompt} · [E]</div>}
      <div className="squat-zone-table"></div>
      <div className={`squat-zone-label ${color || ""}`}>{label}</div>
    </div>
  );
}

// =====================================================================
// SQUAT SCENE
// =====================================================================

function SquatScene({ you, friends, settings, onEnterGame, density = "medium" }) {
  // Player position in tile units
  const [pos, setPos] = React.useState({ x: 7, y: 5 });
  const [keys, setKeys] = React.useState({});
  const posRef = React.useRef(pos);
  posRef.current = pos;
  const keysRef = React.useRef(keys);
  keysRef.current = keys;

  // friends state — random walkers
  const [friendPos, setFriendPos] = React.useState(() => {
    const seeds = [
      { x: 4, y: 6 }, { x: 10, y: 7 }, { x: 6, y: 8 },
    ];
    return friends.map((f, i) => ({ ...f, x: seeds[i]?.x || 5, y: seeds[i]?.y || 5, vx: 0, vy: 0 }));
  });

  // Movement loop
  React.useEffect(() => {
    const onDown = (e) => {
      const k = e.key.toLowerCase();
      if (["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright","e"].includes(k)) {
        e.preventDefault();
        setKeys((p) => ({ ...p, [k]: true }));
      }
    };
    const onUp = (e) => {
      const k = e.key.toLowerCase();
      setKeys((p) => ({ ...p, [k]: false }));
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  // Game tables in world coordinates
  const tables = [
    { id: "g1", x: 2.5, y: 2, label: "Cha-Pas-Possible 🦤", color: "", prompt: "Jouer" },
    { id: "g2", x: 7, y: 1.5, label: "Toz!", color: "pink", prompt: "Jouer" },
    { id: "g3", x: 11.5, y: 2.5, label: "Crachoir", color: "acid", prompt: "Jouer" },
  ];

  // Movement tick (60fps)
  React.useEffect(() => {
    let raf;
    let last = performance.now();
    const speed = 4.0; // tiles/sec

    const loop = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const k = keysRef.current;
      let dx = 0, dy = 0;
      if (k.w || k.arrowup) dy -= 1;
      if (k.s || k.arrowdown) dy += 1;
      if (k.a || k.arrowleft) dx -= 1;
      if (k.d || k.arrowright) dx += 1;
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        dx /= len; dy /= len;
        setPos((p) => {
          let nx = p.x + dx * speed * dt;
          let ny = p.y + dy * speed * dt;
          // clamp inside walkable area (avoid back wall row 0)
          nx = Math.max(0.6, Math.min(GRID_W - 0.6, nx));
          ny = Math.max(0.8, Math.min(GRID_H - 0.6, ny));
          return { x: nx, y: ny };
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Find nearest interactable
  const nearTable = React.useMemo(() => {
    let best = null, bestD = Infinity;
    tables.forEach((t) => {
      const d = Math.hypot(t.x - pos.x, (t.y + 0.8) - pos.y);
      if (d < 1.8 && d < bestD) { best = t; bestD = d; }
    });
    return best;
  }, [pos]);

  // Press E to enter game
  React.useEffect(() => {
    if (keys.e && nearTable) {
      onEnterGame(nearTable.id);
    }
  }, [keys.e, nearTable, onEnterGame]);

  // Random walk for friends
  React.useEffect(() => {
    const iv = setInterval(() => {
      setFriendPos((arr) => arr.map((f) => {
        let nx = f.x + (Math.random() - 0.5) * 0.4;
        let ny = f.y + (Math.random() - 0.5) * 0.4;
        nx = Math.max(2, Math.min(GRID_W - 2, nx));
        ny = Math.max(3, Math.min(GRID_H - 1.5, ny));
        return { ...f, x: nx, y: ny };
      }));
    }, 800);
    return () => clearInterval(iv);
  }, []);

  // Compute floor tiles
  const floor = [];
  for (let y = 1; y < GRID_H; y++) {
    for (let x = 1; x < GRID_W; x++) {
      floor.push({ x, y, dark: (x + y) % 2 === 0 });
    }
  }

  // Props placed manually
  const densityMul = density === "low" ? 0.4 : density === "high" ? 1.4 : 1;
  const allProps = [
    { type: "syringe", x: 5, y: 5.3, rot: 30 },
    { type: "syringe", x: 9, y: 6.2, rot: -45 },
    { type: "syringe", x: 4.2, y: 7.3, rot: 70 },
    { type: "syringe", x: 11, y: 5.7, rot: -20 },
    { type: "syringe", x: 6.5, y: 8.1, rot: 110 },
    { type: "syringe", x: 3, y: 6.6, rot: 50 },
    { type: "beer", x: 3.5, y: 5.2, tint: "#7ad94a" },
    { type: "beer", x: 8.7, y: 4.9, tint: "#d94a3a" },
    { type: "beer", x: 12.2, y: 7.4, tint: "#d9c44a" },
    { type: "beer", x: 5.2, y: 9.1, tint: "#3a8ad9" },
    { type: "beer", x: 10, y: 8.7 },
    { type: "pizza", x: 7.8, y: 8.4 },
    { type: "pizza", x: 2.4, y: 8.3 },
    { type: "mattress", x: 12, y: 8.5 },
    { type: "speaker", x: 1.6, y: 4 },
    { type: "speaker", x: 12.5, y: 4 },
  ];
  const propCount = Math.round(allProps.length * densityMul);
  const props = allProps.slice(0, Math.min(allProps.length, propCount));

  // World render center
  const worldStyle = {
    width: 1,
    height: 1,
    position: "relative",
  };

  // Sort all "depth-sorted" entities by y (then x) for painter's algorithm
  const entities = [
    ...props.map((p, i) => ({ ...p, kind: "prop", _id: `p${i}` })),
    ...tables.map((t) => ({ ...t, kind: "table", _id: t.id })),
    ...friendPos.map((f, i) => ({ ...f, kind: "friend", _id: `f${i}` })),
    { kind: "you", x: pos.x, y: pos.y, _id: "you" },
  ];
  entities.sort((a, b) => (a.y - b.y) || (a.x - b.x));

  return (
    <div className="screen squat">
      <div className="squat-world-wrap">
        <div className="squat-world" style={worldStyle}>
          {/* === Back walls (drawn behind everything) === */}
          {/* Left wall: along y=0, x from 1 to GRID_W */}
          <div style={{
            position: "absolute",
            ...(() => {
              const p = project(1, 0);
              return { left: p.sx, top: p.sy - 220 };
            })(),
            transformOrigin: "left top",
          }}>
            <WallPanel side="right" length={GRID_W - 1} tag={{ text: "SHEPA", color: "var(--pink)" }} />
          </div>
          <div style={{
            position: "absolute",
            ...(() => {
              const p = project(0, 1);
              return { left: p.sx - (GRID_H - 1) * TILE_W / 2, top: p.sy - 220 };
            })(),
            transformOrigin: "left top",
          }}>
            <WallPanel side="left" length={GRID_H - 1} tag={{ text: "JOUER", color: "var(--acid)" }} />
          </div>

          {/* === Floor tiles === */}
          {floor.map((t) => {
            const p = project(t.x, t.y);
            return (
              <div
                key={`f-${t.x}-${t.y}`}
                className={`squat-floor-tile ${t.dark ? "dark" : ""}`}
                style={{ left: p.sx, top: p.sy }}
              />
            );
          })}

          {/* === Painter's depth-sorted entities === */}
          {entities.map((e) => {
            const p = project(e.x, e.y);
            const style = { left: p.sx, top: p.sy };
            if (e.kind === "prop") {
              if (e.type === "syringe") return <div key={e._id} className="squat-prop" style={{...style, transform: "translate(-50%, -80%)"}}><Syringe rot={e.rot} /></div>;
              if (e.type === "beer") return <div key={e._id} className="squat-prop" style={style}><BeerCan tint={e.tint} /></div>;
              if (e.type === "pizza") return <div key={e._id} className="squat-prop" style={{...style, transform: "translate(-50%, -60%)"}}><PizzaBox /></div>;
              if (e.type === "mattress") return <div key={e._id} className="squat-prop" style={{...style, transform: "translate(-50%, -50%)"}}><Mattress /></div>;
              if (e.type === "speaker") return <div key={e._id} className="squat-prop" style={style}><Speaker /></div>;
              return null;
            }
            if (e.kind === "table") {
              return (
                <div key={e._id} style={{ position: "absolute", ...style }}>
                  <GameTable label={e.label} color={e.color} prompt={e.prompt} showPrompt={nearTable && nearTable.id === e.id} />
                </div>
              );
            }
            if (e.kind === "friend") {
              return (
                <div key={e._id} className="squat-character" style={style}>
                  <div className="name-tag">{e.name}</div>
                  <VoxelCharacter config={e.config} cell={5} />
                </div>
              );
            }
            if (e.kind === "you") {
              return (
                <div key="you" className="squat-character you" style={style}>
                  <div className="name-tag">{you.name}</div>
                  <VoxelCharacter config={you.config} cell={5} />
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>

      {/* HUD */}
      <div className="squat-hud">
        <div className="squat-hud-pill">SALON · <span className="v">{settings.code}</span></div>
        <div className="squat-hud-pill">{friends.length + 1} <span className="v">en ligne</span></div>
      </div>

      <div className="squat-roster">
        <div className="squat-roster-title">// dans le squat</div>
        <div className="squat-roster-row you">
          <span className="dot"></span><span>{you.name}</span>
        </div>
        {friendPos.map((f) => (
          <div key={f.id} className="squat-roster-row">
            <span className="dot"></span><span>{f.name}</span>
          </div>
        ))}
      </div>

      <div className="squat-controls">
        <div><span className="key">W</span><span className="key">A</span><span className="key">S</span><span className="key">D</span> bouger</div>
        <div><span className="key">E</span> interagir avec une table</div>
      </div>
    </div>
  );
}

Object.assign(window, { SquatScene });
