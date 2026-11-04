"""Caractéristiques des balles (masses et diamètres réglementaires).

Les paramètres aérodynamiques sont des ordres de grandeur tirés de la littérature
(essais en soufflerie publiés). Ils sont faits pour être modifiés : c'est le
principal levier pour calibrer le modèle sur tes propres mesures.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .aero import DragModel, LiftModel


@dataclass(frozen=True)
class Ball:
    key: str
    name: str
    mass: float  # kg
    radius: float  # m
    drag: DragModel
    lift: LiftModel
    spin_decay_time: float  # s, constante de temps : ω(t) = ω0·exp(-t/τ)
    color: str

    @property
    def diameter(self) -> float:
        return 2.0 * self.radius

    @property
    def area(self) -> float:
        """Maître-couple π r² (m²)."""
        return math.pi * self.radius**2

    def describe(self) -> str:
        return f"{self.name} — {self.mass * 1000:.0f} g, Ø {self.diameter * 100:.1f} cm"


BALLS: dict[str, Ball] = {
    b.key: b
    for b in [
        Ball(
            "football",
            "Football (taille 5)",
            0.430,
            0.110,
            DragModel(cd_sub=0.45, cd_super=0.18, re_crit=2.2e5, sharpness=6),
            LiftModel(slope=1.0, cl_max=0.40),
            12.0,
            "#2b7bba",
        ),
        Ball(
            "basketball",
            "Basket (taille 7)",
            0.620,
            0.1194,
            DragModel(cd_sub=0.54, cd_super=0.54),
            LiftModel(slope=1.0, cl_max=0.50),
            10.0,
            "#e07b39",
        ),
        Ball(
            "golf",
            "Golf",
            0.04593,
            0.021335,
            DragModel(cd_sub=0.50, cd_super=0.21, re_crit=5.0e4, sharpness=4, spin_coeff=0.3),
            LiftModel(slope=3.0, cl_max=0.40),
            25.0,
            "#555555",
        ),
        Ball(
            "tennis",
            "Tennis",
            0.057,
            0.0335,
            DragModel(cd_sub=0.55, cd_super=0.55),
            LiftModel(slope=1.0, cl_max=0.50),
            10.0,
            "#9aa81c",
        ),
        Ball(
            "baseball",
            "Baseball",
            0.145,
            0.0366,
            DragModel(cd_sub=0.50, cd_super=0.30, re_crit=1.3e5, sharpness=4),
            LiftModel(slope=1.8, cl_max=0.50),
            15.0,
            "#b03a2e",
        ),
        Ball(
            "volleyball",
            "Volley",
            0.270,
            0.105,
            DragModel(cd_sub=0.50, cd_super=0.17, re_crit=2.6e5, sharpness=6),
            LiftModel(slope=1.0, cl_max=0.40),
            10.0,
            "#8e44ad",
        ),
    ]
}
