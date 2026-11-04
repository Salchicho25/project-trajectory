"""Coefficients aérodynamiques d'une sphère en rotation.

Nombre de Reynolds : Re = V·d/ν
Paramètre de spin  : S  = r·ω/V   (vitesse périphérique / vitesse d'avance)

Les fonctions acceptent des scalaires ou des tableaux numpy.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DragModel:
    """Coefficient de traînée Cd(Re, S) avec crise de traînée.

    En dessous de `re_crit`, la couche limite est laminaire et décolle tôt : Cd ≈ cd_sub.
    Au-dessus, elle devient turbulente, le sillage se resserre : Cd chute vers cd_super.
    C'est ce qui rend les balles de golf alvéolées si efficaces (re_crit très bas) et
    ce qui fait « flotter » un ballon de volley ou de foot frappé sans rotation.

    sharpness  : raideur de la transition (logistique en log Re)
    spin_coeff : traînée induite par la rotation, Cd += spin_coeff · S
    """

    cd_sub: float
    cd_super: float
    re_crit: float = 2.0e5
    sharpness: float = 6.0
    spin_coeff: float = 0.0

    def cd(self, re, spin_param=0.0):
        x = (re / self.re_crit) ** self.sharpness
        return self.cd_super + (self.cd_sub - self.cd_super) / (1.0 + x) + self.spin_coeff * spin_param


@dataclass(frozen=True)
class LiftModel:
    """Coefficient de portance Magnus CL(S).

    CL = S / (1/slope + S/cl_max) : linéaire (pente `slope`) aux faibles spins,
    saturé à `cl_max` aux forts spins. Avec slope = 1 et cl_max = 0.5 on retrouve la
    corrélation classique CL = 1 / (2 + 1/S) (balles de tennis, ballons).
    """

    slope: float = 1.0
    cl_max: float = 0.5

    def cl(self, spin_param):
        return spin_param / (1.0 / self.slope + spin_param / self.cl_max)
