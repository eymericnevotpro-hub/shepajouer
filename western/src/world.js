// =============================================================
//  WORLD — procedural Western village
//  Returns { colliders, spawnPoints } for the player controller.
//  Colliders are axis-aligned boxes in XZ: { minX, maxX, minZ, maxZ }.
// =============================================================
import * as THREE from "three";
import { rbox } from "./geo.js";
import { buildMaterials } from "./textures.js";

// ---- shared textured materials (voxel/pixel-art palette) ----
const M = buildMaterials();

export function buildVillage(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const colliders = [];

  // -- helper: add a box mesh, optionally register it as a collider --
  // Plain BoxGeometry: tiled plank/adobe textures map cleanly per face.
  function box(w, h, d, mat, x, y, z, { collide = false, ry = 0 } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    if (collide && ry === 0) {
      colliders.push({
        minX: x - w / 2, maxX: x + w / 2,
        minZ: z - d / 2, maxZ: z + d / 2,
      });
    }
    return m;
  }

  // =============================================================
  //  GROUND — desert sand + dirt main street
  // =============================================================
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    M.sand
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.04; // sit below ground level so prop bases don't z-fight
  sand.receiveShadow = true;
  root.add(sand);

  // main street strip (runs along Z) — clearly above the sand to avoid z-fighting
  const street = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 90),
    M.road
  );
  street.rotation.x = -Math.PI / 2;
  street.position.y = 0.02;
  street.receiveShadow = true;
  root.add(street);

  // =============================================================
  //  BUILDING FACTORY — false-front Western storefront w/ porch
  // =============================================================
  // side: -1 = west (left, facing +X), +1 = east (right, facing -X)
  function storefront(z, side, opts) {
    const {
      w = 9, h = 5, depth = 8,
      wallMat = M.wood, roofMat = M.roofRed,
      falseFront = true, sign = "", signColor = 0x2a1a10,
      porch = true,
    } = opts;

    const faceX = side * 7; // street edge ~ x = ±7
    const cx = faceX + side * (depth / 2); // building centre pushed away from street
    const g = new THREE.Group();
    g.position.set(cx, 0, z);
    root.add(g);

    // main body — plain box so the tiled wall texture maps cleanly per face
    // (RoundedBoxGeometry's continuous UV unwrap stretches tiled textures).
    const bodyM = new THREE.Mesh(new THREE.BoxGeometry(depth, h, w), wallMat);
    bodyM.position.y = h / 2;
    bodyM.castShadow = true;
    bodyM.receiveShadow = true;
    g.add(bodyM);
    colliders.push({
      minX: cx - depth / 2, maxX: cx + depth / 2,
      minZ: z - w / 2, maxZ: z + w / 2,
    });

    // faceDir = local +X direction that points TOWARD the street (decorated face)
    const faceDir = -side;

    // sloped roof (leans down toward the street)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.4, 0.3, w + 0.4), roofMat);
    roof.position.y = h + 0.15;
    roof.rotation.z = faceDir * 0.12;
    roof.castShadow = true;
    g.add(roof);

    // false front (taller flat facade facing the street).
    // Pushed proud of the wall (outer face at depth/2 + 0.04) and slightly
    // narrower than the wall so NO face is coplanar with the body -> no z-fighting.
    if (falseFront) {
      const ff = new THREE.Mesh(new THREE.BoxGeometry(0.4, h + 1.4, w - 0.06), M.woodVert);
      ff.position.set(faceDir * (depth / 2 - 0.16), (h + 1.4) / 2, 0);
      ff.castShadow = true;
      g.add(ff);
    }

    // facade trim: door + windows, set clearly in FRONT of the false front
    const fz = faceDir * (depth / 2 + 0.2);
    // door
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 1.5), M.woodDark);
    door.position.set(fz, 1.2, 0);
    g.add(door);
    // windows (frame sits just behind the glass, both proud of the false front)
    for (const wz of [-w / 2 + 1.6, w / 2 - 1.6]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 1.6), M.glass);
      win.position.set(fz, 2.6, wz);
      g.add(win);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.7, 1.8), M.woodDark);
      frame.position.set(fz - faceDir * 0.05, 2.6, wz);
      g.add(frame);
    }

    // porch with posts + awning + plank floor
    if (porch) {
      const porchD = 2.6;
      const px = faceDir * (depth / 2 + porchD / 2);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(porchD, 0.18, w), M.plank);
      floor.position.set(px, 0.22, 0);
      floor.receiveShadow = true;
      g.add(floor);
      const awning = new THREE.Mesh(new THREE.BoxGeometry(porchD + 0.3, 0.16, w), M.woodDark);
      awning.position.set(px, 3.0, 0);
      awning.rotation.z = -faceDir * 0.06;
      awning.castShadow = true;
      g.add(awning);
      for (const pz of [-w / 2 + 0.4, w / 2 - 0.4]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3, 0.18), M.woodDark);
        post.position.set(faceDir * (depth / 2 + porchD - 0.3), 1.5, pz);
        post.castShadow = true;
        g.add(post);
      }
    }

    // hanging sign board
    if (sign) {
      makeSign(g, faceDir * (depth / 2 + 1.0), 3.7, 0, sign, signColor, w);
    }

    return g;
  }

  // text sign rendered to a canvas texture
  function makeSign(parent, x, y, z, text, bg, w) {
    const cvs = document.createElement("canvas");
    cvs.width = 512; cvs.height = 160;
    const ctx = cvs.getContext("2d");
    ctx.fillStyle = "#" + bg.toString(16).padStart(6, "0");
    ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = "#d9b84a";
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, 496, 144);
    ctx.fillStyle = "#e8d9a0";
    ctx.font = "bold 74px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 86);
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.0, Math.min(w - 1, 3.2)),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })
    );
    board.position.set(x, y, z);
    parent.add(board);
  }

  // =============================================================
  //  THE TOWN — storefronts down both sides of the street
  // =============================================================
  // West side (left), facing +X
  storefront(-30, -1, { sign: "SALOON", w: 12, h: 5.5, depth: 9, wallMat: M.wood, roofMat: M.roofRed, signColor: 0x5a1410 });
  storefront(-14, -1, { sign: "BANK", w: 9, h: 5, depth: 8, wallMat: M.adobe, roofMat: M.roofGreen, signColor: 0x1c3a2a });
  storefront(2,   -1, { sign: "STORE", w: 9, h: 4.6, depth: 7, wallMat: M.woodLight, roofMat: M.roofRed, signColor: 0x3a2a14 });
  storefront(18,  -1, { sign: "HOTEL", w: 10, h: 6, depth: 8, wallMat: M.wood, roofMat: M.roofGreen, signColor: 0x2a2418 });

  // East side (right), facing -X
  storefront(-30, 1, { sign: "SHERIFF", w: 9, h: 4.8, depth: 8, wallMat: M.adobe, roofMat: M.roofRed, signColor: 0x2a1c10 });
  storefront(-14, 1, { sign: "BARBER", w: 8, h: 4.6, depth: 7, wallMat: M.woodLight, roofMat: M.roofGreen, signColor: 0x1c2a3a });
  storefront(4,   1, { sign: "JAIL",   w: 8, h: 4.6, depth: 8, wallMat: M.adobe, roofMat: M.roofRed, signColor: 0x2a2020 });

  // =============================================================
  //  CHURCH — at the far north end, on-axis, with steeple
  // =============================================================
  buildChurch(-44, 0);

  function buildChurch(z, x) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    const bodyW = 8, bodyH = 6, bodyD = 11;
    const bodyM = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), M.white);
    bodyM.position.y = bodyH / 2;
    bodyM.castShadow = true; bodyM.receiveShadow = true;
    g.add(bodyM);
    colliders.push({ minX: x - bodyW / 2, maxX: x + bodyW / 2, minZ: z - bodyD / 2, maxZ: z + bodyD / 2 });
    // gable roof (two slabs)
    for (const s of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(bodyW / 1.7, 0.3, bodyD + 0.6), M.roofGreen);
      slab.position.set(s * 1.6, bodyH + 1.2, 0);
      slab.rotation.z = s * 0.7;
      slab.castShadow = true;
      g.add(slab);
    }
    // steeple at the street-facing end
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5, 2.4), M.white);
    tower.position.set(0, bodyH + 1.5, bodyD / 2 - 1);
    tower.castShadow = true;
    g.add(tower);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.7, 3, 4), M.roofGreen);
    spire.position.set(0, bodyH + 5.5, bodyD / 2 - 1);
    spire.rotation.y = Math.PI / 4;
    spire.castShadow = true;
    g.add(spire);
    // cross
    const cv = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), M.woodDark);
    cv.position.set(0, bodyH + 7.6, bodyD / 2 - 1);
    g.add(cv);
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), M.woodDark);
    ch.position.set(0, bodyH + 7.7, bodyD / 2 - 1);
    g.add(ch);
    // door
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 0.12), M.woodDark);
    door.position.set(0, 1.3, bodyD / 2 + 0.01);
    g.add(door);
  }

  // =============================================================
  //  CORRAL / STABLE — fenced area off to the east-south
  // =============================================================
  buildCorral(20, 30);
  function buildCorral(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    const size = 12;
    // fence rails around a square (with a gap as gate)
    function railLine(x1, z1, x2, z2) {
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      const posts = Math.max(2, Math.round(len / 2));
      for (let i = 0; i <= posts; i++) {
        const px = x1 + (dx * i) / posts;
        const pz = z1 + (dz * i) / posts;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.2, 0.16), M.woodDark);
        post.position.set(px, 0.6, pz);
        post.castShadow = true;
        g.add(post);
      }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, len), M.wood);
      rail.position.set((x1 + x2) / 2, 0.85, (z1 + z2) / 2);
      rail.lookAt(rail.position.x + dx, 0.85, rail.position.z + dz);
      g.add(rail);
      const rail2 = rail.clone(); rail2.position.y = 0.45; g.add(rail2);
    }
    const h = size / 2;
    railLine(-h, -h, h, -h);
    railLine(-h, h, h, h);
    railLine(-h, -h, -h, h);
    railLine(h, -h, h, h - 3); // leave a gate gap
    // a couple of hay bales
    for (const [hx, hz] of [[-3, 2], [2, -3], [3, 3]]) {
      const hay = new THREE.Mesh(rbox(1.6, 1.1, 1.1, 0.18), M.hay);
      hay.position.set(hx, 0.55, hz);
      hay.castShadow = true;
      g.add(hay);
    }
  }

  // =============================================================
  //  WATER TOWER — landmark by the south entrance
  // =============================================================
  buildWaterTower(-12, 36);
  function buildWaterTower(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    for (const [lx, lz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 6, 0.25), M.woodDark);
      leg.position.set(lx, 3, lz);
      leg.castShadow = true;
      g.add(leg);
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3.2, 14), M.wood);
    tank.position.y = 7.6;
    tank.castShadow = true;
    g.add(tank);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.4, 14), M.woodDark);
    cone.position.y = 9.9;
    cone.castShadow = true;
    g.add(cone);
    colliders.push({ minX: x - 1.7, maxX: x + 1.7, minZ: z - 1.7, maxZ: z + 1.7 });
  }

  // =============================================================
  //  PROPS — barrels, crates, troughs, hitching posts, wagon, cacti
  // =============================================================
  function barrel(x, z) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12), M.wood);
    b.position.set(x, 0.55, z);
    b.castShadow = true;
    root.add(b);
    for (const yy of [0.2, 0.9]) {
      const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.08, 12), M.metal);
      hoop.position.set(x, yy, z);
      root.add(hoop);
    }
    colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45 });
  }
  function crate(x, z, s = 0.9) {
    box(s, s, s, M.woodLight, x, s / 2, z, { collide: true });
  }
  function trough(x, z) {
    box(2.4, 0.7, 0.9, M.woodDark, x, 0.35, z, { collide: true });
    const water = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.7), M.water);
    water.position.set(x, 0.66, z);
    root.add(water);
  }
  function hitchingPost(x, z) {
    for (const dz of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), M.woodDark);
      p.position.set(x, 0.55, z + dz);
      p.castShadow = true;
      root.add(p);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.2), M.wood);
    rail.position.set(x, 0.95, z);
    root.add(rail);
  }
  function cactus(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 2.6, 8), M.cactus);
    trunk.position.y = 1.3;
    trunk.castShadow = true;
    g.add(trunk);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.0, 8), M.cactus);
      arm.position.set(s * 0.45, 1.4, 0);
      arm.castShadow = true;
      g.add(arm);
      const up = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.8, 8), M.cactus);
      up.position.set(s * 0.55, 1.9, 0);
      g.add(up);
    }
    colliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
  }
  function wagon(x, z, ry = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    root.add(g);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 1.6), M.wood);
    bed.position.y = 1.0; bed.castShadow = true; g.add(bed);
    for (const sx of [-1.2, 1.2]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 0.1), M.woodDark);
      side.position.set(0, 1.3, sx * 0.65); g.add(side);
    }
    for (const [wx, wz] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 12), M.woodDark);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.7, wz);
      wheel.castShadow = true;
      g.add(wheel);
    }
    colliders.push({ minX: x - 1.8, maxX: x + 1.8, minZ: z - 1.0, maxZ: z + 1.0 });
  }

  // scatter the street furniture
  barrel(-6.2, -26); barrel(-5.4, -25.2); crate(-6.4, -22);
  trough(-6.5, -12); hitchingPost(-6.3, -30); hitchingPost(6.3, -30);
  hitchingPost(6.3, -14); barrel(6.2, 2); crate(6.4, 5, 1.0);
  wagon(8.5, -2, 0.3); wagon(-9, 20, -0.4);
  cactus(11, -22); cactus(-13, 8); cactus(13, 12); cactus(-11, 28);
  cactus(15, -5); cactus(-15, -18);

  // gallows — small Western flavour at the south plaza
  (function gallows() {
    const x = 11, z = 34;
    const g = new THREE.Group(); g.position.set(x, 0, z); root.add(g);
    box(2.4, 0.4, 2.4, M.woodDark, 0, 0.2, 0); // platform (local)
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 0.2), M.woodDark); a.position.set(-0.9, 1.9, 0); g.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 0.2), M.woodDark); b.position.set(0.9, 1.9, 0); g.add(b);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.2), M.woodDark); top.position.set(0, 3.5, 0); g.add(top);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), M.dark); rope.position.set(0.4, 2.95, 0); g.add(rope);
  })();

  // =============================================================
  //  DISTANT MESAS — backdrop buttes around the perimeter
  // =============================================================
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2 + 0.3;
    const r = 120 + Math.random() * 50;
    const mx = Math.cos(ang) * r;
    const mz = Math.sin(ang) * r;
    const mw = 18 + Math.random() * 26;
    const mh = 14 + Math.random() * 26;
    const mesa = new THREE.Mesh(
      new THREE.CylinderGeometry(mw * 0.7, mw, mh, 6),
      M.mesa
    );
    mesa.position.set(mx, mh / 2 - 1, mz);
    mesa.rotation.y = Math.random() * Math.PI;
    root.add(mesa);
  }

  // small rocks scattered around town
  for (let i = 0; i < 24; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 18 + Math.random() * 40;
    const rx = Math.cos(ang) * r;
    const rz = Math.sin(ang) * r;
    const s = 0.6 + Math.random() * 1.6;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), M.rock);
    rock.position.set(rx, s * 0.4, rz);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    root.add(rock);
  }

  // spawn points along the street (south end, looking NORTH up the main street
  // toward the church). FPS camera faces -Z when yaw = 0.
  const spawnPoints = [
    { x: -3, z: 40, yaw: 0 },
    { x: 0, z: 41, yaw: 0 },
    { x: 3, z: 40, yaw: 0 },
    { x: -3, z: 44, yaw: 0 },
    { x: 0, z: 45, yaw: 0 },
    { x: 3, z: 44, yaw: 0 },
    { x: -5, z: 42, yaw: 0 },
    { x: 5, z: 42, yaw: 0 },
  ];

  return { colliders, spawnPoints, bounds: 70 };
}
