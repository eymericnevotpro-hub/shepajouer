// =============================================================
//  NET — PeerJS host/join + 20Hz position sync
//  Keeps the working invitation flow from the original app.
//  `Peer` is a UMD global loaded via <script> in index.html.
// =============================================================
/* global Peer */

const APP_PREFIX = "shepa-"; // namespace so peer IDs don't collide
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode() {
  let s = "";
  for (let i = 0; i < 5; i++) s += CHARS[(Math.random() * CHARS.length) | 0];
  return s;
}

export function createNet(handlers) {
  // handlers: { onStatus, onToast, onEnter, onPeerUpdate, onPeerJoin, onPeerLeave, getLocalState }
  let peer = null;
  let roomCode = null;
  const connections = new Map(); // peerId → DataConnection

  function broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const c of connections.values()) if (c.open) c.send(data);
  }
  function sendTo(c, msg) { if (c.open) c.send(JSON.stringify(msg)); }

  let lastSendT = 0;
  function maybeSendPosition(now) {
    if (connections.size === 0) return;
    if (now - lastSendT < 50) return; // 20Hz
    lastSendT = now;
    const s = handlers.getLocalState();
    broadcast({
      t: "pos",
      x: +s.x.toFixed(3), y: +s.y.toFixed(3), z: +s.z.toFixed(3),
      yaw: +s.yaw.toFixed(3), p: +(s.pitch || 0).toFixed(3),
      m: !!s.moving, a: !!s.airborne, r: !!s.running, c: !!s.crouching,
      s: Math.round((s.speaking || 0) * 100), rg: !!s.ragdoll,
      vx: +(s.vx || 0).toFixed(2), vz: +(s.vz || 0).toFixed(2),
      pt: !!s.pointing,
      ic: s.inCar || 0, // 0 none · 1 driver · 2 passenger
      ...(s.inCar === 1 ? { cx: +s.cx.toFixed(2), cz: +s.cz.toFixed(2), ch: +s.ch.toFixed(3) } : {}),
    });
  }

  function wireConnection(c, isHost) {
    c.on("open", () => {
      connections.set(c.peer, c);
      handlers.onToast(isHost ? "Un·e pote rejoint la ville" : "Connecté·e à l'hôte");
      handlers.onPeerJoin(c.peer);
      handlers.onPeerUpdate(playerCount());
      sendTo(c, { t: "hello" });
    });
    c.on("data", (raw) => {
      let msg;
      try { msg = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return; }
      if (!msg || !msg.t) return;
      if (msg.t === "pos") {
        handlers.onRemoteState(c.peer, {
          x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.p || 0,
          moving: !!msg.m, airborne: !!msg.a, running: !!msg.r, crouching: !!msg.c,
          speaking: (msg.s || 0) / 100, ragdoll: !!msg.rg,
          vx: msg.vx || 0, vz: msg.vz || 0, pointing: !!msg.pt,
          inCar: msg.ic || 0, cx: msg.cx, cz: msg.cz, ch: msg.ch,
        });
      } else if (msg.t === "act" && handlers.onEvent) {
        handlers.onEvent(c.peer, msg);
      }
    });
    c.on("close", () => {
      connections.delete(c.peer);
      handlers.onPeerLeave(c.peer);
      handlers.onPeerUpdate(playerCount());
      handlers.onToast("Un·e pote a quitté la ville");
    });
    c.on("error", (err) => console.warn("peer conn error", err));
  }

  function playerCount() { return 1 + connections.size; }

  function host() {
    const code = makeCode();
    handlers.onStatus("Création du salon…", "");
    peer = new Peer(APP_PREFIX + code);
    peer.on("open", () => { roomCode = code; handlers.onEnter(code); });
    peer.on("connection", (conn) => wireConnection(conn, true));
    peer.on("error", (err) => {
      console.warn("peer host error", err);
      handlers.onStatus("Erreur de salon. Réessaie.", "error");
    });
  }

  function join(code) {
    handlers.onStatus("Connexion en cours…", "");
    peer = new Peer();
    peer.on("open", () => {
      const conn = peer.connect(APP_PREFIX + code, { reliable: false });
      let opened = false;
      const timeout = setTimeout(() => {
        if (!opened) {
          handlers.onStatus("Aucun salon trouvé avec ce code.", "error");
          try { conn.close(); } catch {}
          try { peer.destroy(); } catch {}
          peer = null;
        }
      }, 6000);
      // Wire the connection NOW (before "open" fires) so wireConnection's own
      // "open" handler actually runs — otherwise the joiner never registers the
      // connection and never broadcasts its position (host can't see it).
      wireConnection(conn, false);
      conn.on("open", () => {
        opened = true;
        clearTimeout(timeout);
        roomCode = code;
        handlers.onEnter(code);
      });
      conn.on("error", (err) => {
        console.warn("join conn error", err);
        if (!opened) handlers.onStatus("Connexion échouée. Vérifie le code.", "error");
      });
    });
    peer.on("error", (err) => {
      console.warn("peer join error", err);
      if (err.type === "peer-unavailable") handlers.onStatus("Aucun salon trouvé avec ce code.", "error");
      else handlers.onStatus("Erreur réseau. Réessaie.", "error");
    });
  }

  function leave() {
    for (const c of connections.values()) try { c.close(); } catch {}
    connections.clear();
    if (peer) { try { peer.destroy(); } catch {} peer = null; }
    roomCode = null;
  }

  // broadcast a one-shot game event (punch, hit, …) to all peers
  function sendEvent(msg) { broadcast(Object.assign({ t: "act" }, msg)); }

  return {
    host, join, leave, maybeSendPosition, sendEvent,
    getCode: () => roomCode,
    getMyId: () => (peer ? peer.id : null),
    playerCount,
  };
}
