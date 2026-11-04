"""Tests de validation du modèle physique."""

import math

import numpy as np
import pytest

from balltraj import (
    BALLS,
    Environment,
    Launch,
    elevations_through,
    min_speed_through,
    optimal_elevation,
    simulate,
    vacuum_trajectory,
)
from balltraj.atmosphere import isa_pressure

G = 9.80665
ENV = Environment(temperature_c=15.0)
FOOT, GOLF, BASKET = BALLS["football"], BALLS["golf"], BALLS["basketball"]


# --- Atmosphère -------------------------------------------------------------------
def test_sea_level_air():
    assert ENV.density == pytest.approx(1.225, abs=1e-3)
    assert ENV.kinematic_viscosity == pytest.approx(1.46e-5, rel=0.01)


def test_isa_altitude():
    # Tables ISA : 1 500 m → 84.56 kPa, ρ = 1.0581 kg/m³
    assert isa_pressure(1500) == pytest.approx(84_560, rel=1e-3)
    assert Environment(altitude=1500).density == pytest.approx(1.0581, rel=1e-3)


# --- Sans air : comparaison à la solution exacte -------------------------------------
@pytest.mark.parametrize("v, el, h", [(20, 45, 0), (15, 30, 2.0), (30, 70, 0.5)])
def test_vacuum_matches_analytic(v, el, h):
    tr = simulate(FOOT, Launch(v, el, height=h), ENV, drag=False, magnus=False)
    vx, vz = v * math.cos(math.radians(el)), v * math.sin(math.radians(el))
    t_land = (vz + math.sqrt(vz**2 + 2 * G * h)) / G
    assert tr.flight_time == pytest.approx(t_land, rel=1e-7)
    assert tr.carry == pytest.approx(vx * t_land, rel=1e-7)
    assert tr.apex == pytest.approx(h + vz**2 / (2 * G), rel=1e-7)
    _, pos = vacuum_trajectory(Launch(v, el, height=h))
    assert pos[0, -1] == pytest.approx(tr.carry, rel=1e-9)


def test_vacuum_optimal_angle_is_45():
    el, _ = optimal_elevation(FOOT, Launch(20, 30), ENV, drag=False, magnus=False)
    assert el == pytest.approx(45.0, abs=0.01)


# --- Traînée ------------------------------------------------------------------------
def test_drag_shortens_and_lowers_optimal_angle():
    vac = simulate(FOOT, Launch(25, 40), ENV, drag=False)
    air = simulate(FOOT, Launch(25, 40), ENV)
    assert air.carry < vac.carry
    el, _ = optimal_elevation(FOOT, Launch(25, 30), ENV)
    assert 30 < el < 45


def test_mechanical_energy_decreases_with_drag():
    tr = simulate(FOOT, Launch(30, 35), ENV, magnus=False)
    energy = 0.5 * tr.speed**2 + G * tr.z  # par unité de masse
    assert np.all(np.diff(energy) < 1e-9)


def test_energy_conserved_with_magnus_only():
    """La force de Magnus est perpendiculaire à la vitesse : elle ne travaille pas."""
    tr = simulate(FOOT, Launch(25, 20, spin_rpm=800, spin_tilt=45), ENV, drag=False)
    energy = 0.5 * tr.speed**2 + G * tr.z
    assert np.ptp(energy) < 1e-5 * energy[0]


def test_drag_crisis():
    re = np.array([1e4, 1e5, 1e6])
    cd = FOOT.drag.cd(re)
    assert cd[0] == pytest.approx(FOOT.drag.cd_sub, abs=0.01)
    assert cd[2] == pytest.approx(FOOT.drag.cd_super, abs=0.01)


# --- Effet Magnus --------------------------------------------------------------------
def test_backspin_lifts_golf_ball():
    spin = simulate(GOLF, Launch(70, 11, spin_rpm=2700), ENV)
    nospin = simulate(GOLF, Launch(70, 11), ENV)
    assert spin.apex > 2 * nospin.apex
    assert spin.carry > nospin.carry


def test_topspin_dips():
    top = simulate(BALLS["tennis"], Launch(30, 8, spin_rpm=3000, spin_tilt=180, height=1), ENV)
    flat = simulate(BALLS["tennis"], Launch(30, 8, height=1), ENV)
    assert top.carry < flat.carry


def test_sidespin_is_symmetric():
    left = simulate(FOOT, Launch(25, 15, spin_rpm=600, spin_tilt=90), ENV)
    right = simulate(FOOT, Launch(25, 15, spin_rpm=600, spin_tilt=-90), ENV)
    assert left.lateral > 1.0
    assert right.lateral == pytest.approx(-left.lateral, rel=1e-6)
    assert right.carry == pytest.approx(left.carry, rel=1e-6)


def test_spin_vector_perpendicular_to_velocity():
    for tilt in (0, 37, 90, 180, -120):
        L = Launch(20, 33, azimuth=12, spin_rpm=500, spin_tilt=tilt)
        assert abs(np.dot(L.spin_vector(), L.velocity())) < 1e-9
        assert np.linalg.norm(L.spin_vector()) == pytest.approx(500 * 2 * math.pi / 60)


def test_spin_decay_exponential():
    tr = simulate(FOOT, Launch(25, 30, spin_rpm=600), ENV)
    w0 = np.linalg.norm(tr.omega[:, 0])
    w1 = np.linalg.norm(tr.omega[:, -1])
    assert w1 == pytest.approx(w0 * math.exp(-tr.flight_time / FOOT.spin_decay_time), rel=1e-6)


# --- Vent et environnement ------------------------------------------------------------
def test_tailwind_and_crosswind():
    base = simulate(FOOT, Launch(25, 30), ENV)
    tail = simulate(FOOT, Launch(25, 30), Environment(temperature_c=15, wind=(5, 0, 0)))
    cross = simulate(FOOT, Launch(25, 30), Environment(temperature_c=15, wind=(0, -5, 0)))
    assert tail.carry > base.carry
    assert cross.lateral < -0.5


def test_altitude_increases_range():
    """Effet « Coors Field » (Denver, 1 609 m). Mesuré en MLB : ~+5 %. Le modèle donne ~+3 %
    car l'air moins dense réduit aussi la portance Magnus et décale Re vers la crise de traînée."""
    sea = simulate(BALLS["baseball"], Launch(44, 28, spin_rpm=2000, height=1), Environment())
    denver = simulate(BALLS["baseball"], Launch(44, 28, spin_rpm=2000, height=1), Environment(altitude=1609))
    assert 1.02 < denver.carry / sea.carry < 1.10


def test_golf_drive_is_realistic():
    """Profil moyen PGA Tour (TrackMan) : ~250 m de carry, apogée ~29 m."""
    tr = simulate(GOLF, Launch(74.6, 10.9, spin_rpm=2686), ENV)
    assert 225 < tr.carry < 265
    assert 22 < tr.apex < 36


# --- Problèmes inverses -----------------------------------------------------------------
def test_elevations_through_target_hit_it():
    L = Launch(8.0, 50, spin_rpm=120, height=2.1)
    roots = elevations_through(BASKET, L, ENV, 4.2, 3.05)
    assert len(roots) == 2
    for el in roots:
        tr = simulate(BASKET, L.with_(elevation=el), ENV)
        t = tr.time_at_x(4.2)
        assert t is not None
        assert tr.at(t)[2] == pytest.approx(3.05, abs=1e-4)


def test_min_speed_free_throw():
    v, el = min_speed_through(BASKET, Launch(7, 50, height=2.1), ENV, 4.2, 3.05)
    # sans air : v² = g·d² / (2 cos²θ (d tanθ - Δh)), minimum vers 51°
    assert 6.5 < v < 8.0
    assert 45 < el < 56
    below = elevations_through(BASKET, Launch(v - 0.05, el, height=2.1), ENV, 4.2, 3.05)
    assert below == []
