# Test à l'aveugle : votations cantonales du 27 septembre 2026 (fixé le 25 octobre 2026, avant le vote des panels)

## Pourquoi ce test est à l'aveugle

- Le modèle des personas (Claude Haiku) a des connaissances arrêtées en juin 2026 : il ne peut pas connaître ces résultats.
- Nous ne les avons pas consultés : seuls les titres ont été lus dans les données ouvertes, par un script qui n'affiche aucun résultat. Les contenus, recommandations et mots d'ordre viennent des brochures officielles publiées avant le vote (`data/cantonales_20260927_sources.json`), rassemblés par un agent chargé de n'en rapporter aucun résultat.
- La méthode est la v2, gelée avant ce test (commit e016514). Ces cinq objets n'ont servi à aucun réglage.
- Ordre imposé et vérifiable dans l'historique Git : ce protocole et les requêtes, puis les prévisions (`2026-09-27_cantonales_previsions.json`), et seulement ensuite la lecture des résultats officiels (`src/cantonales.ts comparer`).

## Objets et communes

Vaud : initiative « Baisse d'impôts pour tous », prédite à Echallens, Yverdon-les-Bains et Nyon. Genève : contraception gratuite, crédit transfrontalier, LDTR, indemnité HES-SO Genève, prédits à Meyrin, Carouge, Onex et Collonge-Bellerive. Soit 19 prévisions, 288 électeurs simulés (un appel isolé chacun).

## Calcul

Panel brut (oui pondéré par la participation annoncée), sans correction, faute de votations cantonales analogues. Intervalle à 90 % : rééchantillonnage des électeurs combiné à l'erreur du panel brut en validation croisée sur les analogues fédéraux de la v2 (13,9 points).

## Critères, fixés d'avance

1. Écart moyen absolu au oui réel de la commune, comparé à l'écart du résultat cantonal (connu seulement après le vote, c'est la barre haute).
2. Bon camp, comparé à la règle naïve « le résultat suit la recommandation des autorités ».
3. Résultat réel dans l'intervalle à 90 % pour au moins 14 prévisions sur 19.
4. Corrélation positive entre les écarts prévus et les écarts réels d'une commune à l'autre (le panel distingue-t-il Collonge-Bellerive d'Onex ?).

Tous les résultats seront publiés, réussis ou non.
