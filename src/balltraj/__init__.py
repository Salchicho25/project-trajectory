"""balltraj — simulation de trajectoires de balles de sport (traînée, Magnus, spin)."""

from .aero import DragModel, LiftModel
from .atmosphere import Environment
from .balls import BALLS, Ball
from .optimize import elevations_through, min_speed_through, optimal_elevation
from .simulate import Launch, Trajectory, simulate, vacuum_trajectory

__all__ = [
    "BALLS",
    "Ball",
    "DragModel",
    "Environment",
    "Launch",
    "LiftModel",
    "Trajectory",
    "elevations_through",
    "min_speed_through",
    "optimal_elevation",
    "simulate",
    "vacuum_trajectory",
]
