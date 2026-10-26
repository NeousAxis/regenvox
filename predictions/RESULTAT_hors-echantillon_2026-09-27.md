# Test hors échantillon : votations du 27 septembre 2026 à Vuadens

Exécuté le 25 octobre 2026 selon `PROTOCOLE_scrutins.md` (commit 7002bf3, poussé avant que le panel ne vote). Détail complet : `runs/scrutins/analyse_run-002_run-003.json`.

Ces votations sont postérieures aux connaissances des modèles : interrogé sans outil, Claude Haiku déclare ne pas en connaître le résultat. Limite rappelée : nous connaissions ces résultats en écrivant le protocole ; le test sans aucune connaissance de notre part est la prévision du 29 novembre.

## Résultats (moyenne des panels 002 et 003, 75 électeurs simulés)

| Objet | Panel brut | Panel corrigé | Réel à Vuadens | Écart corrigé | Écart du résultat cantonal |
|---|---|---|---|---|---|
| Initiative sur l'alimentation | 41,3 % | 24,2 % | 23,2 % | 1,0 point | 5,1 points |
| Initiative sur la neutralité | 49,9 % | 49,1 % | 28,2 % | 21,0 points | 0,7 point |

## Lecture

1. **Alimentation : réussi.** Avec la méthode déjà publiée (correction par la famille « contrainte sur l'agriculture », mesurée sur 4 votations du backtest), le moteur fait cinq fois mieux que le résultat cantonal. Les deux panels concordent (25,3 % et 23,1 %). Sans correction, le panel se trompait de 18 points : c'est la correction, pas le panel brut, qui fait la précision.
2. **Neutralité : échec.** Le panel donne 49 % de oui pour 28 % en réalité. Il reste du bon côté (moins de 50 %), mais l'écart est de 21 points. Les personas jugent l'idée de neutralité, populaire en Suisse, et non l'initiative telle qu'elle a été combattue pendant la campagne.
3. **La correction par analogues est fragile hors du domaine agricole.** Chaque analogue, prédit avec la correction tirée de l'autre analogue de sa famille, donne un écart moyen de 11,4 points, contre 7,8 sans correction et 3,9 pour le résultat cantonal. Avec un ou deux analogues, les biais d'une même famille ne se ressemblent pas (autodétermination surestimée, limitation sous-estimée).
4. **Participation surestimée** : 67 % annoncés contre 42 % réels, malgré la correction.

## Ce que cela dit du moteur

Résonance est fiable dans son domaine, les objets agricoles et alimentaires, où le biais du panel est stable et mesuré sur plusieurs votations. Hors de ce domaine, il n'est pas plus fiable qu'un pronostic grossier, et il ne voit pas les effets de campagne. Pour une commune, cela veut dire que le moteur doit être étalonné sur des votations du même thème que la question posée, et que la phase 2 (participation réelle) reste indispensable.

La prévision du 29 novembre 2026 (`2026-11-29_votations-federales.json`) applique le protocole tel que publié ; la valeur brute du panel est publiée à côté, pour vérifier en conditions réelles si la correction aide ou nuit.
