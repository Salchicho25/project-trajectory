---
name: Trajectoire
description: Tableau de bord de Centre Court pour lire une trajectoire de balle, à l'échelle, sur une pelouse rayée.
colors:
  paper: "oklch(99% 0.004 140)"
  paper-2: "oklch(96.5% 0.012 145)"
  turf-a: "oklch(97.4% 0.022 145)"
  turf-b: "oklch(94.4% 0.040 145)"
  grid-1: "oklch(92% 0.030 148)"
  grid-5: "oklch(86% 0.050 148)"
  grid-10: "oklch(76% 0.070 150)"
  ink: "oklch(22% 0.045 160)"
  ink-2: "oklch(40% 0.050 160)"
  rail: "oklch(32% 0.085 158)"
  rail-ink: "oklch(98% 0.010 140)"
  rail-dim: "oklch(84% 0.050 150)"
  gold: "oklch(80% 0.115 85)"
  traj: "oklch(38% 0.150 305)"
  traj-2: "oklch(56% 0.165 305)"
  traj-deep: "oklch(31% 0.15 305)"
  green: "oklch(46% 0.120 150)"
  ball: "oklch(90% 0.200 112)"
typography:
  mark:
    fontFamily: "Libre Caslon Display, Libre Caslon Text, Georgia, serif"
    fontSize: "1.9rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.01em"
  verdict:
    fontFamily: "Libre Caslon Text, Libre Caslon Display, Georgia, serif"
    fontSize: "1.55rem"
    fontWeight: 700
    lineHeight: 1.15
  heading:
    fontFamily: "Libre Caslon Text, Libre Caslon Display, Georgia, serif"
    fontSize: "1.05rem"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.35
    fontFeature: "\"tnum\" 1"
  label:
    fontFamily: "Barlow Semi Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.4
rounded:
  none: "0"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.7rem"
  lg: "1.15rem"
  xl: "1.5rem"
  rail-height: "3.75rem"
components:
  rail:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.rail-ink}"
    height: "3.75rem"
    padding: "0 1.25rem"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.rail-dim}"
    rounded: "{rounded.none}"
    padding: "0.75rem 1.15rem 0.9rem"
  tab-selected:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.rail}"
  button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.rail}"
    rounded: "{rounded.none}"
    height: "2.5rem"
    padding: "0 1rem"
  button-hover:
    backgroundColor: "{colors.paper-2}"
  button-primary:
    backgroundColor: "{colors.traj}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    height: "2.5rem"
  button-primary-hover:
    backgroundColor: "{colors.traj-deep}"
  number-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    height: "2rem"
    width: "5.2rem"
  verdict-success:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.gold}"
    typography: "{typography.verdict}"
---

# Design System: Trajectoire

## Overview

**Creative North Star: "Le tableau de bord de Centre Court"**

Un lieu de prestige et de précision. Fond blanc des tenues, vert profond pour le bandeau et les titres, filets or sur le vert, violet réservé au tir réel et à l'action, pelouse en bandes de tonte sous les tracés. Inspiration seule d'un tournoi sur gazon : aucun logo, aucun nom, aucune marque reprise (engagement de PRODUCT.md). Reconnaissable sans contenu : vert, violet, rayures de gazon.

La densité est celle d'un instrument : trois colonnes (réglages, relevé, résultats) séparées par des filets de 1 px, chiffres tabulaires, serif anglaise (Libre Caslon) pour le nom, le verdict et les titres, sans-serif condensée (Barlow Semi Condensed) pour tout le reste. Angles droits, filets, aucune ombre portée. Le visiteur doit croire les chiffres parce que le dessin est à l'échelle.

**Key Characteristics:**
- Un seul thème clair, angles droits (0 radius), filets de 1 px, aucune ombre portée.
- Le violet est le tir réel et l'action ; le vert profond est la structure ; l'or n'existe que sur le vert.
- Le relevé est un instrument à l'échelle : carreaux de pelouse carrés à l'écran, échelle toujours écrite sur la feuille.
- Interface en français, nombres au format fr-FR, chiffres tabulaires.

## Colors

Palette de gazon et de tenues blanches : un blanc légèrement verdi, trois verts de structure, un or de filet, un violet de tracé, un jaune de balle. Tous les jetons vivent dans `:root` de `style.css` ; le canvas (`plot.js`) les lit par `getComputedStyle`, donc une valeur ne se change qu'à cet endroit.

### Primary
- **Violet de tracé** (`traj`): le tir réel : trait du tracé, bouton primaire, poignée et remplissage des curseurs, sélection, focus, `accent-color`. Aussi la couleur du texte « Cd » et de la légende « traînée », car `traj-2` est trop clair pour du petit texte.
- **Violet clair** (`traj-2`): uniquement des traits et aplats dessinés (courbe Cd, flèche de traînée). Jamais pour du texte de petite taille.
- **Violet profond** (`traj-deep`): survol du bouton primaire.

### Secondary
- **Vert profond** (`rail`): bandeau, titres de groupe (legend, caption), verdict, contour des boutons et des cadres, bande de sol du canvas, pastille d'échelle.
- **Vert de comparaison** (`green`): la courbe « sans rotation », la force de Magnus et la courbe CL. Il signifie « cas d'école ou autre effet », jamais « succès ».

### Tertiary
- **Or de filet** (`gold`): filet sous le bandeau, nom du produit, focus dans le bandeau, bordure du sélecteur de balle, verdict réussi (texte et filet), message d'erreur. Toujours posé sur du vert profond.
- **Jaune optique** (`ball`): la balle, marques de chronophotographie, toujours cerclée d'encre. Aucun autre usage.

### Neutral
- **Blanc des tenues** (`paper`): fond de page, panneaux, onglet actif, boutons au repos.
- **Papier vert pâle** (`paper-2`): survol des boutons et champs, rail du scrollbar.
- **Pelouse claire / foncée** (`turf-a`, `turf-b`): les deux bandes de tonte alternées.
- **Filets de grille** (`grid-1`, `grid-5`, `grid-10`): `grid-10` pour les séparateurs de colonnes et la grille principale, `grid-5` pour la demi-grille, `grid-1` réservé aux filets les plus discrets.
- **Encre** (`ink`) et **encre secondaire** (`ink-2`): texte courant ; unités, aides, axes, statut, courbe « sans air » en pointillés.
- **Bandeau** (`rail-ink`, `rail-dim`): texte clair et texte atténué (onglets inactifs) sur le vert.

### Named Rules
**The Purple Is The Shot Rule.** Le violet désigne le tir réel et l'action possible, rien d'autre. Un nouvel élément décoratif ne le prend pas.

**The Gold Needs Green Rule.** L'or n'apparaît que sur le vert profond (ou comme filet adjacent). Jamais d'or sur blanc.

**The Ball Is Yellow Rule.** Le jaune `ball` est réservé à la balle et à sa légende.

**The Token Source Rule.** Aucune couleur n'est écrite en dur dans `plot.js` ; il lit les variables CSS.

## Typography

**Display Font:** Libre Caslon Display (400), repli Libre Caslon Text, Georgia
**Heading Font:** Libre Caslon Text (400, 700), repli Georgia
**Body/Label Font:** Barlow Semi Condensed (400, 500, 600, 700), repli Arial Narrow, system-ui
Toutes les polices sont auto-hébergées (`static/fonts/*.woff2`), `font-display: swap`.

**Character:** Une serif de livre, posée, face à une condensée de tableau d'affichage. La serif parle (nom, verdict, titres) ; la condensée mesure (réglages, nombres, axes).

### Hierarchy
- **Mark** (Display 400, 1.9rem, 1, +0.01em, or): le nom « Trajectoire » dans le bandeau. 1.65rem sous 760px.
- **Verdict** (Text 700, 1.55rem, 1.15, vert profond ; or sur vert en cas de réussite): l'énoncé du résultat. 1.3rem sous 760px.
- **Heading** (Text 700, 1.05rem, 1.2, vert profond, filet 1 px dessous): titres de groupe de réglages (legend) et du tableau (caption).
- **Body** (Barlow 400, 0.9375rem, 1.35, tabulaire): champs, tableau, onglets (500), valeurs (600).
- **Small** (Barlow, 0.8125rem): aides sous un champ, note d'air, légendes de figure.
- **Canvas text** (Barlow 500, 11 à 12 px, 700 pour pastille d'échelle et titres de force): axes, étiquettes de balle, libellés de décor, tous posés via le registre de collisions.

### Named Rules
**The Tabular Rule.** Tout nombre est en chiffres tabulaires et formaté en fr-FR (virgule décimale, `nf()` dans `plot.js`).

**The Serif Speaks Rule.** La serif est réservée au nom, au verdict et aux titres de groupe. Ni sur les étiquettes de champ, ni sur les boutons.

## Layout

Page en deux rangées : bandeau (3.75rem) puis `.layout` de la hauteur restante (`100dvh - 3.75rem`). Trois colonnes de `19.5rem | 1fr | 21rem` séparées par un filet de 1 px (le gap de 1 px laisse voir le fond `grid-10`). Colonne gauche : réglages et actions ; centre : verdict, bascules, vue de côté (3fr) puis vue de dessus (1.25fr) ; droite : tableau des résultats, graphique, note d'air. Les colonnes latérales défilent seules.

Rythme : paddings de panneau 1.1rem / 1.15rem, groupes séparés de 1.35rem, champs de 0.7rem, boutons empilés avec 0.5rem. Les actions forment un dock collant en bas de la colonne des réglages (filet supérieur `grid-10`) afin de rester visibles.

Responsive : sous 1100px, deux colonnes (17rem + relevé), résultats en pleine largeur dessous, relevé en 24rem + 13rem de plots. Sous 760px, une seule colonne : le verdict reste collé en haut (sticky), puis bascules, vue de côté (19rem), vue de dessus (11rem), réglages, résultats ; le bandeau passe à la ligne et les onglets occupent une ligne entière. Les onglets défilent horizontalement avec un fondu de 1.75rem à droite pour signaler la suite.

## Elevation & Depth

Aucune ombre portée : la profondeur vient des aplats (bandeau vert sur page blanche), des filets de 1 px et de la superposition de bandes de pelouse. Le seul état « enfoncé » est un déplacement de 1 px vers le bas à l'appui d'un bouton. Les états forts (réussite, erreur) s'obtiennent par inversion de couleur, vert plein et or.

### Named Rules
**The No Shadow Rule.** Pas de `box-shadow` décoratif, pas de flou, pas de dégradé de surface. Une séparation est un filet de 1 px ou un changement d'aplat.

## Shapes

Angles droits partout : `border-radius: 0` sur boutons, champs, onglets, poignées de curseur. Filets de 1 px (vert profond pour les cadres et titres, `grid-10` pour les séparations internes, or sous le bandeau). Seules les formes du canvas sont rondes : la balle (cercle de rayon 3.4 à 4 px cerclé d'encre) et la cible (cercle de 8 px avec réticule). Les curseurs sont un trait de 3 px à poignée rectangulaire de 0.65rem x 1.15rem.

## Components

### Bandeau et onglets
Vert profond `rail`, filet or de 1 px en bas, nom en or à gauche, onglets des situations alignés sur le bas, sélecteur de balle à droite (`margin-left: auto`). Onglet inactif : texte `rail-dim`, survol `rail-ink` sur voile blanc à 7 %. Onglet actif : fond `paper`, texte `rail`, 700, il se fond dans la page sous le bandeau. Focus dans le bandeau : contour or.

### Boutons
- **Forme:** carré, 2.5rem de haut, padding 0 1rem, contour 1 px vert profond, texte 600.
- **Défaut:** fond `paper`, texte `rail`. Survol `paper-2`. Appui : `translateY(1px)`. Transition 120 ms (ease `cubic-bezier(0.16, 1, 0.3, 1)`), supprimée sous `prefers-reduced-motion`.
- **Primaire** (un seul par écran, « Viser la cible »): fond et contour `traj`, texte `paper`, survol `traj-deep`.
- **Discret** (« Réglages d'origine »): sans contour, `ink-2`, souligné (décalage 3 px).
- **Désactivé:** texte `ink-2`, contour en tirets 1 px, fond transparent.
- **Focus (partout):** contour 2 px `traj`, décalé de 2 px.

### Champs numériques et curseurs
Champ 5.2rem x 2rem, texte à droite en 600, fond `paper`, contour 1 px `ink-2`, survol `paper-2`, flèches natives masquées. Chaque champ est accompagné d'un curseur pleine largeur : trait de 3 px, partie remplie en `traj` (variable `--pct`), reste `grid-10`. Unité en `ink-2`, aide en 0.8125rem.

### Groupe de réglages
Un fieldset avec une legend en serif vert profond, filet 1 px `rail` dessous, champs en grille `1fr auto`.

### Verdict
Ligne de serif 700 sur fond blanc, filet inférieur vert profond. État `success` : fond vert profond, texte or, filet or (le tableau d'affichage). État `miss` : cadre intérieur de 2 px vert profond.

### Bascules
Cases à cocher `accent-color` violet, libellés en 500, alignées en ligne avec filet inférieur.

### Tableau de résultats
Caption en serif ; lignes en grille sans bordure, libellé `ink-2` à gauche, valeur 600 à droite, unité en `small` `ink-2`, écart (`delta`) en 500 `ink-2`. Titres de sous-groupe en 0.8125rem 700 vert profond. Un filet `grid-10` clôt chaque tbody.

### Figure de relevé (signature)
Un canvas dans une figure séparée par un filet ; titre de figure posé en haut à gauche sur fond `paper`. Vue de côté, vue de dessus et graphique partagent la même fonction de fond (voir langage du canvas). Le graphique de droite est encadré d'un filet 1 px vert profond, 11.5rem de haut.

### Message d'erreur
Pastille fixe centrée en bas : fond vert profond, texte or 600, filet or 1 px.

### Langage du canvas (plot.js)
- **Pelouse à l'échelle:** chaque carreau est carré à l'écran et vaut un nombre rond d'unités (pas 1, 2, 2.5, 4, 5, 8, 10 puissance de dix), différent en x et en z. Les bandes de tonte sont un carreau sur deux en `turf-b` sur `turf-a` ; la grille principale est `grid-10`, la demi-grille `grid-5`, cadre 1 px `rail`. Le graphique n'a pas de bandes (elles suggéreraient une échelle non graduée).
- **Échelle écrite:** « 1 carreau = X m en x, Y m en z/y » en haut à droite. Si l'échelle n'est pas 1:1, une pastille pleine `rail` en 700 blanc annonce « Échelle verticale/latérale xN (dilatée/compressée) ». La vue de dessus subdivise les carreaux (÷1, ÷2, ÷4) pour avoir au moins 3 rangées de chaque côté de l'axe, avec le même pas en x que la vue de côté.
- **Sol:** bande `rail` sous l'altitude 0 avec une ligne de craie `paper` de 2 px ; repères nommés au-dessus de la ligne en `ink-2`.
- **Tracé réel:** trait `traj` 2.8 px, joints et bouts arrondis, dessiné progressivement une fois à chaque changement de tir ; fin marquée d'une croix `traj` de 2.2 px.
- **Chronophotographie:** balle `ball` cerclée d'encre 1.5 px (rayon 4 vue de côté, 3.4 vue de dessus) à chaque intervalle `dt`, légende « balle toutes les X s » avec sa pastille. Les temps ne s'écrivent que s'il y a de la place (un sur 1, 2 ou 5 selon le nombre de marques).
- **Cas d'école:** « sans air » en pointillés longs 7/5, `ink-2`, 1.25 px ; « sans rotation » en pointillés courts 2/4, `green`, 1.75 px, 600. Leurs étiquettes sont posées près du tracé.
- **Forces à l'apogée:** flèches de 2 px depuis l'apogée, 46 px par g ; poids `ink`, traînée `traj-2` (légende en `traj`), Magnus `green`. Légende fixe en haut à gauche de la vue (carré de couleur 8 px + nom + valeur en g), sous la note d'échelle, hors du décor.
- **Décor et cible:** formes en `ink` (aplats à 85 %, traits de 3 px, bande de 5 px), étiquettes 12 px en 600 ; cible en cercle de 8 px et réticule `ink` de 1.5 px.
- **Registre de collisions:** chaque texte posé enregistre son rectangle (`occupied`) ; une étiquette facultative ne se pose que si `isFree`. Tout nouveau libellé du canvas passe par `text()` et ce registre.
- **Graphique v / Cd / CL:** vitesse en `ink`, Cd en `traj-2` (étiquette `traj`), CL en `green`, 2 px, deux axes (m/s à gauche, Cd/CL à droite).

## Do's and Don'ts

### Do:
- **Do** déclarer toute nouvelle couleur comme jeton dans `:root` de `style.css`, en OKLCH, et la lire depuis le canvas via `css()`.
- **Do** réserver le violet (`traj`) au tir réel, à l'action primaire, à la sélection et au focus.
- **Do** garder les angles droits, les filets de 1 px et les aplats ; séparer par un filet ou un changement de fond.
- **Do** écrire l'échelle sur chaque nouveau dessin à l'échelle, et la dire quand elle n'est pas 1:1.
- **Do** utiliser `traj` (et non `traj-2`) pour tout petit texte violet ; vérifier le contraste du texte sur `turf-b`.
- **Do** passer tout texte du canvas par `text()` avec vérification `isFree` quand il est facultatif.
- **Do** formater les nombres en fr-FR avec chiffres tabulaires et écrire l'interface en français.
- **Do** respecter `prefers-reduced-motion` pour toute nouvelle transition.

### Don't:
- **Don't** ajouter d'ombre portée, de flou ou de coin arrondi hors du canvas (balle et cible).
- **Don't** reprendre un logo, un nom ou un élément de marque d'un tournoi réel : l'esprit seulement.
- **Don't** mettre de l'or sur blanc, ni du jaune `ball` ailleurs que sur la balle.
- **Don't** utiliser le vert `green` pour signifier un succès : il désigne les cas d'école et les forces secondaires.
- **Don't** revenir au tableau de bord gris à un accent, ni au papier millimétré neutre.
- **Don't** mettre la serif sur des étiquettes de champ ou des boutons.
- **Don't** laisser un dessin de relevé sans échelle chiffrée.


## Vue 3D (extension)

La vue 3D reste dans le monde « Centre Court » : aucun nouveau matériau, seulement les jetons existants plus un seul, `--sky`.

- **Jeton ajouté** : `--sky` (`oklch(88% 0.035 230)`), le ciel. L'horizon se fond dans `--turf-a` ; le brouillard prend la même couleur.
- **Pelouse** : bandes de tonte alternées dérivées de `--green` éclairci vers `--turf-b` (deux teintes, 2,5 m, 5 m ou 10 m selon la longueur du terrain). Lignes de craie en `--paper`.
- **Tracé** : tube en `--traj` (règle « Purple Is The Shot »). Balles fantômes en `--ball`, translucides. Anneaux de contact en `--gold`.
- **Ballon** : sphère texturée avec les jetons (`--ball` pour le tennis, `--paper`, `--ink`, `--gold`, `--traj` pour les autres). Sa taille grossit avec la distance de la caméra (de la taille réelle ou 12 cm de rayon, jusqu'à 1,2 % de la longueur du tir) : lisible de loin, jamais énorme de près.
- **Tableau d'affichage et barre de lecture** : bandes pleines `--rail` avec chiffres en or (« Gold Needs Green »), placées au-dessus et en dessous de l'image, jamais en surimpression : rien ne cache la trajectoire. Chiffres du tableau en Libre Caslon, chiffres tabulaires.
- **Commutateurs** (Relevé / Vue 3D, caméras) : groupe à liseré intérieur de 3 px, état pressé plein (`--rail` et or, ou or et `--rail` sur la barre).
- **Caméras** : Suivi, Tribune (à droite du tireur, le tir va de gauche à droite), Aérien, Arrivée. Mouvement signature : transition d'une caméra à l'autre en 0,9 s, exponentielle, instantanée sous `prefers-reduced-motion`.
- Le fichier `.impeccable/design.json` n'a pas été régénéré pour cette extension : ce paragraphe fait foi pour la 3D.

### Rendu et matières 3D (mise à jour)

- **Ciel** : addon `Sky`, voilé (turbidité 4,5, Rayleigh 0,8) pour rester pâle et dans la palette ; le brouillard garde la couleur de l'horizon des jetons.
- **Halo** : bloom discret (force 0,42, seuil 0,92) : ne s'allume que pour le soleil, la balle et l'or.
- **Herbe** : brins dans les couleurs des bandes du sol (même rayures recalculées dans le shader), sombres à la racine, un peu plus clairs à la pointe.
- **Arbres et haies** : houppiers arrondis dans `--green` éclairci vers `--turf-b`, jamais mêlés à `--ink` ; haie taillée en `--green` assombri vers `--rail`.
- **Public** : `--paper`, crème (`--paper` + `--gold` 14 %), `--turf-b`, verts éclaircis ; 1 spectateur sur 12 en `--gold` ou `--traj-2` éclairci. Le violet franc reste réservé au tir.
- **Qualité** : « Élevée » (halo, herbe, ombres 2048) et « Standard » (rendu direct). Réglage dans la barre de lecture.

### Décors 3D

Chaque situation a un lieu, construit avec les seuls jetons existants (aucune couleur nouvelle en dehors de `--sky`).

- **Football** : pelouse à bandes de 5,5 m, lignes de craie `--paper` aux cotes du règlement, mur de joueurs (maillot `--traj`, short `--paper`), but blanc avec filet translucide, tribunes sur trois côtés.
- **Basket** : salle fermée, terrain aux cotes officielles (28 × 15 m) peint dans une texture de 64 px/m : lames de parquet teintées (`--gold` vers `--ink`), raquette et cercle central en `--rail`/`--green`, lignes `--paper` de 5 cm (3 points, lancers francs, zone restrictive), monogramme et lettrage dorés. Panier : verre cerclé d'acier, carré de tir, cercle `--gold` avec filet maillé, mât rembourré. Passerelle lumineuse, tableau suspendu, bannières vert et or, tribunes sur quatre côtés ; reflets de salle (RoomEnvironment), sans ciel ni nuages.
- **Golf** : rough plus sombre (`--ink` mêlé), fairway de bandes de 10 m, bunkers `--paper` mêlé de `--gold`, fanions de distance `--traj`, arbres uniquement du côté opposé à la caméra de tribune.
- **Baseball** : avant-champ en terre (`--gold` assombri), pelouse intérieure, bases `--paper`, piste d'avertissement, tribune derrière la palissade.
- **Public** : cubes instanciés colorés avec `--paper`, `--gold`, `--traj`, `--traj-2`, `--green`, `--turf-b` : jamais de couleur hors palette.
- **Lecture de la physique** : flèche d'axe de rotation en `--gold`, poussière aux contacts en `--paper` mêlé de `--gold`, vent en points `--paper`.
- **Bandeaux** : la caméra « Cinéma » et les boutons Photo et Vidéo suivent les règles de la barre de lecture (fond `--rail`, or, liseré intérieur de 3 px).
