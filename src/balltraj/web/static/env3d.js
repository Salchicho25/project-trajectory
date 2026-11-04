// Décors de la vue 3D : un terrain réel par situation, tribunes avec public, arbres, nuages.
// Aucune physique ici. Repère du simulateur (x avant, y gauche, z haut) converti en three.js
// par (x, y, z) -> (x, z, -y). Les cotes sont celles des règlements (terrain de foot, panier, etc.).

import * as THREE from "three";

const P = (x, y, z) => new THREE.Vector3(x, z, -y);
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });

// générateur pseudo-aléatoire à graine : le décor est identique à chaque rechargement
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (c) => `#${c.getHexString(THREE.SRGBColorSpace)}`;

// ---------------------------------------------------------------- textures
export function stripes(light, dark, band, length, alongZ = false) {
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 8;
  const g = cv.getContext("2d");
  g.fillStyle = hex(light); g.fillRect(0, 0, 128, 8);
  g.fillStyle = hex(dark); g.fillRect(128, 0, 128, 8);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(length / (2 * band), 1);
  tex.anisotropy = 8;
  tex.magFilter = THREE.NearestFilter;
  if (alongZ) { tex.rotation = Math.PI / 2; tex.center.set(0.5, 0.5); }
  return tex;
}

function parquet(kit) {
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 256;
  const g = cv.getContext("2d");
  const a = kit.gold.clone().lerp(kit.ink, 0.30), b = kit.gold.clone().lerp(kit.ink, 0.40);
  const r = rng(11);
  for (let i = 0; i < 12; i++) {                       // 12 lames de 0,12 m
    g.fillStyle = hex(a.clone().lerp(b, r() * 0.9));
    g.fillRect(0, (i * 256) / 12, 256, 256 / 12);
    g.fillStyle = hex(kit.ink); g.globalAlpha = 0.25;
    g.fillRect(0, (i * 256) / 12, 256, 1.5);
    g.globalAlpha = 1;
    for (let j = 0; j < 3; j++) { g.fillStyle = hex(kit.ink); g.globalAlpha = 0.18; g.fillRect(r() * 256, (i * 256) / 12, 1.5, 256 / 12); g.globalAlpha = 1; }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28 / 4, 15 / 1.44);
  tex.anisotropy = 8;
  return tex;
}

// ---------------------------------------------------------------- outils de dessin au sol
class Painter {
  constructor(group, kit) {
    this.g = group;
    this.chalk = new THREE.MeshStandardMaterial({ color: kit.paper, roughness: 0.6, emissive: kit.paper, emissiveIntensity: 0.12 });
  }
  holder(x, y, rot, lift) {
    const h = new THREE.Group();
    h.position.set(x, lift, -y);
    h.rotation.y = rot;
    this.g.add(h);
    return h;
  }
  plane(cx, cy, sx, sy, material, rot = 0, lift = 0.006) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), material);
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
    this.holder(cx, cy, rot, lift).add(m);
    return m;
  }
  disc(cx, cy, r, material, lift = 0.008, sy = 1) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 64), material);
    m.rotation.x = -Math.PI / 2; m.scale.y = sy; m.receiveShadow = true;
    this.holder(cx, cy, 0, lift).add(m);
    return m;
  }
  line(x0, y0, x1, y1, w = 0.12, material = this.chalk) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), material);
    m.rotation.x = -Math.PI / 2; m.position.x = len / 2; m.receiveShadow = true;
    this.holder(x0, y0, Math.atan2(y1 - y0, x1 - x0), 0.012).add(m);
  }
  rect(x0, y0, x1, y1, w = 0.12) {
    this.line(x0, y0, x1, y0, w); this.line(x1, y0, x1, y1, w);
    this.line(x1, y1, x0, y1, w); this.line(x0, y1, x0, y0, w);
  }
  arc(cx, cy, r, a0, len, w = 0.12) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - w / 2, r + w / 2, 72, 1, a0, len), this.chalk);
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
    this.holder(cx, cy, 0, 0.012).add(m);
  }
  spot(cx, cy, r = 0.15) { this.disc(cx, cy, r, this.chalk, 0.013); }
}

// ---------------------------------------------------------------- tribunes avec public
function stand(g, kit, { cx, cy, away, len, rows, seed = 1, gap = 2 }) {
  const grp = new THREE.Group();
  grp.position.set(cx, 0, -cy);
  grp.rotation.y = away;                     // axe local +X = direction qui s'éloigne du terrain
  const rowD = 0.85, rowH = 0.42;
  const concrete = mat(kit.rail.clone().lerp(kit.ink, 0.2), { roughness: 0.95 });
  for (let r = 0; r < rows; r++) {
    const h = rowH * (r + 1);
    const b = new THREE.Mesh(new THREE.BoxGeometry(rowD, h, len), concrete);
    b.position.set(gap + r * rowD + rowD / 2, h / 2, 0);
    b.castShadow = b.receiveShadow = true;
    grp.add(b);
  }
  const barrier = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, len), mat(kit.rail.clone().lerp(kit.green, 0.3)));
  barrier.position.set(gap - 0.4, 0.45, 0);
  barrier.castShadow = true;
  grp.add(barrier);

  const rand = rng(seed);
  const palette = [kit.paper, kit.gold, kit.traj2, kit.green, kit.turfB, kit.rail.clone().lerp(kit.paper, 0.45), kit.traj];
  const per = Math.max(1, Math.floor(len / 0.55));
  const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.62, 0.3), mat(kit.paper, { roughness: 0.8 }), per * rows);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < per; i++) {
      if (rand() < 0.08) { s.set(0, 0, 0); } else { s.set(1, 0.85 + rand() * 0.3, 1); }
      m4.compose(
        new THREE.Vector3(gap + r * rowD + rowD * 0.45, rowH * (r + 1) + 0.31 * s.y, -len / 2 + ((i + 0.5 + (rand() - 0.5) * 0.4) * len) / per),
        q, s,
      );
      crowd.setMatrixAt(n, m4);
      crowd.setColorAt(n, palette[Math.floor(rand() * palette.length)]);
      n++;
    }
  }
  crowd.castShadow = true;
  grp.add(crowd);
  g.add(grp);
}

// ---------------------------------------------------------------- arbres (cônes instanciés)
function forest(g, kit, count, sampler, seed = 5, size = [7, 14]) {
  const rand = rng(seed);
  const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), mat(kit.green, { roughness: 1 }), count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const { x, y } = sampler(rand);
    const h = size[0] + rand() * (size[1] - size[0]), r = h * (0.22 + rand() * 0.1);
    m4.compose(P(x, y, 0), q, new THREE.Vector3(r, h, r));
    trees.setMatrixAt(i, m4);
    trees.setColorAt(i, kit.green.clone().lerp(kit.ink, 0.25 + rand() * 0.4));
  }
  trees.castShadow = true;
  g.add(trees);
}

function skyline(g, kit, cx, ext) {
  const r0 = ext * 1.5 + 140;
  forest(g, kit, 160, (rand) => {
    const a = rand() * Math.PI * 2, r = r0 + rand() * (r0 * 0.6);
    return { x: cx + Math.cos(a) * r, y: Math.sin(a) * r };
  }, 21, [14, 34]);
}

// ---------------------------------------------------------------- terrains
function football(g, kit, geom, p) {
  const gx = 22;                                    // ligne de but (22 m du point de coup franc)
  p.line(gx, -34, gx, 34);
  p.line(-35, -34, gx, -34); p.line(-35, 34, gx, 34);
  p.rect(gx - 5.5, -9.16, gx, 9.16);                // surface de but
  p.rect(gx - 16.5, -20.16, gx, 20.16);             // surface de réparation
  p.spot(gx - 11, 0); p.spot(0, 0, 0.18);           // point de penalty, point de coup franc
  p.arc(gx - 11, 0, 9.15, Math.PI - 0.926, 1.852);  // arc de cercle de la surface
  const wall = geom.top.find((b) => b.kind === "band" && b.label === "mur");
  if (wall) {                                       // mur de joueurs : mannequins en maillot violet
    const n = Math.max(3, Math.round((wall.y1 - wall.y0) / 0.5));
    const shirt = mat(kit.traj, { roughness: 0.7 }), skin = mat(kit.paper.clone().lerp(kit.gold, 0.25), { roughness: 0.6 });
    const shorts = mat(kit.paper, { roughness: 0.7 });
    for (let i = 0; i < n; i++) {
      const y = wall.y0 + ((i + 0.5) * (wall.y1 - wall.y0)) / n;
      const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.85, 12), shorts);
      legs.position.copy(P(wall.x, y, 0.42));
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 6, 14), shirt);
      torso.position.copy(P(wall.x, y, 1.18));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 14), skin);
      head.position.copy(P(wall.x, y, 1.72));
      for (const m of [legs, torso, head]) { m.castShadow = true; g.add(m); }
    }
  }
  stand(g, kit, { cx: gx + 10, cy: 0, away: 0, len: 78, rows: 8, seed: 3 });
  stand(g, kit, { cx: 6, cy: -42, away: -Math.PI / 2, len: 100, rows: 6, seed: 4 });
  stand(g, kit, { cx: 6, cy: 42, away: Math.PI / 2, len: 100, rows: 6, seed: 5 });
  return new Set(["mur"]);
}

function basketball(g, kit, geom, p) {
  const wood = new THREE.MeshStandardMaterial({ map: parquet(kit), roughness: 0.45, metalness: 0.05 });
  p.plane(-8.2, 0, 28, 15, wood, 0, 0.004);                       // le terrain : 28 m x 15 m
  const key = mat(kit.rail.clone().lerp(kit.green, 0.45), { roughness: 0.6 });
  p.plane(2.9, 0, 5.8, 4.9, key, 0, 0.007);                       // raquette
  p.rect(0, -2.45, 5.8, 2.45);
  p.disc(0, 0, 1.8, p.chalk, 0.0075).visible = false;
  p.arc(0, 0, 1.8, -Math.PI / 2, Math.PI);                        // cercle des lancers francs
  p.arc(4.2, 0, 6.75, 1.78, 2.72);                                // ligne à 3 points
  p.line(5.8, -6.6, 2.78, -6.6); p.line(5.8, 6.6, 2.78, 6.6);
  p.line(5.8, -7.5, -22.2, -7.5); p.line(5.8, 7.5, -22.2, 7.5);   // lignes de touche
  p.line(5.8, -7.5, 5.8, 7.5); p.line(-22.2, -7.5, -22.2, 7.5);
  p.line(-8.2, -7.5, -8.2, 7.5);                                  // ligne médiane
  p.arc(-8.2, 0, 1.8, 0, Math.PI * 2);
  const boards = mat(kit.rail, { roughness: 0.6 });
  for (const y of [-8.4, 8.4]) {                                  // panneaux de bord de terrain
    const b = new THREE.Mesh(new THREE.BoxGeometry(28, 0.9, 0.12), boards);
    b.position.copy(P(-8.2, y, 0.45)); b.castShadow = b.receiveShadow = true; g.add(b);
  }
  stand(g, kit, { cx: -8, cy: -11, away: -Math.PI / 2, len: 40, rows: 6, seed: 8, gap: 1 });
  stand(g, kit, { cx: -8, cy: 11, away: Math.PI / 2, len: 40, rows: 6, seed: 9, gap: 1 });
  stand(g, kit, { cx: 11, cy: 0, away: 0, len: 22, rows: 5, seed: 10, gap: 1 });
  return new Set();
}

function golf(g, kit, geom, p, d) {
  const xmax = d.xmax;
  const [light, dark] = [d.light.clone().lerp(kit.paper, 0.06), d.dark.clone().lerp(kit.paper, 0.04)];
  const fairway = new THREE.MeshStandardMaterial({ map: stripes(light, dark, 10, xmax * 1.5 + 80), roughness: 1 });
  const f = p.plane(xmax * 0.55 + 20, 0, xmax * 1.5 + 80, 46, fairway, 0, 0.004);
  f.material.map.repeat.set((xmax * 1.5 + 80) / 20, 1);
  const pad = mat(light.clone().lerp(kit.green, 0.3));
  p.plane(0, 0, 8, 10, pad, 0, 0.006);                            // départ
  for (const y of [-2.2, 2.2]) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), mat(kit.paper)); s.position.copy(P(0, y, 0.18)); s.castShadow = true; g.add(s); }
  const pole = mat(kit.paper, { roughness: 0.4 }), flag = mat(kit.traj, { side: THREE.DoubleSide });
  for (const m of geom.marks) {                                   // repères de distance : fanions violets
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8), pole);
    mast.position.copy(P(m.x, -18, 1.3)); mast.castShadow = true; g.add(mast);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), flag);
    cloth.position.copy(P(m.x + 0.45, -18, 2.3)); cloth.castShadow = true; g.add(cloth);
  }
  const sand = mat(kit.paper.clone().lerp(kit.gold, 0.4), { roughness: 1 });
  p.disc(xmax * 0.62, 15, 6, sand, 0.008, 0.55);                  // bunkers
  p.disc(xmax * 0.84, -12, 7, sand, 0.008, 0.5);
  p.disc(xmax * 0.35, -15, 5, sand, 0.008, 0.5);
  forest(g, kit, 150, (rand) => {                                  // arbres de chaque côté du fairway
    return { x: 8 + rand() * (xmax * 1.35 + 40), y: 28 + rand() * 50 };      // côté opposé à la tribune : la vue reste dégagée
  }, 6, [8, 16]);
  return new Set();
}

function baseball(g, kit, geom, p, d) {
  const dirt = mat(kit.gold.clone().lerp(kit.ink, 0.32), { roughness: 1 });
  const infield = mat(d.light.clone().lerp(kit.paper, 0.04), { roughness: 1 });
  p.disc(18.4, 0, 28.9, dirt, 0.004);                             // terre de l'avant-champ
  p.plane(19.4, 0, 27.4, 27.4, infield, Math.PI / 4, 0.008);      // pelouse intérieure du losange
  p.disc(0, 0, 3.6, dirt, 0.009);
  p.plane(122 - 6, 0, 12, 260, dirt, 0, 0.005);                   // piste d'avertissement
  const base = mat(kit.paper, { roughness: 0.5 });
  for (const [x, y] of [[19.4, -19.4], [38.8, 0], [19.4, 19.4], [0, 0]]) p.plane(x, y, 0.42, 0.42, base, Math.PI / 4, 0.02);
  p.line(0, 0, 125, -125, 0.14); p.line(0, 0, 125, 125, 0.14);    // lignes de faute
  stand(g, kit, { cx: 124, cy: 0, away: 0, len: 150, rows: 9, seed: 12, gap: 2 });
  return new Set();
}

function training(g, kit, geom, p, d) {
  const lines = [0, ...(geom.marks || []).map((m) => m.x)];
  for (let x = 10; x <= d.xmax * 1.2 + 10; x += 10) lines.push(x);
  for (const x of lines) p.line(x, -20, x, 20, x % 50 === 0 ? 0.2 : 0.1);
  stand(g, kit, { cx: d.xmax * 0.5, cy: -34, away: -Math.PI / 2, len: Math.max(40, d.xmax), rows: 4, seed: 2 });
  return new Set();
}

const BUILDERS = { "Coup franc": football, "Lancer franc": basketball, "Drive golf": golf, "Home run": baseball };

// dimensions du sol selon la situation
export function groundSpec(name, kit, d) {
  const spec = { light: d.light, dark: d.dark };
  if (name === "Coup franc") Object.assign(spec, { band: 5.5, length: 150, width: 130, x0: 20 });
  else if (name === "Home run") Object.assign(spec, { band: 6, length: 330, width: 330, x0: 120 });
  else if (name === "Drive golf") {
    spec.light = d.light.clone().lerp(kit.ink, 0.12); spec.dark = d.dark.clone().lerp(kit.ink, 0.12);   // le rough, plus sombre
    Object.assign(spec, { band: 10, width: 220, length: d.xmax * 1.8 + 200, x0: d.xmax * 0.55 });
  } else if (name === "Lancer franc") Object.assign(spec, { band: 2, length: 140, width: 110, x0: -10 });
  return spec;
}

export function buildEnvironment(name, geom, kit, dims) {
  const group = new THREE.Group();
  const painter = new Painter(group, kit);
  const handles = (BUILDERS[name] ?? training)(group, kit, geom, painter, dims);
  skyline(group, kit, dims.xmax * 0.5, dims.ext);
  return { group, handles, update() {} };
}

// ---------------------------------------------------------------- nuages
export function clouds(kit, cx) {
  const group = new THREE.Group();
  const rand = rng(7);
  const material = new THREE.MeshBasicMaterial({ color: kit.paper, transparent: true, opacity: 0.9, fog: false, depthWrite: false });
  const geo = new THREE.SphereGeometry(1, 14, 10);
  const items = [];
  for (let i = 0; i < 18; i++) {
    const c = new THREE.Group();
    const parts = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < parts; k++) {
      const m = new THREE.Mesh(geo, material);
      m.scale.set(16 + rand() * 22, 6 + rand() * 6, 10 + rand() * 10);
      m.position.set((k - parts / 2) * 18 + rand() * 8, rand() * 5, (rand() - 0.5) * 14);
      c.add(m);
    }
    c.position.set(cx + (rand() - 0.5) * 1800, 140 + rand() * 120, (rand() - 0.5) * 1800);
    group.add(c);
    items.push(c);
  }
  return {
    group,
    update(dt) {
      for (const c of items) { c.position.x += dt * 1.6; if (c.position.x > cx + 900) c.position.x -= 1800; }
    },
  };
}
