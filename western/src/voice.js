// =============================================================
//  VOICE — microphone level detection (first brick of proximity chat).
//  Captures the mic, measures loudness each frame, exposes 0..1 level.
//  The level is sent over the network to drive remote players' mouths.
//  (Spatial audio playback comes later — this only detects "is talking".)
// =============================================================
export function createMic() {
  let stream = null;
  let ctx = null;
  let analyser = null;
  let data = null;
  let level = 0;
  let muted = false;
  let ready = false;

  async function start() {
    if (ready) return true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.5;
      src.connect(analyser);
      data = new Uint8Array(analyser.fftSize);
      ready = true;
      return true;
    } catch (e) {
      console.warn("Microphone unavailable:", e?.name || e);
      ready = false;
      return false;
    }
  }

  // call once per frame; updates `level` (0..1)
  function sample() {
    if (!ready || muted || !analyser) { level = 0; return 0; }
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const gated = Math.max(0, rms - 0.02);   // noise gate
    level = Math.min(1, gated * 8);           // gain to 0..1
    return level;
  }

  function getLevel() { return level; }
  function setMuted(m) { muted = !!m; if (muted) level = 0; }
  function isMuted() { return muted; }
  function isReady() { return ready; }
  function stop() {
    try { stream && stream.getTracks().forEach((t) => t.stop()); } catch {}
    try { ctx && ctx.close(); } catch {}
    analyser = null; data = null; ready = false; level = 0;
  }

  return { start, sample, getLevel, setMuted, isMuted, isReady, stop };
}
