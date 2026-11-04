# Feuille de route

Fil conducteur : passer d'un simulateur théorique à un modèle **validé par mes propres mesures**,
puis l'exploiter (optimisation, IA) et le valoriser (application, rapport).

Règles : chaque jalon dure 1 à 2 semaines et produit un résultat visible (graphique, démo, chiffre).
Chaque ajout physique est validé par un test contre une donnée publiée ou une mesure.
Les tâches détaillées vivent dans les issues GitHub, une par tâche, rattachées à un jalon.

---

## Phase 0 — Fondations ✅ (novembre 2026)
- [x] Paquet installable (`pyproject.toml`, structure `src/`), commandes `trajectoire` et `trajectoire-etude`
- [x] Qualité : ruff (lint + format), mypy, pytest + couverture (≥ 90 %)
- [x] CI GitHub Actions (Python 3.11 et 3.13)
- [x] ROADMAP, CLAUDE.md, journal de bord
- [x] Dépôt GitHub créé et premier push (github.com/Salchicho25/project-trajectory)
- [ ] Jalons et premières issues créés sur GitHub

## Phase 1 — Physique plus fidèle (mois 1–2)
**J1.1 Rebonds**
- [ ] Modèle d'impact : restitution normale, frottement, transfert de spin (modèle de Cross)
- [ ] Trajectoire multi-rebonds, distance totale (carry + roulé) au golf
- [ ] Test : hauteur de rebond d'une balle de tennis lâchée de 2,54 m (norme ITF : 1,35–1,47 m)

**J1.2 Coefficients issus de mesures**
- [ ] Tables Cd(Re, S) et CL(S, Re) tirées de la littérature (soufflerie), interpolées
- [ ] Interface commune « modèle aéro » : formule analytique ou table, interchangeables
- [ ] Objectif : optimum du drive vers 15–17° / 2 000–2 200 tr/min (aujourd'hui 24° / 1 600)

**J1.3 Atmosphère complète**
- [ ] Humidité (air humide moins dense)
- [ ] Profil de vent avec la hauteur (couche limite atmosphérique) et rafales

**J1.4 Knuckleball**
- [ ] Force latérale fonction de l'orientation des coutures, ballon sans rotation
- [ ] Reproduire les trajectoires « flottantes » du volley et du foot

**J1.5 Ballon ovale (gros chantier)**
- [ ] Corps rigide 6 degrés de liberté : quaternions, tenseur d'inertie, moments aérodynamiques
- [ ] Spirale du rugby / football américain, précession gyroscopique
- [ ] Tests : conservation du moment cinétique sans air, précession analytique

**J1.6 Incertitudes**
- [ ] Monte-Carlo sur les conditions de frappe → nuage de points d'impact
- [ ] Probabilité de marquer au lieu d'un verdict oui/non

## Phase 2 — Mesures réelles (mois 2–4), cœur du projet
**J2.1 Acquisition vidéo**
- [ ] Protocole de tournage (cadence, éclairage, repères au sol), stockage dans `data/raw/` (hors git)
- [ ] Calibration de la caméra au damier (OpenCV) : distorsion + passage pixels → mètres

**J2.2 Suivi de la balle**
- [ ] Détection (couleur, soustraction de fond), puis filtre de Kalman
- [ ] Export des trajectoires mesurées (CSV horodaté) dans `data/processed/`

**J2.3 Stéréo 3D**
- [ ] Deux téléphones synchronisés (clap sonore), triangulation
- [ ] Erreur de reconstruction mesurée sur un objet de dimensions connues

**J2.4 Identification de paramètres**
- [ ] Ajuster Cd, CL (et vitesse/spin initiaux) par moindres carrés sur les trajectoires filmées
- [ ] Intervalles de confiance, analyse des résidus, comparaison avec la littérature
- [ ] Livrable : « mon modèle de mon ballon », avec ses barres d'erreur

## Phase 3 — Optimisation et IA (mois 4–5)
- [ ] Optimisation robuste : coup franc qui maximise la probabilité de but compte tenu de MA dispersion mesurée
- [ ] Modèle de substitution (réseau de neurones entraîné sur des simulations), ×1 000 en vitesse
- [ ] Apprentissage par renforcement : agent qui apprend à tirer des coups francs
- [ ] Gardien de but simple (temps de réaction, plongeon) dans la situation de coup franc

## Phase 4 — Produit et valorisation (mois 5–6+)
- [x] Interface web locale « Centre Court » (`trajectoire-web`), API JSON testée (novembre 2026)
- [ ] Vue 3D (three.js) et lien partageable en ligne (demande de porter la physique côté serveur hébergé)
- [ ] Site de documentation (mkdocs) avec la théorie et les résultats
- [ ] Rapport technique type article : modèle, validation, comparaison aux mesures
- [ ] Vidéo de démo (tir filmé et simulation superposés)
