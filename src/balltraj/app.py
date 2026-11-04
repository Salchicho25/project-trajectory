"""Simulateur interactif de trajectoire de balle.

    trajectoire                                    # fenêtre interactive
    trajectoire --scenario "Coup franc"            # démarre sur une situation
    trajectoire --scenario "Drive golf" --save capture.png   # image sans fenêtre

(équivalent : python -m balltraj.app ...)
"""

from __future__ import annotations

import argparse
import math
from dataclasses import dataclass

import matplotlib
import numpy as np


@dataclass(frozen=True)
class SliderSpec:
    key: str
    label: str
    vmin: float
    vmax: float
    step: float
    col: int
    row: int


SLIDERS = [
    SliderSpec("speed", "Vitesse (m/s)", 0.5, 80, 0.1, 0, 0),
    SliderSpec("elevation", "Élévation (°)", -10, 85, 0.1, 0, 1),
    SliderSpec("azimuth", "Azimut (°, + gauche)", -30, 30, 0.1, 0, 2),
    SliderSpec("height", "Hauteur départ (m)", 0, 3, 0.01, 0, 3),
    SliderSpec("spin_rpm", "Spin (tr/min)", 0, 5000, 10, 1, 0),
    SliderSpec("spin_tilt", "Axe du spin (°)", -180, 180, 1, 1, 1),
    SliderSpec("wind_x", "Vent arrière (m/s)", -20, 20, 0.5, 1, 2),
    SliderSpec("wind_y", "Vent vers gauche (m/s)", -20, 20, 0.5, 1, 3),
    SliderSpec("altitude", "Altitude (m)", 0, 4000, 10, 2, 0),
    SliderSpec("temperature", "Température (°C)", -10, 40, 1, 2, 1),
]
COL_X = (0.12, 0.45, 0.78)
ROW_Y = (0.205, 0.15, 0.095, 0.04)
SUCCESS_WORDS = ("BUT", "PANIER", "HOME RUN")


class App:
    def __init__(self, scenario_name: str):
        import matplotlib.pyplot as plt
        from matplotlib.widgets import Button, CheckButtons, RadioButtons, Slider

        from balltraj import BALLS
        from balltraj.scenarios import SCENARIOS

        self.plt, self.BALLS, self.SCENARIOS = plt, BALLS, SCENARIOS
        self.ball_keys = list(BALLS)
        self.scenario = SCENARIOS[scenario_name]
        self.ball = BALLS[self.scenario.ball]
        self._mute = False
        self.status = ""

        plt.rcParams.update({"font.size": 9, "axes.titlesize": 10})
        self.fig = plt.figure(figsize=(15, 9))
        if self.fig.canvas.manager is not None:
            self.fig.canvas.manager.set_window_title("Trajectoire de balle — traînée & effet Magnus")

        self.ax_side = self.fig.add_axes((0.06, 0.58, 0.58, 0.37))
        self.ax_top = self.fig.add_axes((0.06, 0.32, 0.58, 0.19), sharex=self.ax_side)
        self.ax_speed = self.fig.add_axes((0.72, 0.32, 0.24, 0.14))
        self.ax_coef = self.ax_speed.twinx()

        # Sélecteurs
        ax_sc = self.fig.add_axes((0.69, 0.76, 0.14, 0.19))
        ax_sc.set_title("Situation", fontsize=9, loc="left")
        self.radio_scenario = RadioButtons(
            ax_sc, list(SCENARIOS), active=list(SCENARIOS).index(scenario_name)
        )
        self.radio_scenario.on_clicked(self.on_scenario)

        ax_ball = self.fig.add_axes((0.84, 0.76, 0.14, 0.19))
        ax_ball.set_title("Balle", fontsize=9, loc="left")
        self.radio_ball = RadioButtons(
            ax_ball, [BALLS[k].name for k in self.ball_keys], active=self.ball_keys.index(self.ball.key)
        )
        self.radio_ball.on_clicked(self.on_ball)

        self.btn_opt = Button(self.fig.add_axes((0.69, 0.705, 0.14, 0.04)), "Angle de portée max")
        self.btn_opt.on_clicked(self.on_optimal)
        self.btn_target = Button(self.fig.add_axes((0.84, 0.705, 0.14, 0.04)), "Viser la cible")
        self.btn_target.on_clicked(self.on_target)

        self.info = self.fig.text(0.69, 0.69, "", va="top", ha="left", family="monospace", fontsize=8.2)
        self.verdict = self.fig.text(0.69, 0.49, "", va="top", ha="left", fontsize=11, weight="bold")

        # Curseurs
        self.sliders: dict[str, Slider] = {}
        for s in SLIDERS:
            ax = self.fig.add_axes((COL_X[s.col], ROW_Y[s.row], 0.15, 0.03))
            sl = Slider(ax, s.label, s.vmin, s.vmax, valinit=s.vmin, valstep=s.step)
            if hasattr(sl, "vline"):
                sl.vline.set_visible(False)  # repère de valeur initiale, inutile ici
            sl.on_changed(self.on_slider)
            self.sliders[s.key] = sl

        self.checks = CheckButtons(
            self.fig.add_axes((0.70, 0.03, 0.26, 0.085)),
            ["Comparer : sans air (parabole)", "Comparer : sans spin"],
            [True, True],
        )
        self.checks.on_clicked(lambda _label: self.update())

        self.load_scenario(self.scenario)

    # --- état courant -------------------------------------------------------
    def value(self, key: str) -> float:
        return float(self.sliders[key].val)

    def current_launch(self):
        from balltraj import Launch

        return Launch(
            self.value("speed"),
            self.value("elevation"),
            self.value("azimuth"),
            self.value("spin_rpm"),
            self.value("spin_tilt"),
            self.value("height"),
        )

    def current_env(self):
        from balltraj import Environment

        return Environment(
            altitude=self.value("altitude"),
            temperature_c=self.value("temperature"),
            wind=(self.value("wind_x"), self.value("wind_y"), 0.0),
        )

    def set_values(self, **values):
        self._mute = True
        try:
            for k, v in values.items():
                self.sliders[k].set_val(v)
        finally:
            self._mute = False
        self.update()

    # --- callbacks ----------------------------------------------------------
    def load_scenario(self, sc):
        self.scenario = sc
        self.ball = self.BALLS[sc.ball]
        self._mute = True
        self.radio_ball.set_active(self.ball_keys.index(sc.ball))
        self._mute = False
        L = sc.launch
        self.status = ""
        self.set_values(
            speed=L.speed,
            elevation=L.elevation,
            azimuth=L.azimuth,
            height=L.height,
            spin_rpm=L.spin_rpm,
            spin_tilt=L.spin_tilt,
            wind_x=0,
            wind_y=0,
            altitude=0,
            temperature=15,
        )

    def on_scenario(self, label):
        self.load_scenario(self.SCENARIOS[label])

    def on_ball(self, label):
        self.ball = next(b for b in self.BALLS.values() if b.name == label)
        if not self._mute:
            self.status = ""
            self.update()

    def on_slider(self, _val):
        if not self._mute:
            self.status = ""
            self.update()

    def _busy(self, msg):
        self.verdict.set_text(msg)
        self.verdict.set_color("#555")
        self.fig.canvas.draw_idle()
        self.fig.canvas.flush_events()

    def on_optimal(self, _event):
        from balltraj import optimal_elevation

        self._busy("Calcul de l'angle optimal…")
        el, tr = optimal_elevation(self.ball, self.current_launch(), self.current_env())
        self.set_values(elevation=round(el, 1))
        self.status = f"Angle de portée max : {el:.1f}° → {tr.distance:.1f} m"
        self.update()

    def on_target(self, _event):
        from balltraj import elevations_through

        tg = self.scenario.target
        if tg is None:
            self.status = "Pas de cible dans cette situation"
            self.update()
            return
        self._busy("Recherche de l'angle…")
        roots = elevations_through(
            self.ball, self.current_launch(), self.current_env(), tg.x, tg.z, descending=tg.descending
        )
        if not roots:
            self.status = "Cible hors de portée : augmente la vitesse"
            self.update()
            return
        current = self.value("elevation")
        best = min(roots, key=lambda r: abs(r - current))
        others = ", ".join(f"{r:.1f}°" for r in roots)
        self.set_values(elevation=round(best, 1))
        self.status = f"Solutions : {others}"
        self.update()

    # --- rendu ----------------------------------------------------------------
    def update(self):
        from balltraj import simulate, vacuum_trajectory

        ball, launch, env = self.ball, self.current_launch(), self.current_env()
        tr = simulate(ball, launch, env, rtol=1e-7)
        show_vac, show_nospin = self.checks.get_status()
        _, vac = vacuum_trajectory(launch, env.gravity)
        nospin = simulate(ball, launch.with_(spin_rpm=0), env, rtol=1e-7) if launch.spin_rpm > 0 else None

        side, top = self.ax_side, self.ax_top
        side.cla()
        top.cla()
        top.tick_params(labelbottom=True)

        xs, zs, ys = [tr.x], [tr.z], [tr.y]
        if show_vac and vac.shape[1] > 1:
            side.plot(vac[0], vac[2], "--", color="#999", lw=1, label="sans air")
            top.plot(vac[0], vac[1], "--", color="#999", lw=1)
            xs.append(vac[0])
            zs.append(vac[2])
            ys.append(vac[1])
        if show_nospin and nospin is not None:
            side.plot(nospin.x, nospin.z, ":", color="#555", lw=1.2, label="sans spin")
            top.plot(nospin.x, nospin.y, ":", color="#555", lw=1.2)
            xs.append(nospin.x)
            zs.append(nospin.z)
            ys.append(nospin.y)

        side.plot(tr.x, tr.z, color=ball.color, lw=2.2, label=ball.name)
        top.plot(tr.x, tr.y, color=ball.color, lw=2.2)
        # positions de la balle à intervalles de temps réguliers : l'espacement montre le freinage
        if tr.flight_time > 0:
            ts = np.linspace(0, tr.flight_time, 21)
            pts = np.array([tr.at(t) for t in ts]).T
            side.plot(pts[0], pts[2], "o", ms=3.5, color=ball.color, alpha=0.6)
            top.plot(pts[0], pts[1], "o", ms=3.5, color=ball.color, alpha=0.6)
            ta = tr.apex_time
            side.plot(*tr.at(ta)[[0, 2]], "^", color=ball.color, ms=7)

        self.scenario.draw(side, top)

        vx, vz, vy = self.scenario.view
        x_all, z_all, y_all = np.concatenate(xs), np.concatenate(zs), np.concatenate(ys)
        x_max = max(vx, float(x_all.max()) * 1.05)
        x_min = min(-0.02 * x_max, float(x_all.min()))
        z_max = max(vz, float(z_all.max()) * 1.15)
        y_half = max(vy, float(np.abs(y_all).max()) * 1.3)
        side.set_xlim(x_min, x_max)
        side.set_ylim(-0.03 * z_max, z_max)
        top.set_ylim(-y_half, y_half)
        for ax in (side, top):
            ax.axhline(0, color="#7a9a5a" if ax is side else "#bbb", lw=1.5 if ax is side else 0.8)
            ax.grid(alpha=0.25)
        side.axhspan(-0.03 * z_max, 0, color="#7a9a5a", alpha=0.25)
        side.set_title(f"Vue de côté — {self.scenario.name}", loc="left")
        side.set_ylabel("hauteur z (m)")
        side.legend(loc="upper right", fontsize=8, framealpha=0.8)
        top.set_title("Vue de dessus", loc="left")
        top.set_ylabel("y (m)  ↑ gauche")
        top.set_xlabel("distance x (m)")

        self.draw_speed(tr)
        self.draw_info(tr, vac, env)
        self.fig.canvas.draw_idle()

    def draw_speed(self, tr):
        a = tr.aero()
        ax, ax2 = self.ax_speed, self.ax_coef
        ax.cla()
        ax2.cla()
        ax.plot(tr.t, a["v_rel"], color="#333", lw=1.5, label="vitesse / air")
        ax.set_xlabel("temps (s)")
        ax.set_ylabel("m/s")
        ax.set_ylim(bottom=0)
        ax.grid(alpha=0.25)
        ax2.plot(tr.t, a["cd"], color="#c0392b", lw=1.2, label="Cd")
        ax2.plot(tr.t, a["cl"], color="#2980b9", lw=1.2, label="CL")
        ax2.set_ylim(0, max(0.6, float(np.max(a["cd"])) * 1.1))
        ax2.yaxis.tick_right()  # cla() remet l'axe jumeau à gauche
        ax2.yaxis.set_label_position("right")
        ax2.set_ylabel("Cd, CL")
        h1, l1 = ax.get_legend_handles_labels()
        h2, l2 = ax2.get_legend_handles_labels()
        ax.legend(h1 + h2, l1 + l2, fontsize=7, loc="lower left", ncol=3, framealpha=0.8)

    def draw_info(self, tr, vac, env):
        a = tr.aero()
        k = 0.5 * env.density * tr.ball.area / tr.ball.mass
        v0 = a["v_rel"][0]
        drag_g = k * a["cd"][0] * v0**2 / env.gravity
        lift_g = k * a["cl"][0] * v0**2 / env.gravity
        vac_range = float(math.hypot(vac[0, -1], vac[1, -1])) if vac.shape[1] > 1 else 0.0
        change = 100 * (tr.impact_speed / tr.launch.speed - 1) if tr.launch.speed else 0.0
        lines = [
            tr.ball.describe(),
            f"Air : {env.describe()}",
            "─" * 46,
            f"Distance       : {tr.distance:7.2f} m   (sans air {vac_range:.1f} m)",
            f"Écart latéral  : {tr.lateral:+7.2f} m",
            f"Apogée         : {tr.apex:7.2f} m",
            f"Temps de vol   : {tr.flight_time:7.2f} s",
            f"Vitesse impact : {tr.impact_speed:7.1f} m/s ({change:+.0f} %)",
            f"Angle impact   : {tr.impact_angle:7.1f} °",
            f"Départ : Re {a['re'][0]:.2e}  Cd {a['cd'][0]:.3f}",
            f"         S  {a['spin_param'][0]:.3f}    CL {a['cl'][0]:.3f}",
            f"Forces départ : traînée {drag_g:.2f} g, Magnus {lift_g:.2f} g",
        ]
        self.info.set_text("\n".join(lines))
        text = self.status or self.scenario.verdict(tr)
        self.verdict.set_text(text)
        if self.status:
            color = "#555"
        elif any(w in text for w in SUCCESS_WORDS):
            color = "#1e8449"
        elif self.scenario.target is not None:
            color = "#c0392b"
        else:
            color = "#222"
        self.verdict.set_color(color)


def main():
    from balltraj.scenarios import SCENARIOS

    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--scenario", default="Coup franc", choices=list(SCENARIOS))
    p.add_argument("--save", metavar="FICHIER.png", help="enregistre une image au lieu d'ouvrir la fenêtre")
    args = p.parse_args()

    if args.save:
        matplotlib.use("Agg")
    app = App(args.scenario)
    if args.save:
        app.fig.savefig(args.save, dpi=110)
        print(f"Image enregistrée : {args.save}")
    else:
        app.plt.show()


if __name__ == "__main__":
    main()
