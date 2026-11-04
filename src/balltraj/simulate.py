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
from .impact import SURFACES, Impact, Surface, bounce

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
class Segment:
    """Un tronçon continu de la trajectoire (un vol ou le roulé), sur [t0, t1].

    `fn(tau)` renvoie l'état (9,) à l'instant relatif tau = t - t0.
    """

    t0: float
    t1: float
    fn: Callable[[float], np.ndarray]


@dataclass
class Trajectory:
    """Résultat d'une simulation. `states` a la forme (9, N) : x y z vx vy vz ωx ωy ωz.

    Avec des rebonds, `t` et `states` enchaînent tous les tronçons (vols puis roulé) ;
    `impacts` liste les contacts avec le sol et `roll_distance` la distance roulée (m).
    """

    ball: Ball
    launch: Launch
    env: Environment
    t: np.ndarray
    states: np.ndarray
    landed: bool
    apex_time: float
    segments: list[Segment] = field(default_factory=list, repr=False)
    impacts: list[Impact] = field(default_factory=list)
    roll_distance: float = 0.0

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
        if not self.segments:
            return self.states[:, -1]
        for seg in self.segments:
            if t <= seg.t1:
                return np.asarray(seg.fn(max(t, seg.t0) - seg.t0))
        last = self.segments[-1]
        return np.asarray(last.fn(last.t1 - last.t0))

    # --- grandeurs de synthèse --------------------------------------------
    @property
    def end(self) -> np.ndarray:
        return self.states[:, -1]

    @property
    def flight_time(self) -> float:
        return float(self.t[-1])

    @property
    def carry(self) -> float:
        """Distance parcourue selon x au premier contact avec le sol (m)."""
        return float(self.impacts[0].x if self.impacts else self.end[0])

    @property
    def carry_distance(self) -> float:
        """Distance horizontale au premier contact (m) : le « carry » du golf."""
        if not self.impacts:
            return self.distance
        return float(math.hypot(self.impacts[0].x, self.impacts[0].y))

    @property
    def lateral(self) -> float:
        """Écart latéral au point de chute (m), + = à gauche."""
        return float(self.end[1])

    @property
    def distance(self) -> float:
        """Distance horizontale entre le départ et l'arrêt (ou le dernier contact) (m)."""
        return float(math.hypot(self.end[0], self.end[1]))

    @property
    def apex(self) -> float:
        return float(self.at(self.apex_time)[2])

    @property
    def impact_speed(self) -> float:
        """Vitesse au premier contact (m/s)."""
        return float(self.impacts[0].speed_in if self.impacts else np.linalg.norm(self.end[3:6]))

    @property
    def impact_angle(self) -> float:
        """Angle de descente au premier contact (°, négatif)."""
        vx, vy, vz = self.impacts[0].v_in if self.impacts else self.end[3:6]
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


def _vec3(a: np.ndarray) -> tuple[float, float, float]:
    return (float(a[0]), float(a[1]), float(a[2]))


def _roll_segment(ball: Ball, env: Environment, t0: float, ground: float, post: np.ndarray) -> Segment | None:
    """Roulé après le dernier contact : décélération constante = résistance de roulement × g."""
    vx, vy = float(post[3]), float(post[4])
    vh = math.hypot(vx, vy)
    if vh < 0.05:
        return None
    dx, dy = vx / vh, vy / vh
    a = ball.roll_resistance * env.gravity
    ts = vh / a
    x0, y0, r = float(post[0]), float(post[1]), ball.radius

    def fn(tau: float) -> np.ndarray:
        tau = min(max(tau, 0.0), ts)
        d = vh * tau - 0.5 * a * tau * tau
        sp = max(vh - a * tau, 0.0)
        return np.array(
            [x0 + dx * d, y0 + dy * d, ground, dx * sp, dy * sp, 0.0, -dy * sp / r, dx * sp / r, 0.0]
        )

    return Segment(t0, t0 + ts, fn)


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
    bounces: int = 0,
    surface: str | Surface = "dur",
    roll: bool = False,
    rest_speed: float = 0.5,
) -> Trajectory:
    """Simule le vol jusqu'au sol (z = ground), avec rebonds et roulé en option.

    bounces     : nombre de rebonds que la balle effectue (0 : arrêt au premier contact)
    surface     : sol (« dur », « gazon », « terre ») ou un objet Surface
    roll        : si vrai, la balle roule après le dernier contact jusqu'à l'arrêt
    rest_speed  : en dessous de cette vitesse verticale après un impact, la balle ne rebondit plus
    """
    env = env or Environment()
    surf = SURFACES[surface] if isinstance(surface, str) else surface
    s0 = np.concatenate([[0.0, 0.0, launch.height], launch.velocity(), launch.spin_vector()])

    if launch.height <= ground and s0[5] <= 0.0:  # tir vers le sol depuis le sol
        return Trajectory(ball, launch, env, np.array([0.0]), s0[:, None], True, 0.0)

    def hit_ground(_t, s):
        return s[2] - ground

    def apex(_t, s):
        return s[5]

    # attributs lus par solve_ivp : arrêt au sol, détection uniquement en descente
    setattr(hit_ground, "terminal", True)  # noqa: B010
    setattr(hit_ground, "direction", -1)  # noqa: B010
    setattr(apex, "direction", -1)  # noqa: B010
    rhs = _make_rhs(ball, env, drag, magnus, spin_decay)

    segments: list[Segment] = []
    impacts: list[Impact] = []
    state, t_off = s0, 0.0
    apex_time: float | None = None
    final_state = s0
    landed = False
    for k in range(max(0, bounces) + 1):
        sol = solve_ivp(
            rhs,
            (0.0, max(t_max - t_off, 1e-6)),
            state,
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
        final_state = np.array(sol.y_events[0][0] if landed else sol.y[:, -1])
        if k == 0 and sol.t_events[1].size:
            apex_time = float(sol.t_events[1][0])
        segments.append(Segment(t_off, t_off + t_end, sol.sol))
        if not landed:
            break

        v_out, w_out, sliding = bounce(ball, surf, final_state[3:6], final_state[6:9])
        impacts.append(
            Impact(
                t_off + t_end,
                float(final_state[0]),
                float(final_state[1]),
                _vec3(final_state[3:6]),
                _vec3(v_out),
                sliding,
            )
        )
        post = final_state.copy()
        post[2], post[3:6], post[6:9] = ground, v_out, w_out
        t_off += t_end
        if k == bounces or v_out[2] < rest_speed:
            if roll:
                seg = _roll_segment(ball, env, t_off, ground, post)
                if seg is not None:
                    segments.append(seg)
                    final_state = seg.fn(seg.t1 - seg.t0)
            break
        state = post

    t_total = segments[-1].t1
    t = np.linspace(0.0, t_total, n_samples)
    traj = Trajectory(ball, launch, env, t, np.empty((9, 0)), bool(impacts), 0.0, segments, impacts)
    traj.states = np.column_stack([traj.at(float(tt)) for tt in t])
    traj.states[:, -1] = final_state
    if apex_time is None:
        first = t <= segments[0].t1
        apex_time = float(t[first][np.argmax(traj.states[2][first])])
    traj.apex_time = apex_time
    if roll and len(segments) > 1 and impacts:
        traj.roll_distance = float(math.hypot(final_state[0] - impacts[-1].x, final_state[1] - impacts[-1].y))
    return traj


def vacuum_trajectory(launch: Launch, gravity: float = 9.80665, ground: float = 0.0, n: int = 200):
    """Solution analytique sans air (parabole). Renvoie (t, positions (3, n))."""
    v = launch.velocity()
    h = launch.height - ground
    t_end = (v[2] + math.sqrt(max(v[2] ** 2 + 2 * gravity * h, 0.0))) / gravity
    t = np.linspace(0.0, max(t_end, 0.0), n)
    pos = np.vstack([v[0] * t, v[1] * t, launch.height + v[2] * t - 0.5 * gravity * t**2])
    return t, pos
