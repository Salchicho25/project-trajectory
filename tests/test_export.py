"""Tests de l'export (CSV et script Autodesk Fusion) et de l'API des rebonds.

Le script Fusion généré est exécuté contre une fausse API Fusion : on vérifie sa logique
(nombre de sphères, courbes, points de contact, repère Z haut / Y haut), pas l'API réelle.
"""

import io
import json
import sys
import threading
import types
import urllib.request
import zipfile
from types import SimpleNamespace

import pytest

from balltraj.web import api
from balltraj.web.export import slug, to_csv
from balltraj.web.server import make_server


def _result(**payload):
    return api.run_simulation({"scenario": "Coup franc", **payload})


# --- API : rebonds, sols, rotation ------------------------------------------------------
def test_golf_defaults_bounce_and_roll_with_total_beyond_carry():
    out = api.run_simulation({"scenario": "Drive golf"})
    assert len(out["impacts"]) == 3 and out["contact"] == {"bounces": 2, "surface": "gazon", "roll": True}
    s = out["summary"]
    assert s["roll_distance"] > 0 and s["distance"] > s["carry_distance"] > 0
    assert "total" in out["verdict"]["text"]


def test_bounces_are_clamped_and_surface_is_validated():
    assert api.run_simulation({"scenario": "Libre", "bounces": 99})["contact"]["bounces"] == 6
    with pytest.raises(api.ApiError):
        api.run_simulation({"surface": "lave"})


def test_samples_carry_what_the_3d_view_needs():
    s = api.run_simulation({"scenario": "Libre", "spin_rpm": 900})["samples"]
    n = len(s["t"])
    assert n == api.N_SAMPLES_BOUNCING
    assert len(s["speed"]) == n and all(len(s["omega"][k]) == n for k in "xyz")
    assert max(abs(w) for w in s["omega"]["y"]) > 10  # la balle tourne vraiment


def test_zero_bounce_free_kick_is_unchanged_and_has_a_single_impact():
    out = _result()
    assert out["contact"]["bounces"] == 0 and len(out["impacts"]) == 1
    assert out["verdict"]["success"] is True


# --- Export ----------------------------------------------------------------------------
def test_csv_has_one_row_per_sample_and_a_header():
    res = _result()
    rows = to_csv(res).strip().splitlines()
    assert rows[0] == "t_s,x_m,y_m,z_m,vitesse_m_s"
    assert len(rows) == 1 + len(res["samples"]["t"])
    t, x, *_ = (float(c) for c in rows[1].split(","))
    assert t == 0.0 and x == 0.0


def test_slug_is_filename_safe():
    assert slug("Coup franc é/ü ?") == "Coup_franc_e_u"  # accents retirés, le reste devient « _ »


def test_fusion_zip_contains_a_valid_script_and_manifest():
    dl = api.run_export({"scenario": "Coup franc", "format": "fusion"})
    assert dl.filename.endswith(".zip") and dl.mime == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(dl.data))
    py = next(n for n in z.namelist() if n.endswith(".py"))
    man = next(n for n in z.namelist() if n.endswith(".manifest"))
    assert py.split("/")[0] == man.split("/")[0] and py.rsplit(".", 1)[0] == man.rsplit(".", 1)[0]
    manifest = json.loads(z.read(man))
    assert manifest["type"] == "script" and manifest["autodeskProduct"] == "Fusion"
    compile(z.read(py).decode("utf-8"), py, "exec")  # syntaxe valide


def _fake_fusion(y_up: bool, parametric: bool):
    class P:
        def __init__(self, x, y, z=0.0):
            self.x, self.y, self.z = x, y, z

        @staticmethod
        def create(x, y, z=0.0):
            return P(x, y, z)

    class Coll:
        def __init__(self):
            self.items = []

        @staticmethod
        def create():
            return Coll()

        def add(self, p):
            self.items.append(p)

        @property
        def count(self):
            return len(self.items)

        def item(self, i):
            return self.items[i]

    class Sketch:
        def __init__(self, plane):
            self.plane, self.name = plane, ""
            self.splines: list = []
            self.points: list = []
            self.sketchCurves = SimpleNamespace(
                sketchFittedSplines=SimpleNamespace(add=lambda pts: self.splines.append(pts)),
                sketchLines=SimpleNamespace(addByTwoPoints=lambda a, b: self.splines.append([a, b])),
            )
            self.sketchPoints = SimpleNamespace(add=lambda p: self.points.append(p))

        def modelToSketchSpace(self, p):
            return P(p.x, p.y, 0.0)

    class Body(SimpleNamespace):
        pass

    log = SimpleNamespace(sketches=[], bodies=[], messages=[], base_edits=0, fitted=0)

    class Base:
        def startEdit(self):
            log.base_edits += 1

        def finishEdit(self):
            log.base_edits += 100

    comp = SimpleNamespace(
        name="",
        xYConstructionPlane="XY",
        xZConstructionPlane="XZ",
        yZConstructionPlane="YZ",
        sketches=SimpleNamespace(add=lambda plane: (log.sketches.append(Sketch(plane)), log.sketches[-1])[1]),
        bRepBodies=SimpleNamespace(
            add=lambda body, base=None: (
                log.bodies.append(Body(src=body, base=base, name="")),
                log.bodies[-1],
            )[1]
        ),
        features=SimpleNamespace(baseFeatures=SimpleNamespace(add=lambda: Base())),
    )
    occ = SimpleNamespace(component=comp)
    design = SimpleNamespace(
        designType="param" if parametric else "direct",
        rootComponent=SimpleNamespace(occurrences=SimpleNamespace(addNewComponent=lambda m: occ)),
    )
    orientations = SimpleNamespace(YUpModelingOrientation="Y", ZUpModelingOrientation="Z")
    app = SimpleNamespace(
        userInterface=SimpleNamespace(messageBox=lambda text: log.messages.append(text)),
        activeProduct=design,
        preferences=SimpleNamespace(
            generalPreferences=SimpleNamespace(defaultModelingOrientation="Y" if y_up else "Z")
        ),
        activeViewport=SimpleNamespace(fit=lambda: None),
    )
    core = types.ModuleType("adsk.core")
    vars(core).update(
        Application=SimpleNamespace(get=lambda: app),
        Point3D=P,
        ObjectCollection=Coll,
        Matrix3D=SimpleNamespace(create=lambda: object()),
        DefaultModelingOrientations=orientations,
    )
    fusion = types.ModuleType("adsk.fusion")
    vars(fusion).update(
        Design=SimpleNamespace(cast=lambda x: x),
        DesignTypes=SimpleNamespace(ParametricDesignType="param"),
        TemporaryBRepManager=SimpleNamespace(
            get=lambda: SimpleNamespace(createSphere=lambda c, r: SimpleNamespace(center=c, radius=r))
        ),
    )
    pkg = types.ModuleType("adsk")
    vars(pkg).update(core=core, fusion=fusion)
    return {"adsk": pkg, "adsk.core": core, "adsk.fusion": fusion}, log


def _run_script(monkeypatch, y_up, parametric, **payload):
    dl = api.run_export({"scenario": "Coup franc", "format": "fusion", **payload})
    z = zipfile.ZipFile(io.BytesIO(dl.data))
    source = z.read(next(n for n in z.namelist() if n.endswith(".py"))).decode("utf-8")
    modules, log = _fake_fusion(y_up, parametric)
    for name, mod in modules.items():
        monkeypatch.setitem(sys.modules, name, mod)
    ns: dict = {}
    exec(compile(source, "fusion_script", "exec"), ns)
    ns["run"](None)
    return ns, log


@pytest.mark.parametrize("y_up", [False, True], ids=["z-haut", "y-haut"])
def test_fusion_script_builds_spheres_curves_and_contacts(monkeypatch, y_up):
    ns, log = _run_script(monkeypatch, y_up, parametric=False)
    assert not log.messages[-1].count("À vérifier"), log.messages[-1]
    assert len(log.bodies) == len(ns["MARKS"])
    names = [s.name for s in log.sketches]
    assert names == ["Profil", "Dessus", "Contacts"]
    assert all(len(s.splines) == 1 for s in log.sketches[:2])
    assert len(log.sketches[2].points) == len(ns["IMPACTS"]) == 1
    # le repère : la 2e balle de la chronophotographie
    _t, x, y, z = ns["MARKS"][1]
    c = log.bodies[1].src.center
    expected = (x * 100, z * 100, -y * 100) if y_up else (x * 100, y * 100, z * 100)
    assert (c.x, c.y, c.z) == pytest.approx(expected)
    assert log.bodies[1].src.radius == pytest.approx(ns["BALL_RADIUS_CM"] * ns["BALL_SCALE"])
    assert ns["BALL_SCALE"] >= 1


def test_parametric_design_goes_through_a_base_feature(monkeypatch):
    _, log = _run_script(monkeypatch, y_up=False, parametric=True)
    assert log.base_edits == 101  # startEdit puis finishEdit
    assert all(b.base is not None for b in log.bodies)


def test_small_ball_on_a_long_flight_is_enlarged_to_stay_visible(monkeypatch):
    ns, _ = _run_script(monkeypatch, False, False, scenario="Drive golf")
    assert ns["BALL_SCALE"] > 10 and len(ns["IMPACTS"]) == 3


def test_script_without_a_design_open_asks_politely(monkeypatch):
    dl = api.run_export({"scenario": "Libre", "format": "fusion"})
    source = zipfile.ZipFile(io.BytesIO(dl.data)).read(
        next(n for n in zipfile.ZipFile(io.BytesIO(dl.data)).namelist() if n.endswith(".py"))
    )
    modules, log = _fake_fusion(False, False)
    vars(modules["adsk.core"])["Application"] = SimpleNamespace(
        get=lambda: SimpleNamespace(
            userInterface=SimpleNamespace(messageBox=lambda t: log.messages.append(t)), activeProduct=None
        )
    )
    for name, mod in modules.items():
        monkeypatch.setitem(sys.modules, name, mod)
    ns: dict = {}
    exec(compile(source.decode("utf-8"), "s", "exec"), ns)
    ns["run"](None)
    assert "design Fusion" in log.messages[0]


# --- Téléchargement par le vrai serveur ------------------------------------------------------
@pytest.fixture(scope="module")
def base_url():
    server = make_server(0)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()


def _post_raw(url, body):
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


def test_server_sends_the_zip_as_an_attachment(base_url):
    status, headers, data = _post_raw(
        base_url + "/api/export", {"scenario": "Coup franc", "format": "fusion"}
    )
    assert status == 200 and headers["Content-Type"] == "application/zip"
    assert headers["Content-Disposition"] == 'attachment; filename="Trajectoire_Coup_franc_Football.zip"'
    assert zipfile.ZipFile(io.BytesIO(data)).testzip() is None


def test_server_sends_csv_and_rejects_unknown_formats(base_url):
    status, headers, data = _post_raw(base_url + "/api/export", {"scenario": "Libre", "format": "csv"})
    assert status == 200 and headers["Content-Type"].startswith("text/csv")
    assert data.decode().startswith("t_s,x_m,y_m,z_m,vitesse_m_s")
    status, _, data = _post_raw(base_url + "/api/export", {"format": "stl"})
    assert status == 400 and "stl" in json.loads(data)["error"]
