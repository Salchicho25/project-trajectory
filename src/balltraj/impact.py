"""Impact d'une balle sur le sol : restitution, frottement de Coulomb, transfert de rotation.

Modèle de sphère rigide (type Garwin) : à l'instant du contact, une impulsion normale réfléchit
la vitesse verticale (coefficient de restitution e) et une impulsion tangentielle, plafonnée par
le frottement (μ × impulsion normale), agit sur la vitesse de glissement du point de contact.

  - si le frottement suffit, la balle « accroche » : la vitesse du point de contact tombe à 0
    (roulement sans glissement) ;
  - sinon elle glisse : l'impulsion vaut μ·J_n, dirigée contre le glissement.

Repère : x avant, y gauche, z haut ; le sol est le plan z = 0, la normale est +z.

    vitesse du point de contact : u = (v_x − R·ω_y, v_y + R·ω_x)
    variation de la vitesse tangentielle : Δv_t = j            (j = impulsion / masse)
    variation de la rotation : Δω = (j_y, −j_x, 0) / (α·R)    (I = α·m·R²)
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .balls import Ball


@dataclass(frozen=True)
class Surface:
    """Sol : le coefficient de restitution de la balle est multiplié par `e_factor`."""

    key: str
    name: str
    e_factor: float
    mu: float  # coefficient de frottement balle/sol


SURFACES: dict[str, Surface] = {
    s.key: s
    for s in (
        Surface("dur", "Dur", 1.00, 0.50),
        Surface("gazon", "Gazon", 0.82, 0.55),
        Surface("terre", "Terre battue", 0.88, 0.70),
    )
}


@dataclass(frozen=True)
class Impact:
    """Un contact avec le sol. `v_in` et `v_out` sont les vitesses juste avant et juste après."""

    t: float
    x: float
    y: float
    v_in: tuple[float, float, float]
    v_out: tuple[float, float, float]
    sliding: bool

    @property
    def speed_in(self) -> float:
        return math.sqrt(sum(c * c for c in self.v_in))

    @property
    def speed_out(self) -> float:
        return math.sqrt(sum(c * c for c in self.v_out))


def restitution(ball: Ball, surface: Surface) -> float:
    """Coefficient de restitution effectif (borné à 1)."""
    return min(1.0, ball.restitution * surface.e_factor)


def bounce(
    ball: Ball, surface: Surface, v: np.ndarray, omega: np.ndarray
) -> tuple[np.ndarray, np.ndarray, bool]:
    """Vitesse et rotation juste après l'impact. Renvoie (v', ω', glisse)."""
    e = restitution(ball, surface)
    r, alpha, mu = ball.radius, ball.inertia, surface.mu
    vx, vy, vz = (float(c) for c in v)
    ox, oy, oz = (float(c) for c in omega)
    if vz >= 0.0:  # la balle ne descend pas : pas d'impact
        return np.array(v, dtype=float), np.array(omega, dtype=float), False

    jn = (1.0 + e) * -vz  # impulsion normale par unité de masse
    ux, uy = vx - r * oy, vy + r * ox  # vitesse de glissement au point de contact
    u = math.hypot(ux, uy)
    stick = u / (1.0 + 1.0 / alpha)  # impulsion qui annulerait exactement le glissement
    sliding = stick > mu * jn
    if u < 1e-12:
        jx = jy = 0.0
    elif sliding:
        jx, jy = -mu * jn * ux / u, -mu * jn * uy / u
    else:
        jx, jy = -ux / (1.0 + 1.0 / alpha), -uy / (1.0 + 1.0 / alpha)

    v_out = np.array([vx + jx, vy + jy, -e * vz])
    w_out = np.array([ox + jy / (alpha * r), oy - jx / (alpha * r), oz])
    return v_out, w_out, bool(sliding)
