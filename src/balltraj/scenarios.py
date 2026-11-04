"""Situations de jeu : géométrie du terrain, tir par défaut et verdict."""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass

from matplotlib.patches import Circle, Rectangle

from .balls import BALLS
from .simulate import Launch, Trajectory


def _f(v: float, digits: int, sign: bool = False) -> str:
    """Nombre à la française : virgule décimale, vrai signe moins."""
    text = f"{v:+.{digits}f}" if sign else f"{v:.{digits}f}"
    return text.replace(".", ",").replace("-", "−")


GROUND_COLOR = "#7a9a5a"
STRUCT_COLOR = "#444444"


@dataclass(frozen=True)
class Target:
    """Point visé par le bouton « Viser la cible »."""

    x: float
    z: float
    descending: bool = False


@dataclass(frozen=True)
class Scenario:
    name: str
    ball: str
    launch: Launch
    target: Target | None
    view: tuple[float, float, float]  # x_max, z_max, demi-largeur y minimales
    draw: Callable[[object, object], None]  # (ax_side, ax_top)
    verdict: Callable[[Trajectory], str]


# --- Coup franc -----------------------------------------------------------------
FK_WALL_X, FK_WALL_Y, FK_WALL_H = 9.15, (-1.0, 1.4), 1.90
FK_GOAL_X, FK_GOAL_HALF_W, FK_GOAL_H = 22.0, 3.66, 2.44


def _draw_free_kick(side, top):
    side.add_patch(Rectangle((FK_WALL_X - 0.15, 0), 0.3, FK_WALL_H, color=STRUCT_COLOR, alpha=0.6))
    side.plot([FK_GOAL_X, FK_GOAL_X, FK_GOAL_X + 1.5], [0, FK_GOAL_H, FK_GOAL_H], color=STRUCT_COLOR, lw=3)
    for label, x, z in (("mur", FK_WALL_X, FK_WALL_H), ("but", FK_GOAL_X, FK_GOAL_H)):
        side.annotate(label, (x, z), xytext=(0, 4), textcoords="offset points", ha="center", fontsize=8)
    top.plot([FK_WALL_X] * 2, FK_WALL_Y, color=STRUCT_COLOR, lw=6, alpha=0.6, solid_capstyle="butt")
    top.plot([FK_GOAL_X] * 2, [-FK_GOAL_HALF_W, FK_GOAL_HALF_W], color=STRUCT_COLOR, lw=3)
    top.plot([FK_GOAL_X] * 2, [-FK_GOAL_HALF_W, FK_GOAL_HALF_W], "o", color=STRUCT_COLOR, ms=5)


def _verdict_free_kick(tr: Trajectory) -> str:
    r = tr.ball.radius
    tw = tr.time_at_x(FK_WALL_X)
    if tw is None:
        return "Trop court : n'atteint pas le mur"
    _, yw, zw = tr.at(tw)[:3]
    if FK_WALL_Y[0] - r < yw < FK_WALL_Y[1] + r and zw < FK_WALL_H + r:
        return "Contré par le mur"
    tg = tr.time_at_x(FK_GOAL_X)
    if tg is None:
        return "Trop court : rebondit avant la ligne"
    _, yg, zg = tr.at(tg)[:3]
    if abs(yg) < FK_GOAL_HALF_W - r and zg < FK_GOAL_H - r:
        return f"BUT ! (y = {_f(yg, 2, sign=True)} m, z = {_f(zg, 2)} m)"
    if zg >= FK_GOAL_H - r and abs(yg) < FK_GOAL_HALF_W + r:
        return f"Au-dessus (z = {_f(zg, 2)} m)"
    return f"À côté (y = {_f(yg, 2, sign=True)} m)"


# --- Lancer franc -------------------------------------------------------------------
FT_HOOP_X, FT_HOOP_Z, FT_RIM_R = 4.2, 3.05, 0.225
FT_BOARD_X = FT_HOOP_X + 0.375


def _draw_free_throw(side, top):
    side.plot([FT_HOOP_X - FT_RIM_R, FT_HOOP_X + FT_RIM_R], [FT_HOOP_Z] * 2, color="#d35400", lw=3)
    side.plot([FT_BOARD_X] * 2, [2.90, 3.95], color=STRUCT_COLOR, lw=4)
    side.plot([FT_BOARD_X + 0.05, FT_BOARD_X + 0.6], [3.3, 3.3], color=STRUCT_COLOR, lw=2)
    top.add_patch(Circle((FT_HOOP_X, 0), FT_RIM_R, fill=False, color="#d35400", lw=2))
    top.plot([FT_BOARD_X] * 2, [-0.9, 0.9], color=STRUCT_COLOR, lw=4)


def _verdict_free_throw(tr: Trajectory) -> str:
    t = tr.time_descending_through(FT_HOOP_Z)
    if t is None:
        return "Trop court : n'atteint pas la hauteur du cercle"
    x, y = tr.at(t)[:2]
    off = math.hypot(x - FT_HOOP_X, y)
    entry = math.degrees(math.atan2(-tr.at(t)[5], math.hypot(*tr.at(t)[3:5])))
    if off < FT_RIM_R - tr.ball.radius:
        return f"PANIER ! (écart {off * 100:.0f} cm, entrée à {entry:.0f}°)"
    if off < FT_RIM_R + tr.ball.radius:
        return f"Touche le cercle (écart {off * 100:.0f} cm)"
    return f"Raté ({'long' if x > FT_HOOP_X else 'court'} de {abs(x - FT_HOOP_X) * 100:.0f} cm)"


# --- Drive de golf ------------------------------------------------------------------
def _draw_golf(side, top):
    for d in range(50, 351, 50):
        side.axvline(d, color=GROUND_COLOR, lw=0.6, alpha=0.5)
        top.axvline(d, color=GROUND_COLOR, lw=0.6, alpha=0.5)
    top.axhspan(-18, 18, color=GROUND_COLOR, alpha=0.12)


def _verdict_golf(tr: Trajectory) -> str:
    carry = tr.carry_distance
    text = f"Carry : {carry:.0f} m ({carry / 0.9144:.0f} yd), écart {_f(tr.lateral, 1, sign=True)} m"
    if len(tr.impacts) > 1 or tr.roll_distance > 0:
        text += f", total {tr.distance:.0f} m"
    return text


# --- Home run -------------------------------------------------------------------------
HR_FENCE_X, HR_FENCE_H = 122.0, 3.0


def _draw_home_run(side, top):
    side.add_patch(Rectangle((HR_FENCE_X, 0), 1.0, HR_FENCE_H, color=STRUCT_COLOR, alpha=0.7))
    side.annotate(
        "palissade 122 m (400 ft)",
        (HR_FENCE_X, HR_FENCE_H),
        xytext=(0, 4),
        textcoords="offset points",
        ha="center",
        fontsize=8,
    )
    top.axvline(HR_FENCE_X, color=STRUCT_COLOR, lw=3)


def _verdict_home_run(tr: Trajectory) -> str:
    t = tr.time_at_x(HR_FENCE_X)
    if t is not None and tr.at(t)[2] > HR_FENCE_H + tr.ball.radius:
        return f"HOME RUN ! ({tr.carry:.0f} m, soit {tr.carry / 0.3048:.0f} ft)"
    return f"Dans le champ ({tr.carry:.0f} m, soit {tr.carry / 0.3048:.0f} ft)"


def _nothing(*_):
    return None


SCENARIOS: dict[str, Scenario] = {
    s.name: s
    for s in [
        Scenario("Libre", "football", Launch(25, 30), None, (10, 3, 2), _nothing, lambda tr: ""),
        Scenario(
            "Coup franc",
            "football",
            Launch(24, 17, -8, 600, 80, BALLS["football"].radius),
            Target(FK_GOAL_X, 2.0),
            (25, 4, 5),
            _draw_free_kick,
            _verdict_free_kick,
        ),
        Scenario(
            "Lancer franc",
            "basketball",
            Launch(7.6, 56.5, 0, 120, 0, 2.1),
            Target(FT_HOOP_X, FT_HOOP_Z, descending=True),
            (5.2, 4.5, 1),
            _draw_free_throw,
            _verdict_free_throw,
        ),
        Scenario(
            "Drive golf",
            "golf",
            Launch(70, 11, 0, 2700, 0, 0),
            None,
            (250, 30, 20),
            _draw_golf,
            _verdict_golf,
        ),
        Scenario(
            "Home run",
            "baseball",
            Launch(46, 28, 0, 2000, 0, 1.0),
            Target(HR_FENCE_X, 6.0),
            (130, 30, 10),
            _draw_home_run,
            _verdict_home_run,
        ),
    ]
}
