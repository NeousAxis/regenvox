# Test à l'aveugle de la méthode hybride : 10 démarches participatives genevoises

Généré par `npx tsx src/geneve.ts comparer`, après le commit des prévisions (historique Git de `tests_aveugles/`).

| Démarche | Commune | Panel seul | Modèle seul | Hybride | Réel |
|---|---|---|---|---|---|
| gen03 | Meyrin | 1210 | 400 | 450 | 1027 |
| gen01 | Lancy | 844 | 110 | 120 | 200 |
| gen06 | Genève | 3387 | 500 | 500 | 200 |
| gen02 | Thônex | 405 | 80 | 70 | 150 |
| gen10 | Veyrier | 452 | 80 | 70 | 130 |
| gen07 | Carouge | 511 | 40 | 45 | 65 |
| gen04 | Le Grand-Saconnex | 480 | 250 | 170 | 46 |
| gen05 | Le Grand-Saconnex | 361 | 200 | 120 | 33 |
| gen09 | Versoix | 265 | 25 | 25 | 32 |
| gen08 | Meyrin | 351 | 35 | 30 | 25 |

| Méthode | Corrélation de rang avec le réel | Écart médian (facteur) |
|---|---|---|
| panel | 0,8571 | 8,0714 |
| modele seul | 0,6585 | 1,8466 |
| hybride | 0,6942 | 2 |
