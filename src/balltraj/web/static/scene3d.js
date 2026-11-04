// Vue 3D immersive : la trajectoire calculée par Python, rejouée en temps réel.
// Aucune physique ici : positions, vitesses et rotations viennent de l'API (échantillons).
//
// Repère du simulateur : x avant, y gauche, z haut. Repère de three.js : X droite, Y haut, Z vers
// l'observateur. Passage (x, y, z) -> (x, z, -y) : une vraie rotation, la main droite est conservée,
// les pseudo-vecteurs (rotation de la balle) se convertissent comme les positions.

import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { Sky } from "three/addons/objects/Sky.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildEnvironment, clouds, grassPatch, groundSpec, stripes } from "./env3d.js";

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const nf = (v, d = 0) => v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const P = (x, y, z) => new THREE.Vector3(x, z, -y);
const easeOut = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

// jeton CSS (oklch...) -> couleur three.js : on laisse le navigateur convertir
function tokenColor(name) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const g = cv.getContext("2d");
  g.fillStyle = css(name);
  g.fillRect(0, 0, 1, 1);
  const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
  return new THREE.Color().setRGB(r / 255, gr / 255, b / 255, THREE.SRGBColorSpace);
}
const hex = (c) => `#${c.getHexString(THREE.SRGBColorSpace)}`;

const BALL_LOOK = {
  tennis: (g, k) => {
    g.fillStyle = k.ball; g.fillRect(0, 0, 512, 256);
    speckle(g, k.ink, 1400, 0.07);
    g.strokeStyle = k.paper; g.lineWidth = 15; g.lineCap = "round";
    for (const ph of [0, Math.PI]) {
      g.beginPath();
      for (let x = 0; x <= 512; x += 4) {
        const y = 128 + 78 * Math.sin((x / 512) * Math.PI * 2 + ph);
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  },
  basketball: (g, k) => {
    g.fillStyle = k.gold; g.fillRect(0, 0, 512, 256);
    speckle(g, k.ink, 900, 0.1);
    g.strokeStyle = k.ink; g.lineWidth = 7;
    for (const x of [0, 256, 512]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
    g.beginPath(); g.moveTo(0, 128); g.lineTo(512, 128); g.stroke();
    for (const cx of [128, 384]) { g.beginPath(); g.ellipse(cx, 128, 70, 128, 0, 0, Math.PI * 2); g.stroke(); }
  },
  football: (g, k) => {
    g.fillStyle = k.paper; g.fillRect(0, 0, 512, 256);
    g.fillStyle = k.ink;
    for (const [x, y] of [[64, 64], [192, 64], [320, 64], [448, 64], [0, 192], [128, 192], [256, 192], [384, 192], [512, 192], [256, 128]]) {
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(x + 30 * Math.cos(a), y + 30 * Math.sin(a));
      }
      g.closePath(); g.fill();
    }
  },
  golf: (g, k) => {
    g.fillStyle = k.paper; g.fillRect(0, 0, 512, 256);
    speckle(g, k.ink, 2600, 0.14, 2.2);
  },
  baseball: (g, k) => {
    g.fillStyle = k.paper; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = k.traj; g.lineWidth = 4;
    for (const ph of [0, Math.PI]) {
      for (let x = 0; x <= 512; x += 6) {
        const y = 128 + 70 * Math.sin((x / 512) * Math.PI * 2 + ph);
        g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 3, y + 9); g.stroke();
      }
    }
  },
  volleyball: (g, k) => {
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? k.paper : k.gold; g.fillRect((i * 512) / 6, 0, 512 / 6 + 1, 256); }
    g.strokeStyle = k.traj; g.lineWidth = 5;
    for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo((i * 512) / 6, 0); g.lineTo((i * 512) / 6, 256); g.stroke(); }
  },
};

function speckle(g, color, n, alpha, r = 1.4) {
  g.fillStyle = color; g.globalAlpha = alpha;
  for (let i = 0; i < n; i++) { g.beginPath(); g.arc(Math.random() * 512, Math.random() * 256, r, 0, 7); g.fill(); }
  g.globalAlpha = 1;
}

// grain du revêtement (cuir grenu, feutre, alvéoles) : relief fin en bump map, partagé par toutes les balles
let bumpTex = null;
function ballBump() {
  if (bumpTex) return bumpTex;
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 256;
  const g = cv.getContext("2d");
  g.fillStyle = "rgb(128,128,128)"; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 90 + Math.random() * 90;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath(); g.arc(Math.random() * 512, Math.random() * 256, 0.9 + Math.random() * 1.3, 0, 7); g.fill();
  }
  bumpTex = new THREE.CanvasTexture(cv);
  bumpTex.wrapS = THREE.RepeatWrapping;
  return bumpTex;
}

function ballTexture(key, kit) {
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 256;
  (BALL_LOOK[key] ?? BALL_LOOK.tennis)(cv.getContext("2d"), kit);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createScene3D(canvas, hud, { onFrame = () => {}, onMode = () => {}, quality: initialQuality = "high" } = {}) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 4000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 1.5;

  const kit = {};
  const refreshKit = () => {
    for (const [k, v] of Object.entries({
      paper: "--paper", turfA: "--turf-a", turfB: "--turf-b", ink: "--ink", rail: "--rail", gold: "--gold",
      traj: "--traj", traj2: "--traj-2", green: "--green", ball: "--ball", sky: "--sky",
    })) kit[k] = tokenColor(v);
  };
  refreshKit();
  const horizon = kit.sky.clone().lerp(kit.turfA, 0.55);       // ciel à l'horizon = couleur du brouillard
  const lawn = () => [kit.green.clone().lerp(kit.turfB, 0.42), kit.green.clone().lerp(kit.turfB, 0.16)];
  const kitHex = () => Object.fromEntries(Object.entries(kit).map(([k, v]) => [k, hex(v)]));

  // ---------------------------------------------------------------- ciel, lumières
  const SUN_DIR = new THREE.Vector3(-0.9, 1.7, 0.8).normalize();
  // ciel physique (modèle de Preetham) : soleil, halo et dégradé de l'horizon calculés, voilé pour rester dans la palette
  const sky = new Sky();
  sky.scale.setScalar(3000);
  {
    const u = sky.material.uniforms;
    u.turbidity.value = 4.5;
    u.rayleigh.value = 0.8;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.86;
    u.sunPosition.value.copy(SUN_DIR);
  }
  scene.add(sky);
  const hemi = new THREE.HemisphereLight(kit.sky, lawn()[1], 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(kit.paper, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // ---------------------------------------------------------------- état
  const world = new THREE.Group();     // pelouse + décor (reconstruit selon la situation)
  const dyn = new THREE.Group();       // balle, tracés, marques (reconstruit à chaque tir)
  scene.add(world, dyn);
  let data = null, staticKey = "", ballKey = "";
  let T = 1, vr = 0.12, vrMin = 0.12, ext = 30, xmax = 30, zmax = 5, xend = 30;
  let tt = [], px = [], py = [], pz = [], sp = [], om = [], qs = [];
  let trail = [], ghosts = null, marks = [], rings = [], impacts = [];
  let ballGroup = null, ballMesh = null, ballTex = null, ghostScale = 0;
  let spinArrow = null, puffs = [], windPts = null, envUpdate = () => {}, grass = null;
  let quality = initialQuality, composer = null, slow = false, recDone = null;
  const windVec = new THREE.Vector3(), windBox = { x0: -20, x1: 100, zh: 30 };
  let t = 0, hold = 0, playing = !reduce.matches, speed = 1, loop = true, active = false;
  let curT = 0, recorder = null, recChunks = [], savedLoop = true;
  let mode = "tribune", raf = 0, last = 0, hudAcc = 0;
  const heading = new THREE.Vector3(1, 0, 0);
  const lookAt = new THREE.Vector3();
  let tween = null;
  const HOLD = 1.4;

  // ---------------------------------------------------------------- échantillons
  const tmp = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), speed: 0, omega: new THREE.Vector3(), i: 0, f: 0 };
  function sampleAt(time) {
    let lo = 0, hi = tt.length - 1;
    if (time >= tt[hi]) lo = hi - 1;
    else if (time > tt[0]) { while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tt[m] <= time) lo = m; else hi = m; } }
    const dt = tt[lo + 1] - tt[lo] || 1e-9;
    const f = Math.min(1, Math.max(0, (time - tt[lo]) / dt));
    const L = (a) => a[lo] + (a[lo + 1] - a[lo]) * f;
    tmp.pos.set(L(px), L(pz), -L(py));                        // repère du simulateur -> repère three.js : (x, z, -y)
    tmp.vel.set((px[lo + 1] - px[lo]) / dt, (pz[lo + 1] - pz[lo]) / dt, -(py[lo + 1] - py[lo]) / dt);
    tmp.speed = L(sp);
    tmp.i = lo; tmp.f = f;
    return tmp;
  }

  // ---------------------------------------------------------------- décor statique
  // dehors : ciel physique et soleil ; dedans : pas de ciel, projecteurs doux et reflets de salle (RoomEnvironment) sur le parquet, le verre et le cercle
  let roomEnv = null;
  function setAtmosphere(indoor) {
    sky.visible = !indoor;
    if (indoor && !roomEnv) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    }
    scene.environment = indoor ? roomEnv : null;
    hemi.intensity = indoor ? 0.2 : 0.85;
    sun.intensity = indoor ? 1.5 : 2.1;
    sun.color.copy(indoor ? kit.paper.clone().lerp(kit.gold, 0.12) : kit.paper);
    renderer.toneMappingExposure = indoor ? 0.8 : 0.9;
  }

  function disposeGroup(g) {
    g.traverse((o) => {
      o.geometry?.dispose?.();
      const m = o.material;
      for (const mm of Array.isArray(m) ? m : m ? [m] : []) { mm.map?.dispose?.(); mm.dispose?.(); }
    });
    g.clear();
  }

  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });

  function buildScenery(geom, skip = new Set()) {
    const g = new THREE.Group();
    const bandAt = (x) => geom.top.find((b) => b.kind === "band" && Math.abs(b.x - x) < 0.8);
    for (const sh of geom.side) {
      if (sh.label && skip.has(sh.label)) continue;      // déjà dessiné par le décor de la situation
      if (sh.kind === "rect") {
        const b = bandAt(sh.x + sh.w / 2) ?? bandAt(sh.x);
        const y0 = b ? b.y0 : -3, y1 = b ? b.y1 : 3;
        const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(sh.w, 0.3), sh.h, y1 - y0), std(kit.rail.clone().lerp(kit.green, 0.35)));
        m.position.copy(P(sh.x + sh.w / 2, (y0 + y1) / 2, sh.h / 2));
        m.castShadow = m.receiveShadow = true;
        g.add(m);
      } else if (sh.kind === "post" && sh.label === "but") {
        const b = bandAt(sh.x);
        const y0 = b ? b.y0 : -3.66, y1 = b ? b.y1 : 3.66, h = sh.z1;
        const white = std(kit.paper, { roughness: 0.4 });
        for (const y of [y0, y1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 16), white);
          post.position.copy(P(sh.x, y, h / 2)); post.castShadow = true; g.add(post);
        }
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, y1 - y0, 16), white);
        bar.rotation.x = Math.PI / 2; bar.position.copy(P(sh.x, (y0 + y1) / 2, h)); bar.castShadow = true; g.add(bar);
        const net = new THREE.MeshBasicMaterial({ color: kit.paper, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
        const back = new THREE.Mesh(new THREE.PlaneGeometry(y1 - y0, h), net);
        back.rotation.y = Math.PI / 2; back.position.copy(P(sh.x + 1.6, (y0 + y1) / 2, h / 2)); g.add(back);
        const roof = new THREE.Mesh(new THREE.PlaneGeometry(1.6, y1 - y0), net);
        roof.rotation.set(-Math.PI / 2, 0, Math.PI / 2); roof.position.copy(P(sh.x + 0.8, (y0 + y1) / 2, h)); g.add(roof);
      } else if (sh.kind === "post" && sh.label === "planche") {
        const b = bandAt(sh.x);
        const y0 = b ? b.y0 : -0.9, y1 = b ? b.y1 : 0.9;
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.06, sh.z1 - sh.z0, y1 - y0), std(kit.paper, { roughness: 0.3, transparent: true, opacity: 0.85 }));
        board.position.copy(P(sh.x, 0, (sh.z0 + sh.z1) / 2)); board.castShadow = true; g.add(board);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, sh.z1, 12), std(kit.ink));
        pole.position.copy(P(sh.x + 0.9, 0, sh.z1 / 2)); pole.castShadow = true; g.add(pole);
      } else if (sh.kind === "hoop") {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(sh.r, 0.013, 12, 48), std(kit.gold, { metalness: 0.6, roughness: 0.3 }));
        ring.rotation.x = Math.PI / 2; ring.position.copy(P(sh.x, 0, sh.z)); ring.castShadow = true; g.add(ring);
        const net = [], N = 14;                          // filet : 14 brins qui se resserrent sous le cercle
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2;
          net.push(P(sh.x + Math.cos(a) * sh.r, Math.sin(a) * sh.r, sh.z), P(sh.x + Math.cos(a) * sh.r * 0.55, Math.sin(a) * sh.r * 0.55, sh.z - 0.42));
        }
        g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(net), new THREE.LineBasicMaterial({ color: kit.paper, transparent: true, opacity: 0.8 })));
      }
    }
    return g;
  }

  function buildWorld(d) {
    disposeGroup(world);
    const [light, dark] = lawn();
    const spec = groundSpec(d.scenario, kit, { light, dark, xmax, ext });
    const length = spec.length ?? Math.max(90, xmax * 1.5 + 80);
    const width = spec.width ?? Math.max(70, 2 * (ymaxAbs() + 45));
    const band = spec.band ?? (length > 260 ? 10 : length > 140 ? 5 : 2.5);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(length, width),
      spec.indoor
        ? new THREE.MeshStandardMaterial({ color: spec.floor, roughness: 0.55 })               // sol de la salle
        : new THREE.MeshStandardMaterial({ map: stripes(spec.light, spec.dark, band, length), roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(spec.x0 ?? length / 2 - 40, 0, 0);
    ground.receiveShadow = true;
    world.add(ground);
    if (!spec.indoor) {
      const far = new THREE.Mesh(new THREE.CircleGeometry(3500, 48), new THREE.MeshStandardMaterial({ color: dark, roughness: 1 }));
      far.rotation.x = -Math.PI / 2; far.position.y = -0.04;           // terre au-delà du terrain, fondue dans le brouillard
      world.add(far);
    }
    const env = buildEnvironment(d.scenario, d.geometry, kit, { xmax, ext, light, dark });
    world.add(env.group);
    world.add(buildScenery(d.geometry, env.handles));
    grass = spec.grass
      ? grassPatch(kit, { light: spec.light, dark: spec.dark, band, origin: ground.position.x - length / 2, fair: spec.fair })
      : null;
    if (grass) { world.add(grass.group); grass.group.visible = quality === "high"; }
    const cloudsFx = clouds(kit, xmax * 0.5);
    if (!env.indoor) world.add(cloudsFx.group);
    setAtmosphere(env.indoor);
    envUpdate = (dt, now, anim) => {
      env.update(dt);
      if (anim) cloudsFx.update(dt);
      grass?.update(camera, now, anim, windVec.length());
    };
    scene.fog = env.indoor ? new THREE.Fog(kit.rail.clone().lerp(kit.ink, 0.6), 50, 150) : new THREE.Fog(horizon, ext * 1.6 + 60, ext * 6 + 500);
  }
  const ymaxAbs = () => py.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

  // ---------------------------------------------------------------- balle, tracés, marques
  function polylineToTube(points, radius) {
    if (points.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    const segs = Math.min(260, Math.max(8, points.length * 2));
    const geo = new THREE.TubeGeometry(curve, segs, radius, 8, false);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: kit.traj, emissive: kit.traj, emissiveIntensity: 0.55, roughness: 0.35 }),
    );
    mesh.castShadow = false;
    return { mesh, segs, radial: 8 };
  }

  // les balles fantômes suivent l'échelle de la balle (donc la distance de la caméra)
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v3 = new THREE.Vector3();
  function setGhostScale(k) {
    if (!ghosts || Math.abs(k - ghostScale) < ghostScale * 0.08) return;
    ghostScale = k;
    marks.forEach((m, i) => {
      const p = P(m.x, m.y, m.z); p.y += vrMin;
      m4.compose(p, q0, v3.setScalar(k));
      ghosts.setMatrixAt(i, m4);
    });
    ghosts.instanceMatrix.needsUpdate = true;
  }

  function buildDynamic(d) {
    if (ballMesh) ballMesh.material.map = null;      // la texture de la balle est réutilisée : on ne la libère pas avec le reste
    disposeGroup(dyn);
    trail = []; rings = []; ghosts = null; marks = d.strobe.marks; impacts = d.impacts;
    const S = d.samples;
    const dist = Math.max(d.summary.distance, 5);
    vrMin = Math.max(d.ball.diameter / 2, 0.12);        // taille mini : visible de près
    vr = Math.max(vrMin, 0.012 * ext);                  // taille maxi : visible de loin (la balle grossit avec la distance caméra)

    // balle : sphère texturée, orientation intégrée à partir de la rotation calculée par Python
    if (ballKey !== d.ball.key) { ballTex?.dispose?.(); ballTex = ballTexture(d.ball.key, kitHex()); ballKey = d.ball.key; }
    ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 32),
      new THREE.MeshStandardMaterial({ map: ballTex, bumpMap: ballBump(), bumpScale: d.ball.key === "golf" ? 1.4 : 0.55, roughness: 0.62 }),
    );
    ballMesh.scale.setScalar(vr);
    ballMesh.castShadow = true;
    ballGroup = new THREE.Group();
    ballGroup.add(ballMesh);
    dyn.add(ballGroup);

    // tracé en tronçons : un par vol et un pour le roulé, jamais lissé à travers un rebond
    const cuts = [0];
    for (const im of impacts) {
      const i = tt.findIndex((v) => v >= im.t - 1e-3);       // l'API arrondit les instants : on tolère 1 ms
      cuts.push(i < 0 ? tt.length - 1 : i);
    }
    cuts.push(tt.length - 1);
    const lift = (v) => v.setY(v.y + vrMin);
    for (let k = 0; k < cuts.length - 1; k++) {
      const a = cuts[k], b = cuts[k + 1];
      const pts = [], times = [];
      if (k > 0) { pts.push(lift(P(impacts[k - 1].x, impacts[k - 1].y, 0))); times.push(impacts[k - 1].t); }
      for (let i = a; i <= b; i++) {
        if (k > 0 && tt[i] <= impacts[k - 1].t) continue;
        if (k < impacts.length && tt[i] >= impacts[k].t) break;
        pts.push(lift(P(px[i], py[i], pz[i]))); times.push(tt[i]);
      }
      if (k < impacts.length) { pts.push(lift(P(impacts[k].x, impacts[k].y, 0))); times.push(impacts[k].t); }
      const clean = pts.filter((v) => Number.isFinite(v.x + v.y + v.z));
      if (clean.length < 2 || clean.length !== pts.length) continue;
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
      const tube = polylineToTube(pts, Math.max(0.035, vr * 0.16));
      if (!tube) continue;
      dyn.add(tube.mesh);
      const ghost = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: kit.traj, transparent: true, opacity: 0.3 }),
      );
      dyn.add(ghost);
      trail.push({ ...tube, times, cum, total: cum[cum.length - 1] || 1 });
    }

    // chronophotographie : la balle fantôme à chaque intervalle de temps
    ghosts = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshStandardMaterial({ color: kit.ball, roughness: 0.5, transparent: true, opacity: 0.55 }),
      Math.max(1, marks.length),
    );
    ghostScale = 0;
    setGhostScale(vr * 0.5);
    ghosts.count = 0;
    dyn.add(ghosts);

    // anneaux de contact avec le sol
    for (const im of impacts) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(vrMin * 1.5, vrMin * 1.9, 48),
        new THREE.MeshBasicMaterial({ color: kit.gold, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(P(im.x, im.y, 0)).setY(0.03);
      ring.visible = false;
      dyn.add(ring);
      rings.push({ ring, t: im.t });
    }

    // axe de rotation de la balle (flèche or) : d'où vient l'effet Magnus
    spinArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, kit.gold, 0.3, 0.18);
    spinArrow.visible = false;
    dyn.add(spinArrow);

    // poussière aux contacts avec le sol
    puffs = impacts.map((im) => {
      const n = 26;
      let a = Math.round(im.x * 100) + 7;
      const rand = () => (a = (a * 1664525 + 1013904223) >>> 0) / 4294967296;
      const dirs = Array.from({ length: n }, () => {
        const th = rand() * Math.PI * 2, up = 0.25 + rand() * 0.75;
        return new THREE.Vector3(Math.cos(th) * (1 - up * 0.5), up, Math.sin(th) * (1 - up * 0.5)).multiplyScalar(0.6 + rand() * 1.4);
      });
      const geo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        color: kit.paper.clone().lerp(kit.gold, 0.3), size: vrMin * 1.7, transparent: true, opacity: 0, depthWrite: false,
      }));
      pts.frustumCulled = false;
      pts.position.copy(P(im.x, im.y, 0));
      pts.visible = false;
      dyn.add(pts);
      return { pts, dirs, t: im.t, n };
    });

    // vent : particules qui dérivent dans le sens du vent (seulement s'il y en a)
    const wind = d.wind ?? { x: 0, y: 0 };
    windVec.set(wind.x, 0, -wind.y);
    windPts = null;
    if (windVec.length() > 0.3) {
      const n = 240, arr = new Float32Array(n * 3);
      Object.assign(windBox, { x0: -20, x1: xmax + 60, zh: Math.max(25, ymaxAbs() + 25) });
      for (let i = 0; i < n; i++) {
        arr[i * 3] = windBox.x0 + Math.random() * (windBox.x1 - windBox.x0);
        arr[i * 3 + 1] = 0.3 + Math.random() * Math.max(zmax * 1.4, 8);
        arr[i * 3 + 2] = (Math.random() * 2 - 1) * windBox.zh;
      }
      windPts = new THREE.Points(
        new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(arr, 3)),
        new THREE.PointsMaterial({ color: kit.paper, size: Math.max(0.14, ext * 0.004), transparent: true, opacity: 0.6, depthWrite: false }),
      );
      windPts.frustumCulled = false;
      dyn.add(windPts);
    }

    // orientation de la balle à chaque échantillon (intégration de la rotation calculée par Python)
    qs = [new THREE.Quaternion()];
    const q = new THREE.Quaternion(), axis = new THREE.Vector3();
    for (let i = 1; i < tt.length; i++) {
      axis.set(
        (om[i - 1].x + om[i].x) / 2, (om[i - 1].z + om[i].z) / 2, -(om[i - 1].y + om[i].y) / 2,
      );
      const w = axis.length();
      q.setFromAxisAngle(w > 1e-9 ? axis.divideScalar(w) : new THREE.Vector3(0, 1, 0), w * (tt[i] - tt[i - 1]));
      qs.push(q.clone().multiply(qs[i - 1]));
    }
  }

  // ---------------------------------------------------------------- caméras
  function frameFor(name) {
    const mid = xmax * 0.5;
    if (name === "aerien") {
      const h = Math.max(ext * 1.15, 14);
      return { pos: P(mid, 0.001, h), target: P(mid, 0, 0) };
    }
    if (name === "arrivee") {
      return {
        pos: P(xend + Math.max(6, ext * 0.16), -(py[py.length - 1] || 0) * 0.5 - 2.4, 1.5 + Math.min(4, zmax * 0.15)),
        target: P(xend * 0.42, 0, Math.max(zmax * 0.45, 1.2)),
      };
    }
    const long = ext > 90;                          // tirs très longs (golf, home run) : on se rapproche pour lire l'arc
    const dist = Math.max(ext * (long ? 0.72 : 1.05), 11);    // à droite du tireur : le tir va de gauche à droite
    return { pos: P(mid, -dist, Math.max(zmax * 1.1, 4) + ext * (long ? 0.08 : 0.16)), target: P(mid, 0, Math.max(zmax * 0.25, 0.8)) };
  }

  function setCamera(name, instant = false) {
    mode = name;
    onMode(name);
    if (name === "suivi" || name === "cine") {
      controls.enabled = false;
      camera.fov = name === "cine" ? 46 : 40;
      camera.updateProjectionMatrix();
      return;
    }
    controls.enabled = true;
    const f = frameFor(name);
    camera.fov = name === "arrivee" ? 52 : 40;
    camera.updateProjectionMatrix();
    if (instant || reduce.matches) {
      camera.position.copy(f.pos); controls.target.copy(f.target); controls.update();
      tween = null;
    } else {
      tween = { t0: performance.now(), dur: 900, p0: camera.position.clone(), p1: f.pos, g0: controls.target.clone(), g1: f.target };
    }
  }
  controls.addEventListener("start", () => {
    tween = null;
    if (mode === "suivi" || mode === "cine") { mode = "libre"; controls.enabled = true; onMode("libre"); }
    else if (mode !== "libre") { mode = "libre"; onMode("libre"); }
  });

  function updateCamera(dt, ballPos) {
    if (mode === "cine") {
      const u = T > 0 ? curT / T : 0;
      const hv = Math.hypot(tmp.vel.x, tmp.vel.z);
      if (hv > 0.5) heading.set(tmp.vel.x / hv, 0, tmp.vel.z / hv);
      const d = Math.max(4.5, vrMin * 24);
      let want, look, rate;
      if (u < 0.28) {                          // plan 1 : derrière la balle
        want = ballPos.clone().addScaledVector(heading, -d).setY(ballPos.y + d * 0.28 + vrMin);
        look = ballPos.clone().addScaledVector(heading, d * 0.7);
        rate = 4.5;
      } else if (u < 0.74) {                   // plan 2 : travelling de côté
        const side = Math.max(7, ext * 0.28);
        want = new THREE.Vector3(ballPos.x + ext * 0.05, ballPos.y + ext * 0.04 + 1.4, ballPos.z + side);
        look = ballPos.clone().addScaledVector(heading, side * 0.25);
        rate = 2.4;
      } else {                                 // plan 3 : face à l'arrivée
        want = new THREE.Vector3(xend + Math.max(5, ext * 0.12), 1.7 + zmax * 0.05, -(py[py.length - 1] || 0) + Math.max(2, ext * 0.03));
        look = ballPos.clone();
        rate = 2.0;
      }
      const k = reduce.matches || curT < 0.03 ? 1 : 1 - Math.exp(-dt * rate);
      camera.position.lerp(want, k);
      lookAt.lerp(look, k);
      camera.position.y = Math.max(camera.position.y, 0.6);
      camera.lookAt(lookAt);
      return;
    }
    if (mode === "suivi") {
      const hv = Math.hypot(tmp.vel.x, tmp.vel.z);
      if (hv > 0.5) heading.set(tmp.vel.x / hv, 0, tmp.vel.z / hv);
      const d = Math.max(4.5, vr * 24);
      const want = ballPos.clone().addScaledVector(heading, -d).setY(ballPos.y + d * 0.3 + vr);
      const k = reduce.matches ? 1 : 1 - Math.exp(-dt * 4.5);
      camera.position.lerp(want, k);
      lookAt.lerp(ballPos.clone().addScaledVector(heading, d * 0.7), k);
      camera.position.y = Math.max(camera.position.y, 0.6);
      camera.lookAt(lookAt);
      return;
    }
    if (tween) {
      const p = Math.min(1, (performance.now() - tween.t0) / tween.dur), e = easeOut(p);
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.g0, tween.g1, e);
      if (p >= 1) tween = null;
    }
    controls.update();
  }

  // ---------------------------------------------------------------- scène à l'instant t
  function place(time) {
    const s = sampleAt(time);
    const p = s.pos.clone().setY(s.pos.y + vrMin);
    const bs = Math.min(vr, Math.max(vrMin, camera.position.distanceTo(p) * 0.012));
    ballMesh.scale.setScalar(bs);
    setGhostScale(bs * 0.5);
    ballGroup.position.copy(p);
    ballMesh.quaternion.copy(qs[s.i]).slerp(qs[Math.min(s.i + 1, qs.length - 1)], s.f);
    {
      const a = om[s.i], b = om[Math.min(s.i + 1, om.length - 1)];
      const ox = a.x + (b.x - a.x) * s.f, oy = a.y + (b.y - a.y) * s.f, oz = a.z + (b.z - a.z) * s.f;
      const mag = Math.hypot(ox, oy, oz);
      spinArrow.visible = mag > 5;
      if (spinArrow.visible) {
        spinArrow.position.copy(p);
        spinArrow.setDirection(new THREE.Vector3(ox / mag, oz / mag, -oy / mag));
        spinArrow.setLength(bs * 3.4, bs * 1.0, bs * 0.6);
      }
    }
    for (const pf of puffs) {
      const age = time - pf.t;
      pf.pts.visible = age >= 0 && age < 2.8;
      if (pf.pts.visible) {
        const pos = pf.pts.geometry.attributes.position, k = (1 - Math.exp(-age * 2.6)) / 2.6;
        for (let i = 0; i < pf.n; i++) {
          pos.setXYZ(i, pf.dirs[i].x * k * 3, Math.max(0.03, vrMin * 0.6 + pf.dirs[i].y * k * 3 - 0.08 * age * age), pf.dirs[i].z * k * 3);
        }
        pos.needsUpdate = true;
        pf.pts.material.opacity = 0.75 * Math.exp(-age * 1.5);
      }
    }
    for (const tr of trail) {
      const ta = tr.times[0], tb = tr.times[tr.times.length - 1];
      let frac = 0;
      if (time >= tb) frac = 1;
      else if (time > ta) {
        let j = 1;
        while (j < tr.times.length - 1 && tr.times[j] < time) j++;
        const u = (time - tr.times[j - 1]) / (tr.times[j] - tr.times[j - 1] || 1e-9);
        frac = (tr.cum[j - 1] + (tr.cum[j] - tr.cum[j - 1]) * u) / tr.total;
      }
      tr.mesh.geometry.setDrawRange(0, Math.floor(frac * tr.segs) * tr.radial * 6);
    }
    let n = 0;
    while (n < marks.length && marks[n].t <= time + 1e-9) n++;
    ghosts.count = n;
    for (const r of rings) {
      const age = time - r.t;
      r.ring.visible = age >= 0;
      if (age >= 0) {
        const k = 1 + 2.4 * (1 - Math.exp(-age * 3.5));
        r.ring.scale.setScalar(k);
        r.ring.material.opacity = 0.9 * Math.exp(-age * 0.9);
      }
    }
    // l'ombre suit la balle : résolution fine autour d'elle quelle que soit la longueur du tir
    const S = Math.min(130, Math.max(28, ext * 0.55));
    const texel = (S * 2) / 2048, sx = Math.round(p.x / texel) * texel, sz = Math.round(p.z / texel) * texel;   // l'ombre ne scintille pas
    sun.position.set(sx - S * 0.9, S * 1.7, sz + S * 0.8);
    sun.target.position.set(sx, 0, sz);
    if (Math.abs(sun.shadow.camera.right - S) > 1) {
      Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: S * 5 });
      sun.shadow.camera.updateProjectionMatrix();
    }
    sky.position.copy(camera.position);
    return { p, s };
  }

  function writeHud(time) {
    const s = tmp;
    const i = s.i;
    const x = px[i] + (px[Math.min(i + 1, px.length - 1)] - px[i]) * s.f;
    const z = pz[i] + (pz[Math.min(i + 1, pz.length - 1)] - pz[i]) * s.f;
    hud.time.textContent = `${nf(time, 2)} s`;
    hud.dist.textContent = `${nf(x, 1)} m`;
    hud.height.textContent = `${nf(Math.max(z, 0), 2)} m`;
    hud.speed.textContent = `${nf(s.speed, 1)} m/s`;
    hud.kmh.textContent = `${nf(s.speed * 3.6, 0)} km/h`;
  }

  // qualité : « standard » = rendu direct ; « élevée » = halo (bloom), ombres fines, herbe, résolution écran
  function renderFrame() {
    if (composer && quality === "high") composer.render(); else renderer.render(scene, camera);
  }
  function applyQuality() {
    const high = quality === "high";
    renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    if (high && !composer) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.55, 0.92));
      composer.addPass(new OutputPass());
    }
    if (grass) grass.group.visible = high;
    resize();
  }

  // arrête et abandonne un enregistrement en cours (réglage modifié, onglet masqué...) : le bouton se libère
  function abortRecording(reason) {
    if (!recorder) return;
    const r = recorder, done = recDone;
    recorder = null; recDone = null;
    r.onstop = null;
    try { r.stop(); } catch { /* déjà arrêté */ }
    loop = savedLoop;
    done?.(null, reason);
  }

  function updateWind(dt) {
    if (!windPts) return;
    const pos = windPts.geometry.attributes.position, b = windBox, span = b.x1 - b.x0;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) + windVec.x * dt, z = pos.getZ(i) + windVec.z * dt;
      if (x > b.x1) x -= span; else if (x < b.x0) x += span;
      if (z > b.zh) z -= 2 * b.zh; else if (z < -b.zh) z += 2 * b.zh;
      pos.setXYZ(i, x, pos.getY(i), z);
    }
    pos.needsUpdate = true;
  }

  // photo : on dessine puis on lit le canvas dans la même tâche (sans quoi WebGL l'a déjà vidé)
  function snapshot() {
    return new Promise((resolve) => { renderFrame(); canvas.toBlob(resolve, "image/png"); });
  }

  // vidéo : un tir complet, une seule fois, enregistré depuis le canvas (sans les bandeaux de la page)
  function record(onDone) {
    if (recorder) return false;
    if (!canvas.captureStream || !window.MediaRecorder) { onDone(null, "Enregistrement vidéo non pris en charge par ce navigateur."); return false; }
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
    recorder = new MediaRecorder(canvas.captureStream(60), { mimeType: mime, videoBitsPerSecond: 9_000_000 });
    recChunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
    recDone = onDone;
    recorder.onstop = () => { const blob = new Blob(recChunks, { type: "video/webm" }); recorder = null; recDone = null; loop = savedLoop; onDone(blob); };
    savedLoop = loop; loop = false;
    t = 0; heading.set(1, 0, 0); playing = true;
    recorder.start(200);
    return true;
  }

  // ---------------------------------------------------------------- boucle
  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(2, Math.round(r.width)), h = Math.max(2, Math.round(r.height));
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.25, (now - last) / 1000 || 0);       // temps réel même si l'écran est lent (sans carte graphique)
    last = now;
    if (!data) return;
    if (playing) {
      let k = speed;
      slow = false;
      if (mode === "cine") for (const im of impacts) if (Math.abs(t - im.t) < 0.3) { k *= 0.3; slow = true; break; }   // ralenti aux contacts
      t += dt * k;
      if (t > T + HOLD) {
        if (loop) { t = 0; heading.set(1, 0, 0); } else { t = T; playing = false; if (recorder) recorder.stop(); }
      }
    }
    const tBall = Math.min(t, T);
    curT = tBall;
    envUpdate(dt, now / 1000, !reduce.matches);
    if (!reduce.matches) updateWind(dt);
    const { p } = place(tBall);
    updateCamera(dt, p);
    renderFrame();
    hudAcc += dt;
    if (hudAcc > 0.05 || !playing) { hudAcc = 0; writeHud(tBall); onFrame({ t: tBall, T, playing, slow }); }
  }

  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }
  function startLoop() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  // ---------------------------------------------------------------- interface publique
  function setData(d, { restart = true } = {}) {
    abortRecording("Enregistrement interrompu : le réglage a changé.");
    data = d;
    const S = d.samples;
    tt = S.t; px = S.x; py = S.y; pz = S.z; sp = S.speed;
    om = S.t.map((_, i) => ({ x: S.omega.x[i], y: S.omega.y[i], z: S.omega.z[i] }));
    T = tt[tt.length - 1] || 1;
    xmax = Math.max(...px, 5); zmax = Math.max(...pz, 1); xend = px[px.length - 1];
    ext = Math.max(xmax, zmax * 2, 8);
    const fixedVenue = d.scenario !== "Drive golf" && d.scenario !== "Libre";   // terrain de taille fixe : inutile de le reconstruire à chaque réglage
    const key = fixedVenue ? d.scenario : `${d.scenario}|${Math.round(ext / 10)}|${Math.round(ymaxAbs())}`;
    refreshKit();
    if (key !== staticKey) { staticKey = key; buildWorld(d); if (active) setCamera(mode === "libre" ? "tribune" : mode, true); }
    buildDynamic(d);
    if (restart) { t = 0; hold = 0; if (!reduce.matches) playing = true; else t = T; }
    t = Math.min(t, T);
    if (!active) return;
    if (mode === "suivi") { const f = sampleAt(t); camera.position.copy(P(px[0], py[0], pz[0])).addScaledVector(heading, -8).setY(2.5); lookAt.copy(f.pos); }
    place(Math.min(t, T)); writeHud(Math.min(t, T));
    onFrame({ t: Math.min(t, T), T, playing });         // la barre de lecture suit tout de suite la nouvelle durée
  }

  function setActive(on) {
    active = on;
    if (on) {
      resize();
      if (data) { setCamera(mode === "libre" ? "tribune" : mode, true); place(Math.min(t, T)); }
      startLoop();
    } else { abortRecording("Enregistrement interrompu : la vue 3D a été quittée."); stopLoop(); }
  }

  new ResizeObserver(() => active && resize()).observe(canvas);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { abortRecording("Enregistrement interrompu : la page a été masquée."); stopLoop(); }
    else if (active) startLoop();
  });

  return {
    setData, setActive, setCamera,
    play() { if (t >= T) t = 0; playing = true; },
    pause() { playing = false; },
    toggle() { if (playing) playing = false; else { if (t >= T) t = 0; playing = true; } return playing; },
    seek(time) { t = Math.min(Math.max(time, 0), T); playing = false; if (data) { place(t); writeHud(t); } },
    replay() { t = reduce.matches ? T : 0; heading.set(1, 0, 0); playing = !reduce.matches; if (data) place(t); },
    setSpeed(v) { speed = v; },
    snapshot, record,
    setQuality(q) { quality = q; applyQuality(); },
    get quality() { return quality; },
    setLoop(v) { loop = v; },
    get duration() { return T; },
    get playing() { return playing; },
    get mode() { return mode; },
  };
}
