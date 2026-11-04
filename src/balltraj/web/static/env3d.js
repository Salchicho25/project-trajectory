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
  const cream = kit.paper.clone().lerp(kit.gold, 0.14);
  const palette = [kit.paper, kit.paper, cream, cream, kit.turfB, kit.green.clone().lerp(kit.paper, 0.5), kit.rail.clone().lerp(kit.paper, 0.6)];
  const accents = [kit.gold, kit.traj2.clone().lerp(kit.paper, 0.4)];            // 1 spectateur sur 12 seulement
  const per = Math.max(1, Math.floor(len / 0.55));
  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.15, 0.28, 3, 8), mat(kit.paper, { roughness: 0.85 }), per * rows);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 10, 8), mat(kit.paper, { roughness: 0.7 }), per * rows);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < per; i++) {
      sc.setScalar(rand() < 0.08 ? 0 : 0.88 + rand() * 0.28);               // quelques places vides
      const u = gap + r * rowD + rowD * 0.45, v = -len / 2 + ((i + 0.5 + (rand() - 0.5) * 0.4) * len) / per;
      const y0 = rowH * (r + 1) + 0.33 * sc.y;
      m4.compose(new THREE.Vector3(u, y0, v), q, sc);
      bodies.setMatrixAt(n, m4);
      bodies.setColorAt(n, rand() < 1 / 12 ? accents[Math.floor(rand() * accents.length)] : palette[Math.floor(rand() * palette.length)]);
      m4.compose(new THREE.Vector3(u, y0 + 0.36 * sc.y, v), q, sc);
      heads.setMatrixAt(n, m4);
      heads.setColorAt(n, cream.clone().lerp(kit.ink, rand() * 0.55));      // carnations variées
      n++;
    }
  }
  bodies.castShadow = true;
  grp.add(bodies, heads);
  g.add(grp);
}

// ---------------------------------------------------------------- arbres arrondis et haies taillées
// Houppiers arrondis dans la famille des verts du site (jamais mêlés au noir), sur de petits troncs.
function forest(g, kit, count, sampler, seed = 5, size = [7, 14]) {
  const rand = rng(seed);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), mat(kit.green, { roughness: 1 }), count);
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.2, 1, 6).translate(0, 0.5, 0),
    mat(kit.ink.clone().lerp(kit.gold, 0.4), { roughness: 1 }),
    count,
  );
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const { x, y } = sampler(rand);
    const h = size[0] + rand() * (size[1] - size[0]), r = h * (0.28 + rand() * 0.12);
    m4.compose(P(x, y, h * 0.6), q, new THREE.Vector3(r, r * 0.88, r));
    crowns.setMatrixAt(i, m4);
    crowns.setColorAt(i, kit.green.clone().lerp(kit.turfB, 0.2 + rand() * 0.5));
    m4.compose(P(x, y, 0), q, new THREE.Vector3(h * 0.3, h * 0.5, h * 0.3));
    trunks.setMatrixAt(i, m4);
  }
  crowns.castShadow = trunks.castShadow = true;
  g.add(crowns, trunks);
}

// Haie taillée : un mur vert continu entre deux points du sol.
function hedge(g, kit, x0, y0, x1, y1, h, thick = 2.2) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, h, thick), mat(kit.green.clone().lerp(kit.rail, 0.3), { roughness: 1 }));
  body.castShadow = body.receiveShadow = true;
  const holder = new THREE.Group();
  holder.position.copy(P((x0 + x1) / 2, (y0 + y1) / 2, h / 2));
  holder.rotation.y = Math.atan2(y1 - y0, x1 - x0);
  holder.add(body);
  g.add(holder);
}

function skyline(g, kit, cx, ext) {
  const r0 = ext * 1.5 + 140;
  forest(g, kit, 120, (rand) => {
    const a = rand() * Math.PI * 2, r = r0 + rand() * (r0 * 0.6);
    return { x: cx + Math.cos(a) * r, y: Math.sin(a) * r };
  }, 21, [14, 30]);
  const hx = ext * 0.9 + 80, hy = ext * 0.55 + 70, h = 3 + ext * 0.01;       // haie taillée tout autour du site
  hedge(g, kit, cx - hx, -hy, cx + hx, -hy, h); hedge(g, kit, cx - hx, hy, cx + hx, hy, h);
  hedge(g, kit, cx - hx, -hy, cx - hx, hy, h); hedge(g, kit, cx + hx, -hy, cx + hx, hy, h);
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
      const arms = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.34, 4, 8), shirt);   // bras croisés sur le ventre
      arms.rotation.x = Math.PI / 2;
      arms.position.copy(P(wall.x - 0.17, y, 1.06));
      for (const m of [legs, torso, head, arms]) { m.castShadow = true; g.add(m); }
    }
  }
  stand(g, kit, { cx: gx + 10, cy: 0, away: 0, len: 78, rows: 8, seed: 3 });
  stand(g, kit, { cx: 6, cy: -42, away: -Math.PI / 2, len: 100, rows: 6, seed: 4 });
  stand(g, kit, { cx: 6, cy: 42, away: Math.PI / 2, len: 100, rows: 6, seed: 5 });
  return new Set(["mur"]);
}

// Terrain de basket aux cotes du règlement : 28 m x 15 m, dégagement de 2 m, panier à 3,05 m.
const COURT = { x0: -22.2, x1: 5.8, hw: 7.5, border: 2 };
const HOOP_X = 4.2;                                         // centre du cercle : 4,2 m de la ligne des lancers francs

// Le terrain entier est peint dans UNE texture de 2048 x 1216 px (64 px par mètre) : lames de parquet, peinture,
// toutes les lignes (cercle central, raquette, lancers francs, zone restrictive, ligne à 3 points) et l'emblème.
function courtTexture(kit) {
  const PPM = 64, W = (28 + 4) * PPM, H = (15 + 4) * PPM;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const X = (x) => (x - (COURT.x0 - COURT.border)) * PPM;
  const Y = (y) => (COURT.hw + COURT.border - y) * PPM;
  const L = (m) => m * PPM;
  const rand = rng(11);

  // parquet : lames de 7,5 cm dans le sens de la longueur, teinte et veinage variables, joints décalés
  const light = kit.gold.clone().lerp(kit.ink, 0.22), dark = kit.gold.clone().lerp(kit.ink, 0.38);
  const plank = L(0.075);
  for (let y = 0; y < H; y += plank) {
    let x = -rand() * L(1.2);
    while (x < W) {
      const len = L(0.9 + rand() * 1.6);
      g.fillStyle = hex(light.clone().lerp(dark, rand()));
      g.fillRect(x, y, len, plank + 0.5);
      g.globalAlpha = 0.13; g.strokeStyle = hex(kit.ink); g.lineWidth = 0.8;
      for (let k = 0; k < 3; k++) {
        const yy = y + rand() * plank;
        g.beginPath(); g.moveTo(x, yy); g.lineTo(x + len, yy + (rand() - 0.5) * 2); g.stroke();
      }
      g.globalAlpha = 0.4; g.fillStyle = hex(kit.ink); g.fillRect(x, y, 1.2, plank);
      g.globalAlpha = 1;
      x += len;
    }
    g.globalAlpha = 0.22; g.fillStyle = hex(kit.ink); g.fillRect(0, y, W, 1); g.globalAlpha = 1;
  }
  // dégagement autour du terrain : bois plus sombre
  g.globalAlpha = 0.34; g.fillStyle = hex(kit.ink);
  g.fillRect(0, 0, W, L(COURT.border)); g.fillRect(0, H - L(COURT.border), W, L(COURT.border));
  g.fillRect(0, 0, L(COURT.border), H); g.fillRect(W - L(COURT.border), 0, L(COURT.border), H);
  g.globalAlpha = 1;

  // peinture de la raquette et du cercle central : le grain du bois reste visible dessous
  const paint = hex(kit.rail.clone().lerp(kit.green, 0.45));
  g.fillStyle = paint; g.globalAlpha = 0.93;
  g.fillRect(X(0), Y(2.45), L(5.8), L(4.9));
  g.beginPath(); g.arc(X(-8.2), Y(0), L(1.8), 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;

  // lignes blanches de 5 cm
  g.strokeStyle = hex(kit.paper); g.lineWidth = L(0.05); g.lineCap = "butt";
  const arc = (cx, cy, r, a0, a1, dash = null) => {            // angles du simulateur (x avant, y gauche)
    g.setLineDash(dash ?? []);
    g.beginPath(); g.arc(X(cx), Y(cy), L(r), -a0, -a1, true); g.stroke();
    g.setLineDash([]);
  };
  const seg = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke(); };
  g.strokeRect(X(COURT.x0), Y(COURT.hw), L(28), L(15));        // limites du terrain
  seg(-8.2, -7.5, -8.2, 7.5);                                  // ligne médiane
  arc(-8.2, 0, 1.8, 0, Math.PI * 2);                           // cercle central
  g.strokeRect(X(0), Y(2.45), L(5.8), L(4.9));                 // raquette et ligne des lancers francs
  arc(0, 0, 1.8, Math.PI / 2, (3 * Math.PI) / 2);              // cercle des lancers francs, trait plein côté terrain
  arc(0, 0, 1.8, -Math.PI / 2, Math.PI / 2, [L(0.3), L(0.3)]); // et en pointillés côté raquette
  arc(HOOP_X, 0, 1.25, Math.PI / 2, (3 * Math.PI) / 2);        // zone restrictive sous le panier
  seg(HOOP_X, -1.25, 5.8, -1.25); seg(HOOP_X, 1.25, 5.8, 1.25);
  const a3 = Math.asin(6.6 / 6.75);                            // ligne à 3 points : 6,75 m, lignes de coin à 6,6 m
  arc(HOOP_X, 0, 6.75, Math.PI - a3, Math.PI + a3);
  const cx3 = HOOP_X + 6.75 * Math.cos(Math.PI - a3);
  seg(5.8, -6.6, cx3, -6.6); seg(5.8, 6.6, cx3, 6.6);
  for (const x of [1.0, 1.6, 2.6, 3.6]) { seg(x, 2.45, x, 2.7); seg(x, -2.45, x, -2.7); }   // repères de la raquette

  // emblème central (monogramme du projet) et lettrage hors limites
  g.fillStyle = hex(kit.gold); g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `400 ${L(2.1)}px "Libre Caslon Display", Georgia, serif`;
  g.fillText("T", X(-8.2), Y(0) + L(0.08));
  g.globalAlpha = 0.9;
  g.font = `400 ${L(0.8)}px "Libre Caslon Display", Georgia, serif`;
  g.save(); g.translate(X(5.8 + 1), Y(0)); g.rotate(Math.PI / 2); g.fillText("TRAJECTOIRE", 0, 0); g.restore();
  g.save(); g.translate(X(-22.2 - 1), Y(0)); g.rotate(-Math.PI / 2); g.fillText("TRAJECTOIRE", 0, 0); g.restore();
  g.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

// Panneau d'affichage suspendu : texte doré sur le vert du bandeau
function boardTexture(kit, lines) {
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 256;
  const g = cv.getContext("2d");
  g.fillStyle = hex(kit.rail); g.fillRect(0, 0, 512, 256);
  g.strokeStyle = hex(kit.gold); g.lineWidth = 6; g.strokeRect(10, 10, 492, 236);
  g.fillStyle = hex(kit.gold); g.textAlign = "center"; g.textBaseline = "middle";
  g.font = '400 54px "Libre Caslon Display", Georgia, serif';
  g.fillText(lines[0], 256, 80);
  g.font = '700 110px "Libre Caslon Text", Georgia, serif';
  g.fillText(lines[1], 256, 172);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Panier : panneau de verre cerclé d'acier, carré de tir, rembourrage, cercle avec son attache, filet maillé, armature.
function hoopAssembly(g, kit, hoop, board) {
  const bx = board.x, hx = hoop.x, hr = hoop.r, hz = hoop.z, bz0 = board.z0, bz1 = board.z1, bh = bz1 - bz0;
  const steel = mat(kit.ink.clone().lerp(kit.paper, 0.18), { metalness: 0.7, roughness: 0.38 });
  const white = mat(kit.paper, { roughness: 0.5 });
  const put = (m, x, y, z) => { m.position.copy(P(x, y, z)); m.castShadow = true; g.add(m); return m; };

  put(new THREE.Mesh(                                                         // verre : 1,80 m x 1,05 m
    new THREE.BoxGeometry(0.03, bh, 1.8),
    new THREE.MeshPhysicalMaterial({ color: kit.paper, transparent: true, opacity: 0.22, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false }),
  ), bx, 0, (bz0 + bz1) / 2);
  for (const dz of [-bh / 2, bh / 2]) put(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 1.84), steel), bx, 0, (bz0 + bz1) / 2 + dz);
  for (const dy of [-0.9, 0.9]) put(new THREE.Mesh(new THREE.BoxGeometry(0.06, bh, 0.05), steel), bx, dy, (bz0 + bz1) / 2);
  const padded = mat(kit.rail.clone().lerp(kit.green, 0.35), { roughness: 0.9 });
  put(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 1.86), padded), bx, 0, bz0 - 0.04);   // rembourrage du bord bas

  const line = (w, h, y, z) => put(new THREE.Mesh(new THREE.BoxGeometry(0.012, h, w), white), bx - 0.022, y, z);
  const sqW = 0.59, sqH = 0.45, sqZ = hz + sqH / 2 - 0.02;                    // carré de tir : 59 cm x 45 cm, base au niveau du cercle
  line(sqW, 0.015, 0, sqZ - sqH / 2); line(sqW, 0.015, 0, sqZ + sqH / 2);
  line(0.015, sqH, -sqW / 2, sqZ); line(0.015, sqH, sqW / 2, sqZ);

  const rimMat = mat(kit.gold, { metalness: 0.75, roughness: 0.28 });         // cercle en laiton doré
  const rim = new THREE.Mesh(new THREE.TorusGeometry(hr, 0.009, 14, 64), rimMat);
  rim.rotation.x = Math.PI / 2; put(rim, hx, 0, hz);
  put(new THREE.Mesh(new THREE.BoxGeometry(bx - (hx + hr) + 0.04, 0.03, 0.14), rimMat), (bx + hx + hr) / 2, 0, hz);   // attache

  const net = [], N = 14, SEG = 8, LEN = 0.42;                                // filet : deux hélices opposées = mailles en losange
  for (const dir of [1, -1]) {
    for (let i = 0; i < N; i++) {
      let prev = null;
      for (let k = 0; k <= SEG; k++) {
        const f = k / SEG, a = (i / N) * Math.PI * 2 + dir * f * 0.95, r = hr * (1 - 0.38 * f);
        const q = P(hx + Math.cos(a) * r, Math.sin(a) * r, hz - f * LEN);
        if (prev) net.push(prev, q);
        prev = q;
      }
    }
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(net), new THREE.LineBasicMaterial({ color: kit.paper, transparent: true, opacity: 0.92 })));

  const poleX = COURT.x1 + 1.3, poleH = hz + 0.7;                             // armature : mât derrière la ligne de fond, bras jusqu'au panneau
  put(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, poleH, 20), steel), poleX, 0, poleH / 2);
  put(new THREE.Mesh(new THREE.BoxGeometry(poleX - bx, 0.16, 0.22), steel), (poleX + bx) / 2, 0, bz1 - 0.2);
  put(new THREE.Mesh(new THREE.BoxGeometry(0.62, 2.1, 0.9), padded), poleX, 0, 1.05);   // protection rembourrée au pied du mât
}

// La salle : murs sombres, passerelle d'éclairage lumineuse, tableau suspendu, bannières, tribunes tout autour
function arena(g, kit) {
  const wall = mat(kit.rail.clone().lerp(kit.ink, 0.6), { roughness: 0.95, side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(76, 20, 60), wall);
  room.position.copy(P(-9, 0, 10)); g.add(room);

  const glow = new THREE.MeshBasicMaterial({ color: kit.paper.clone().multiplyScalar(4) });       // valeurs > 1 : le halo (bloom) les fait briller
  for (const y of [-10.5, -6.3, -2.1, 2.1, 6.3, 10.5]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(22, 0.22, 0.55), glow);
    bar.position.copy(P(-8.2, y, 16.2)); g.add(bar);
  }
  const rig = mat(kit.ink, { metalness: 0.6, roughness: 0.5 });
  for (const x of [-18, -8.2, 2]) {
    const truss = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 26), rig);
    truss.position.copy(P(x, 0, 16.6)); g.add(truss);
  }

  const faces = [boardTexture(kit, ["TRAJECTOIRE", "24"]), boardTexture(kit, ["DOMICILE", "00"]), boardTexture(kit, ["TRAJECTOIRE", "24"]), boardTexture(kit, ["VISITEURS", "00"])];
  const mats = [0, 1, 2, 3].map((i) => new THREE.MeshStandardMaterial({ map: faces[i], emissive: kit.rail, emissiveMap: faces[i], emissiveIntensity: 0.9, roughness: 0.6 }));
  const cube = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.0, 3.6), [mats[0], mats[2], new THREE.MeshStandardMaterial({ color: kit.ink }), new THREE.MeshStandardMaterial({ color: kit.ink }), mats[1], mats[3]]);
  cube.position.copy(P(-8.2, 0, 11.4)); cube.castShadow = true; g.add(cube);
  for (const [dx, dy] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4.6, 6), rig);
    cable.position.copy(P(-8.2 + dx, dy, 13.9)); g.add(cable);
  }

  const banner = (x, y, rot, i) => {                                           // bannières suspendues : vert et or, jamais de violet
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.6), new THREE.MeshStandardMaterial({ color: i % 2 ? kit.rail : kit.gold.clone().lerp(kit.ink, 0.25), roughness: 0.8, side: THREE.DoubleSide }));
    m.position.copy(P(x, y, 10.5)); m.rotation.y = rot; g.add(m);
  };
  for (let i = 0; i < 6; i++) { banner(-30 + i * 6.4, -27.8, 0, i); banner(-30 + i * 6.4, 27.8, Math.PI, i + 1); }
  stand(g, kit, { cx: -8, cy: -11, away: -Math.PI / 2, len: 40, rows: 8, seed: 8, gap: 1 });
  stand(g, kit, { cx: -8, cy: 11, away: Math.PI / 2, len: 40, rows: 8, seed: 9, gap: 1 });
  stand(g, kit, { cx: 11, cy: 0, away: 0, len: 22, rows: 6, seed: 10, gap: 1 });
  stand(g, kit, { cx: -28, cy: 0, away: Math.PI, len: 22, rows: 6, seed: 13, gap: 1 });
}

function basketball(g, kit, geom, p) {
  const floor = new THREE.MeshPhysicalMaterial({ map: courtTexture(kit), roughness: 0.34, clearcoat: 0.75, clearcoatRoughness: 0.12, metalness: 0.02 });
  p.plane((COURT.x0 + COURT.x1) / 2, 0, 28 + 4, 15 + 4, floor, 0, 0.004);
  const boards = mat(kit.rail, { roughness: 0.55 });
  for (const y of [-8.5, 8.5]) {                                               // panneaux publicitaires de bord de terrain, vert et or
    const b = new THREE.Mesh(new THREE.BoxGeometry(28, 0.9, 0.12), boards);
    b.position.copy(P(-8.2, y, 0.45)); b.castShadow = b.receiveShadow = true; g.add(b);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(28, 0.06, 0.125), mat(kit.gold, { metalness: 0.5, roughness: 0.4 }));
    strip.position.copy(P(-8.2, y, 0.93)); g.add(strip);
  }
  const hoop = geom.side.find((sh) => sh.kind === "hoop"), board = geom.side.find((sh) => sh.label === "planche");
  if (hoop && board) hoopAssembly(g, kit, hoop, board);
  arena(g, kit);
  return { handles: new Set(["planche", "cercle"]), indoor: true };
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
  if (name === "Coup franc") Object.assign(spec, { band: 5.5, length: 150, width: 130, x0: 20, grass: true });
  else if (name === "Home run") Object.assign(spec, { band: 6, length: 330, width: 330, x0: 120 });
  else if (name === "Drive golf") {
    spec.light = d.light.clone().lerp(kit.ink, 0.12); spec.dark = d.dark.clone().lerp(kit.ink, 0.12);   // le rough, plus sombre
    Object.assign(spec, { band: 10, width: 220, length: d.xmax * 1.8 + 200, x0: d.xmax * 0.55, grass: true });
    spec.fair = {                                                                   // le fairway, plus clair, 46 m de large
      light: d.light.clone().lerp(kit.paper, 0.06), dark: d.dark.clone().lerp(kit.paper, 0.04),
      origin: d.xmax * 0.55 + 20 - (d.xmax * 1.5 + 80) / 2, half: 23,
    };
  } else if (name === "Lancer franc") Object.assign(spec, { indoor: true, length: 90, width: 70, x0: -8, floor: kit.rail.clone().lerp(kit.ink, 0.62) });
  else spec.grass = true;
  return spec;
}

export function buildEnvironment(name, geom, kit, dims) {
  const group = new THREE.Group();
  const painter = new Painter(group, kit);
  const built = (BUILDERS[name] ?? training)(group, kit, geom, painter, dims);
  const handles = built instanceof Set ? built : built.handles;
  const indoor = !(built instanceof Set) && built.indoor === true;
  if (!indoor) skyline(group, kit, dims.xmax * 0.5, dims.ext);               // dehors seulement : arbres et haies
  return { group, handles, indoor, update() {} };
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

// ---------------------------------------------------------------- herbe réelle autour de la caméra
// 9 tuiles identiques d'une cellule de 20 m (54 000 brins, un seul appel de rendu). Le motif est périodique :
// on déplace le groupe par pas d'une cellule pour suivre la caméra, sans que rien ne saute.
// Les rayures de tonte sont recalculées dans le shader à partir de la position dans le monde, comme la texture du sol.
export function grassPatch(kit, cfg) {
  const CELL = 20, PER = 6000, TILES = 3, R = 18;
  const rand = rng(101);
  const w = 0.016, h = 0.11;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-w, 0, 0, w, 0, 0, -w * 0.7, h * 0.5, 0.01, w * 0.7, h * 0.5, 0.01, 0, h, 0.03]), 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);

  const U = {
    uTime: { value: 0 }, uWind: { value: 0.5 }, uR: { value: R },
    uLight: { value: cfg.light }, uDark: { value: cfg.dark }, uBand: { value: cfg.band }, uOrigin: { value: cfg.origin },
    uFLight: { value: cfg.fair?.light ?? cfg.light }, uFDark: { value: cfg.fair?.dark ?? cfg.dark },
    uFOrigin: { value: cfg.fair?.origin ?? 0 }, uFHalf: { value: cfg.fair?.half ?? 0 },
  };
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime; uniform float uWind; uniform float uR; varying float vWX; varying float vWZ; varying float vH;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 wp0 = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        float fade = 1.0 - smoothstep(uR * 0.55, uR, distance(wp0.xz, cameraPosition.xz));
        float hh = position.y;
        transformed.y *= fade;
        transformed.x += sin(uTime * 1.7 + instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.5) * 0.02 * hh * 9.0 * uWind;
        vH = hh;`)
      .replace("#include <project_vertex>", `#include <project_vertex>
        vec4 wp1 = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        vWX = wp1.x; vWZ = wp1.z;`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uLight; uniform vec3 uDark; uniform float uBand; uniform float uOrigin; uniform vec3 uFLight; uniform vec3 uFDark; uniform float uFOrigin; uniform float uFHalf; varying float vWX; varying float vWZ; varying float vH;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        float st = mod(floor((vWX - uOrigin) / uBand), 2.0);
        vec3 gc = mix(uLight, uDark, st);
        if (uFHalf > 0.0 && abs(vWZ) < uFHalf) { gc = mix(uFLight, uFDark, mod(floor((vWX - uFOrigin) / uBand), 2.0)); }
        diffuseColor.rgb = mix(gc * 0.6, gc * 1.12, clamp(vH / 0.11, 0.0, 1.0));`);
  };

  const mesh = new THREE.InstancedMesh(geo, material, PER * TILES * TILES);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const base = Array.from({ length: PER }, () => ({ x: rand() * CELL, z: rand() * CELL, yaw: rand() * Math.PI * 2, s: 0.7 + rand() * 0.9, tilt: (rand() - 0.5) * 0.4 }));
  let n = 0;
  for (let ti = 0; ti < TILES; ti++) {
    for (let tj = 0; tj < TILES; tj++) {
      for (const b of base) {
        q.setFromEuler(e.set(b.tilt, b.yaw, 0));
        m4.compose(new THREE.Vector3((ti - 1) * CELL + b.x, 0, (tj - 1) * CELL + b.z), q, new THREE.Vector3(1, b.s, 1));
        mesh.setMatrixAt(n++, m4);
      }
    }
  }
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return {
    group,
    update(camera, now, anim, windSpeed = 0) {
      group.position.set(Math.floor(camera.position.x / CELL) * CELL, 0, Math.floor(camera.position.z / CELL) * CELL);
      U.uTime.value = now;
      U.uWind.value = anim ? 0.5 + windSpeed * 0.12 : 0;
    },
  };
}
