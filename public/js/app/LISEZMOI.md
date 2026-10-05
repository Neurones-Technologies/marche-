# Interface de Marché+ : organisation des scripts

L'interface est en JavaScript natif, sans framework ni étape de build. Elle est découpée en **scripts classiques**
(pas des modules ES), chargés par `public/index.html` **dans cet ordre** :

1. `noyau.js` : référentiels, état synchronisé avec l'API (envoi en bloc, écritures ciblées), aides DOM
   (`add`, `el`…), habilitations (`can`), notifications, cycle de vie de la procédure, navigation (`go`, menu).
2. `composants.js` : composants de présentation partagés (icônes, pastilles, bandeaux, frise des étapes) et
   bandeau de déclaration de conflit d'intérêts.
3. `ecrans/*.js` : un fichier par écran, chacun définissant sa fonction `vNomDeLEcran(m)`.
4. `demarrage.js` : table des écrans (`ROUTER`), rendu, événements globaux et point d'entrée `window.MarchePlus`.
   Il doit rester **le dernier**.

Avant eux, `profils.js`, `regles.js` (partagés avec le serveur) et `api.js` (connexion, appels à l'API).

## Règles

- Les fonctions et variables de premier niveau sont **communes à tous les fichiers** (portée globale de la page),
  comme elles l'étaient dans l'ancien `app.js` unique. Un fichier ne doit exécuter aucun code au chargement qui
  dépende d'un fichier chargé après lui ; les écrans ne font que définir des fonctions.
- Un nom de premier niveau ne doit pas masquer une propriété de `window` (`name`, `status`, `open`, `close`…).
  Le découpage du 02/10/2026 a été vérifié sans collision.
- Chaque fichier commence par `"use strict";`.

## Conventions d'affichage

- Le titre d'un écran est le `h1` de son en-tête (`.head`) : le rendu le monte dans la barre du haut. Pas de
  sous-titre ni de ligne au-dessus du titre.
- Une liste est un **tableau** : `tableau(parent, {...})` (`composants.js`) donne les libellés de colonnes, la
  recherche, les filtres, le bouton « Nouveau » et la pagination (10 lignes par défaut). Un formulaire de création
  ne s'affiche qu'après « Nouveau », avec un bouton « Annuler ».
- Les champs de saisie sont soulignés (un trait, sans cadre) : style global de `app.css`, rien à faire par écran.
- Imprimer, exporter et les autres actions secondaires sont des **boutons-icônes** : `boutonIcone(parent, icône,
  libellé, action, fk)`. Le libellé sert d’infobulle et de nom pour les lecteurs d’écran.
- Le détail d’une ligne s’ouvre dans une **fenêtre** : `ouvrirFenetre(titre, remplir, {large})` (`composants.js`).
  `remplir(corps, pied)` est rappelé à chaque rendu tant que la fenêtre est ouverte : il relit l’état (par
  identifiant ou par rang, jamais un objet capturé) et renvoie `false` si l’élément a disparu. Les saisies en
  cours sont conservées ; une confirmation (`ask`, `demander`) s’affiche par-dessus. Aides : `champLecture`,
  `grilleLecture`, `boutonDetail` (bouton texte si une action attend, œil sinon).
- Une étape terminée (ou une procédure archivée) passe en consultation seule : le rendu appelle `figer` sur l’écran
  et sur ses fenêtres. Un bouton qui ne fait que consulter (fenêtre de détail, navigation) porte `data-consult`.
- Les tableaux des registres n’ont pas de titre (il est dans la barre du haut) ; ceux des écrans de procédure en ont.
- Le rendu appelle `organiserSections` : un écran d’au moins quatre sections reçoit le sommaire collé à droite. Une section
  est une carte posée directement dans le contenu, qui commence par un `.panel-head`. Un titre « N · Titre »
  donne la pastille N (le texte de l’en-tête reste « N · Titre ») ; sans numéro, la pastille porte le rang.
  Une carte garde son `id` s’il en a un ; sinon elle reçoit `sec-N`.

## Ajouter un écran

1. Créer `ecrans/mon-ecran.js` avec `function vMonEcran(m){ … }`.
2. L'ajouter dans `index.html`, avant `demarrage.js`.
3. Déclarer l'écran dans `VIEWS` (`noyau.js`), son icône dans `NAV_ICONS` (`composants.js`) et sa fonction dans
   `ROUTER` (`demarrage.js`). Le groupe (`grp`) range l'écran dans le menu : `Accueil`, `Registres` (écrans de
   l'organisation), `Procédure` (écrans de la procédure ouverte : hors du menu, dans le cadre à étapes ; les ranger aussi dans une
   étape de `ETAPES` ou dans `OUTILS_PROCEDURE`, `composants.js`) ou `Administration`. Un écran
   utilisable sans procédure ouverte est aussi listé dans `SANS_PROCEDURE`.
