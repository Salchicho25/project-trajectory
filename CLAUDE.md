# CLAUDE.md — contexte du projet pour les sessions de travail

## Le projet
`balltraj` : simulateur 3D de trajectoires de balles de sport (traînée avec crise de traînée,
effet Magnus, décroissance du spin, vent, atmosphère ISA), avec une interface matplotlib interactive
et des outils d'optimisation inverse. Projet personnel d'ingénierie mené sur plusieurs mois.
Feuille de route : `ROADMAP.md`. Historique des résultats : `docs/journal.md`.

## Commandes (depuis la racine, venv activé : `.venv\Scripts\activate`)
```
pip install -e ".[dev]"     # installation (une fois)
pytest                      # tests rapides (~5 s) ; tous : pytest -m ""
pytest -m "" --cov          # tous les tests + couverture (ce que fait la CI)
ruff check . && ruff format . && mypy   # qualité, doit être propre avant chaque commit
trajectoire-web             # interface web locale (http://127.0.0.1:8765) ; --port N, --no-browser
trajectoire                 # ancienne interface matplotlib ; --scenario "Coup franc" --save x.png
trajectoire-etude           # régénère docs/figures/
```
Sous Windows, préfixer les scripts Python qui affichent des accents par `PYTHONIOENCODING=utf-8`.

## Structure
```
src/balltraj/
  atmosphere.py   Environment : ρ, ν (ISA + Sutherland), vent, gravité
  aero.py         DragModel Cd(Re, S), LiftModel CL(S)
  balls.py        Ball + catalogue BALLS (masses/diamètres réglementaires)
  simulate.py     Launch, Trajectory, simulate() (solve_ivp DOP853 + événements), vacuum_trajectory()
  optimize.py     optimal_elevation, elevations_through, min_speed_through
  impact.py       Surface, Impact, bounce() : restitution, frottement de Coulomb, transfert de rotation
  scenarios.py    situations de jeu : géométrie, tir par défaut, verdict
  app.py          interface matplotlib (curseurs, boutons) — commande `trajectoire`
  web/api.py      API JSON en fonctions pures (meta, run_simulation, run_optimal, run_target)
  web/geometry.py décor des situations en données pour le navigateur (cotes lues dans scenarios.py)
  web/server.py   serveur stdlib sur 127.0.0.1 + fichiers statiques + téléchargements — commande `trajectoire-web`
  web/export.py   export CSV et dossier zippé Autodesk Fusion (script .py + .manifest)
  web/static/     index.html, style.css, app.js (logique), plot.js (relevé 2D), scene3d.js (vue 3D three.js),
                  env3d.js (décors par situation, tribunes, arbres, nuages),
                  fonts/, vendor/ (three.js r160 + OrbitControls, MIT, embarqués pour fonctionner hors ligne)
  etude.py        graphiques d'étude — commande `trajectoire-etude`
tests/            test_physics.py (validation physique), test_scenarios.py (situations + UI matplotlib),
                  test_web.py (API + vrai serveur HTTP), test_bounce.py (rebonds), test_export.py (Fusion + CSV)
docs/figures/     figures versionnées utilisées par le README
data/             (à venir, phase 2) raw/ hors git, processed/ versionné si léger
```

## Conventions
- Unités SI partout (m, s, kg, rad/s) ; seules les entrées utilisateur sont en ° et tr/min.
- Repère direct : x vers l'avant, y vers la gauche, z vers le haut, origine au sol sous la frappe.
- Axe du spin (`spin_tilt`) : 0° rétro, 180° lift, +90° effet vers la gauche.
- Identifiants en anglais ; docstrings, commentaires et interface en français.
- Le second membre de l'EDO (`_make_rhs`) est écrit en flottants purs pour la vitesse : ne pas le vectoriser avec numpy.
- Toute nouvelle physique arrive avec un test qui la valide contre une solution analytique,
  une conservation, une symétrie ou une donnée publiée (citer la source dans le test).
- Interface web : la physique ne se réécrit JAMAIS en JavaScript, l'API renvoie tout (forces comprises via `Trajectory.accelerations`).
- Rebonds : `simulate(..., bounces=N, surface="gazon", roll=True)`. `bounces=0` garde l'ancien comportement (arrêt au premier contact). `carry` = premier contact, `distance` = arrêt final.
- Vue 3D : repère three.js = (x, z, −y) par rapport au simulateur (rotation propre, les vecteurs rotation se convertissent pareil). Les tronçons du tracé sont coupés à chaque contact.
- Export Fusion : script généré testé contre une FAUSSE API (`tests/test_export.py`). Non testé dans Fusion lui-même : si une erreur apparaît dans Fusion, la corriger dans `web/export.py` et ajouter le cas au faux Fusion.
- Direction visuelle « Centre Court » épinglée par l'utilisateur (Wimbledon : vert, violet, blanc, or, serif Libre Caslon + Barlow Semi Condensed). Contrat de design dans `.impeccable/surfaces/`, produit dans `PRODUCT.md`. Ni logo ni nom de marque.
- Une fonctionnalité = une branche `feat/...` → PR → CI verte → merge sur `main`.
- Après un résultat marquant, ajouter une entrée datée dans `docs/journal.md` et cocher `ROADMAP.md`.

## État actuel et limites connues
- Calibration : drive type PGA Tour → 239 m de carry (mesuré ~251 m).
- Optimum golf trop haut (24° / 1 600 tr/min) car CL(S) linéaire aux faibles spins → J1.2.
- Effet d'altitude sous-estimé (+3 % au lieu de ~+5 % à Denver).
- Rebonds : restitution constante, pas de déformation, pas de rotation autour de la normale. Pas d'humidité, balles sphériques uniquement.
- Sans fenêtre (Agg), chaque `Slider.set_val` redessine toute la figure : le test UI est marqué `slow`.
