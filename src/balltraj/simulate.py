"""Intégration 3D du vol d'une balle : gravité + traînée + effet Magnus + décroissance du spin.

Repère : x vers l'avant, y vers la gauche, z vers le haut (direct). Origine au sol
sous le point de frappe.

Équations (v_r = v - v_vent, k = ½ ρ A / m) :
    dv/dt = g - k·Cd(Re, S)·|v_r|·v_r + k·CL(S)·|v_r|·(ω × v_r)/|ω|
    dω/dt = -ω/τ
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass, field, replace

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq

from .atmosphere import Environment
from .balls import Ball

RPM_TO_RAD_S = 2.0 * math.pi / 60.0


@dataclass(frozen=True)
class Launch:
    """Conditions de frappe.

    speed      : vitesse initiale (m/s)
    elevation  : angle au-dessus de l'horizontale (°)
    azimuth    : direction horizontale (°), + = vers la gauche
    spin_rpm   : vitesse de rotation (tr/min)
    spin_tilt  : inclinaison de l'axe de rotation autour de la vitesse (°)
                 0 = rétro (backspin, la balle « porte »), 180 = lift (topspin),
                 +90 = effet vers la gauche, -90 = effet vers la droite
    height     : hauteur du point de frappe (m)
    """

    speed: float
    elevation: float
    azimuth: float = 0.0
    spin_rpm: float = 0.0
    spin_tilt: float = 0.0
    height: float = 0.0

    def direction(self) -> np.ndarray:
        el, az = math.radians(self.elevation), math.radians(self.azimuth)
        return np.array([math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)])

    def velocity(self) -> np.ndarray:
        return self.speed * self.direction()

    def spin_vector(self) -> np.ndarray:
        """Vecteur rotation ω (rad/s), toujours perpendiculaire à la vitesse initiale."""
        if self.spin_rpm == 0.0:
            return np.zeros(3)
        u = self.direction()
        az = math.radians(self.azimuth)
        left = np.array([-math.sin(az), math.cos(az), 0.0])  # horizontal, ⟂ u
        backspin_axis = -left  # ω × u pointe vers le haut
        sidespin_axis = np.cross(u, left)  # ω × u pointe vers la gauche
        tilt = math.radians(self.spin_tilt)
        axis = math.cos(tilt) * backspin_axis + math.sin(tilt) * sidespin_axis
        return self.spin_rpm * RPM_TO_RAD_S * axis

    def with_(self, **changes) -> Launch:
        return replace(self, **changes)


@dataclass
class Trajectory:
    """Résultat d'une simulation. `states` a la forme (9, N) : x y z vx vy vz ωx ωy ωz."""

    ball: Ball
    launch: Launch
    env: Environment
    t: np.ndarray
    states: np.ndarray
    landed: bool
    apex_time: float
    _dense: Callable[[float], np.ndarray] | None = field(default=None, repr=False)

    # --- accès pratiques -------------------------------------------------
    x = property(lambda self: self.states[0])
    y = property(lambda self: self.states[1])
    z = property(lambda self: self.states[2])
    velocity = property(lambda self: self.states[3:6])
    omega = property(lambda self: self.states[6:9])

    @property
    def speed(self) -> np.ndarray:
        return np.linalg.norm(self.velocity, axis=0)

    def at(self, t: float) -> np.ndarray:
        """État (9,) à l'instant t, par la sortie dense de l'intégrateur."""
        if self._dense is None:
            return self.states[:, -1]
        return self._dense(t)

    # --- grandeurs de synthèse --------------------------------------------
    @property
    def end(self) -> np.ndarray:
        return self.states[:, -1]

    @property
    def flight_time(self) -> float:
        return float(self.t[-1])

    @property
    def carry(self) -> float:
        """Distance parcourue selon x au point de chute (m)."""
        return float(self.end[0])

    @property
    def lateral(self) -> float:
        """Écart latéral au point de chute (m), + = à gauche."""
        return float(self.end[1])

    @property
    def distance(self) -> float:
        """Distance horizontale entre le départ et le point de chute (m)."""
        return float(math.hypot(self.end[0], self.end[1]))

    @property
    def apex(self) -> float:
        return float(self.at(self.apex_time)[2])

    @property
    def impact_speed(self) -> float:
        return float(np.linalg.norm(self.end[3:6]))

    @property
    def impact_angle(self) -> float:
        """Angle de descente au point de chute (°, négatif)."""
        vx, vy, vz = self.end[3:6]
        return math.degrees(math.atan2(vz, math.hypot(vx, vy)))

    # --- passages à une position donnée --------------------------------------
    def time_at_x(self, x: float) -> float | None:
        """Premier instant où la balle franchit le plan x = cte, ou None."""
        idx = np.nonzero(self.x >= x)[0]
        if idx.size == 0:
            return None
        i = int(idx[0])
        if i == 0:
            return float(self.t[0])
        return brentq(lambda tt: self.at(tt)[0] - x, self.t[i - 1], self.t[i], xtol=1e-12)

    def time_descending_through(self, z: float) -> float | None:
        """Instant où la balle redescend sous l'altitude z (après l'apogée), ou None."""
        mask = (self.t >= self.apex_time) & (self.z <= z)
        idx = np.nonzero(mask)[0]
        if idx.size == 0:
            return None
        i = int(idx[0])
        t_lo = max(self.apex_time, float(self.t[i - 1])) if i > 0 else self.apex_time
        if self.at(t_lo)[2] < z:
            return None
        return brentq(lambda tt: self.at(tt)[2] - z, t_lo, self.t[i], xtol=1e-12)

    # --- aérodynamique le long du vol --------------------------------------
    def aero(self) -> dict[str, np.ndarray]:
        """Re, S, Cd, CL et vitesse relative à chaque échantillon."""
        wind = np.asarray(self.env.wind, dtype=float)[:, None]
        v_rel = np.linalg.norm(self.velocity - wind, axis=0)
        v_safe = np.maximum(v_rel, 1e-9)
        om = np.linalg.norm(self.omega, axis=0)
        re = v_rel * self.ball.diameter / self.env.kinematic_viscosity
        s = self.ball.radius * om / v_safe
        return {
            "v_rel": v_rel,
            "re": re,
            "spin_param": s,
            "cd": self.ball.drag.cd(re, s),
            "cl": self.ball.lift.cl(s),
        }

    def accelerations(self) -> dict[str, np.ndarray]:
        """Accélérations (m/s²) dues à la traînée et à Magnus, composantes (3, N).

        Mêmes formules que le second membre de l'EDO, évaluées sur les échantillons :
        c'est ce qui permet d'afficher les forces sans jamais refaire la physique ailleurs.
        """
        a = self.aero()
        k = 0.5 * self.env.density * self.ball.area / self.ball.mass
        wind = np.asarray(self.env.wind, dtype=float)[:, None]
        u = self.velocity - wind
        v = np.maximum(a["v_rel"], 1e-12)
        drag = -k * a["cd"] * v * u
        om = np.linalg.norm(self.omega, axis=0)
        cross = np.cross(self.omega, u, axis=0)
        magnus = k * a["cl"] * v / np.maximum(om, 1e-12) * cross
        return {"drag": drag, "magnus": np.where(om > 1e-12, magnus, 0.0)}


def _make_rhs(ball: Ball, env: Environment, drag: bool, magnus: bool, spin_decay: bool):
    """Second membre de l'EDO, écrit en flottants purs pour la vitesse."""
    r, d = ball.radius, ball.diameter
    k = 0.5 * env.density * ball.area / ball.mass
    nu = env.kinematic_viscosity
    g = env.gravity
    wx, wy, wz = (float(c) for c in env.wind)
    cd_f, cl_f = ball.drag.cd, ball.lift.cl
    inv_tau = 1.0 / ball.spin_decay_time if spin_decay and ball.spin_decay_time > 0 else 0.0
    sqrt = math.sqrt

    def rhs(_t, s):
        vx, vy, vz, ox, oy, oz = s[3], s[4], s[5], s[6], s[7], s[8]
        ux, uy, uz = vx - wx, vy - wy, vz - wz
        v = sqrt(ux * ux + uy * uy + uz * uz)
        ax = ay = 0.0
        az = -g
        if v > 1e-12 and k > 0.0:
            om = sqrt(ox * ox + oy * oy + oz * oz)
            sp = r * om / v
            if drag:
                c = k * cd_f(v * d / nu, sp) * v
                ax -= c * ux
                ay -= c * uy
                az -= c * uz
            if magnus and om > 1e-12:
                c = k * cl_f(sp) * v / om
                ax += c * (oy * uz - oz * uy)
                ay += c * (oz * ux - ox * uz)
                az += c * (ox * uy - oy * ux)
        return [vx, vy, vz, ax, ay, az, -ox * inv_tau, -oy * inv_tau, -oz * inv_tau]

    return rhs


def simulate(
    ball: Ball,
    launch: Launch,
    env: Environment | None = None,
    *,
    drag: bool = True,
    magnus: bool = True,
    spin_decay: bool = True,
    ground: float = 0.0,
    t_max: float = 60.0,
    n_samples: int = 400,
    rtol: float = 1e-8,
    atol: float = 1e-9,
) -> Trajectory:
    """Simule le vol jusqu'au contact avec le sol (z = ground) ou jusqu'à t_max."""
    env = env or Environment()
    s0 = np.concatenate([[0.0, 0.0, launch.height], launch.velocity(), launch.spin_vector()])

    if launch.height <= ground and s0[5] <= 0.0:  # tir vers le sol depuis le sol
        return Trajectory(ball, launch, env, np.array([0.0]), s0[:, None], True, 0.0, None)

    def hit_ground(_t, s):
        return s[2] - ground

    def apex(_t, s):
        return s[5]

    # attributs lus par solve_ivp : arrêt au sol, détection uniquement en descente
    setattr(hit_ground, "terminal", True)  # noqa: B010
    setattr(hit_ground, "direction", -1)  # noqa: B010
    setattr(apex, "direction", -1)  # noqa: B010

    sol = solve_ivp(
        _make_rhs(ball, env, drag, magnus, spin_decay),
        (0.0, t_max),
        s0,
        method="DOP853",
        events=(hit_ground, apex),
        dense_output=True,
        rtol=rtol,
        atol=atol,
    )
    if sol.status == -1:
        raise RuntimeError(f"Échec de l'intégration : {sol.message}")

    landed = sol.t_events[0].size > 0
    t_end = float(sol.t_events[0][0]) if landed else float(sol.t[-1])
    t = np.linspace(0.0, t_end, n_samples)
    states = sol.sol(t)
    if landed:
        states[:, -1] = sol.y_events[0][0]
    apex_time = float(sol.t_events[1][0]) if sol.t_events[1].size else float(t[np.argmax(states[2])])
    return Trajectory(ball, launch, env, t, states, landed, apex_time, sol.sol)


def vacuum_trajectory(launch: Launch, gravity: float = 9.80665, ground: float = 0.0, n: int = 200):
    """Solution analytique sans air (parabole). Renvoie (t, positions (3, n))."""
    v = launch.velocity()
    h = launch.height - ground
    t_end = (v[2] + math.sqrt(max(v[2] ** 2 + 2 * gravity * h, 0.0))) / gravity
    t = np.linspace(0.0, max(t_end, 0.0), n)
    pos = np.vstack([v[0] * t, v[1] * t, launch.height + v[2] * t - 0.5 * gravity * t**2])
    return t, pos
