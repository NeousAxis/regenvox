# Résonance

*English summary.* Résonance is an open source, multi-agent engine that lets a municipality test, before launching a participatory process, several ways of asking its question on a panel of simulated residents built from official statistics. It shows which wording brings people together, who it leaves out and why. Every forecast is written and timestamped before the real outcome is known, then compared with it, failures included (see `predictions/` and `tests_aveugles/`). Part of [Régénère Plus](https://regenereplus.ch), a platform of open tools for the ecological transition. Licence: AGPL-3.0.

Moteur multi-agents de Régénère Plus pour la phase 1 de la prospective rétrocausale (ascendante) : avant de lancer une démarche participative, le décideur teste à huis clos plusieurs manières de poser la question (les angles) sur un panel virtuel calibré sur les statistiques publiques de sa commune.

Le décideur nomme l'enjeu et l'objectif, jamais les chemins : les chemins sont inventés par le terrain en phase 2 (participation réelle, en présentiel accompagné ou à distance).

Cas d'étude actuel : Vuadens, commune de la Gruyère, canton de Fribourg, Suisse (cas simulé, sans mandat de la commune).

## Principe de fonctionnement

Chaque agent est un appel de modèle de langage isolé, qui ne voit que ce dont il a besoin. Les échanges passent par des fichiers : le moteur écrit une requête, un agent écrit sa réponse, le moteur la contrôle puis la valide. N'importe quel fournisseur peut exécuter les requêtes (en développement : sous-agents Claude Code isolés ; en production : API Mistral ou Anthropic, à brancher).

Tout ce qui est chiffré (tirage du panel, propagation, mobilisation, backtest) est calculé par du code déterministe, jamais par un modèle.

| Étape | Rôle | Modèle |
|-------|------|--------|
| formulateur | Garde l'angle du décideur, propose d'autres angles ouverts | opus |
| gardien-angles | Contrôle doctrinal (6 principes) des angles | sonnet |
| personas | 48 habitants simulés : réaction aux angles et votes sur les votations passées | haiku |
| mobilisation | Probabilité de participer à chaque format (avis en ligne, atelier, parcours à distance, atelier avec un proche) | haiku |
| controle, controle2 | Angles témoins : décision imposée, puis objectif chiffré en question ouverte | haiku |
| facilitateur | Lecture des courbes de propagation | sonnet |
| sociologue | Segments, objections citées mot pour mot, freins, ambassadeurs | opus |
| contradicteur | Attaques sous plusieurs postures (5 à 12) | opus |
| gardien-final | Contrôle doctrinal de la recommandation et des leviers | sonnet |
| traducteur | Rapport au Conseil communal, sans chiffre absent du dossier | sonnet |

L'Administrateur du cadre (src/admin.ts) contrôle chaque réponse avant validation : format, âge et nationalité du portrait, votations complètes, citations exactes, chiffres présents dans le dossier, moyens imposés dans les angles, tirets séparateurs. Une réponse rejetée est renvoyée à l'agent avec la liste des erreurs (5 tentatives au plus, puis escalade humaine).

## Arborescence

| Chemin | Rôle |
|--------|------|
| cases/vuadens-bio/case.json | Enjeu, objectif, angle du décideur, faits sourcés, mémoire politique, votations, angles témoins, sources |
| cases/vuadens-bio/panel.json | Statistiques du panel (âges, nationalités, partis, agriculteurs) |
| cases/vuadens-bio/votes_reels.json | Résultats réels des votations (test et étalonnage) |
| data/vuadens.sources.json | Données publiques collectées et leurs sources |
| src/cli.ts | Orchestrateur (commandes ci-dessous) |
| src/schemas.ts, src/prompts.ts, src/requests.ts | Formats de réponse, consignes système, messages des agents |
| src/admin.ts | Administrateur du cadre |
| src/demographe.ts, src/diffusion.ts, src/scoring.ts | Panel par quotas, propagation sur réseau social, métriques et backtest |
| src/report.ts | Rapport HTML d'un run |
| src/catalogue.ts | Catalogue public à partir de plusieurs runs |
| src/selftest.ts | Autotests |
| runs/run-00x/ | Requêtes, réponses, réponses validées, journal, métriques de chaque run |
| REPRISE.md | État courant et pistes ouvertes |

## Commandes

```bash
npm install
npx tsx src/selftest.ts
npx tsx src/cli.ts init vuadens-bio run-004 20261030
npx tsx src/cli.ts panel run-004
npx tsx src/cli.ts prepare run-004 personas
npx tsx src/cli.ts ingest run-004 personas
npx tsx src/cli.ts simulate run-004
npx tsx src/cli.ts status run-004
npx tsx src/report.ts run-004
npx tsx src/catalogue.ts run-002 run-003 runs/publish/catalogue.html
```

### Exécuter les agents par API

`src/runner.ts` envoie les requêtes en attente d'une étape au fournisseur choisi et écrit les réponses ; l'Administrateur les contrôle ensuite avec `ingest`. Les modèles par niveau d'agent sont dans `fournisseurs.json`.

```bash
npx tsx src/runner.ts run-004 personas --essai
MISTRAL_API_KEY=... npx tsx src/runner.ts run-004 personas --fournisseur mistral --parallele 6
npx tsx src/runner.ts run-004 sociologue --fournisseur anthropic
npx tsx src/cli.ts ingest run-004 personas
```

`--essai` compte les requêtes et estime les jetons sans rien envoyer. Côté Anthropic, la clé vient de `ANTHROPIC_API_KEY` ou d'un profil `ant auth login` ; le repli automatique sur refus (`fallbacks: "default"`) est activé pour les agents Opus et Sonnet. Chaque appel est journalisé avec le modèle et les jetons consommés. `npm run selftest` vérifie le runner contre une fausse API locale, sans réseau ni clé.

### Registre des prévisions

`predictions/` contient les prévisions publiées avant les événements réels (votations, participation), jamais modifiées, puis comparées aux résultats officiels. Règles et format : `predictions/README.md`. Commandes : `npm run registre verifier` et `npm run registre bilan`.

### Étape scrutins (votations hors du backtest)

Le panel vote sur les votations de `cases/<cas>/scrutins.json` : analogues passées au résultat connu, votations postérieures aux connaissances des modèles, votations à venir. `src/scrutins.ts` corrige le biais du panel par famille d'analogues et écrit la prévision dans le registre. Protocole : `predictions/PROTOCOLE_scrutins.md`.

```bash
npx tsx src/cli.ts prepare run-002 scrutins
npx tsx src/cli.ts ingest run-002 scrutins
npx tsx src/scrutins.ts analyse run-002 run-003
npx tsx src/scrutins.ts prevision run-002 run-003 --publie-le 2026-10-25
```

### Méthode v2 (plusieurs communes)

Étape `scrutins2` : mêmes 32 votations pour toutes les communes (`data/scrutins_v2.json`), avec la recommandation officielle et les mots d'ordre des partis, 26 analogues en familles avec le sens du oui, biais ramené vers zéro selon le nombre d'analogues, participation par correspondance de quantiles. Protocole : `predictions/PROTOCOLE_scrutins_v2.md`. Les données des communes sont construites par `scripts/build_communes_v2.py` et `scripts/build_scrutins_v2.py` à partir des données ouvertes OFS et Swissvotes.

```bash
npx tsx src/cli.ts init echallens v2-echallens
npx tsx src/cli.ts panel v2-echallens
npx tsx src/cli.ts prepare v2-echallens scrutins2
npx tsx src/cli.ts ingest v2-echallens scrutins2
npx tsx src/scrutins2.ts analyse v2-vuadens v2-echallens v2-saviese v2-le-locle v2-meyrin v2-delemont
npx tsx src/scrutins2.ts prevision v2-vuadens v2-echallens v2-saviese v2-le-locle v2-meyrin v2-delemont --publie-le 2026-10-25
```

Ordre des étapes d'un run : formulateur, gardien-angles (ou `clone-angles <run source> <run cible>` pour réutiliser des angles validés), personas, mobilisation, controle, controle2, simulate, facilitateur, sociologue, contradicteur, gardien-final, traducteur. Pour chaque étape : `prepare`, exécution des requêtes par les agents, `ingest`.

Aperçu local des pages : configuration « resonance-pages » dans .claude/launch.json (serveur statique sur le port 8765, dossier runs).

## Résultats du cas Vuadens (runs 002 et 003)

- Le panel sait dire non : la décision imposée et l'objectif chiffré en question ouverte obtiennent 17 % de soutien, contre 82 % pour l'angle du décideur. C'est l'objectif chiffré qui suscite le rejet, pas seulement le ton.
- Reproductibilité : un second panel sans profil commun donne le même classement et la même mobilisation.
- Mobilisation, angle 1 : atelier estimé à 59 habitants (plafond 78), avis en ligne à 171 (plafond 228), invitation par un proche x2,8.
- Votations réelles : écart moyen de 5,7 points sur les 6 votations corrigées, contre 7,0 pour le résultat cantonal.
- Hors échantillon (27.09.2026, postérieur aux connaissances des modèles) : initiative sur l'alimentation prédite à 24,2 % pour 23,2 % réels (résultat cantonal : 5,1 points d'écart) ; initiative sur la neutralité ratée, 49,1 % pour 28,2 %. Le moteur est fiable dans son domaine agricole, pas au dehors. Détail : `predictions/RESULTAT_hors-echantillon_2026-09-27.md`.
- Prévision publiée avant le vote du 29.11.2026 : `predictions/2026-11-29_votations-federales.json`.
- Test à l'aveugle (25.10.2026, résultats inconnus du modèle et de nous, prévisions commitées avant la comparaison) sur les 5 votations cantonales vaudoises et genevoises du 27.09.2026, 7 communes, 19 prévisions : bon camp 14 fois sur 19 (suivre la recommandation des autorités : 5 sur 19), corrélation de 0,84 entre écarts prévus et réels d'une commune à l'autre, écart moyen 7,4 points (résultat cantonal : 5,4). Détail : `tests_aveugles/2026-09-27_cantonales_bilan.md`.
- Méthode v2 (contexte de campagne, familles d'analogues, participation par quantiles), six communes romandes, 244 électeurs simulés : prévision des 24 objets du 29.11.2026 dans `predictions/2026-11-29_votations-federales_romandie.json`. Contrôle sur le 27.09 : le contexte de campagne réduit nettement l'erreur du panel, la correction apporte peu, la participation reste hors de portée du panel. Détail : `predictions/RESULTAT_v2_controle_2026-09-27.md`.

## Test à l'aveugle par quartier (Medellín, Bologne)

Question posée : dans quels quartiers d'une ville une démarche participative prendra, et dans lesquels elle ne prendra pas. Un panel de 20 ou 30 habitants simulés par quartier (étape `quartiers`, `src/quartiers.ts`), comparé au modèle seul, à un hybride, à « rang du panel, niveau du modèle » (le total du modèle seul réparti comme le panel répartit les quartiers) et à deux références naïves. Protocole fixé et commité avant toute donnée : `tests_aveugles/PROTOCOLE_quartiers_medellin_bologne.md` ; incidents : `tests_aveugles/quartiers_journal.md`.

- Medellín, budget participatif 2026 (21 territoires, vote de septembre 2026, postérieur aux connaissances des modèles) : les 3 critères fixés d'avance sont atteints. Le panel classe les taux de participation à 0,55 (p 0,006), le modèle seul à 0,31 ; « rang du panel, niveau du modèle » a l'écart le plus faible sur le nombre de votants (facteur 1,14). Limite : reconduire l'édition 2025 classe mieux (0,88), le panel sert donc surtout là où une démarche n'a pas d'historique. Plus gros écarts : El Poblado (surestimé) et Palmitas (sous-estimé). Détail : `tests_aveugles/medellin_bilan.md`.
- Bologne, budget participatif 2026 (6 quartiers) : prévision commitée avant la clôture du vote le 9 novembre 2026 à 12 h (`tests_aveugles/bologne_previsions.json`), comparaison après la publication des résultats. Le chiffre publié compte les votes reçus par chaque quartier, pas la participation de ses habitants.

```bash
npx tsx src/quartiers.ts cases medellin 20
npx tsx src/quartiers.ts fuite medellin
npx tsx src/quartiers.ts prevision medellin
npx tsx src/quartiers.ts comparer medellin
```

## Limites connues

Personas synthétiques, 8 agriculteurs seulement par panel, paramètres de propagation non étalonnés sur le terrain, aucun opposant initial sur les angles ouverts, participation déclarée et non observée : le panel surestime le niveau de participation (facteur 2,4 à 8 selon les tests), un modèle seul l'estime mieux, tandis que le panel distingue mieux les communes entre elles.

Dépendances : `npm audit` signale une faille de `zod` (saturation mémoire sur des collections démesurées) corrigée seulement par une version majeure. Le risque est faible ici, le moteur ne validant que les réponses de ses propres agents ; la mise à jour reste à faire.

## Plan de validation

1. Prérequis : runner API et registre des prévisions (faits).
2. Prévisions publiées avant les votations fédérales (Vuadens puis d'autres communes), et test hors échantillon sur une votation postérieure aux connaissances des modèles. Fait pour Vuadens (27.09 testé, 29.11 publié) ; autres communes à faire.
3. Réplication des sondages suisses d'après votation (VOTO, FORS) et comparaison au plafond de réplication.
4. Démarches participatives passées rejouées à l'aveugle.
5. Test A/B de deux angles avec une commune partenaire, puis mesure de la participation réelle.
6. Audit par un partenaire académique.

## Code ouvert

Licence : GNU Affero General Public License v3 (fichier `LICENSE`). Vous pouvez utiliser, étudier, modifier et redistribuer ce code ; les versions modifiées mises à disposition en ligne doivent rester ouvertes.

Historique : Résonance a été développé dans un dépôt privé jusqu'au 26 octobre 2026, puis ouvert ici. Les prévisions du 29 novembre 2026 y avaient été horodatées dès le 25 octobre ; dans ce dépôt public, elles datent du 26 octobre 2026, toujours avant le vote. Les noms des particuliers auteurs de pétitions ont été remplacés par leur rôle (« un particulier ») ; les institutions et les élus restent nommés.

Les données utilisées sont publiques et sourcées (OFS, Chancellerie fédérale, Swissvotes, cantons, communes, act.campax.org). Les personas sont synthétiques : aucune personne réelle n'est simulée.

Contributions bienvenues : ouvrez une issue ou une pull request.
