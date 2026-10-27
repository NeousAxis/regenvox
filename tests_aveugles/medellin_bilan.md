# Test à l'aveugle par quartier : Medellín

Généré par `npx tsx src/quartiers.ts comparer medellin`, après le commit des prévisions (historique Git de `tests_aveugles/`). Chiffre publié : votants.

| Quartier | Population éligible | Panel seul | Modèle seul | Hybride | Rang du panel, niveau du modèle | Édition précédente | Réel |
|---|---|---|---|---|---|---|---|
| San Sebastián de Palmitas | 4956 | 385 | 600 | 198 | 293 | 1157 | 1407 |
| Popular | 117633 | 8670 | 7600 | 4000 | 6597 | 25383 | 14037 |
| Santa Elena | 20077 | 1650 | 1800 | 1004 | 1256 | 2389 | 2316 |
| Castilla | 117367 | 9143 | 6400 | 3521 | 6957 | 12750 | 9641 |
| Altavista | 33937 | 2359 | 2700 | 1120 | 1795 | 2710 | 2726 |
| Guayabal | 63674 | 3770 | 2900 | 1464 | 2868 | 5139 | 4463 |
| La América | 86691 | 6259 | 3500 | 2254 | 4763 | 6998 | 5913 |
| La Candelaria | 75161 | 5750 | 2300 | 2030 | 4375 | 5431 | 4981 |
| San Javier | 141279 | 9748 | 9200 | 4521 | 7418 | 10107 | 8778 |
| Robledo | 171163 | 13316 | 8600 | 5648 | 10133 | 11851 | 10294 |
| San Antonio de Prado | 84827 | 5675 | 5500 | 2714 | 4318 | 5945 | 4735 |
| San Cristóbal | 101518 | 6761 | 6600 | 3046 | 5145 | 5999 | 5611 |
| Belén | 197064 | 13184 | 7900 | 5321 | 10032 | 10617 | 10147 |
| Laureles-Estadio | 104805 | 7326 | 3100 | 2515 | 5575 | 6482 | 5199 |
| Manrique | 147011 | 10232 | 8800 | 4410 | 7786 | 13125 | 7245 |
| Doce de Octubre | 161803 | 11504 | 8900 | 5016 | 8754 | 10241 | 7943 |
| Buenos Aires | 144490 | 10172 | 7900 | 4190 | 7741 | 9544 | 6877 |
| Santa Cruz | 98893 | 5617 | 6400 | 2275 | 4274 | 5793 | 4691 |
| Villa Hermosa | 135398 | 8124 | 8800 | 3250 | 6182 | 6747 | 6191 |
| Aranjuez | 130765 | 9219 | 7200 | 3661 | 7015 | 6309 | 5940 |
| El Poblado | 108324 | 6597 | 1600 | 1300 | 5020 | 3236 | 2450 |

| Méthode | Rang des taux (Spearman) | p (permutation) | Rang des nombres | Écart médian (facteur) |
|---|---|---|---|---|
| panel | 0,5455 | 0,0055 | 0,887 | 1,2993 |
| modele seul | 0,313 | 0,0828 | 0,8274 | 1,2867 |
| hybride | 0,6143 | 0,0023 | 0,9208 | 1,9416 |
| rang panel niveau modele | 0,5455 | 0,0055 | 0,887 | 1,1385 |
| reference population seule |  |  | 0,8455 |  |
| reference edition precedente | 0,8831 |  | 0,961 | 1,1835 |
