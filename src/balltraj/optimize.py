"""Problèmes inverses : quel angle / quelle vitesse pour atteindre un objectif ?"""

from __future__ import annotations

import math

import numpy as np
from scipy.optimize import brentq, minimize_scalar

from .atmosphere import Environment
from .balls import Ball
from .simulate import Launch, Trajectory, simulate


def optimal_elevation(
    ball: Ball,
    launch: Launch,
    env: Environment | None = None,
    bounds: tuple[float, float] = (1.0, 80.0),
    **sim_kw,
) -> tuple[float, Trajectory]:
    """Angle d'élévation qui maximise la distance horizontale, les autres paramètres fixés.

    Balayage grossier (la fonction peut être multimodale avec beaucoup de spin)
    puis affinage par optimisation bornée autour du meilleur point.
    """

    def neg_distance(el: float) -> float:
        return -simulate(ball, launch.with_(elevation=el), env, **sim_kw).distance

    grid = np.arange(bounds[0], bounds[1] + 1e-9, 2.5)
    values = [neg_distance(e) for e in grid]
    i = int(np.argmin(values))
    lo, hi = grid[max(i - 1, 0)], grid[min(i + 1, len(grid) - 1)]
    res = minimize_scalar(neg_distance, bounds=(lo, hi), method="bounded", options={"xatol": 1e-3})
    best = float(res.x)
    return best, simulate(ball, launch.with_(elevation=best), env, **sim_kw)


def height_at_x(
    ball: Ball, launch: Launch, env: Environment | None, x_target: float, **sim_kw
) -> tuple[float, float] | None:
    """(z, vz) quand la balle franchit le plan x = x_target, ou None si elle n'y arrive pas."""
    traj = simulate(ball, launch, env, **sim_kw)
    t = traj.time_at_x(x_target)
    if t is None:
        return None
    s = traj.at(t)
    return float(s[2]), float(s[5])


def elevations_through(
    ball: Ball,
    launch: Launch,
    env: Environment | None,
    x_target: float,
    z_target: float,
    *,
    descending: bool = False,
    bounds: tuple[float, float] = (-10.0, 85.0),
    step: float = 1.0,
    **sim_kw,
) -> list[float]:
    """Tous les angles d'élévation (à vitesse fixée) qui font passer la balle par (x, z).

    Il y en a en général deux : un tir tendu et un tir en cloche.
    Avec descending=True, on ne garde que ceux où la balle redescend au passage
    (indispensable pour un panier de basket).
    """

    def f(el: float) -> float:
        res = height_at_x(ball, launch.with_(elevation=el), env, x_target, **sim_kw)
        return math.nan if res is None else res[0] - z_target

    grid = np.arange(bounds[0], bounds[1] + 1e-9, step)
    vals = np.array([f(e) for e in grid])
    roots = []
    for a, b, fa, fb in zip(grid[:-1], grid[1:], vals[:-1], vals[1:], strict=True):
        if np.isfinite(fa) and np.isfinite(fb) and fa * fb <= 0 and fa != fb:
            roots.append(brentq(f, a, b, xtol=1e-7))
    if descending:
        roots = [
            el for el in roots if _vz_at_x(ball, launch.with_(elevation=el), env, x_target, **sim_kw) < 0
        ]
    return roots


def _vz_at_x(ball: Ball, launch: Launch, env: Environment | None, x_target: float, **sim_kw) -> float:
    res = height_at_x(ball, launch, env, x_target, **sim_kw)
    return math.nan if res is None else res[1]


def min_speed_through(
    ball: Ball,
    launch: Launch,
    env: Environment | None,
    x_target: float,
    z_target: float,
    *,
    speed_bounds: tuple[float, float] = (0.5, 120.0),
    **sim_kw,
) -> tuple[float, float]:
    """Vitesse minimale (et angle associé) pour faire passer la balle par (x, z).

    Résultat classique au basket : le lancer franc « au moindre effort » se fait
    autour de 50°, et c'est aussi le plus tolérant aux erreurs de vitesse.
    """

    def best_height(speed: float) -> tuple[float, float]:
        def neg(el: float) -> float:
            res = height_at_x(ball, launch.with_(speed=speed, elevation=el), env, x_target, **sim_kw)
            return 1e6 if res is None else -(res[0] - z_target)

        grid = np.arange(2.5, 85.0, 2.5)
        vals = [neg(e) for e in grid]
        i = int(np.argmin(vals))
        lo, hi = grid[max(i - 1, 0)], grid[min(i + 1, len(grid) - 1)]
        res = minimize_scalar(neg, bounds=(lo, hi), method="bounded", options={"xatol": 1e-4})
        return -float(res.fun), float(res.x)

    v_min = brentq(lambda v: best_height(v)[0], *speed_bounds, xtol=1e-5)
    return v_min, best_height(v_min)[1]
