"""Tests des situations de jeu et de l'interface (rendu sans fenêtre)."""

import matplotlib
import pytest

matplotlib.use("Agg")

from balltraj import BALLS, Launch, simulate
from balltraj.scenarios import SCENARIOS

EXPECTED_DEFAULT = {
    "Coup franc": "BUT",
    "Lancer franc": "PANIER",
    "Drive golf": "Carry",
    "Home run": "HOME RUN",
}


@pytest.mark.parametrize("name, expected", EXPECTED_DEFAULT.items())
def test_default_shot_verdict(name, expected):
    sc = SCENARIOS[name]
    tr = simulate(BALLS[sc.ball], sc.launch)
    assert sc.verdict(tr).startswith(expected)


def test_free_kick_blocked_by_wall():
    sc = SCENARIOS["Coup franc"]
    tr = simulate(BALLS["football"], Launch(24, 6, 0, 0, 0, 0.11))
    assert sc.verdict(tr) == "Contré par le mur"


def test_free_throw_short():
    sc = SCENARIOS["Lancer franc"]
    tr = simulate(BALLS["basketball"], sc.launch.with_(speed=6.8))
    assert sc.verdict(tr).startswith(("Raté", "Trop court"))


def test_home_run_caught():
    sc = SCENARIOS["Home run"]
    tr = simulate(BALLS["baseball"], sc.launch.with_(speed=35))
    assert sc.verdict(tr).startswith("Dans le champ")


@pytest.mark.slow
def test_app_renders_every_scenario():
    from balltraj.app import App

    app = App("Libre")
    for i, name in enumerate(SCENARIOS):
        app.radio_scenario.set_active(i)
        assert app.scenario.name == name
    app.radio_scenario.set_active(list(SCENARIOS).index("Lancer franc"))
    app.on_target(None)
    assert app.verdict.get_text().startswith("Solutions")
    app.fig.canvas.draw()
