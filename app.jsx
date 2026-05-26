/* global React, ReactDOM, HomeScreen, LobbyScreen, CharacterCreator, SquatScene, Game1, Game2, Game3, TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakSlider, TweakSelect, VOXEL_PALETTES */
// =====================================================================
// APP — main state machine
//   home → lobby → creator → squat ↔ game{1,2,3}
// =====================================================================

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "medium",
  "botCount": 0
}/*EDITMODE-END*/;

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const BOT_POOL = [
  { name: "Naia", config: { skin: "#c4895a", hair: "#ff70a0", hairStyle: "mohawk", shirt: "#d94aa0", pants: "#2a2a35", head: "round", accessory: "earring" } },
  { name: "Sham", config: { skin: "#e6b88a", hair: "#1a1410", hairStyle: "cap", shirt: "#7ad94a", pants: "#1f3a5c", head: "square", accessory: "cigar" } },
  { name: "Léo",  config: { skin: "#8a5a3a", hair: "#c69b50", hairStyle: "long", shirt: "#3a8ad9", pants: "#3d3530", head: "tall",  accessory: "glasses" } },
  { name: "Mick", config: { skin: "#f5d6b4", hair: "#5a3aa0", hairStyle: "spiky", shirt: "#d9c44a", pants: "#5c2a4a", head: "round", accessory: "none" } },
  { name: "Rio",  config: { skin: "#c4895a", hair: "#e0e0e0", hairStyle: "long", shirt: "#202028", pants: "#3a3a3a", head: "tall", accessory: "mask" } },
];

function makeBots(count) {
  return BOT_POOL.slice(0, count).map((b, i) => ({ ...b, id: `bot-${i}` }));
}

function App() {
  const [stage, setStage] = React.useState("home");
  const [code, setCode] = React.useState("");
  const [you, setYou] = React.useState({
    name: "Pseudo",
    config: {
      name: "Pseudo",
      skin: VOXEL_PALETTES.skin[1],
      hair: VOXEL_PALETTES.hair[0],
      shirt: VOXEL_PALETTES.shirt[0],
      pants: VOXEL_PALETTES.pants[0],
      head: "round",
      hairStyle: "short",
      accessory: "none",
    },
  });

  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const friends = React.useMemo(() => makeBots(tweaks.botCount), [tweaks.botCount]);

  // Players list for any game: you first or interleaved
  const gamePlayers = React.useMemo(() => ([
    { name: you.name, you: true, config: you.config },
    ...friends.map((f) => ({ name: f.name, you: false, config: f.config })),
  ]), [you, friends]);

  // ----- handlers ------------------------------------------------------
  const handleHost = () => {
    setCode(makeCode());
    setStage("creator-host");
  };
  const handleJoin = (c) => {
    setCode(c);
    setStage("creator-join");
  };
  const handleConfirmCharacter = (cfg) => {
    setYou({ name: cfg.name || "Pseudo", config: cfg });
    setStage("squat");
  };
  const handleEnterSquat = () => setStage("squat");
  const handleLeave = () => setStage("home");

  const [activeGame, setActiveGame] = React.useState(null);
  const onEnterGame = (id) => setActiveGame(id);
  const onExitGame = () => setActiveGame(null);

  return (
    <div className="app">
      {stage === "home" && <HomeScreen onHost={handleHost} onJoin={handleJoin} />}

      {(stage === "creator-host" || stage === "creator-join") && (
        <CharacterCreator
          initial={you.config}
          onConfirm={handleConfirmCharacter}
          onBack={() => setStage("home")}
        />
      )}

      {stage === "lobby" && (
        <LobbyScreen
          code={code}
          you={you}
          friends={friends}
          onStart={handleEnterSquat}
          onLeave={handleLeave}
        />
      )}

      {stage === "squat" && (
        <>
          <SquatScene
            you={you}
            friends={friends}
            settings={{ code }}
            onEnterGame={onEnterGame}
            density={tweaks.density}
          />
          {activeGame === "g1" && <Game1 players={gamePlayers} onExit={onExitGame} />}
          {activeGame === "g2" && <Game2 players={gamePlayers} onExit={onExitGame} />}
          {activeGame === "g3" && <Game3 players={gamePlayers} onExit={onExitGame} />}
        </>
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Squat">
          <TweakRadio
            label="Densité"
            value={tweaks.density}
            options={[
              { label: "Soft", value: "low" },
              { label: "Trash", value: "medium" },
              { label: "Saturé", value: "high" },
            ]}
            onChange={(v) => setTweak("density", v)}
          />
          <TweakSlider
            label="Nb. joueurs"
            value={tweaks.botCount}
            min={1} max={5} step={1}
            onChange={(v) => setTweak("botCount", v)}
          />
        </TweakSection>

        <TweakSection label="Raccourcis">
          <button className="btn xs acid" onClick={() => setStage("home")}>→ Accueil</button>
          <button className="btn xs ghost" onClick={() => setStage("creator-host")}>→ Création perso</button>
          <button className="btn xs ghost" onClick={() => { setCode(code || makeCode()); setStage("lobby"); }}>→ Lobby</button>
          <button className="btn xs ghost" onClick={() => { setCode(code || makeCode()); setStage("squat"); }}>→ Squat</button>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            <button className="btn xs pink" onClick={() => { setCode(code || makeCode()); setStage("squat"); setActiveGame("g1"); }}>→ Cha-Pas-Possible</button>
            <button className="btn xs pink" onClick={() => { setCode(code || makeCode()); setStage("squat"); setActiveGame("g2"); }}>→ Toz!</button>
            <button className="btn xs pink" onClick={() => { setCode(code || makeCode()); setStage("squat"); setActiveGame("g3"); }}>→ Crachoir</button>
          </div>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
