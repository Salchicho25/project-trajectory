"""Export d'une trajectoire : CSV et script Autodesk Fusion (dossier zippé prêt à l'emploi).

Le script Fusion crée, dans un nouveau composant : une sphère par instant de la
chronophotographie, deux esquisses (profil et vue de dessus) portant la courbe de la
trajectoire, et un point par contact avec le sol. Unités : mètres côté simulateur,
centimètres côté Fusion. Il gère les modèles à axe Z vers le haut et à axe Y vers le haut.
"""

from __future__ import annotations

import io
import json
import re
import unicodedata
import uuid
import zipfile
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Download:
    """Fichier renvoyé par le serveur avec un en-tête de téléchargement."""

    filename: str
    mime: str
    data: bytes


MAX_PATH_POINTS = 150
MIN_VISIBLE_M = 0.004  # une balle agrandie vise ~0,4 % de la distance parcourue


def slug(text: str) -> str:
    """Nom de fichier sûr : sans accents, lettres, chiffres et tirets bas."""
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9]+", "_", plain).strip("_") or "trajectoire"


def to_csv(result: dict[str, Any]) -> str:
    s = result["samples"]
    lines = ["t_s,x_m,y_m,z_m,vitesse_m_s"]
    for t, x, y, z, v in zip(s["t"], s["x"], s["y"], s["z"], s["speed"], strict=True):
        lines.append(f"{t:.4f},{x:.4f},{y:.4f},{z:.4f},{v:.3f}")
    return "\n".join(lines) + "\n"


_TEMPLATE = '''# -*- coding: utf-8 -*-
"""Trajectoire de balle exportée depuis le simulateur « Trajectoire ».

Dans Fusion : Utilitaires > Scripts et compléments > onglet Scripts > « + » (Script ou complément
depuis l'appareil), choisis le dossier de ce script, puis Exécuter.

Crée un composant « __NAME__ » avec :
  - une sphère par instant de la chronophotographie (balle de rayon réel x __SCALE__),
  - deux esquisses : « Profil » (avant et haut) et « Dessus » (avant et gauche), avec la courbe,
  - un point par contact avec le sol (esquisse « Contacts »).
Repère du simulateur : x vers l'avant, y vers la gauche, z vers le haut. Unités : m puis cm.
"""

import traceback

import adsk.core
import adsk.fusion

NAME = "__NAME__"
BALL_RADIUS_CM = __RADIUS_CM__  # rayon réel de la balle
BALL_SCALE = __SCALE__  # agrandissement pour la rendre visible (1 = taille réelle)
PATH = __PATH__  # (t en s, x, y, z en m)
MARKS = __MARKS__  # la balle à intervalles de temps réguliers
IMPACTS = __IMPACTS__  # (t, x, y) : contacts avec le sol


def _is_y_up(app):
    pref = app.preferences.generalPreferences.defaultModelingOrientation
    return pref == adsk.core.DefaultModelingOrientations.YUpModelingOrientation


def _world(app, x, y, z):
    """Point du simulateur (m) -> point Fusion (cm), selon l'orientation du modèle."""
    cm = 100.0
    if _is_y_up(app):  # Y vers le haut, Z vers l'observateur : la gauche est -Z
        return adsk.core.Point3D.create(x * cm, z * cm, -y * cm)
    return adsk.core.Point3D.create(x * cm, y * cm, z * cm)


def _curve(comp, app, plane, title, points, problems):
    try:
        sk = comp.sketches.add(plane)
        sk.name = title
        pts = adsk.core.ObjectCollection.create()
        last = None
        for _t, x, y, z in points:
            p = sk.modelToSketchSpace(_world(app, x, y, z))
            key = (round(p.x, 3), round(p.y, 3))
            if key != last:  # deux points confondus feraient échouer la spline
                pts.add(p)
                last = key
        if pts.count >= 3:
            sk.sketchCurves.sketchFittedSplines.add(pts)
        elif pts.count == 2:
            sk.sketchCurves.sketchLines.addByTwoPoints(pts.item(0), pts.item(1))
    except Exception:
        problems.append(title + " : " + traceback.format_exc(limit=1))


def _spheres(comp, app, design, problems):
    try:
        tbm = adsk.fusion.TemporaryBRepManager.get()
        parametric = design.designType == adsk.fusion.DesignTypes.ParametricDesignType
        base = None
        if parametric:  # en mode paramétrique, les corps temporaires passent par une fonction de base
            base = comp.features.baseFeatures.add()
            base.startEdit()
        radius = BALL_RADIUS_CM * BALL_SCALE
        for t, x, y, z in MARKS:
            body = tbm.createSphere(_world(app, x, y, z), radius)
            made = comp.bRepBodies.add(body, base) if parametric else comp.bRepBodies.add(body)
            made.name = "Balle t=%.2f s" % t
        if base is not None:
            base.finishEdit()
    except Exception:
        problems.append("Sphères : " + traceback.format_exc(limit=1))


def _contacts(comp, app, plane, problems):
    if not IMPACTS:
        return
    try:
        sk = comp.sketches.add(plane)
        sk.name = "Contacts"
        for _t, x, y in IMPACTS:
            sk.sketchPoints.add(sk.modelToSketchSpace(_world(app, x, y, 0.0)))
    except Exception:
        problems.append("Contacts : " + traceback.format_exc(limit=1))


def _new_component(design):
    """Nouveau composant NAME. Un document de pièce n'en accepte qu'un : on travaille alors dans la racine."""
    root = design.rootComponent
    try:
        comp = root.occurrences.addNewComponent(adsk.core.Matrix3D.create()).component
        comp.name = NAME
        return comp
    except RuntimeError:
        return root


def run(context):
    ui = None
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface
        design = adsk.fusion.Design.cast(app.activeProduct)
        if design is None:
            ui.messageBox("Ouvre ou crée d'abord un design Fusion, puis relance le script.")
            return
        comp = _new_component(design)
        y_up = _is_y_up(app)
        side = comp.xYConstructionPlane if y_up else comp.xZConstructionPlane  # avant et haut
        top = comp.xZConstructionPlane if y_up else comp.xYConstructionPlane  # avant et gauche
        problems = []
        _curve(comp, app, side, "Profil", PATH, problems)
        _curve(comp, app, top, "Dessus", PATH, problems)
        _contacts(comp, app, top, problems)
        _spheres(comp, app, design, problems)
        app.activeViewport.fit()
        message = "Trajectoire créée : %d balles, %d contacts." % (len(MARKS), len(IMPACTS))
        if problems:
            message += "\\n\\nÀ vérifier :\\n" + "\\n".join(problems)
        ui.messageBox(message)
    except Exception:
        if ui:
            ui.messageBox("Échec du script :\\n" + traceback.format_exc())


def stop(context):
    pass
'''


def _rows(rows: list[tuple]) -> str:
    return "[\n" + "".join(f"    {tuple(r)!r},\n" for r in rows) + "]"


def fusion_script(result: dict[str, Any], name: str) -> str:
    s = result["samples"]
    n = len(s["t"])
    step = max(1, -(-n // MAX_PATH_POINTS))
    idx = list(range(0, n, step))
    if idx[-1] != n - 1:
        idx.append(n - 1)
    path = [(round(s["t"][i], 3), round(s["x"][i], 3), round(s["y"][i], 3), round(s["z"][i], 3)) for i in idx]
    marks = [
        (m["t"], round(m["x"], 3), round(m["y"], 3), round(m["z"], 3)) for m in result["strobe"]["marks"]
    ]
    impacts = [(i["t"], i["x"], i["y"]) for i in result["impacts"]]
    radius_m = result["ball"]["diameter"] / 2
    scale = max(1, round(MIN_VISIBLE_M * result["summary"]["distance"] / radius_m))
    out = _TEMPLATE
    for key, value in {
        "__NAME__": name,
        "__RADIUS_CM__": repr(round(radius_m * 100, 3)),
        "__SCALE__": str(scale),
        "__PATH__": _rows(path),
        "__MARKS__": _rows(marks),
        "__IMPACTS__": _rows(impacts),
    }.items():
        out = out.replace(key, value)
    return out


def fusion_zip(result: dict[str, Any]) -> Download:
    """Dossier prêt à l'emploi : un script Fusion (.py) et son fichier .manifest, en .zip."""
    title = f"Trajectoire {result['scenario']} {result['ball']['name'].split(' (')[0]}"
    folder = "Trajectoire_" + slug(f"{result['scenario']} {result['ball']['name'].split(' (')[0]}")
    manifest = {
        "autodeskProduct": "Fusion",
        "type": "script",
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, folder)),
        "author": "Trajectoire",
        "description": {"": "Trajectoire de balle exportée depuis le simulateur."},
        "version": "1.0.0",
        "runOnStartup": False,
        "supportedOS": "windows|mac",
        "editEnabled": True,
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{folder}/{folder}.py", fusion_script(result, title))
        z.writestr(f"{folder}/{folder}.manifest", json.dumps(manifest, indent=2, ensure_ascii=False))
    return Download(f"{folder}.zip", "application/zip", buf.getvalue())


def csv_download(result: dict[str, Any]) -> Download:
    name = "Trajectoire_" + slug(f"{result['scenario']} {result['ball']['name'].split(' (')[0]}")
    return Download(f"{name}.csv", "text/csv; charset=utf-8", to_csv(result).encode("utf-8"))
