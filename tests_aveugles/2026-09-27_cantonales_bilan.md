# Test à l'aveugle : votations cantonales du 27 septembre 2026 (Vaud et Genève)

Généré par `npx tsx src/cantonales.ts comparer`, après le commit des prévisions (voir l'historique Git de `tests_aveugles/`).

| Commune | Objet | Prévu | Réel | Écart | Écart du résultat cantonal | Dans l'intervalle |
|---|---|---|---|---|---|---|
| Echallens | Initiative populaire « Baisse d'impôts pour tous, redonner du pouvoir  | 38,0 % | 50,7 % | 12,7 | 2,4 | oui |
| Yverdon-les-Bains | Initiative populaire « Baisse d'impôts pour tous, redonner du pouvoir  | 36,7 % | 45,3 % | 8,6 | 7,9 | oui |
| Nyon | Initiative populaire « Baisse d'impôts pour tous, redonner du pouvoir  | 33,1 % | 53,5 % | 20,4 | 0,3 | oui |
| Meyrin | Initiative populaire 198 « Pour une contraception gratuite » | 51,5 % | 58,5 % | 7,0 | 0,1 | oui |
| Meyrin | Loi 13725 ouvrant un crédit de 39,5 millions de francs pour accélérer  | 56,1 % | 47,0 % | 9,1 | 9,7 | oui |
| Meyrin | Loi 13025 modifiant la LDTR, pour que les locataires puissent devenir, | 40,4 % | 33,0 % | 7,4 | 3,5 | oui |
| Meyrin | Loi 13579 accordant une indemnité à la Haute école spécialisée de Suis | 47,7 % | 37,7 % | 10,0 | 3,7 | oui |
| Carouge | Initiative populaire 198 « Pour une contraception gratuite » | 58,1 % | 64,0 % | 5,9 | 5,5 | oui |
| Carouge | Loi 13725 ouvrant un crédit de 39,5 millions de francs pour accélérer  | 63,1 % | 57,6 % | 5,5 | 0,8 | oui |
| Carouge | Loi 13025 modifiant la LDTR, pour que les locataires puissent devenir, | 37,0 % | 33,3 % | 3,7 | 3,1 | oui |
| Carouge | Loi 13579 accordant une indemnité à la Haute école spécialisée de Suis | 45,5 % | 36,1 % | 9,4 | 5,4 | oui |
| Onex | Initiative populaire 198 « Pour une contraception gratuite » | 49,6 % | 59,1 % | 9,5 | 0,6 | oui |
| Onex | Loi 13725 ouvrant un crédit de 39,5 millions de francs pour accélérer  | 51,8 % | 47,7 % | 4,1 | 9,1 | oui |
| Onex | Loi 13025 modifiant la LDTR, pour que les locataires puissent devenir, | 38,5 % | 33,6 % | 4,9 | 2,8 | oui |
| Onex | Loi 13579 accordant une indemnité à la Haute école spécialisée de Suis | 45,1 % | 37,5 % | 7,6 | 4,0 | oui |
| Collonge-Bellerive | Initiative populaire 198 « Pour une contraception gratuite » | 39,5 % | 47,5 % | 8,0 | 11,0 | oui |
| Collonge-Bellerive | Loi 13725 ouvrant un crédit de 39,5 millions de francs pour accélérer  | 56,6 % | 59,6 % | 3,0 | 2,8 | oui |
| Collonge-Bellerive | Loi 13025 modifiant la LDTR, pour que les locataires puissent devenir, | 47,3 % | 49,7 % | 2,4 | 13,2 | oui |
| Collonge-Bellerive | Loi 13579 accordant une indemnité à la Haute école spécialisée de Suis | 59,4 % | 58,1 % | 1,3 | 16,6 | oui |

Écart moyen : 7,4 points, contre 5,4 pour le résultat cantonal (connu seulement après le vote). Bon camp : 14/19 (suivre la recommandation des autorités : 5/19). Résultat réel dans l'intervalle : 19/19. Corrélation entre écarts prévus et réels d'une commune à l'autre : 0.84 (19 couples).
