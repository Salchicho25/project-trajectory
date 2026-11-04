// Dessin du relevé sur pelouse rayée. Aucune physique ici : tout vient de l'API Python.
//
// Les bandes de tonte sont des carreaux à l'échelle : un carreau est carré à l'écran mais vaut
// un nombre « rond » d'unités, différent en x et en z. L'écart (échelle verticale) est écrit
// sur la feuille : on ne triche pas sur les proportions.

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const FONT = '"Barlow Semi Condensed", "Arial Narrow", system-ui, sans-serif';

export const nf = (v, d = 0) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

function palette() {
  return {
    paper: css("--paper"), turfA: css("--turf-a"), turfB: css("--turf-b"),
    g5: css("--grid-5"), g10: css("--grid-10"),
    ink: css("--ink"), ink2: css("--ink-2"), rail: css("--rail"), gold: css("--gold"),
    traj: css("--traj"), traj2: css("--traj-2"), green: css("--green"), ball: css("--ball"),
  };
}

function niceCeil(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 4, 5, 8, 10]) if (m * p >= v * 0.9999) return m * p;
  return 10 * p;
}

function decimals(step) {
  let d = 0;
  while (d < 3 && Math.abs(step * 10 ** d - Math.round(step * 10 ** d)) > 1e-9) d++;
  return d;
}

const occupied = [];   // rectangles des libellés déjà posés : sert à éviter les collisions

function setup(canvas) {
  occupied.length = 0;
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(1, Math.round(r.width));
  const H = Math.max(1, Math.round(r.height));
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W, H };
}

function gridLines(ctx, area, ox, oy, step, color, width) {
  if (step < 3.2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let x = ox + Math.ceil((area.x - ox) / step) * step; x <= area.x + area.w + 0.5; x += step) {
    const px = Math.round(x) + 0.5;
    ctx.moveTo(px, area.y);
    ctx.lineTo(px, area.y + area.h);
  }
  for (let y = oy + Math.ceil((area.y - oy) / step) * step; y <= area.y + area.h + 0.5; y += step) {
    const py = Math.round(y) + 0.5;
    ctx.moveTo(area.x, py);
    ctx.lineTo(area.x + area.w, py);
  }
  ctx.stroke();
}

function paper(ctx, pal, W, H, area, ox, oy, s, stripes = true) {
  ctx.fillStyle = pal.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  // bandes de tonte : une par carreau, alternées
  ctx.fillStyle = pal.turfA;
  ctx.fillRect(area.x, area.y, area.w, area.h);
  for (let i = Math.floor((area.x - ox) / s) - 1; stripes && ox + i * s < area.x + area.w; i++) {
    if (i % 2 === 0) continue;
    ctx.fillStyle = pal.turfB;
    ctx.fillRect(ox + i * s, area.y, s + 0.5, area.h);
  }
  gridLines(ctx, area, ox, oy, s / 2, pal.g5, 1);
  gridLines(ctx, area, ox, oy, s, pal.g10, 1);
  ctx.restore();
  ctx.strokeStyle = pal.rail;
  ctx.lineWidth = 1;
  ctx.strokeRect(area.x + 0.5, area.y + 0.5, area.w - 1, area.h - 1);
}

function box(ctx, str, x, y, size, align, baseline) {
  const w = ctx.measureText(str).width;
  const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  const top = baseline === "middle" ? y - size / 2 : y - size * 0.85;
  return { l: left - 2, r: left + w + 2, t: top - 1, b: top + size * 1.1 + 1 };
}

function text(ctx, str, x, y, { color, size = 11.5, weight = 500, align = "left", baseline = "alphabetic" }) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
  occupied.push(box(ctx, str, x, y, size, align, baseline));
}

// vrai si le libellé tiendrait sans recouvrir un libellé déjà posé
function isFree(ctx, str, x, y, { size = 11.5, weight = 500, align = "left", baseline = "alphabetic" }) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const b = box(ctx, str, x, y, size, align, baseline);
  return !occupied.some((o) => b.l < o.r && b.r > o.l && b.t < o.b && b.b > o.t);
}

function extent(data) {
  const sets = [data.samples];
  if (data.vacuum) sets.push(data.vacuum);
  if (data.nospin) sets.push(data.nospin);
  let xmax = 0, zmax = 0, ymax = 0;
  for (const s of sets) {
    xmax = Math.max(xmax, ...s.x);
    zmax = Math.max(zmax, ...s.z);
    ymax = Math.max(ymax, ...s.y.map(Math.abs));
  }
  return { xmax, zmax, ymax };
}

// ---------------------------------------------------------------- cadre : vue de côté
function sideFrame(W, H, data, view, cell) {
  const ex = extent(data);
  const mL = 48, mR = 16, mT = 16, mB = 30, pad = 10;
  const ph = H - mT - mB;
  const R = Math.max(2, Math.round((ph - pad) / cell));
  const s = (ph - pad) / R;
  const pw = W - mL - mR;
  const cols = (pw - pad) / s;
  const stepX = niceCeil(Math.max(view.x, ex.xmax * 1.03) / cols);
  const stepZ = niceCeil(Math.max(view.z, ex.zmax * 1.12) / R);
  const area = { x: mL, y: mT, w: pw, h: ph };
  const x0 = mL + pad;
  const y0 = mT + R * s;
  return { area, s, x0, y0, stepX, stepZ, kx: s / stepX, kz: s / stepZ, mL, mB, W, H };
}

function topFrame(side, W, H, data, view) {
  const ex = extent(data);
  const mT = 16, mB = 30;
  const ph = H - mT - mB;
  // on subdivise les carreaux (÷1, ÷2, ÷4) jusqu'à avoir au moins 3 rangées de chaque côté de l'axe
  const k = [1, 2, 4].find((d) => Math.floor(ph / (2 * (side.s / d))) >= 3) ?? 4;
  const s = side.s / k;
  const half = Math.max(1, Math.floor(ph / (2 * s)));
  const stepY = niceCeil(Math.max(view.y, ex.ymax * 1.3) / half);
  return {
    area: { x: side.area.x, y: mT, w: side.area.w, h: ph },
    s, x0: side.x0, yc: mT + ph / 2, stepX: side.stepX / k, stepY,
    kx: side.kx, ky: s / stepY, half, labelEvery: k, W, H,
  };
}

function axisLabels(ctx, pal, f, { vertical }) {
  const { area, s } = f;
  const opts = { color: pal.ink2, size: 11.5 };
  const every = (f.labelEvery || 1) * (s < 34 ? 2 : 1);
  for (let i = 0, x = f.x0; x <= area.x + area.w; i++, x += s) {
    if (i % every) continue;
    text(ctx, nf(i * f.stepX, decimals(f.stepX * every)), x, area.y + area.h + 15, { ...opts, align: "center" });
  }
  text(ctx, "x (m)", area.x + area.w, f.H - 4, { ...opts, align: "right" });
  if (vertical === "z") {
    for (let i = 0, y = f.y0; y >= area.y - 1; i++, y -= s) {
      text(ctx, nf(i * f.stepZ, decimals(f.stepZ)), area.x - 6, y, { ...opts, align: "right", baseline: "middle" });
    }
    text(ctx, "z (m)", area.x - 6, 9, { ...opts, align: "right" });
  } else {
    for (let i = -f.half; i <= f.half; i++) {
      text(ctx, nf(i * f.stepY, decimals(f.stepY)), area.x - 6, f.yc - i * s, { ...opts, align: "right", baseline: "middle" });
    }
    text(ctx, "y (m)", area.x - 6, 9, { ...opts, align: "right" });
  }
}

function scaleNote(ctx, pal, f, other, otherName, axisWord, interval = null) {
  const ratio = f.stepX / other;
  const fmt = (v) => nf(v, decimals(v));
  const right = f.area.x + f.area.w - 8;
  let y = f.area.y + 15;
  if (Math.abs(ratio - 1) > 1e-6) {
    // l'échelle n'est pas 1:1 : on le dit sur une pastille pleine, impossible à rater
    const label = `Échelle ${axisWord} ×${nf(ratio, ratio < 10 ? 1 : 0)} (${ratio > 1 ? "dilatée" : "compressée"})`;
    ctx.font = `700 12px ${FONT}`;
    const w = ctx.measureText(label).width + 14;
    const x = f.area.x + f.area.w - 6 - w;
    ctx.fillStyle = pal.rail;
    ctx.fillRect(x, f.area.y + 6, w, 20);
    text(ctx, label, x + 7, f.area.y + 20, { color: pal.paper, size: 12, weight: 700 });
    occupied.push({ l: x, r: x + w, t: f.area.y + 6, b: f.area.y + 26 });
    y += 24;
  }
  text(ctx, `1 carreau = ${fmt(f.stepX)} m en x, ${fmt(other)} m en ${otherName}`, right, y, { color: pal.ink2, size: 11.5, align: "right" });
  if (interval !== null) {
    const str = `balle toutes les ${nf(interval, decimals(interval))} s`;
    ctx.font = `500 11.5px ${FONT}`;
    const w = ctx.measureText(str).width;
    text(ctx, str, right, y + 15, { color: pal.ink2, size: 11.5, align: "right" });
    ctx.fillStyle = pal.ball; ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(right - w - 9, y + 11, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}

// ---------------------------------------------------------------- décor
function drawScenery(ctx, pal, shapes, toPx, side) {
  ctx.strokeStyle = pal.ink;
  ctx.fillStyle = pal.ink;
  for (const sh of shapes) {
    if (sh.kind === "rect") {
      const [x1, y1] = toPx(sh.x, sh.z + sh.h);
      const [x2, y2] = toPx(sh.x + sh.w, sh.z);
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x1, y1, Math.max(3, x2 - x1), y2 - y1);
      ctx.globalAlpha = 1;
      if (sh.label) text(ctx, sh.label, x1 + 4, y1 - 5, { color: pal.ink, size: 12, weight: 600 });
    } else if (sh.kind === "post") {
      const [x, y1] = toPx(sh.x, sh.z1);
      const [, y2] = toPx(sh.x, sh.z0);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke();
      if (sh.label) text(ctx, sh.label, x + 6, y1 + 11, { color: pal.ink, size: 12, weight: 600 });
    } else if (sh.kind === "line") {
      const [xa, ya] = toPx(sh.x0, sh.z0);
      const [xb, yb] = toPx(sh.x1, sh.z1);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
    } else if (sh.kind === "hoop") {
      ctx.lineWidth = 3;
      if (side) {
        const [xa, y] = toPx(sh.x - sh.r, sh.z);
        const [xb] = toPx(sh.x + sh.r, sh.z);
        ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xb, y); ctx.stroke();
        if (sh.label) text(ctx, sh.label, (xa + xb) / 2, y + 16, { color: pal.ink, size: 12, weight: 600, align: "center" });
      } else {
        const [cx, cy] = toPx(sh.x, 0);
        const [ex] = toPx(sh.x + sh.r, 0);
        ctx.beginPath(); ctx.arc(cx, cy, Math.abs(ex - cx), 0, Math.PI * 2); ctx.stroke();
      }
    } else if (sh.kind === "band") {
      const [x, ya] = toPx(sh.x, sh.y0);
      const [, yb] = toPx(sh.x, sh.y1);
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x, ya); ctx.lineTo(x, yb); ctx.stroke();
      if (sh.label) text(ctx, sh.label, x + 7, Math.min(ya, yb) + 4, { color: pal.ink, size: 12, weight: 600 });
    }
  }
}

function drawTarget(ctx, pal, target, toPx) {
  if (!target) return;
  const [x, y] = toPx(target.x, target.z);
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.moveTo(x - 13, y); ctx.lineTo(x + 13, y);
  ctx.moveTo(x, y - 13); ctx.lineTo(x, y + 13);
  ctx.stroke();
}

function polyline(ctx, xs, ys, toPx, upTo = xs.length) {
  ctx.beginPath();
  for (let i = 0; i < upTo; i++) {
    const [px, py] = toPx(xs[i], ys[i]);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function arrow(ctx, x, y, dx, dy, color) {
  const len = Math.hypot(dx, dy);
  if (len < 3) return;
  const ux = dx / len, uy = dy / len;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
  const h = 7;
  ctx.beginPath();
  ctx.moveTo(x + dx, y + dy);
  ctx.lineTo(x + dx - ux * h - uy * h * 0.45, y + dy - uy * h + ux * h * 0.45);
  ctx.lineTo(x + dx - ux * h + uy * h * 0.45, y + dy - uy * h - ux * h * 0.45);
  ctx.closePath(); ctx.fill();
}

// ---------------------------------------------------------------- vues
export function drawSide(canvas, data, view, opts) {
  const { ctx, W, H } = setup(canvas);
  const pal = palette();
  const f = sideFrame(W, H, data, view, 58);
  paper(ctx, pal, W, H, f.area, f.x0, f.y0, f.s);
  axisLabels(ctx, pal, f, { vertical: "z" });
  scaleNote(ctx, pal, f, f.stepZ, "z", "verticale", data.strobe.dt);
  const toPx = (x, z) => [f.x0 + x * f.kx, f.y0 - z * f.kz];

  ctx.save();
  ctx.beginPath(); ctx.rect(f.area.x, f.area.y, f.area.w, f.area.h + 12); ctx.clip();

  // sol : bande de gazon vert profond, ligne de craie blanche
  ctx.fillStyle = pal.rail;
  ctx.fillRect(f.area.x, f.y0, f.area.w, f.area.y + f.area.h - f.y0);
  ctx.strokeStyle = pal.paper; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(f.area.x, f.y0); ctx.lineTo(f.area.x + f.area.w, f.y0); ctx.stroke();

  for (const m of data.geometry.marks) {
    const [x] = toPx(m.x, 0);
    text(ctx, m.label, x, f.y0 - 5, { color: pal.ink2, size: 11, align: "center" });
  }
  drawScenery(ctx, pal, data.geometry.side, toPx, true);
  drawTarget(ctx, pal, data.target, toPx);

  if (opts.vacuum && data.vacuum) {
    ctx.strokeStyle = pal.ink2; ctx.lineWidth = 1.25; ctx.setLineDash([7, 5]);
    polyline(ctx, data.vacuum.x, data.vacuum.z, toPx);
    ctx.setLineDash([]);
    const i = Math.floor(data.vacuum.x.length * 0.8);
    const [lx, ly] = toPx(data.vacuum.x[i], data.vacuum.z[i]);
    text(ctx, "sans air", lx + 6, ly - 6, { color: pal.ink2, size: 11.5 });
  }
  if (opts.nospin && data.nospin) {
    ctx.strokeStyle = pal.green; ctx.lineWidth = 1.75; ctx.setLineDash([2, 4]);
    polyline(ctx, data.nospin.x, data.nospin.z, toPx);
    ctx.setLineDash([]);
    const n = Math.floor(data.nospin.x.length * 0.72);
    const [lx, ly] = toPx(data.nospin.x[n], data.nospin.z[n]);
    text(ctx, "sans rotation", lx - 8, ly - 4, { color: pal.green, size: 11.5, weight: 600, align: "right" });
  }

  // tracé réel, dessiné au crayon jusqu'à `progress`
  const sm = data.samples;
  const upTo = Math.max(2, Math.ceil(sm.x.length * opts.progress));
  ctx.strokeStyle = pal.traj; ctx.lineWidth = 2.8; ctx.lineJoin = "round"; ctx.lineCap = "round";
  polyline(ctx, sm.x, sm.z, toPx, upTo);

  if (opts.progress >= 1) {
    const [ax0, ay0] = toPx(data.apex.x, data.apex.z);
    text(ctx, `apogée ${nf(data.summary.apex, 1)} m`, ax0, ay0 - 17, { color: pal.ink, size: 12, weight: 600, align: "center" });
    if (opts.forces) occupied.push({ l: f.area.x + 8, r: f.area.x + 150, t: f.area.y + 28, b: f.area.y + 100 });
  }

  // chronophotographie : la balle toutes les `dt` secondes (l'espacement montre le freinage)
  const tNow = data.summary.flight_time * opts.progress;
  const every = data.strobe.marks.length > 22 ? 5 : data.strobe.marks.length > 11 ? 2 : 1;
  data.strobe.marks.forEach((m, i) => {
    if (m.t > tNow + 1e-9) return;
    const [px, py] = toPx(m.x, m.z);
    ctx.fillStyle = pal.ball; ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const label = `${nf(m.t, decimals(data.strobe.dt * every))} s`;
    const spec = { color: pal.ink2, size: 11, align: "center" };
    if (i % every === 0 && i > 0 && isFree(ctx, label, px, py + 22, spec)) {
      ctx.strokeStyle = pal.ink; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py + 5); ctx.lineTo(px, py + 10); ctx.stroke();
      text(ctx, label, px, py + 22, spec);
    }
  });

  if (opts.progress >= 1) {
    const [ax, ay] = toPx(data.apex.x, data.apex.z);
    ctx.fillStyle = pal.ink;
    ctx.beginPath(); ctx.moveTo(ax, ay - 12); ctx.lineTo(ax - 5, ay - 4); ctx.lineTo(ax + 5, ay - 4); ctx.closePath(); ctx.fill();
    if (opts.forces) drawForces(ctx, pal, data, ax, ay, f.area);

    for (const im of data.impacts.slice(0, -1)) {          // contacts intermédiaires : petites croix au sol
      const [cx, cy] = toPx(im.x, 0);
      ctx.strokeStyle = pal.traj2; ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 4); ctx.lineTo(cx + 4, cy + 4);
      ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx - 4, cy + 4);
      ctx.stroke();
    }
    const n = sm.x.length - 1;
    const [lx, ly] = toPx(sm.x[n], sm.z[n]);
    ctx.strokeStyle = pal.traj; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(lx - 6, ly - 6); ctx.lineTo(lx + 6, ly + 6);
    ctx.moveTo(lx + 6, ly - 6); ctx.lineTo(lx - 6, ly + 6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawForces(ctx, pal, data, ax, ay, area) {
  const sm = data.samples;
  let i = 0;
  for (let k = 0; k < sm.t.length; k++) if (Math.abs(sm.t[k] - data.apex.t) < Math.abs(sm.t[i] - data.apex.t)) i = k;
  const G = 9.80665, PX_PER_G = 46;
  const forces = [
    { name: "poids", ax: 0, az: -G, color: pal.ink },
    { name: "traînée", ax: sm.drag.x[i], az: sm.drag.z[i], color: pal.traj2, ink: pal.traj },
    { name: "Magnus", ax: sm.magnus.x[i], az: sm.magnus.z[i], color: pal.green },
  ];
  text(ctx, "Forces à l'apogée", area.x + 12, area.y + 40, { color: pal.ink2, size: 11.5, weight: 700 });
  let row = 0;
  for (const fo of forces) {
    const g = Math.hypot(fo.ax, fo.az) / G;
    if (g < 0.005) continue;
    arrow(ctx, ax, ay, (fo.ax / G) * PX_PER_G, -(fo.az / G) * PX_PER_G, fo.color);
    const ly = area.y + 56 + row++ * 14;                  // légende fixe dans le coin haut-gauche, jamais sur le décor
    ctx.fillStyle = fo.color;
    ctx.fillRect(area.x + 12, ly - 8, 8, 8);
    text(ctx, `${fo.name} ${nf(g, 2)} g`, area.x + 25, ly, { color: fo.ink ?? fo.color, size: 11.5, weight: 600 });
  }
}

export function drawTop(canvas, data, view, opts) {
  const { ctx, W, H } = setup(canvas);
  const pal = palette();
  const side = sideFrame(W, 1000, data, view, 58);       // même échelle en x que la vue de côté
  const f = topFrame(side, W, H, data, view);
  f.W = W; f.H = H;
  paper(ctx, pal, W, H, f.area, f.x0, f.yc, f.s);
  axisLabels(ctx, pal, f, { vertical: "y" });
  scaleNote(ctx, pal, f, f.stepY, "y", "latérale");
  const toPx = (x, y) => [f.x0 + x * f.kx, f.yc - y * f.ky];

  ctx.save();
  ctx.beginPath(); ctx.rect(f.area.x, f.area.y, f.area.w, f.area.h); ctx.clip();
  ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(f.area.x, f.yc); ctx.lineTo(f.area.x + f.area.w, f.yc); ctx.stroke();

  for (const m of data.geometry.marks) {
    const [x] = toPx(m.x, 0);
    ctx.strokeStyle = pal.g10; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, f.area.y); ctx.lineTo(x, f.area.y + f.area.h); ctx.stroke();
  }
  drawScenery(ctx, pal, data.geometry.top, toPx, false);

  if (opts.vacuum && data.vacuum) {
    ctx.strokeStyle = pal.ink2; ctx.lineWidth = 1.25; ctx.setLineDash([7, 5]);
    polyline(ctx, data.vacuum.x, data.vacuum.y, toPx);
    ctx.setLineDash([]);
  }
  if (opts.nospin && data.nospin) {
    ctx.strokeStyle = pal.green; ctx.lineWidth = 1.75; ctx.setLineDash([2, 4]);
    polyline(ctx, data.nospin.x, data.nospin.y, toPx);
    ctx.setLineDash([]);
  }
  const sm = data.samples;
  const upTo = Math.max(2, Math.ceil(sm.x.length * opts.progress));
  ctx.strokeStyle = pal.traj; ctx.lineWidth = 2.8; ctx.lineJoin = "round"; ctx.lineCap = "round";
  polyline(ctx, sm.x, sm.y, toPx, upTo);
  const tNow = data.summary.flight_time * opts.progress;
  for (const m of data.strobe.marks) {
    if (m.t > tNow + 1e-9) continue;
    const [px, py] = toPx(m.x, m.y);
    ctx.fillStyle = pal.ball; ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- courbes v, Cd, CL
export function drawChart(canvas, data) {
  const { ctx, W, H } = setup(canvas);
  const pal = palette();
  const sm = data.samples;
  const mL = 34, mR = 34, mT = 24, mB = 22;
  const area = { x: mL, y: mT, w: W - mL - mR, h: H - mT - mB };
  const s = 24;
  paper(ctx, pal, W, H, area, area.x, area.y + area.h, s, false);   // pas de bandes : elles suggéreraient une échelle non graduée
  const T = sm.t[sm.t.length - 1] || 1;
  const vmax = niceCeil(Math.max(...sm.v_rel) * 1.05);
  const cmax = niceCeil(Math.max(0.5, ...sm.cd, ...sm.cl) * 1.05);
  const X = (t) => area.x + (t / T) * area.w;
  const line = (arr, max, color, width) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round";
    ctx.beginPath();
    arr.forEach((v, i) => {
      const px = X(sm.t[i]), py = area.y + area.h - (v / max) * area.h;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
    return area.y + area.h - (arr[arr.length - 1] / max) * area.h;
  };
  ctx.save();
  ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip();
  line(sm.v_rel, vmax, pal.ink, 2);
  const yCd = line(sm.cd, cmax, pal.traj2, 2);
  const yCl = line(sm.cl, cmax, pal.green, 2);
  ctx.restore();

  const o = { color: pal.ink2, size: 11 };
  text(ctx, "0", area.x - 5, area.y + area.h, { ...o, align: "right", baseline: "middle" });
  text(ctx, nf(vmax), area.x - 5, area.y, { ...o, align: "right", baseline: "middle" });
  text(ctx, "m/s", area.x - 5, area.y - 9, { ...o, align: "right" });
  text(ctx, nf(cmax, cmax < 1 ? 1 : 0), area.x + area.w + 5, area.y, { ...o, baseline: "middle" });
  text(ctx, "Cd, CL", area.x + area.w + 5, area.y - 9, { ...o, align: "right" });
  text(ctx, "0", area.x, H - 6, { ...o, align: "center" });
  text(ctx, `${nf(T, 1)} s`, area.x + area.w, H - 6, { ...o, align: "right" });
  text(ctx, "vitesse", area.x + 6, area.y + 13, { color: pal.ink, size: 11.5, weight: 600 });
  const lab = (str, y, color) => text(ctx, str, area.x + area.w - 6, Math.min(Math.max(y - 5, area.y + 22), area.y + area.h - 4),
    { color, size: 11.5, weight: 600, align: "right" });
  lab("Cd", yCd, pal.traj);
  lab("CL", yCl, pal.green);
}
