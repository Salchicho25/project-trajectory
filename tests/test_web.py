"""Tests de l'API web et du serveur local."""

import json
import re
import threading
import urllib.error
import urllib.request

import numpy as np
import pytest

from balltraj import BALLS, Environment, Launch, simulate
from balltraj.scenarios import SCENARIOS
from balltraj.web import api
from balltraj.web.server import make_server

G = 9.80665


# --- API : fonctions pures -------------------------------------------------------------
def test_meta_lists_everything_the_ui_needs():
    m = api.meta()
    assert {c["key"] for c in m["controls"]} == {
        "speed", "elevation", "azimuth", "height", "spin_rpm", "spin_tilt",
        "wind_x", "wind_y", "altitude", "temperature", "bounces",
    }  # fmt: skip
    assert [s["name"] for s in m["scenarios"]] == list(SCENARIOS)
    assert {b["key"] for b in m["balls"]} == set(BALLS)
    for sc in m["scenarios"]:
        assert set(sc["values"]) == {c["key"] for c in m["controls"]} | {"roll", "surface"}
    json.dumps(m)  # sérialisable


@pytest.mark.parametrize("name", list(SCENARIOS))
def test_simulation_matches_the_python_verdict(name):
    sc = SCENARIOS[name]
    out = api.run_simulation({"scenario": name})
    contact = api._parse({"scenario": name})[4]
    n = api.N_SAMPLES_BOUNCING if contact["bounces"] or contact["roll"] else api.N_SAMPLES
    tr = simulate(BALLS[sc.ball], sc.launch, rtol=1e-7, n_samples=n, **contact)
    assert out["verdict"]["text"] == sc.verdict(tr)
    assert out["summary"]["distance"] == pytest.approx(tr.distance, abs=1e-3)
    n = len(out["samples"]["t"])
    for key in ("x", "y", "z", "v_rel", "cd", "cl", "re", "spin_param"):
        assert len(out["samples"][key]) == n
    assert out["strobe"]["marks"][0] == {"t": 0.0, "x": 0.0, "y": 0.0, "z": pytest.approx(sc.launch.height)}
    assert len(out["strobe"]["marks"]) <= api.MAX_STROBE_MARKS + 1
    json.dumps(out)


def test_default_free_kick_scores_and_flags_success():
    out = api.run_simulation({"scenario": "Coup franc"})
    assert out["verdict"] == {"text": out["verdict"]["text"], "success": True, "has_target": True}
    assert out["verdict"]["text"].startswith("BUT")


def test_free_flight_has_no_target_and_no_verdict():
    out = api.run_simulation({"scenario": "Libre"})
    assert out["verdict"]["has_target"] is False
    assert out["target"] is None
    assert out["nospin"] is None  # pas de rotation : rien à comparer


def test_nospin_comparison_present_with_spin():
    out = api.run_simulation({"scenario": "Drive golf"})
    assert out["nospin"] is not None
    assert out["summary"]["nospin_distance"] < out["summary"]["distance"]
    assert out["summary"]["vacuum_distance"] > 0


def test_inputs_are_clamped_not_trusted():
    out = api.run_simulation({"scenario": "Libre", "speed": 1e6, "altitude": -500})
    assert out["summary"]["launch_speed"] == 80  # borne haute du curseur


@pytest.mark.parametrize(
    "bad",
    [
        {"scenario": "Inconnue"},
        {"ball": "pétanque"},
        {"speed": "vite"},
        {"speed": float("nan")},
        {"elevation": None, "spin_rpm": [1]},
    ],
)
def test_invalid_requests_are_rejected(bad):
    with pytest.raises(api.ApiError):
        api.run_simulation(bad)


def test_target_and_optimal():
    t = api.run_target({"scenario": "Lancer franc", "elevation": 45})
    assert len(t["elevations"]) == 2 and t["best"] == min(t["elevations"], key=lambda e: abs(e - 45))
    with pytest.raises(api.ApiError):
        api.run_target({"scenario": "Drive golf"})
    o = api.run_optimal({"scenario": "Libre", "speed": 20, "spin_rpm": 0})
    assert 30 < o["elevation"] < 45


def test_accelerations_reproduce_the_equations_of_motion():
    """dv/dt (différences finies) = g + traînée + Magnus : l'API n'invente aucune force."""
    ball = BALLS["football"]
    env = Environment(temperature_c=15, wind=(3.0, -2.0, 0.0))
    tr = simulate(ball, Launch(26, 20, -5, 500, 70, 0.11), env, n_samples=4000, rtol=1e-10, atol=1e-12)
    acc = tr.accelerations()
    dvdt = np.gradient(tr.velocity, tr.t, axis=1)
    model = acc["drag"] + acc["magnus"] + np.array([[0.0], [0.0], [-G]])
    inner = slice(5, -5)
    scale = np.max(np.abs(model))
    assert np.max(np.abs(dvdt[:, inner] - model[:, inner])) < 2e-3 * scale


def test_no_magnus_without_spin():
    tr = simulate(BALLS["football"], Launch(25, 30), Environment())
    assert np.all(tr.accelerations()["magnus"] == 0.0)


# --- Serveur : vrai HTTP sur un port libre -------------------------------------------------
@pytest.fixture(scope="module")
def base_url():
    server = make_server(0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()


def _get(url):
    try:
        with urllib.request.urlopen(url) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


def _post(url, body, raw=None):
    data = raw if raw is not None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def test_serves_page_assets_and_fonts(base_url):
    status, headers, body = _get(base_url + "/")
    assert status == 200 and b"<title>Trajectoire</title>" in body
    assert headers["Content-Type"].startswith("text/html")
    status, headers, _ = _get(base_url + "/app.js")
    assert status == 200 and "javascript" in headers["Content-Type"]
    status, headers, body = _get(base_url + "/fonts/barlow-semicondensed-700.woff2")
    assert status == 200 and headers["Content-Type"] == "font/woff2" and body[:4] == b"wOF2"


def test_static_server_cannot_read_outside_its_folder(base_url):
    for path in ("/../server.py", "/..%2f..%2fpyproject.toml", "/fonts/../../api.py", "/nope.txt"):
        assert _get(base_url + path)[0] == 404


def test_api_roundtrip(base_url):
    status, meta = _post(base_url + "/api/simulate", {"scenario": "Coup franc"})
    assert status == 200 and meta["verdict"]["success"] is True
    status, _, raw = _get(base_url + "/api/meta")
    assert status == 200 and "controls" in json.loads(raw)


def test_api_errors_are_json_400(base_url):
    status, body = _post(base_url + "/api/simulate", {"ball": "pétanque"})
    assert status == 400 and "pétanque" in body["error"]
    status, body = _post(base_url + "/api/simulate", None, raw=b"{pas du json")
    assert status == 400
    status, body = _post(base_url + "/api/simulate", None, raw=b"[1, 2]")
    assert status == 400
    status, body = _post(base_url + "/api/inconnue", {})
    assert status == 404


def test_oversized_body_is_refused(base_url):
    status, _ = _post(base_url + "/api/simulate", None, raw=b"x" * (70 * 1024))
    assert status == 413


def test_every_file_the_page_depends_on_is_served(base_url):
    """HTML, CSS, modules JS (import map comprise) et polices : aucun 404 caché."""
    html = _get(base_url + "/")[2].decode()
    css = _get(base_url + "/style.css")[2].decode()
    found = re.search(r'<script type="importmap">(.*?)</script>', html, re.S)
    assert found, "pas d'import map dans la page"
    imports = json.loads(found.group(1))["imports"]
    refs = set(re.findall(r'(?:src|href)="([^"#:]+)"', html)) - {"data,"}
    refs |= {v.removeprefix("./") for v in imports.values() if not v.endswith("/")}
    refs |= set(re.findall(r'url\("([^"]+)"\)', css))
    for js in ("app.js", "plot.js", "scene3d.js"):
        text = _get(base_url + "/" + js)[2].decode()
        for spec in re.findall(r'(?:from|import\()\s*"([^"]+)"', text):
            if spec.startswith("."):
                refs.add(spec.removeprefix("./"))
            else:  # spécificateur nu : doit être résolu par l'import map
                prefix = next(
                    (k for k in imports if spec == k or (k.endswith("/") and spec.startswith(k))), None
                )
                assert prefix, f"{js} importe « {spec} » sans entrée dans l'import map"
                target = (
                    imports[prefix] + spec.removeprefix(prefix) if prefix.endswith("/") else imports[prefix]
                )
                refs.add(target.removeprefix("./"))
    assert {"vendor/three.module.min.js", "vendor/OrbitControls.js", "scene3d.js"} <= refs
    missing = [r for r in sorted(refs) if _get(f"{base_url}/{r}")[0] != 200]
    assert not missing, missing


def test_three_js_license_ships_with_the_vendored_copy(base_url):
    status, _, body = _get(base_url + "/vendor/LICENSE-three.txt")
    assert (status == 200 and b"MIT" in body[:200].upper()) or b"Permission is hereby granted" in body
