"""Logique de l'API web : fonctions pures dictionnaire -> dictionnaire.

Le serveur ne fait que transporter du JSON. Toute la physique passe par `balltraj` :
le navigateur affiche ce que Python calcule, il ne recalcule jamais rien.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np

from .. import BALLS, Environment, Launch, Trajectory, elevations_through, optimal_elevation, simulate
from ..scenarios import SCENARIOS
from ..simulate import vacuum_trajectory
from .geometry import geometry

SUCCESS_WORDS = ("BUT", "PANIER", "HOME RUN")
N_SAMPLES = 240
MAX_STROBE_MARKS = 45
STROBE_STEPS = (0.05, 0.1, 0.2, 0.5, 1.0)
G = 9.80665


class ApiError(ValueError):
    """Requête invalide : le serveur répond 400 avec le message."""


@dataclass(frozen=True)
class Control:
    key: str
    label: str
    unit: str
    vmin: float
    vmax: float
    step: float
    group: str
    hint: str = ""


CONTROLS = (
    Control("speed", "Vitesse", "m/s", 0.5, 80, 0.1, "tir"),
    Control("elevation", "Élévation", "°", -10, 85, 0.1, "tir"),
    Control("azimuth", "Azimut", "°", -30, 30, 0.1, "tir", "positif = vers la gauche"),
    Control("height", "Hauteur de frappe", "m", 0, 3, 0.01, "tir"),
    Control("spin_rpm", "Rotation", "tr/min", 0, 5000, 10, "spin"),
    Control("spin_tilt", "Axe de rotation", "°", -180, 180, 1, "spin", "0 rétro, 180 lift, ±90 effet"),
    Control("wind_x", "Vent arrière", "m/s", -20, 20, 0.5, "air", "négatif = vent de face"),
    Control("wind_y", "Vent vers la gauche", "m/s", -20, 20, 0.5, "air"),
    Control("altitude", "Altitude", "m", 0, 4000, 10, "air"),
    Control("temperature", "Température", "°C", -10, 40, 1, "air"),
)
_BOUNDS = {c.key: (c.vmin, c.vmax) for c in CONTROLS}
_AIR_DEFAULTS = {"wind_x": 0.0, "wind_y": 0.0, "altitude": 0.0, "temperature": 15.0}


def _scenario_values(name: str) -> dict[str, float]:
    sc = SCENARIOS[name]
    L = sc.launch
    return {
        "speed": L.speed,
        "elevation": L.elevation,
        "azimuth": L.azimuth,
        "height": L.height,
        "spin_rpm": L.spin_rpm,
        "spin_tilt": L.spin_tilt,
        **_AIR_DEFAULTS,
    }


def meta() -> dict[str, Any]:
    """Catalogue : balles, situations (réglages par défaut, cible), curseurs."""
    return {
        "controls": [
            {
                "key": c.key,
                "label": c.label,
                "unit": c.unit,
                "min": c.vmin,
                "max": c.vmax,
                "step": c.step,
                "group": c.group,
                "hint": c.hint,
            }
            for c in CONTROLS
        ],
        "balls": [
            {"key": b.key, "name": b.name, "mass": b.mass, "diameter": b.diameter} for b in BALLS.values()
        ],
        "scenarios": [
            {
                "name": name,
                "ball": sc.ball,
                "values": _scenario_values(name),
                "target": None
                if sc.target is None
                else {"x": sc.target.x, "z": sc.target.z, "descending": sc.target.descending},
                "view": {"x": sc.view[0], "z": sc.view[1], "y": sc.view[2]},
            }
            for name, sc in SCENARIOS.items()
        ],
    }


def _number(payload: dict, key: str, default: float) -> float:
    raw = payload.get(key, default)
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise ApiError(f"« {key} » doit être un nombre") from None
    if not math.isfinite(value):
        raise ApiError(f"« {key} » doit être fini")
    lo, hi = _BOUNDS[key]
    return min(max(value, lo), hi)


def _parse(payload: dict) -> tuple[str, Any, Launch, Environment]:
    name = payload.get("scenario", "Libre")
    if name not in SCENARIOS:
        raise ApiError(f"Situation inconnue : {name}")
    ball_key = payload.get("ball", SCENARIOS[name].ball)
    if ball_key not in BALLS:
        raise ApiError(f"Balle inconnue : {ball_key}")
    base = _scenario_values(name)
    v = {key: _number(payload, key, base[key]) for key in base}
    launch = Launch(v["speed"], v["elevation"], v["azimuth"], v["spin_rpm"], v["spin_tilt"], v["height"])
    env = Environment(
        altitude=v["altitude"], temperature_c=v["temperature"], wind=(v["wind_x"], v["wind_y"], 0.0)
    )
    return name, BALLS[ball_key], launch, env


def _r(a: Any, digits: int = 4) -> list:
    return np.round(np.asarray(a, dtype=float), digits).tolist()


def _strobe(tr: Trajectory) -> tuple[float, list[dict[str, float]]]:
    """Positions à intervalles de temps réguliers (un pas « rond » : 0,05 / 0,1 / 0,2 s…)."""
    dt = next((s for s in STROBE_STEPS if tr.flight_time / s <= MAX_STROBE_MARKS), STROBE_STEPS[-1])
    times = list(np.arange(0.0, tr.flight_time, dt))
    marks = []
    for t in times:
        s = tr.at(float(t))
        marks.append(
            {
                "t": round(float(t), 3),
                "x": round(float(s[0]), 4),
                "y": round(float(s[1]), 4),
                "z": round(float(s[2]), 4),
            }
        )
    return dt, marks


def _path(x, y, z) -> dict[str, list]:
    return {"x": _r(x), "y": _r(y), "z": _r(z)}


def run_simulation(payload: dict) -> dict[str, Any]:
    """Simule un tir et renvoie tout ce que l'écran affiche."""
    name, ball, launch, env = _parse(payload)
    sc = SCENARIOS[name]
    tr = simulate(ball, launch, env, rtol=1e-7, n_samples=N_SAMPLES)
    aero = tr.aero()
    acc = tr.accelerations()
    dt, strobe = _strobe(tr)

    _, vac = vacuum_trajectory(launch, env.gravity, n=80)
    vac_range = float(math.hypot(vac[0, -1], vac[1, -1])) if vac.shape[1] > 1 else 0.0
    nospin = None
    nospin_distance = None
    if launch.spin_rpm > 0:
        ns = simulate(ball, launch.with_(spin_rpm=0), env, rtol=1e-7, n_samples=120)
        nospin = _path(ns.x, ns.y, ns.z)
        nospin_distance = round(ns.distance, 3)

    k = 0.5 * env.density * ball.area / ball.mass
    v0 = float(aero["v_rel"][0])
    verdict_text = sc.verdict(tr)
    ax = tr.at(tr.apex_time)

    return {
        "scenario": name,
        "ball": {"key": ball.key, "name": ball.name, "mass": ball.mass, "diameter": ball.diameter},
        "air": {
            "density": round(env.density, 4),
            "viscosity": env.kinematic_viscosity,
            "temperature_c": round(env.temperature_k - 273.15, 1),
        },
        "samples": {
            "t": _r(tr.t, 4),
            "x": _r(tr.x),
            "y": _r(tr.y),
            "z": _r(tr.z),
            "v_rel": _r(aero["v_rel"], 3),
            "cd": _r(aero["cd"], 4),
            "cl": _r(aero["cl"], 4),
            "re": _r(aero["re"], 0),
            "spin_param": _r(aero["spin_param"], 4),
            "drag": {"x": _r(acc["drag"][0], 3), "z": _r(acc["drag"][2], 3)},
            "magnus": {"x": _r(acc["magnus"][0], 3), "z": _r(acc["magnus"][2], 3)},
        },
        "strobe": {"dt": dt, "marks": strobe},
        "apex": {"t": round(tr.apex_time, 3), "x": round(float(ax[0]), 3), "z": round(float(ax[2]), 3)},
        "vacuum": _path(vac[0], vac[1], vac[2]) if vac.shape[1] > 1 else None,
        "nospin": nospin,
        "summary": {
            "distance": round(tr.distance, 3),
            "lateral": round(tr.lateral, 3),
            "apex": round(tr.apex, 3),
            "flight_time": round(tr.flight_time, 3),
            "impact_speed": round(tr.impact_speed, 3),
            "impact_angle": round(tr.impact_angle, 2),
            "launch_speed": round(launch.speed, 3),
            "vacuum_distance": round(vac_range, 3),
            "nospin_distance": nospin_distance,
            "re0": round(float(aero["re"][0])),
            "cd0": round(float(aero["cd"][0]), 4),
            "spin_param0": round(float(aero["spin_param"][0]), 4),
            "cl0": round(float(aero["cl"][0]), 4),
            "drag_g0": round(k * float(aero["cd"][0]) * v0**2 / G, 3),
            "magnus_g0": round(k * float(aero["cl"][0]) * v0**2 / G, 3),
        },
        "verdict": {
            "text": verdict_text,
            "success": True if verdict_text.startswith(SUCCESS_WORDS) else None,
            "has_target": sc.target is not None,
        },
        "target": None
        if sc.target is None
        else {"x": sc.target.x, "z": sc.target.z, "descending": sc.target.descending},
        "geometry": geometry(name),
    }


def run_optimal(payload: dict) -> dict[str, Any]:
    """Angle d'élévation qui maximise la distance, les autres réglages fixés."""
    _, ball, launch, env = _parse(payload)
    el, tr = optimal_elevation(ball, launch, env)
    return {"elevation": round(el, 1), "distance": round(tr.distance, 2)}


def run_target(payload: dict) -> dict[str, Any]:
    """Angles qui font passer la balle par la cible de la situation."""
    name, ball, launch, env = _parse(payload)
    target = SCENARIOS[name].target
    if target is None:
        raise ApiError("Pas de cible dans cette situation")
    roots = elevations_through(ball, launch, env, target.x, target.z, descending=target.descending)
    current = launch.elevation
    best = min(roots, key=lambda r: abs(r - current)) if roots else None
    return {"elevations": [round(r, 1) for r in roots], "best": None if best is None else round(best, 1)}
