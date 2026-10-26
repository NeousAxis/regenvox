# Protocole de la méthode v2 (fixé le 25 octobre 2026, avant que les panels ne votent)

Ce protocole est commité et poussé sur GitHub avant l'exécution des panels. La méthode v2 corrige les trois faiblesses constatées par le test du 27 septembre 2026 (`RESULTAT_hors-echantillon_2026-09-27.md`). Elle produit une nouvelle prévision, pour six communes romandes ; la prévision v1 de Vuadens reste publiée et inchangée, et les deux seront comparées.

## Les trois corrections

1. **Effet de campagne (échec sur la neutralité).** La v1 ne donnait aux personas que le contenu des objets ; ils jugeaient l'idée, pas le projet combattu en campagne. La v2 leur donne, pour chaque votation, ce que reçoit un électeur réel : la recommandation du Conseil fédéral et du Parlement, le vote du Conseil national, et les mots d'ordre des six principaux partis (source : Swissvotes, Année politique suisse). Pour le 29 novembre, seuls les mots d'ordre publiés au 25 octobre 2026 sont donnés ; les autres sont indiqués « pas encore décidé ».
2. **Correction trop instable (un ou deux analogues par famille).** La v2 utilise 26 analogues, de 4 à 6 par famille, en tenant compte du sens du oui (un oui pour plus d'armée et un oui contre l'armée appartiennent à la même famille, en sens opposés). Le biais de chaque famille est ramené vers zéro d'autant plus qu'il repose sur peu d'analogues : biais = somme des écarts / (nombre d'analogues + k). Le paramètre k est choisi dans la grille 0 ; 0,5 ; 1 ; 2 ; 4 ; 8 ; infini (pas de correction) en minimisant l'écart moyen en validation croisée sur les seuls analogues (chaque analogue prédit sans lui ni les votations du même jour). Ni le 27 septembre ni le 29 novembre n'interviennent dans ce choix.
3. **Participation surestimée (67 % annoncés pour 42 % réels).** Les personas annoncent toujours une forte participation et distinguent mal un scrutin peu suivi d'un scrutin très suivi. La v2 ne garde que le rang : la participation annoncée pour le jour visé est située parmi celles des jours de votation analogues, puis reportée sur la distribution des participations réelles de ces jours dans la commune (correspondance de quantiles). La référence à battre est la médiane de ces participations réelles.

## Communes et panels

Vuadens (FR), Echallens (VD), Savièse (VS), Le Locle (NE), Meyrin (GE), Delémont (JU) : urbain et rural, gauche et droite, toutes les régions romandes. Un panel par commune, par quotas sur les données OFS (STATPOP 2025, élections au Conseil national 2023, relevé agricole 2025), dimensionné pour environ 40 électeurs suisses (38 à 42). Un appel isolé par électeur. Les personas reçoivent leur profil, la commune et ses faits publics, puis les 32 votations dans l'ordre chronologique. Ils ne voient ni rôle, ni famille, ni résultat.

## Familles et analogues (fixés sur le seul intitulé)

| Famille | Analogues (sens du oui) | Votations prédites |
|---|---|---|
| avs_tva | TVA pour l'AVS et l'AI 2004 (+), TVA pour l'AI 2009 (+), TVA pour l'AVS 2017 (+), TVA pour l'AVS 2022 (+) | AVS du 29.11 |
| armee | exportation de matériel de guerre 2009 (−), service militaire obligatoire 2013 (−), Gripen 2014 (+), avions de combat 2020 (+), commerce de guerre 2020 (−), service civil 2026 (+) | matériel de guerre du 29.11 |
| couples_maries | « Pour le couple et la famille » 2016 (+), mariage pour tous 2021 (−), imposition individuelle 2026 (−) | couples mariés du 29.11 |
| protection_animale | vaches à cornes 2018 (+), loi sur la chasse 2020 (−), expérimentation animale 2022 (+), élevage intensif 2022 (+) | feux d'artifice du 29.11 |
| souverainete | immigration de masse 2014 (+), autodétermination 2018 (+), directive sur les armes 2019 (−), limitation 2020 (+), Frontex 2022 (−), 10 millions 2026 (+) | neutralité du 27.09 |
| contrainte_agriculture | eau potable 2021 (+), pesticides 2021 (+), élevage intensif 2022 (+), biodiversité 2024 (+) | alimentation du 27.09 |

Définitions complètes : `data/scrutins_v2.json` ; résultats réels : `cases/<commune>/scrutins_reels_v2.json` (données ouvertes OFS). Code : `src/scrutins2.ts`. Construction des données : `scripts/build_scrutins_v2.py` et `scripts/build_communes_v2.py`.

## Intervalle

Rééchantillonnage des électeurs (500 tirages, correction et participation recalculées à chaque tirage), combiné à l'erreur quadratique moyenne de validation croisée des analogues pour le k retenu.

## Critères de réussite

Écrits dans `2026-11-29_votations-federales_romandie.json`. Critère principal : écart moyen absolu sur le oui, sur les 24 prévisions, inférieur à celui du résultat cantonal de chaque commune. Sont aussi testés : bon camp, couverture des intervalles, apport de la correction face au panel brut, participation face à la médiane historique, et v2 face à v1 pour Vuadens.

Le 27 septembre est rejoué à titre de contrôle seulement : nous en connaissions le résultat en concevant la v2, ce n'est donc pas un test indépendant. Le seul test indépendant est le 29 novembre. Tous les résultats seront publiés, échecs compris.
