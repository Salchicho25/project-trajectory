"""Tests des rebonds : restitution, frottement, rotation, multi-rebonds, roulé."""

import itertools
import math

import numpy as np
import pytest

from balltraj import BALLS, SURFACES, Environment, Launch, simulate
from balltraj.impact import bounce, restitution

G = 9.80665
ENV = Environment(temperature_c=15.0)
TENNIS, GOLF, FOOT = BALLS["tennis"], BALLS["golf"], BALLS["football"]
DUR, GAZON = SURFACES["dur"], SURFACES["gazon"]


def _drop(ball, height, **kw):
    """Balle lâchée sans vitesse initiale, sans air."""
    return simulate(
        ball,
        Launch(1e-9, 0.0, height=height),
        ENV,
        drag=False,
        magnus=False,
        n_samples=4000,
        **kw,
    )


def test_tennis_ball_bounce_height_matches_itf_standard():
    """Norme ITF : lâchée de 2,54 m sur sol dur, la balle remonte de 1,35 à 1,47 m."""
    tr = _drop(TENNIS, 2.54, bounces=1, surface="dur")
    t_impact = tr.impacts[0].t
    rebound = float(tr.z[tr.t > t_impact].max())
    assert 1.35 <= rebound <= 1.47
    assert rebound == pytest.approx(TENNIS.restitution**2 * 2.54, rel=0.01)


def test_normal_restitution_is_exact_without_friction_effects():
    v_out, w_out, sliding = bounce(FOOT, DUR, np.array([0.0, 0.0, -6.0]), np.zeros(3))
    assert v_out[2] == pytest.approx(restitution(FOOT, DUR) * 6.0)
    assert np.allclose(v_out[:2], 0.0) and np.allclose(w_out, 0.0) and not sliding


def test_softer_surface_gives_lower_bounce():
    hard = _drop(TENNIS, 2.0, bounces=1, surface="dur")
    grass = _drop(TENNIS, 2.0, bounces=1, surface="gazon")
    h = lambda tr: float(tr.z[tr.t > tr.impacts[0].t].max())  # noqa: E731
    assert h(grass) < h(hard)


@pytest.mark.parametrize("ball", list(BALLS.values()), ids=lambda b: b.key)
@pytest.mark.parametrize("surface", list(SURFACES.values()), ids=lambda s: s.key)
def test_impact_never_creates_energy(ball, surface):
    rng = np.random.default_rng(7)
    inertia = ball.inertia * ball.mass * ball.radius**2
    for _ in range(60):
        v = np.array([rng.uniform(-30, 30), rng.uniform(-10, 10), -rng.uniform(0.5, 25)])
        w = rng.uniform(-300, 300, 3)
        v2, w2, _ = bounce(ball, surface, v, w)
        before = 0.5 * ball.mass * (v @ v) + 0.5 * inertia * (w @ w)
        after = 0.5 * ball.mass * (v2 @ v2) + 0.5 * inertia * (w2 @ w2)
        assert after <= before * (1 + 1e-9)


def test_sticking_impact_ends_in_pure_rolling_contact():
    """Si le frottement suffit, la vitesse du point de contact s'annule après l'impact."""
    v = np.array([1.0, 0.0, -4.0])  # glissement faible devant l'impulsion normale : le frottement suffit
    w = np.array([0.0, -10.0, 0.0])
    v2, w2, sliding = bounce(TENNIS, DUR, v, w)
    assert not sliding
    u = (v2[0] - TENNIS.radius * w2[1], v2[1] + TENNIS.radius * w2[0])
    assert u == pytest.approx((0.0, 0.0), abs=1e-9)


def test_sliding_impact_loses_exactly_mu_times_normal_impulse():
    v = np.array([20.0, 0.0, -2.0])  # glissement fort
    v2, _, sliding = bounce(TENNIS, DUR, v, np.zeros(3))
    jn = (1 + restitution(TENNIS, DUR)) * 2.0
    assert sliding
    assert v[0] - v2[0] == pytest.approx(DUR.mu * jn)


def test_topspin_accelerates_and_backspin_brakes_the_bounce():
    v = np.array([3.0, 0.0, -6.0])  # glissement modéré : le frottement ne sature pas
    out = {}
    for name, wy in {"back": -300.0, "none": 0.0, "top": 300.0}.items():
        out[name] = bounce(TENNIS, DUR, v, np.array([0.0, wy, 0.0]))[0][0]
    assert out["top"] > out["none"] > out["back"]


def test_angular_momentum_about_the_contact_point_is_conserved():
    """Pendant l'impulsion, le moment cinétique autour du point de contact ne change pas (axe y)."""
    v = np.array([9.0, 0.0, -3.0])
    w = np.array([0.0, -50.0, 0.0])
    v2, w2, _ = bounce(TENNIS, DUR, v, w)
    m, r, a = TENNIS.mass, TENNIS.radius, TENNIS.inertia
    # L = I ω_y + m R v_x (le point de contact est à −R sur z)
    assert a * m * r**2 * w2[1] + m * r * v2[0] == pytest.approx(a * m * r**2 * w[1] + m * r * v[0], rel=1e-9)


def test_bounces_make_one_impact_per_landing_and_lose_height():
    tr = simulate(
        TENNIS, Launch(18, 25, spin_rpm=0, height=1.0), ENV, bounces=3, surface="dur", n_samples=1500
    )
    assert len(tr.impacts) == 4
    xs = [i.x for i in tr.impacts]
    assert xs == sorted(xs)
    apexes = []
    edges = [0.0] + [i.t for i in tr.impacts]
    for a, b in itertools.pairwise(edges):
        sel = (tr.t >= a) & (tr.t <= b)
        apexes.append(float(tr.z[sel].max()))
    assert apexes == sorted(apexes, reverse=True)


def test_at_is_continuous_in_position_across_a_bounce():
    tr = simulate(FOOT, Launch(20, 30, height=0.2), ENV, bounces=2)
    for imp in tr.impacts[:2]:
        before, after = tr.at(imp.t - 1e-7), tr.at(imp.t + 1e-7)
        assert np.linalg.norm(before[:3] - after[:3]) < 1e-3


def test_golf_total_distance_includes_bounces_and_roll_until_rest():
    tr = simulate(GOLF, Launch(70, 11, spin_rpm=2700), ENV, bounces=2, surface="gazon", roll=True)
    assert tr.carry_distance < tr.distance
    assert tr.roll_distance > 0
    assert np.linalg.norm(tr.end[3:6]) == pytest.approx(0.0, abs=1e-9)
    last = tr.impacts[-1]
    vh = math.hypot(last.v_out[0], last.v_out[1])
    assert tr.roll_distance == pytest.approx(vh**2 / (2 * GOLF.roll_resistance * G), rel=1e-6)


def test_backspin_checks_the_ball_so_it_rolls_less_than_topspin():
    def total(tilt):
        return simulate(
            GOLF, Launch(60, 20, spin_rpm=4000, spin_tilt=tilt), ENV, surface="gazon", roll=True
        ).distance

    assert total(0) < total(180)  # rétro : la balle freine ; lift : elle file


def test_no_bounce_is_unchanged_from_the_plain_flight():
    a = simulate(FOOT, Launch(25, 30, spin_rpm=300), ENV)
    b = simulate(FOOT, Launch(25, 30, spin_rpm=300), ENV, bounces=0, roll=False)
    assert a.carry == pytest.approx(b.carry) and a.distance == pytest.approx(b.distance)
    assert a.impact_speed == pytest.approx(b.impact_speed)
    assert a.impact_angle == pytest.approx(b.impact_angle)


def test_ball_comes_to_rest_without_endless_bouncing():
    tr = simulate(BALLS["basketball"], Launch(6, 40, height=2.0), ENV, bounces=40, roll=True, surface="dur")
    assert tr.flight_time < 60 and len(tr.impacts) < 41
