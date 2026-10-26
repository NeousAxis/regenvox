# Protocole de l'étape scrutins (fixé le 25 octobre 2026, avant que le panel ne vote)

Ce protocole est commité et poussé sur GitHub avant l'exécution du panel. Il fixe d'avance les votations, les familles, les analogues, le calcul et les critères de réussite, pour qu'aucun choix ne puisse être ajusté après avoir vu les réponses.

## Ce qui est testé

1. **Hors échantillon, 27 septembre 2026** : initiative sur la neutralité et initiative sur l'alimentation. Ces votations sont postérieures aux connaissances des modèles (Claude Haiku, connaissances arrêtées en juin 2026). Un contrôle à l'aveugle le 25 octobre 2026 l'a confirmé : interrogé sans outil, le modèle déclare ne pas connaître leurs résultats.
2. **Prévision, 29 novembre 2026** : les quatre objets fédéraux (financement additionnel de l'AVS par la TVA, initiative sur les feux d'artifice, imposition des couples mariés, modification de la loi sur le matériel de guerre). La prévision est publiée dans le registre avant le vote.

Limite assumée pour le 27 septembre : le modèle ignore le résultat, mais nous le connaissons (Vuadens : 28,2 % de oui à la neutralité, 23,2 % à l'alimentation). Pour que cette connaissance ne puisse pas orienter la méthode, l'alimentation est corrigée par la méthode déjà publiée le 25 octobre (famille « contrainte_agriculture » du backtest, commit 465206f), et la neutralité par la même règle des analogues que les objets du 29 novembre. Le vrai test sans aucune connaissance de notre part est celui du 29 novembre.

## Panels

Les personas validés des runs 002 et 003 (37 et 38 électeurs fédéraux, deux tirages indépendants du même panel par quotas). Chaque électeur reçoit son profil, son portrait, les faits publics sur la commune, sa culture politique et la liste des votations, dans l'ordre chronologique, sans résultat, sans rôle ni famille. Un appel isolé par électeur.

## Familles et analogues

Un analogue est une votation passée au résultat connu, de même thème et de même sens du oui. Les analogues ont été choisis sur leur seul intitulé, avant la lecture de leurs résultats à Vuadens.

| Famille | Sens du oui | Analogues | Votations corrigées |
|---|---|---|---|
| avs_tva | relever la TVA pour l'AVS | TVA pour l'AVS 2017, TVA pour l'AVS 2022 | AVS du 29.11.2026 |
| armee | position du Conseil fédéral en faveur de l'équipement militaire | Gripen 2014, avions de combat 2020 | matériel de guerre du 29.11.2026 |
| couples_maries | imposition favorable aux couples mariés | initiative « Pour le couple et la famille » 2016 | couples mariés du 29.11.2026 |
| protection_animale | restriction au nom de la protection des animaux | expérimentation animale 2022, élevage intensif 2022 | feux d'artifice du 29.11.2026 |
| souverainete | souveraineté et indépendance, position de l'UDC | autodétermination 2018, limitation 2020 | neutralité du 27.09.2026 |
| contrainte_agriculture | contraintes sur l'agriculture | les 4 votations de cette famille du backtest (eau potable, pesticides, élevage intensif, biodiversité) | alimentation du 27.09.2026 |

## Calcul (code : src/scrutins.ts)

1. Oui et participation du panel : moyennes pondérées par le poids de chaque électeur, comme dans le backtest.
2. Correction : biais du panel en logit, moyenne de logit(oui réel) moins logit(oui du panel) sur les analogues de la famille, ajouté au logit du panel. Seuls les analogues servent à la correction ; les résultats du 27 septembre ne servent qu'à la comparaison.
3. Les deux panels sont corrigés séparément, puis moyennés.
4. Intervalle à 90 % : 1 000 rééchantillonnages des électeurs (correction recalculée à chaque tirage), combinés à l'erreur résiduelle de la méthode mesurée en validation croisée sur le backtest.
5. Participation : participation annoncée multipliée par le rapport entre participation réelle et annoncée sur les analogues.
6. Contrôle disponible avant le vote : chaque analogue est prédit avec la correction tirée des autres analogues de sa famille, et comparé au résultat cantonal.

## Critères de réussite

27 septembre 2026 (hors échantillon) :
- pour chaque objet, écart au oui réel de Vuadens comparé à l'écart du résultat cantonal (alimentation : 5,1 points ; neutralité : 0,7 point) ;
- bon camp pour les deux objets.

29 novembre 2026 (prévision) : les critères sont écrits dans le fichier `2026-11-29_votations-federales.json`. Critère principal : écart moyen absolu sur le oui de Vuadens, sur les 4 objets, inférieur à celui du résultat cantonal.

Tous les résultats sont publiés, échecs compris.
