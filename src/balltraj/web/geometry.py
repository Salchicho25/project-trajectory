"""Décor de chaque situation, en données pures pour le navigateur.

Les cotes viennent des constantes de `balltraj.scenarios` : une seule source de vérité.
Repère : x vers l'avant, y vers la gauche, z vers le haut (mètres).

Formes (clé `kind`) :
  rect    x, z, w, h             rectangle plein en vue de côté
  post    x, z0, z1              trait vertical (poteau, planche, palissade)
  line    x0, z0, x1, z1         trait quelconque
  hoop    x, z, r                cercle de basket (segment en vue de côté, cercle en vue de dessus)
  band    x, y0, y1              segment vertical en vue de dessus (mur, ligne de but)
"""

from __future__ import annotations

from .. import scenarios as sc


def _free() -> dict:
    return {"side": [], "top": [], "marks": []}


def _free_kick() -> dict:
    return {
        "side": [
            {"kind": "rect", "x": sc.FK_WALL_X - 0.15, "z": 0, "w": 0.3, "h": sc.FK_WALL_H, "label": "mur"},
            {"kind": "post", "x": sc.FK_GOAL_X, "z0": 0, "z1": sc.FK_GOAL_H, "label": "but"},
            {
                "kind": "line",
                "x0": sc.FK_GOAL_X,
                "z0": sc.FK_GOAL_H,
                "x1": sc.FK_GOAL_X + 1.5,
                "z1": sc.FK_GOAL_H,
            },
        ],
        "top": [
            {"kind": "band", "x": sc.FK_WALL_X, "y0": sc.FK_WALL_Y[0], "y1": sc.FK_WALL_Y[1], "label": "mur"},
            {
                "kind": "band",
                "x": sc.FK_GOAL_X,
                "y0": -sc.FK_GOAL_HALF_W,
                "y1": sc.FK_GOAL_HALF_W,
                "label": "but",
            },
        ],
        "marks": [],
    }


def _free_throw() -> dict:
    return {
        "side": [
            {"kind": "hoop", "x": sc.FT_HOOP_X, "z": sc.FT_HOOP_Z, "r": sc.FT_RIM_R, "label": "cercle"},
            {"kind": "post", "x": sc.FT_BOARD_X, "z0": 2.90, "z1": 3.95, "label": "planche"},
        ],
        "top": [
            {"kind": "hoop", "x": sc.FT_HOOP_X, "z": 0, "r": sc.FT_RIM_R},
            {"kind": "band", "x": sc.FT_BOARD_X, "y0": -0.9, "y1": 0.9},
        ],
        "marks": [],
    }


def _golf() -> dict:
    return {"side": [], "top": [], "marks": [{"x": float(d), "label": f"{d} m"} for d in range(50, 351, 50)]}


def _home_run() -> dict:
    return {
        "side": [
            {
                "kind": "rect",
                "x": sc.HR_FENCE_X,
                "z": 0,
                "w": 1.0,
                "h": sc.HR_FENCE_H,
                "label": "palissade 122 m",
            }
        ],
        "top": [{"kind": "band", "x": sc.HR_FENCE_X, "y0": -60, "y1": 60}],
        "marks": [],
    }


_BUILDERS = {
    "Libre": _free,
    "Coup franc": _free_kick,
    "Lancer franc": _free_throw,
    "Drive golf": _golf,
    "Home run": _home_run,
}


def geometry(name: str) -> dict:
    """Décor de la situation `name` (vide si inconnue)."""
    return _BUILDERS.get(name, _free)()
