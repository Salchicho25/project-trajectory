# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

HTML/CSS/JS sans framework ni étape de build, servi en local par un serveur Python minimal (bibliothèque standard) lancé par la commande `trajectoire-web`. La physique reste en Python (`balltraj`), l'interface l'appelle par une petite API JSON. Choix confirmé par l'utilisateur.

## Users

Un seul utilisateur principal, étudiant en ingénierie du sport. Il l'emploie en deux situations : explorer des tirs pour comprendre l'effet de l'air, du spin et de l'altitude, et le montrer à d'autres (portfolio, école, entretien) qui découvrent le projet. Ces visiteurs doivent comprendre en une dizaine de secondes ce qu'ils regardent.

## Product Purpose

Simulateur de trajectoire de balle de sport : on règle un tir (vitesse, angles, spin, vent, altitude) et on voit la trajectoire, les forces, et le verdict de la situation (but, panier, home run). Projet d'ingénierie mené sur plusieurs mois, dont la suite est de confronter le modèle à des mesures réelles (voir ROADMAP.md). L'interface doit servir à la fois d'outil de travail et de vitrine.

## Positioning

Un instrument qui montre la physique, pas un jeu : la trajectoire réelle est comparée en permanence à la parabole sans air et au même tir sans spin, avec les forces (traînée, Magnus) chiffrées en g et les coefficients Cd/CL suivis le long du vol.

## Operating Context

Navigateur sur le PC de l'utilisateur, serveur local, aucune connexion requise. Écran de bureau en priorité, lisible aussi sur téléphone pour une démonstration. Les résultats sont recalculés à chaque réglage, la réponse doit rester quasi instantanée (une trajectoire coûte environ 3 ms, un balayage d'optimisation quelques secondes).

## Capabilities and Constraints

- Six balles : football, basket, golf, tennis, baseball, volley. Cinq situations : tir libre, coup franc, lancer franc, drive de golf, home run.
- Réglages : vitesse, élévation, azimut, hauteur de frappe, spin (tr/min), axe du spin, vent (arrière et latéral), altitude, température.
- Fonctions de calcul inverse : angle de portée maximale, angle pour atteindre la cible.
- Données renvoyées par la physique : trajectoire 3D échantillonnée, apogée, portée, écart latéral, temps de vol, vitesse et angle à l'impact, Reynolds, paramètre de spin, Cd, CL.
- Langue de l'interface : français. Unités SI, avec ° et tr/min pour les saisies.
- Contrainte : la physique n'est jamais réécrite côté navigateur, le JavaScript n'affiche que ce que Python calcule.

## Brand Commitments

Esthétique choisie par l'utilisateur : s'inspirer de la typographie, des couleurs et du luxe du tennis de Wimbledon (vert profond, violet, blanc, pelouse, or discret, serif classique). Aucun logo, nom ou élément de marque de ce tournoi n'est repris. Nom du produit : Trajectoire.

## Evidence on Hand

Code et résultats réels dans `src/balltraj/`, figures d'étude dans `docs/figures/`, capture de l'ancienne interface matplotlib dans `docs/figures/capture_app.png`. Aucune mesure expérimentale ni vidéo pour l'instant (phase 2 de la feuille de route) : ne pas inventer de données mesurées. Valeur de référence connue : drive type PGA Tour à 239 m de carry dans le modèle, contre environ 251 m mesurés.

## Product Principles

- La physique d'abord : chaque chiffre affiché vient du moteur Python et se vérifie.
- Comparer plutôt qu'asséner : toujours montrer l'écart avec la parabole sans air et avec le tir sans spin.
- Lisible en dix secondes par un inconnu, exploitable en profondeur par l'auteur.
- Honnêteté sur les limites du modèle (écart golf, altitude), jamais de précision affichée au-delà de ce que le modèle justifie.

## Accessibility & Inclusion

Contraste de texte conforme WCAG AA, utilisation complète au clavier, respect de `prefers-reduced-motion`. Les verdicts (but, panier, raté) ne reposent pas sur la couleur seule.
