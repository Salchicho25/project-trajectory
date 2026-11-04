# Journal de bord

Une entrée par séance ou par résultat marquant : ce que j'ai essayé, ce qui a marché, les chiffres.
Le plus récent en haut.

---

## 2026-11-04 — Court de basket réaliste
- Terrain aux cotes du règlement (28 × 15 m, 3 points à 6,75 m, raquette 5,8 × 4,9 m) peint en une texture de 2048 px, sur un matériau verni (clearcoat).
- Panier complet : panneau de verre, carré de tir, cercle doré, filet en mailles losange, mât rembourré. La caméra « Arrivée » est décalée de 2,4 m pour ne pas être masquée par le mât.
- Salle intérieure : lumières, tableau suspendu, bannières, tribunes ; `RoomEnvironment` ajouté à `vendor/`. Grain de cuir (bump) sur toutes les balles.
- Vérifié : 5 situations sans erreur JS, qualité Standard OK, ruff/mypy/pytest verts.

## 2026-11-04 — Rendu 3D : ciel physique, post-traitement, herbe, décor sobre, corrections de la revue
- Recherche de bibliothèques : `Sky` (addon three.js), `EffectComposer` + `UnrealBloomPass` + `OutputPass`, herbe instanciée avec vent dans le shader. Tout est copié en local (hors ligne), arborescence miroir de `examples/jsm`.
- Non fait, faute de source fiable : de vrais modèles de joueurs (Quaternius ne propose qu'un lien Patreon, rien de CC0 prêt à télécharger pour les stades). Personnages procéduraux plus soignés à la place (bras croisés pour le mur, public en corps et têtes instanciés, carnations variées). Pas d'occlusion ambiante (GTAO) ni de profondeur de champ : les ombres suffisent pour l'instant.
- Revue appliquée : arbres près du noir remplacés par des houppiers arrondis dans les verts + haie taillée continue ; public blanc, crème et verts avec 1 spectateur sur 12 en couleur, sans le violet du tir ; onglets : dégradé seulement s'il reste des onglets, onglet actif toujours visible, deux rangées sous 760 px ; étiquette « Ralenti » quand la caméra Cinéma ralentit ; note « Balle et tracé agrandis pour la lecture » ; enregistrement vidéo abandonné proprement si on change de réglage, de vue ou si la page est masquée ; bouton Vidéo jamais désactivé (aria-disabled), « Photo enregistrée » annoncé ; Lecture/Pause sans `aria-pressed`, `aria-valuetext` sur le curseur de temps ; sans mouvement, la boucle est décochée et nuages, vent et herbe sont figés ; monde 3D reconstruit seulement quand la situation change (terrains de taille fixe) ; ombres calées sur la grille de la texture (plus de scintillement) ; caméra tribune plus proche pour les tirs longs.
- Piège : le motif d'herbe doit être périodique (9 tuiles identiques de 20 m) sinon tout saute quand le groupe suit la caméra par pas d'une cellule.

---

## 2026-11-04 — Bug 3D : la balle ne suivait pas la trajectoire (signalé par l'utilisateur)
- `sampleAt()` de `scene3d.js` renvoyait la position et la vitesse dans le repère du simulateur (x, y, z) alors que la scène 3D est en (x, z, −y) : la hauteur servait de profondeur, la balle restait au sol à côté du tracé, et la caméra de suivi s'orientait sur une vitesse fausse. Le tracé, les balles fantômes et les contacts utilisaient la bonne conversion, d'où une scène en apparence plausible. Corrigé.
- Leçon : mes captures montraient la balle près du sol sur le basket et je ne l'ai pas relevé. Vérifier qu'un objet mobile est au bout de son tracé, pas seulement qu'il est visible.
- Aussi : la lecture 3D reste en temps réel sur écran lent (plafond de pas 0,25 s) et la barre de lecture se met à jour au changement de situation.

---

## 2026-11-04 — 3D premium : décors, atmosphère, caméra Cinéma, photo, vidéo, partage
- `env3d.js` : un décor aux cotes réglementaires par situation (foot, basket, golf, baseball), tribunes avec public instancié, forêt, nuages. Les arbres du golf sont du côté opposé à la caméra : placés des deux côtés, ils masquaient le fairway.
- Atmosphère : disque solaire dans le shader du ciel, direction identique à celle de la lumière qui projette les ombres.
- La physique devient visible : flèche d'axe de rotation, poussière aux contacts, particules de vent (l'API renvoie maintenant `wind`).
- Caméra Cinéma : trois plans enchaînés selon l'avancement du tir, ralenti (×0,3) à moins de 0,3 s d'un rebond.
- Photo et vidéo : `toBlob` appelé juste après le rendu (sinon WebGL a déjà vidé le canvas) ; `MediaRecorder` sur `captureStream`, un tir complet une seule fois.
- Lien de partage : l'état du tir est dans l'adresse (base64 d'un JSON), validé à la relecture.
- Bug trouvé à 375 px : la barre de 5 caméras élargissait la page à 402 px (colonne de grille en `auto`). Corrigé par `minmax(0, 1fr)` et des boutons qui rétrécissent.

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
