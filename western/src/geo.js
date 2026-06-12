// =============================================================
//  GEO — rounded-box helper for the soft "bouncy toy" look.
//  Falls back to a plain BoxGeometry if the addon can't be loaded.
// =============================================================
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// rbox(width, height, depth, radius, segments)
export function rbox(w, h, d, radius = 0.1, segments = 2) {
  const r = Math.max(0.001, Math.min(radius, Math.min(w, h, d) / 2 - 0.001));
  return new RoundedBoxGeometry(w, h, d, segments, r);
}

export { THREE };
