# Journal de bord

Une entrée par séance ou par résultat marquant : ce que j'ai essayé, ce qui a marché, les chiffres.
Le plus récent en haut.

---

## 2026-11-04 — Phase 0 : fondations
- Projet réorganisé en paquet installable (`src/balltraj`), commandes `trajectoire` et `trajectoire-etude`.
- Qualité outillée : ruff, mypy, pytest-cov, CI GitHub Actions (Python 3.11 et 3.13).
- 28 tests, couverture 97 %. Ajout de tests sur les situations de jeu et sur l'interface sans fenêtre.
- Constat : sans fenêtre, matplotlib redessine la figure à chaque curseur modifié (25 s pour le test UI).
  Le test est marqué `slow`. Ce n'est pas gênant dans la vraie fenêtre, où les redessins sont regroupés.

## 2026-11-04 — Version initiale du simulateur
- Moteur 3D : gravité, traînée Cd(Re, S) avec crise de traînée, Magnus CL(S), spin ω(t) = ω0·e^(−t/τ),
  vent, atmosphère ISA. Intégration DOP853, environ 3 ms par trajectoire.
- Validation : parabole exacte sans air (écart < 1e-7), énergie conservée avec Magnus seul,
  symétrie gauche/droite.
- Calibration golf : drive PGA (74,6 m/s, 10,9°, 2 686 tr/min) → 239 m de carry (mesuré ~251 m).
- Étude :
  - angle optimal < 45° dès 10 m/s ;
  - lancer franc à effort minimal vers 50° ;
  - +3 à 5 % de portée à Denver.
- Limites :
  - optimum golf à 24° / 1 600 tr/min, trop haut (CL linéaire aux faibles spins) ;
  - effet d'altitude sous-estimé.
