# Journal de bord

Une entrée par séance ou par résultat marquant : ce que j'ai essayé, ce qui a marché, les chiffres.
Le plus récent en haut.

---

## 2026-11-04 — Rebonds, vue 3D immersive, export Fusion
- **Rebonds** (`impact.py`) : sphère rigide, restitution + frottement de Coulomb + transfert de rotation, par balle et par sol. Tennis calé sur la norme ITF (rebond 1,41 m pour 2,54 m). Golf : drive de 70 m/s → carry 222 m, roulé 70,7 m, total 317 m sur gazon.
- Tests de mon propre modèle : deux tests faux au départ (cas qui n'accrochait pas, cas où le frottement saturait). C'était les tests, pas la physique.
- **Vue 3D** (three.js r160 embarqué) : lecture en temps réel, balle qui tourne avec la vraie rotation, tube violet, balles fantômes, anneaux de contact, 4 caméras.
- Pièges 3D rencontrés : directive `#include` d'un shader écrite sur la même ligne qu'une instruction (ciel noir) ; texture de la balle libérée puis réutilisée (balle invisible) ; instants de contact arrondis par l'API donnant des points NaN dans le tracé.
- **Export Fusion** : dossier zippé (script + manifest), Z haut ou Y haut, paramétrique ou direct. Testé contre une fausse API, pas dans Fusion.
- 96 tests, couverture 95 %.

## 2026-11-04 — Interface web « Centre Court »
- Nouvelle interface web locale (`trajectoire-web`) : serveur stdlib sur 127.0.0.1, API JSON, page HTML/CSS/JS sans build.
- Direction visuelle épinglée par l'utilisateur : esprit Wimbledon (vert profond, violet, blanc, or, serif). Remplace une première version « papier millimétré » écartée avant livraison.
- Le relevé est à l'échelle, balles jaunes à intervalles de temps réguliers, forces à l'apogée, échelle verticale écrite quand elle diffère de l'horizontale.
- Nouveau `Trajectory.accelerations()` : les forces affichées viennent de Python, vérifiées contre les équations du mouvement (différences finies).
- Bug trouvé en mobile : la page se calait sur la largeur des onglets (521 px dans un cadre de 375 px). Corrigé par `grid-template-columns: minmax(0, 1fr)` sur le body.
- Piège de test : le panneau d'aperçu ne sait pas émuler 375 px ; on charge la page dans un iframe de 375 px pour mesurer le vrai débordement.
- 51 tests, couverture 95 %.

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
