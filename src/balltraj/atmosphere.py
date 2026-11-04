"""Atmosphère standard (ISA) : densité et viscosité de l'air selon l'altitude."""

from __future__ import annotations

from dataclasses import dataclass

R_AIR = 287.05  # constante spécifique de l'air sec, J/(kg·K)
G0 = 9.80665  # gravité standard, m/s²
T0 = 288.15  # température au niveau de la mer, K
P0 = 101_325.0  # pression au niveau de la mer, Pa
LAPSE = 0.0065  # gradient thermique de la troposphère, K/m

# Loi de Sutherland pour la viscosité dynamique de l'air
MU_REF = 1.716e-5  # Pa·s à 273.15 K
T_REF = 273.15
SUTHERLAND = 110.4


def isa_temperature(altitude: float) -> float:
    """Température ISA (K) à l'altitude donnée (m)."""
    return T0 - LAPSE * altitude


def isa_pressure(altitude: float) -> float:
    """Pression ISA (Pa) à l'altitude donnée (m), troposphère."""
    return P0 * (1.0 - LAPSE * altitude / T0) ** (G0 / (R_AIR * LAPSE))


def dynamic_viscosity(temperature_k: float) -> float:
    """Viscosité dynamique de l'air (Pa·s), loi de Sutherland."""
    return MU_REF * (temperature_k / T_REF) ** 1.5 * (T_REF + SUTHERLAND) / (temperature_k + SUTHERLAND)


@dataclass(frozen=True)
class Environment:
    """Conditions extérieures du tir.

    altitude      : m au-dessus du niveau de la mer (fixe la pression)
    temperature_c : °C ; None = température ISA à cette altitude
    wind          : vitesse du vent (m/s) dans le repère (x avant, y gauche, z haut)
    gravity       : m/s²
    """

    altitude: float = 0.0
    temperature_c: float | None = None
    wind: tuple[float, float, float] = (0.0, 0.0, 0.0)
    gravity: float = G0

    @property
    def temperature_k(self) -> float:
        if self.temperature_c is None:
            return isa_temperature(self.altitude)
        return self.temperature_c + 273.15

    @property
    def pressure(self) -> float:
        return isa_pressure(self.altitude)

    @property
    def density(self) -> float:
        """Masse volumique de l'air ρ (kg/m³), gaz parfait."""
        return self.pressure / (R_AIR * self.temperature_k)

    @property
    def kinematic_viscosity(self) -> float:
        """Viscosité cinématique ν = μ/ρ (m²/s)."""
        return dynamic_viscosity(self.temperature_k) / self.density

    def describe(self) -> str:
        return (
            f"ρ = {self.density:.3f} kg/m³, ν = {self.kinematic_viscosity:.2e} m²/s, "
            f"T = {self.temperature_k - 273.15:.0f} °C"
        )


SEA_LEVEL = Environment()
