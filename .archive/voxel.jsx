/* global React */
// =====================================================================
// VOXEL — chunky pixel-art character renderer
// We use a 16x24 grid of "voxel" rects; parts are layered.
// =====================================================================

const VOXEL_PALETTES = {
  skin: ["#f5d6b4", "#e6b88a", "#c4895a", "#8a5a3a", "#5c3a26", "#3d2418"],
  hair: ["#1a1410", "#c69b50", "#e0c080", "#a04030", "#5a3aa0", "#30a050", "#e0e0e0", "#ff70a0"],
  shirt: ["#d94a3a", "#3a8ad9", "#7ad94a", "#d9c44a", "#a04ad9", "#d94aa0", "#202028", "#f1ece4"],
  pants: ["#2a2a35", "#3d3530", "#5a3a26", "#1f3a5c", "#5c2a4a", "#3a3a3a"],
};

const VOXEL_HEADS = ["round", "square", "tall"];
const VOXEL_HAIR = ["short", "spiky", "long", "bald", "cap", "mohawk"];
const VOXEL_ACC = ["none", "glasses", "mask", "cigar", "earring"];

// Rendering helpers ----------------------------------------------------

function VoxelPixel({ x, y, color, w = 1, h = 1, cell = 8 }) {
  return (
    <rect
      x={x * cell}
      y={y * cell}
      width={w * cell}
      height={h * cell}
      fill={color}
      shapeRendering="crispEdges"
    />
  );
}

// Shadow util: same shape, slightly darker
function shade(hex, amt = -20) {
  const c = hex.replace("#", "");
  const num = parseInt(c, 16);
  let r = (num >> 16) + amt;
  let g = ((num >> 8) & 0xff) + amt;
  let b = (num & 0xff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// =====================================================================
// VoxelCharacter — renders a character given a config
//   config: { skin, hair, shirt, pants, head, hairStyle, accessory }
//   size: pixel size of the cell
// =====================================================================

function VoxelCharacter({ config, cell = 8, scale = 1, facing = "south" }) {
  const c = config || {};
  const skin = c.skin || VOXEL_PALETTES.skin[1];
  const skinDark = shade(skin, -30);
  const hair = c.hair || VOXEL_PALETTES.hair[0];
  const hairDark = shade(hair, -25);
  const shirt = c.shirt || VOXEL_PALETTES.shirt[0];
  const shirtDark = shade(shirt, -30);
  const pants = c.pants || VOXEL_PALETTES.pants[0];
  const pantsDark = shade(pants, -25);
  const head = c.head || "round";
  const hairStyle = c.hairStyle || "short";
  const acc = c.accessory || "none";

  // Grid: 12 wide, 20 tall
  // Head: cols 2-9, rows 0-6
  // Body: cols 3-8, rows 7-12
  // Legs: cols 3-8, rows 13-18
  // Shoes: row 19

  const W = 12, H = 20;
  const cellPx = cell;

  return (
    <svg
      width={W * cellPx * scale}
      height={H * cellPx * scale}
      viewBox={`0 0 ${W * cellPx} ${H * cellPx}`}
      style={{ imageRendering: "pixelated", display: "block" }}
    >
      {/* shadow under feet */}
      <ellipse cx={W * cellPx / 2} cy={(H - 0.3) * cellPx} rx={3 * cellPx} ry={0.6 * cellPx} fill="rgba(0,0,0,0.35)" />

      {/* ============ LEGS ============ */}
      <VoxelPixel cell={cellPx} x={3} y={13} w={3} h={6} color={pants} />
      <VoxelPixel cell={cellPx} x={6} y={13} w={3} h={6} color={pants} />
      <VoxelPixel cell={cellPx} x={5} y={13} w={2} h={6} color={pantsDark} />
      {/* shoes */}
      <VoxelPixel cell={cellPx} x={3} y={18} w={3} h={1} color="#0a0a0c" />
      <VoxelPixel cell={cellPx} x={6} y={18} w={3} h={1} color="#0a0a0c" />

      {/* ============ BODY (shirt) ============ */}
      <VoxelPixel cell={cellPx} x={3} y={7} w={6} h={6} color={shirt} />
      {/* shirt shading */}
      <VoxelPixel cell={cellPx} x={3} y={12} w={6} h={1} color={shirtDark} />
      <VoxelPixel cell={cellPx} x={8} y={7} w={1} h={6} color={shirtDark} />
      {/* arms */}
      <VoxelPixel cell={cellPx} x={2} y={7} w={1} h={5} color={shirt} />
      <VoxelPixel cell={cellPx} x={9} y={7} w={1} h={5} color={shirtDark} />
      {/* hands */}
      <VoxelPixel cell={cellPx} x={2} y={12} w={1} h={1} color={skin} />
      <VoxelPixel cell={cellPx} x={9} y={12} w={1} h={1} color={skinDark} />

      {/* ============ NECK ============ */}
      <VoxelPixel cell={cellPx} x={5} y={6} w={2} h={1} color={skinDark} />

      {/* ============ HEAD ============ */}
      {head === "round" && (
        <>
          <VoxelPixel cell={cellPx} x={3} y={1} w={6} h={5} color={skin} />
          <VoxelPixel cell={cellPx} x={2} y={2} w={1} h={3} color={skin} />
          <VoxelPixel cell={cellPx} x={9} y={2} w={1} h={3} color={skinDark} />
          <VoxelPixel cell={cellPx} x={8} y={1} w={1} h={5} color={skinDark} />
        </>
      )}
      {head === "square" && (
        <>
          <VoxelPixel cell={cellPx} x={2} y={1} w={8} h={5} color={skin} />
          <VoxelPixel cell={cellPx} x={8} y={1} w={2} h={5} color={skinDark} />
        </>
      )}
      {head === "tall" && (
        <>
          <VoxelPixel cell={cellPx} x={3} y={0} w={6} h={6} color={skin} />
          <VoxelPixel cell={cellPx} x={8} y={0} w={1} h={6} color={skinDark} />
        </>
      )}

      {/* ============ FACE — eyes & mouth ============ */}
      <VoxelPixel cell={cellPx} x={4} y={3} w={1} h={1} color="#0a0a0c" />
      <VoxelPixel cell={cellPx} x={7} y={3} w={1} h={1} color="#0a0a0c" />
      <VoxelPixel cell={cellPx} x={5} y={5} w={2} h={0.5} color={shade(skin, -50)} />

      {/* ============ HAIR ============ */}
      {hairStyle === "short" && (
        <>
          <VoxelPixel cell={cellPx} x={3} y={1} w={6} h={2} color={hair} />
          <VoxelPixel cell={cellPx} x={2} y={2} w={1} h={1} color={hair} />
          <VoxelPixel cell={cellPx} x={9} y={2} w={1} h={1} color={hairDark} />
          <VoxelPixel cell={cellPx} x={3} y={1} w={1} h={1} color={hair} />
        </>
      )}
      {hairStyle === "spiky" && (
        <>
          <VoxelPixel cell={cellPx} x={3} y={1} w={6} h={1} color={hair} />
          <VoxelPixel cell={cellPx} x={3} y={0} w={1} h={1} color={hair} />
          <VoxelPixel cell={cellPx} x={5} y={0} w={1} h={1} color={hair} />
          <VoxelPixel cell={cellPx} x={7} y={0} w={1} h={1} color={hair} />
          <VoxelPixel cell={cellPx} x={2} y={2} w={1} h={2} color={hair} />
          <VoxelPixel cell={cellPx} x={9} y={2} w={1} h={2} color={hairDark} />
        </>
      )}
      {hairStyle === "long" && (
        <>
          <VoxelPixel cell={cellPx} x={3} y={1} w={6} h={2} color={hair} />
          <VoxelPixel cell={cellPx} x={2} y={2} w={1} h={6} color={hair} />
          <VoxelPixel cell={cellPx} x={9} y={2} w={1} h={6} color={hairDark} />
          <VoxelPixel cell={cellPx} x={2} y={7} w={2} h={1} color={hair} />
          <VoxelPixel cell={cellPx} x={8} y={7} w={2} h={1} color={hairDark} />
        </>
      )}
      {hairStyle === "bald" && null}
      {hairStyle === "cap" && (
        <>
          <VoxelPixel cell={cellPx} x={2} y={1} w={8} h={2} color={hair} />
          <VoxelPixel cell={cellPx} x={1} y={2} w={5} h={1} color={hair} />
          <VoxelPixel cell={cellPx} x={2} y={2} w={8} h={1} color={hairDark} />
        </>
      )}
      {hairStyle === "mohawk" && (
        <>
          <VoxelPixel cell={cellPx} x={5} y={0} w={2} h={3} color={hair} />
          <VoxelPixel cell={cellPx} x={4} y={0} w={1} h={1} color={hair} />
          <VoxelPixel cell={cellPx} x={7} y={0} w={1} h={1} color={hair} />
        </>
      )}

      {/* ============ ACCESSORIES ============ */}
      {acc === "glasses" && (
        <>
          <VoxelPixel cell={cellPx} x={4} y={3} w={1} h={1} color="#fff" />
          <VoxelPixel cell={cellPx} x={7} y={3} w={1} h={1} color="#fff" />
          <VoxelPixel cell={cellPx} x={4} y={3} w={1} h={1} color="#0a0a0c" />
          <VoxelPixel cell={cellPx} x={7} y={3} w={1} h={1} color="#0a0a0c" />
          <VoxelPixel cell={cellPx} x={3} y={3} w={1} h={1} color="#0a0a0c" />
          <VoxelPixel cell={cellPx} x={8} y={3} w={1} h={1} color="#0a0a0c" />
          <VoxelPixel cell={cellPx} x={5} y={3} w={2} h={1} color="#0a0a0c" />
        </>
      )}
      {acc === "mask" && (
        <VoxelPixel cell={cellPx} x={3} y={4} w={6} h={2} color="#e0e0e0" />
      )}
      {acc === "cigar" && (
        <>
          <VoxelPixel cell={cellPx} x={7} y={5} w={2} h={0.5} color="#3a2418" />
          <VoxelPixel cell={cellPx} x={9} y={5} w={0.5} h={0.5} color="#ff6a30" />
        </>
      )}
      {acc === "earring" && (
        <VoxelPixel cell={cellPx} x={8.5} y={4} w={0.5} h={0.5} color={c.earring || "#ffd700"} />
      )}
    </svg>
  );
}

// =====================================================================
// VoxelCharacterCreator — full creator panel
// =====================================================================

function CharacterCreator({ initial, onConfirm, onBack }) {
  const [config, setConfig] = React.useState(initial || {
    name: "Pseudo",
    skin: VOXEL_PALETTES.skin[1],
    hair: VOXEL_PALETTES.hair[0],
    shirt: VOXEL_PALETTES.shirt[0],
    pants: VOXEL_PALETTES.pants[0],
    head: "round",
    hairStyle: "short",
    accessory: "none",
  });

  const set = (k, v) => setConfig((p) => ({ ...p, [k]: v }));

  const Swatches = ({ palette, valueKey }) => (
    <div className="swatches">
      {palette.map((c) => (
        <button
          key={c}
          className={`swatch ${config[valueKey] === c ? "active" : ""}`}
          style={{ background: c }}
          onClick={() => set(valueKey, c)}
        />
      ))}
    </div>
  );

  const Options = ({ options, valueKey }) => (
    <div className="options">
      {options.map((o) => (
        <button
          key={o}
          className={`opt ${config[valueKey] === o ? "active" : ""}`}
          onClick={() => set(valueKey, o)}
        >
          {o}
        </button>
      ))}
    </div>
  );

  const randomize = () => {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    setConfig({
      ...config,
      skin: pick(VOXEL_PALETTES.skin),
      hair: pick(VOXEL_PALETTES.hair),
      shirt: pick(VOXEL_PALETTES.shirt),
      pants: pick(VOXEL_PALETTES.pants),
      head: pick(VOXEL_HEADS),
      hairStyle: pick(VOXEL_HAIR),
      accessory: pick(VOXEL_ACC),
    });
  };

  return (
    <div className="screen creator fade-in">
      <div className="creator-stage">
        <div className="creator-floor"></div>
        <div className="creator-character-wrap">
          <VoxelCharacter config={config} cell={14} />
        </div>
        <div className="creator-name">{config.name || "Pseudo"}</div>
      </div>

      <div className="creator-panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="creator-title">Customise<br/>ton perso.</div>
          <button className="btn xs ghost" onClick={onBack}>← Retour</button>
        </div>

        <div className="creator-section">
          <div className="creator-section-label">Pseudo</div>
          <input
            className="name-input"
            value={config.name}
            maxLength={14}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Ton blaze"
          />
        </div>

        <div className="creator-section">
          <div className="creator-section-label">Tête</div>
          <Options options={VOXEL_HEADS} valueKey="head" />
        </div>

        <div className="creator-section">
          <div className="creator-section-label">Coupe</div>
          <Options options={VOXEL_HAIR} valueKey="hairStyle" />
        </div>

        <div className="creator-section">
          <div className="creator-section-label">Carnation</div>
          <Swatches palette={VOXEL_PALETTES.skin} valueKey="skin" />
        </div>

        <div className="creator-section">
          <div className="creator-section-label">Cheveux</div>
          <Swatches palette={VOXEL_PALETTES.hair} valueKey="hair" />
        </div>

        <div className="creator-section">
          <div className="creator-section-label">Haut</div>
          <Swatches palette={VOXEL_PALETTES.shirt} valueKey="shirt" />
        </div>

        <div className="creator-section">
          <div className="creator-section-label">Bas</div>
          <Swatches palette={VOXEL_PALETTES.pants} valueKey="pants" />
        </div>

        <div className="creator-section">
          <div className="creator-section-label">Accessoire</div>
          <Options options={VOXEL_ACC} valueKey="accessory" />
        </div>

        <div className="row" style={{ marginTop: 8, gap: 8 }}>
          <button className="btn ghost sm" onClick={randomize} style={{ flex: 1 }}>🎲 Random</button>
          <button className="btn acid sm" onClick={() => onConfirm(config)} style={{ flex: 2 }}>
            Entrer dans le squat →
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { VoxelCharacter, CharacterCreator, VOXEL_PALETTES, VOXEL_HEADS, VOXEL_HAIR, VOXEL_ACC });
