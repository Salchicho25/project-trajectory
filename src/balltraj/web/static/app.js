// Interface : réglages -> API Python -> relevé. Aucune physique côté navigateur.
import { drawChart, drawSide, drawTop, nf } from "./plot.js";

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
};
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const GROUPS = [["tir", "Tir"], ["spin", "Rotation"], ["air", "Air"], ["sol", "Sol"]];

const state = {
  meta: null, scenario: null, ball: null, values: {}, data: null,
  progress: 1, status: "", busy: false,
};

// ---------------------------------------------------------------- API
async function post(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`);
  return json;
}
const payload = () => ({ scenario: state.scenario.name, ball: state.ball, ...state.values });

function showError(message) {
  const box = $("error");
  box.textContent = message;
  box.hidden = !message;
}

// ---------------------------------------------------------------- construction
function buildControls() {
  const host = $("groups");
  for (const [group, title] of GROUPS) {
    const fs = el("fieldset", {}, el("legend", { textContent: title }));
    for (const c of state.meta.controls.filter((c) => c.group === group)) {
      const hintId = `hint-${c.key}`;
      const number = el("input", { type: "number", id: `in-${c.key}`, min: c.min, max: c.max, step: c.step, inputMode: "decimal" });
      const range = el("input", { type: "range", id: `rg-${c.key}`, min: c.min, max: c.max, step: c.step });
      range.setAttribute("aria-label", `${c.label}, curseur`);
      number.title = `de ${c.min} à ${c.max} ${c.unit}`;
      if (c.hint) number.setAttribute("aria-describedby", hintId);
      const field = el("div", { className: "field" },
        el("label", { htmlFor: number.id }, c.label, el("span", { className: "unit", textContent: c.unit })),
        number, range);
      if (c.hint) field.append(el("span", { className: "hint", id: hintId, textContent: c.hint }));
      number.addEventListener("input", () => setValue(c, number.value, number));
      number.addEventListener("change", () => setValue(c, number.value, null, true));
      range.addEventListener("input", () => setValue(c, range.value, range));
      fs.append(field);
    }
    if (group === "sol") fs.append(contactFields());
    host.append(fs);
  }
}

function contactFields() {
  const sel = el("select", { id: "in-surface" });
  for (const s of state.meta.surfaces) sel.append(el("option", { value: s.key, textContent: s.name }));
  sel.addEventListener("change", () => { state.values.surface = sel.value; state.status = ""; refresh(true); });
  const roll = el("input", { type: "checkbox", id: "in-roll" });
  roll.addEventListener("change", () => { state.values.roll = roll.checked; state.status = ""; refresh(true); });
  return el("div", { className: "field" },
    el("label", { htmlFor: "in-surface" }, "Surface"), sel,
    el("label", { className: "check" }, roll, "Roulé jusqu'à l'arrêt"));
}

function buildTabs() {
  const tabs = $("tabs");
  state.meta.scenarios.forEach((sc, i) => {
    const b = el("button", { type: "button", id: `tab-${i}`, className: "tab", textContent: sc.name });
    b.setAttribute("role", "tab");
    b.addEventListener("click", () => selectScenario(sc.name));
    b.addEventListener("keydown", (e) => {
      const n = state.meta.scenarios.length;
      const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      selectScenario(state.meta.scenarios[to].name);
      $(`tab-${to}`).focus();
    });
    tabs.append(b);
  });
  const sel = $("ball");
  for (const b of state.meta.balls) sel.append(el("option", { value: b.key, textContent: b.name }));
  sel.addEventListener("change", () => {
    state.ball = sel.value;
    state.status = "";
    refresh(true);
  });
}

// ---------------------------------------------------------------- réglages
function paint(c) {
  const v = state.values[c.key];
  $(`in-${c.key}`).value = v;
  const r = $(`rg-${c.key}`);
  r.value = v;
  r.setAttribute("aria-valuetext", `${v} ${c.unit}`);
  r.style.setProperty("--pct", `${((v - c.min) / (c.max - c.min)) * 100}%`);
}
function paintAll() {
  state.meta.controls.forEach(paint);
  $("in-surface").value = state.values.surface;
  $("in-roll").checked = Boolean(state.values.roll);
}

function setValue(c, raw, source, final = false) {
  let v = parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(v)) {
    if (final) paint(c);
    return;
  }
  if (final || source?.type === "range") v = Math.min(c.max, Math.max(c.min, v));
  else if (v < c.min || v > c.max) {                       // saisie en cours : on attend une valeur valide
    $("status").textContent = `${c.label} : de ${nf(c.min, 0)} à ${nf(c.max, 0)} ${c.unit}.`;
    return;
  }
  state.values[c.key] = v;
  const r = $(`rg-${c.key}`);
  if (source !== r) r.value = v;
  r.setAttribute("aria-valuetext", `${v} ${c.unit}`);
  r.style.setProperty("--pct", `${((v - c.min) / (c.max - c.min)) * 100}%`);
  if (source?.type === "range") $(`in-${c.key}`).value = v;
  if (final) $(`in-${c.key}`).value = v;
  state.status = "";
  refresh(false);
}

function selectScenario(name) {
  const sc = state.meta.scenarios.find((s) => s.name === name);
  state.scenario = sc;
  state.ball = sc.ball;
  state.values = { ...sc.values };
  state.status = "";
  $("ball").value = sc.ball;
  syncTarget();
  state.meta.scenarios.forEach((s, i) => {
    const t = $(`tab-${i}`);
    const on = s.name === name;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    if (on) $("panel").setAttribute("aria-labelledby", t.id);
  });
  paintAll();
  refresh(true);
}

function syncTarget() {
  const none = !state.scenario.target;
  $("btn-target").disabled = none;
  $("btn-target").title = none ? "Aucune cible dans cette situation" : "";
}

// ---------------------------------------------------------------- calcul (le dernier réglage gagne)
let inflight = false, dirty = false, animateNext = false;

async function refresh(animate) {
  if (animate) animateNext = true;
  if (inflight) { dirty = true; return; }
  inflight = true;
  try {
    do {
      dirty = false;
      const data = await post("/api/simulate", payload());
      showError("");
      apply(data);
    } while (dirty);
  } catch (err) {
    showError(err instanceof TypeError
      ? "Le serveur local ne répond pas. Relance « trajectoire-web » dans le terminal."
      : `Calcul impossible : ${err.message}`);
  } finally {
    inflight = false;
  }
}

function apply(data) {
  const restart = animateNext;
  state.data = data;
  renderText(data);
  if (view === "3d") push3d(restart);
  if (animateNext && !reduceMotion.matches) { animateNext = false; animate(); }
  else { animateNext = false; state.progress = 1; draw(); }
}

let raf = 0;
function animate() {
  cancelAnimationFrame(raf);
  const t0 = performance.now(), dur = 650;
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    state.progress = t === 1 ? 1 : 1 - 2 ** (-10 * t);      // exponentielle : le crayon accélère puis freine
    draw();
    if (t < 1) raf = requestAnimationFrame(step); else { state.progress = 1; draw(); }
  };
  raf = requestAnimationFrame(step);
}

// ---------------------------------------------------------------- rendu
function draw() {
  const d = state.data;
  if (!d || !$("t-vacuum")) return;
  const opts = {
    vacuum: $("t-vacuum").checked, nospin: $("t-nospin").checked, forces: $("t-forces").checked,
    progress: state.progress,
  };
  if (view === "2d") {
    drawSide($("cv-side"), d, state.scenario.view, opts);
    drawTop($("cv-top"), d, state.scenario.view, opts);
  }
  drawChart($("cv-chart"), d);
}

function row(label, value, unit = "", extra = "", cls = "") {
  const td = el("td", { className: cls }, value);
  if (unit) td.append(el("small", { textContent: unit }));
  if (extra) td.append(el("small", { textContent: extra }));
  return el("tr", {}, el("th", { scope: "row", textContent: label }), td);
}
const groupRow = (label) => el("tr", { className: "group" }, el("th", { colSpan: 2, scope: "colgroup", textContent: label }));
const signed = (v, d) => `${v >= 0 ? "+" : "−"}${nf(Math.abs(v), d)}`;

function renderText(d) {
  const s = d.summary;
  const verdict = $("verdict");
  verdict.textContent = d.verdict.text || `Tir libre : ${nf(s.distance, 1)} m`;
  verdict.dataset.state = d.verdict.success ? "success" : d.verdict.has_target ? "miss" : "neutral";

  const main = $("rows-main"), cmp = $("rows-compare"), aero = $("rows-aero");
  const bounced = d.impacts.length > 1 || s.roll_distance > 0;
  main.replaceChildren(
    row(bounced ? "Distance totale" : "Distance", nf(s.distance, 1), "m"),
    ...(bounced ? [row("Carry (1er contact)", nf(s.carry_distance, 1), "m")] : []),
    ...(s.roll_distance > 0 ? [row("Roulé", nf(s.roll_distance, 1), "m")] : []),
    ...(bounced ? [row("Contacts avec le sol", String(d.impacts.length))] : []),
    row("Écart latéral", signed(s.lateral, 2), "m"),
    row("Apogée", nf(s.apex, 2), "m"),
    row("Temps de vol", nf(s.flight_time, 2), "s"),
    row("Vitesse à l'impact", nf(s.impact_speed, 1), "m/s", `${signed((s.impact_speed / s.launch_speed - 1) * 100, 0)} %`),
    row("Angle à l'impact", nf(s.impact_angle, 1), "°"),
  );
  const rel = (v) => `${signed(v - s.distance, 1)} m`;
  cmp.replaceChildren(groupRow("Comparaison"),
    row("Sans air", nf(s.vacuum_distance, 1), "m", rel(s.vacuum_distance), "delta"));
  if (s.nospin_distance !== null) cmp.append(row("Sans rotation", nf(s.nospin_distance, 1), "m", rel(s.nospin_distance), "delta"));
  aero.replaceChildren(groupRow("Au départ"),
    row("Reynolds", nf(s.re0)),
    row("Paramètre de rotation S", nf(s.spin_param0, 3)),
    row("Traînée Cd", nf(s.cd0, 3)),
    row("Portance CL", nf(s.cl0, 3)),
    row("Force de traînée", nf(s.drag_g0, 2), "g"),
    row("Force de Magnus", nf(s.magnus_g0, 2), "g"));

  $("air").textContent = `Air : ρ ${nf(d.air.density, 3)} kg/m³, ν ${nf(d.air.viscosity * 1e5, 2)} × 10⁻⁵ m²/s, ${nf(d.air.temperature_c, 0)} °C`;
  $("status").textContent = state.status;
  $("cv-side").setAttribute("aria-label",
    `Trajectoire en vue de côté : ${nf(s.distance, 1)} m de distance, apogée ${nf(s.apex, 1)} m, ${nf(s.flight_time, 1)} s de vol. ${verdict.textContent}`);
  $("cv-top").setAttribute("aria-label", `Trajectoire en vue de dessus : écart latéral de ${signed(s.lateral, 2)} m`);
}

// ---------------------------------------------------------------- boutons
async function busy(label, job) {
  const btns = ["btn-optimal", "btn-target", "btn-reset"].map($);
  const wasDisabled = btns.map((b) => b.disabled);
  btns.forEach((b) => (b.disabled = true));
  $("status").textContent = label;
  try { await job(); }
  catch (err) { state.status = `Calcul impossible : ${err.message}`; }
  finally {
    btns.forEach((b, i) => (b.disabled = wasDisabled[i]));
    syncTarget();
  }
}

function wireButtons() {
  $("btn-optimal").addEventListener("click", () => busy("Recherche de l'angle optimal…", async () => {
    const r = await post("/api/optimal", payload());
    const c = state.meta.controls.find((c) => c.key === "elevation");
    state.values.elevation = r.elevation;
    paint(c);
    state.status = `Portée maximale à ${nf(r.elevation, 1)} °, soit ${nf(r.distance, 1)} m.`;
    await refresh(true);
  }));
  $("btn-target").addEventListener("click", () => busy("Recherche de l'angle…", async () => {
    const r = await post("/api/target", payload());
    if (r.best === null) {
      state.status = "Cible hors de portée : augmente la vitesse.";
      $("status").textContent = state.status;
      return;
    }
    const c = state.meta.controls.find((c) => c.key === "elevation");
    state.values.elevation = r.best;
    paint(c);
    state.status = `Angles possibles : ${r.elevations.map((e) => `${nf(e, 1)} °`).join(" ou ")}.`;
    await refresh(true);
  }));
  $("btn-reset").addEventListener("click", () => selectScenario(state.scenario.name));
  for (const id of ["t-vacuum", "t-nospin", "t-forces"]) $(id).addEventListener("change", draw);
}

// ---------------------------------------------------------------- vue 3D
let view = "2d", scene3d = null, replayTimer = 0, scrubbing = false;
const CAMERAS = ["suivi", "tribune", "aerien", "arrivee"];

async function ensure3D() {
  if (scene3d) return scene3d;
  try {
    const { createScene3D } = await import("./scene3d.js");
    scene3d = createScene3D(
      $("cv-3d"),
      { time: $("h-time"), dist: $("h-dist"), height: $("h-height"), speed: $("h-speed"), kmh: $("h-kmh") },
      {
        onFrame: ({ t, T, playing }) => {
          const r = $("r-time");
          r.max = String(Math.round(T * 1000));
          if (!scrubbing) r.value = String(Math.round(t * 1000));
          r.style.setProperty("--pct", `${T ? (t / T) * 100 : 0}%`);
          $("o-time").textContent = `${nf(t, 2)} / ${nf(T, 2)} s`;
          const b = $("b-play");
          b.textContent = playing ? "Pause" : "Lecture";
          b.setAttribute("aria-pressed", String(playing));
        },
        onMode: (m) => CAMERAS.forEach((n) => $(`c-${n}`).setAttribute("aria-pressed", String(n === m))),
      },
    );
    return scene3d;
  } catch (err) {
    $("msg-3d").textContent = `La vue 3D demande WebGL, indisponible ici (${err.message}).`;
    return null;
  }
}

async function setView(next) {
  if (next === "3d") await ensure3D();
  view = next;
  $("sheet").dataset.view = view;
  $("v-2d").setAttribute("aria-pressed", String(view === "2d"));
  $("v-3d").setAttribute("aria-pressed", String(view === "3d"));
  try { localStorage.setItem("trajectoire-vue", view); } catch { /* stockage indisponible : sans conséquence */ }
  if (view === "3d") {
    if (scene3d) { scene3d.setActive(true); if (state.data) scene3d.setData(state.data, { restart: true }); }
  } else {
    scene3d?.setActive(false);
    draw();
  }
}

function push3d(restart) {
  if (!scene3d || !state.data) return;
  scene3d.setData(state.data, { restart });
  if (!restart) {                                           // pendant un glissement : on rejoue une fois le réglage posé
    clearTimeout(replayTimer);
    replayTimer = setTimeout(() => scene3d.replay(), 650);
  }
}

function wire3d() {
  $("v-2d").addEventListener("click", () => setView("2d"));
  $("v-3d").addEventListener("click", () => setView("3d"));
  $("b-play").addEventListener("click", () => scene3d?.toggle());
  const r = $("r-time");
  r.addEventListener("input", () => { scrubbing = true; scene3d?.seek(Number(r.value) / 1000); });
  r.addEventListener("change", () => { scrubbing = false; });
  $("s-speed").addEventListener("change", (e) => scene3d?.setSpeed(Number(e.target.value)));
  $("t-loop").addEventListener("change", (e) => scene3d?.setLoop(e.target.checked));
  for (const n of CAMERAS) $(`c-${n}`).addEventListener("click", () => scene3d?.setCamera(n));
}

// ---------------------------------------------------------------- export vers Fusion
async function download(format) {
  const status = $("export-status");
  status.textContent = "Préparation du fichier…";
  try {
    const res = await fetch("/api/export", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload(), format }),
    });
    if (!res.ok) throw new Error((await res.json()).error || `Erreur ${res.status}`);
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1]
      ?? (format === "csv" ? "trajectoire.csv" : "trajectoire.zip");
    const link = el("a", { href: URL.createObjectURL(await res.blob()), download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    status.textContent = format === "csv"
      ? `${name} enregistré.`
      : `${name} enregistré. Dans Fusion : dézippe, puis Utilitaires > Scripts et compléments > « + » > choisis le dossier > Exécuter.`;
  } catch (err) {
    status.textContent = `Export impossible : ${err.message}`;
  }
}

// ---------------------------------------------------------------- démarrage
async function start() {
  try {
    state.meta = await (await fetch("/api/meta")).json();
  } catch {
    showError("Le serveur local ne répond pas. Relance « trajectoire-web » dans le terminal.");
    return;
  }
  buildTabs();
  buildControls();
  wireButtons();
  wire3d();
  $("btn-fusion").addEventListener("click", () => download("fusion"));
  $("btn-csv").addEventListener("click", () => download("csv"));
  const ro = new ResizeObserver(() => draw());
  for (const id of ["cv-side", "cv-top", "cv-chart"]) ro.observe($(id));
  document.fonts.ready.then(draw);
  selectScenario("Coup franc");
  let saved = "2d";
  try { saved = localStorage.getItem("trajectoire-vue") || "2d"; } catch { /* sans conséquence */ }
  if (saved === "3d") setView("3d");
}
start();
