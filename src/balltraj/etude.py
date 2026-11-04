"""Étude paramétrique : génère 4 graphiques (par défaut dans docs/figures/).

    trajectoire-etude                  # ou : python -m balltraj.etude
    trajectoire-etude --out outputs    # autre dossier de sortie

1. Angle de portée maximale en fonction de la vitesse (pourquoi pas 45° ?)
2. Carte carry = f(angle, spin) d'un drive de golf : le réglage optimal du driver
3. Lancer franc : vitesse nécessaire selon l'angle, et tolérance à l'erreur
4. Effet de l'altitude sur un drive et un home run
"""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib
import matplotlib.pyplot as plt
import numpy as np

from balltraj import BALLS, Environment, Launch, optimal_elevation, simulate

ENV = Environment(temperature_c=15)


def fig_optimal_angle():
    fig, ax = plt.subplots(figsize=(7, 4.5))
    speeds = np.linspace(5, 60, 12)
    for key in ("football", "basketball", "tennis", "volleyball", "baseball"):
        ball = BALLS[key]
        angles = [optimal_elevation(ball, Launch(v, 40), ENV, bounds=(10, 60))[0] for v in speeds]
        ax.plot(speeds, angles, "o-", ms=3, color=ball.color, label=ball.name)
    ax.axhline(45, color="#999", ls="--", lw=1, label="sans air (45°)")
    ax.set(
        xlabel="vitesse de frappe (m/s)",
        ylabel="angle de portée max (°)",
        title="La traînée fait baisser l'angle optimal (sans spin, depuis le sol)",
    )
    ax.grid(alpha=0.3)
    ax.legend(fontsize=8)
    return fig


def fig_golf_map():
    golf = BALLS["golf"]
    angles = np.linspace(6, 30, 25)
    spins = np.linspace(800, 4500, 25)
    carry = np.array([[simulate(golf, Launch(70, a, spin_rpm=s), ENV).carry for a in angles] for s in spins])
    j, i = np.unravel_index(np.argmax(carry), carry.shape)
    fig, ax = plt.subplots(figsize=(7, 4.5))
    cs = ax.contourf(angles, spins, carry, levels=20, cmap="viridis")
    ax.contour(angles, spins, carry, levels=10, colors="w", linewidths=0.4, alpha=0.6)
    ax.plot(angles[i], spins[j], "r*", ms=14)
    ax.annotate(
        f"optimum : {angles[i]:.0f}°, {spins[j]:.0f} tr/min → {carry[j, i]:.0f} m",
        (angles[i], spins[j]),
        xytext=(-10, -16),
        textcoords="offset points",
        color="k",
        fontsize=9,
        ha="right",
    )
    fig.colorbar(cs, label="carry (m)")
    ax.set(
        xlabel="angle de lancement (°)",
        ylabel="spin (tr/min)",
        title="Drive de golf à 70 m/s : carry selon angle et spin",
    )
    return fig


def _speed_to_reach(ball, el, x_target, z_hoop=3.05, lo=5.0, hi=12.0):
    """Vitesse (dichotomie) pour que la balle redescende à z_hoop exactement en x_target."""
    for _ in range(45):
        mid = 0.5 * (lo + hi)
        tr = simulate(ball, Launch(mid, el, spin_rpm=120, height=2.1), ENV)
        t = tr.time_descending_through(z_hoop)
        if t is None or tr.at(t)[0] < x_target:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def fig_free_throw():
    bb = BALLS["basketball"]
    hoop_x, window = 4.2, 0.225 - bb.radius  # le centre de la balle doit passer à ±10.6 cm
    angles = np.linspace(40, 70, 31)
    speeds, margins = [], []
    for el in angles:
        speeds.append(_speed_to_reach(bb, el, hoop_x))
        # tolérance : plage de vitesses qui fait passer la balle dans le cercle
        margins.append(_speed_to_reach(bb, el, hoop_x + window) - _speed_to_reach(bb, el, hoop_x - window))
    fig, ax = plt.subplots(figsize=(7, 4.5))
    ax.plot(angles, speeds, color="#e07b39", lw=2)
    ax.set(
        xlabel="angle de lâcher (°)",
        ylabel="vitesse nécessaire (m/s)",
        title="Lancer franc (lâcher à 2,10 m, cercle à 4,20 m)",
    )
    ax2 = ax.twinx()
    ax2.plot(angles, np.array(margins) * 100, color="#2980b9", lw=1.5, ls="--")
    ax2.set_ylabel("tolérance en vitesse (cm/s) - - -", color="#2980b9")
    i = int(np.argmin(speeds))
    ax.axvline(angles[i], color="#999", lw=0.8)
    ax.annotate(
        f"effort min. à {angles[i]:.0f}°",
        (angles[i], speeds[i]),
        xytext=(6, 10),
        textcoords="offset points",
        fontsize=9,
    )
    ax.grid(alpha=0.3)
    return fig


def fig_altitude():
    alts = np.linspace(0, 3000, 13)
    fig, ax = plt.subplots(figsize=(7, 4.5))
    cases = [("golf", Launch(70, 11, spin_rpm=2700)), ("baseball", Launch(44, 28, spin_rpm=2000, height=1))]
    for key, L in cases:
        ball = BALLS[key]
        d = np.array([simulate(ball, L, Environment(altitude=a)).carry for a in alts])
        label = f"{ball.name} ({d[0]:.0f} m au niveau mer)"
        ax.plot(alts, 100 * (d / d[0] - 1), "o-", ms=3, color=ball.color, label=label)
    for name, alt in (("Denver", 1609), ("Mexico", 2240)):
        ax.axvline(alt, color="#999", lw=0.8, ls=":")
        ax.text(alt, ax.get_ylim()[1] * 0.95 if ax.get_ylim()[1] > 0 else 1, f" {name}", fontsize=8, va="top")
    ax.set(
        xlabel="altitude (m), atmosphère ISA",
        ylabel="gain de distance (%)",
        title="Effet de l'altitude sur la portée",
    )
    ax.grid(alpha=0.3)
    ax.legend(fontsize=8)
    return fig


def main():
    p = argparse.ArgumentParser(description="Génère les graphiques d'étude.")
    p.add_argument("--out", type=Path, default=Path("docs/figures"), help="dossier de sortie")
    out = p.parse_args().out
    matplotlib.use("Agg")
    out.mkdir(parents=True, exist_ok=True)
    for name, make in [
        ("1_angle_optimal", fig_optimal_angle),
        ("2_golf_angle_spin", fig_golf_map),
        ("3_lancer_franc", fig_free_throw),
        ("4_altitude", fig_altitude),
    ]:
        fig = make()
        fig.tight_layout()
        path = out / f"{name}.png"
        fig.savefig(path, dpi=120)
        plt.close(fig)
        print(f"  {path}")


if __name__ == "__main__":
    main()
