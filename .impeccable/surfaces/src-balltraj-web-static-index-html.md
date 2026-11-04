---
version: 1
slug: "src-balltraj-web-static-index-html"
primary_target: "src/balltraj/web/static/index.html"
related_targets: []
---

# Surface brief : interface web du simulateur

Mode : Operate. Visiteurs : l'auteur (explorer des tirs) et des inconnus qui découvrent le projet en démonstration.
Tâche : régler un tir, lire la trajectoire et les forces, comparer à « sans air » et « sans spin », viser la cible d'une situation.
Contraintes : physique uniquement côté Python, français, clavier complet, `prefers-reduced-motion`, un seul thème clair, HTML/CSS/JS sans build.
Direction épinglée par l'utilisateur (bat le tirage) : s'inspirer de la typographie, des couleurs et du luxe du tennis de Wimbledon. Ni logo, ni nom, ni marque reprise : l'esprit seulement.

## Direction contract

THESIS: L'interface est un tableau de bord de Centre Court : le tracé de la balle se lit sur une pelouse aux rayures de tonte, à l'échelle, balle optique jaune marquée tous les 0,1 s. Elle refuse le dashboard gris à un accent et le papier millimétré neutre.

OWN-WORLD: Fond blanc des tenues, vert profond du bandeau, violet pour le tracé et la sélection, filets or sur le vert, pelouse en bandes vert pâle, balle jaune optique cerclée d'encre. Serif anglaise classique (Libre Caslon) pour le nom, le verdict et les titres, sans-serif condensée (Barlow Semi Condensed) pour les réglages et chiffres tabulaires. Angles droits, filets de 1 px, aucune ombre. Reconnaissable sans contenu : vert, violet, rayures de gazon.

STORY: Le visiteur sent un lieu de prestige et de précision, comprend que le trait violet est le tir réel et que les courbes fantômes sont des cas d'école, croit les chiffres parce qu'ils sont à l'échelle. Il règle, voit, compare, vise.

FIRST VIEWPORT: Bandeau vert avec nom en serif or, onglets des 5 situations, choix de la balle. Colonne gauche : réglages Tir / Rotation / Air avec champs numériques, boutons sous les réglages. Centre : verdict en serif (tableau d'affichage vert et or quand c'est réussi), relevé de côté grand sur pelouse rayée avec échelle chiffrée, vue de dessus dessous. Colonne droite : tableau des résultats, courbes Cd/CL/vitesse.

FORM: Centre Court, direction pinnée par l'utilisateur, remplace la 6e candidate (papier millimétré), tirage 4aef726a. Mouvement signature : le trait se dessine une fois à chaque changement de tir, la balle jaune se pose à chaque intervalle.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
