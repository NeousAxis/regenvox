# Méthode v2 : contrôle sur le 27 septembre 2026 (six communes)

Exécuté le 25 octobre 2026 selon `PROTOCOLE_scrutins_v2.md` (commit e016514, poussé avant que les panels ne votent). 244 électeurs simulés, un panel par commune. Détail : `runs/scrutins/analyse_v2.json`.

Ce n'est pas un test indépendant : la v2 a été conçue après avoir vu l'échec de la v1 sur ce scrutin. Le test indépendant est la prévision du 29 novembre (`2026-11-29_votations-federales_romandie.json`).

## Écart moyen au oui réel (points), six communes

| | Panel brut | Panel corrigé | Résultat cantonal |
|---|---|---|---|
| Neutralité | 8,7 | 7,2 | 3,8 |
| Alimentation | 5,1 | 7,1 | 3,3 |
| Participation | 16,8 (correspondance de quantiles) | | 6,9 (médiane historique) |

## Ce qui a marché, ce qui n'a pas marché

1. **Contexte de campagne : la vraie amélioration.** À Vuadens, le panel brut passe de 50 % à 42 % de oui sur la neutralité (réel 28 %) et de 41 % à 28 % sur l'alimentation (réel 23 %). Sur six communes, le panel brut se trompe de 5 à 9 points en moyenne, contre 18 à 22 en v1 à Vuadens.
2. **Correction par familles : apport faible et irrégulier.** En validation croisée sur les analogues, elle ramène l'écart de 10,8 à 9,9 points (k = 1). Sur le 27.09, elle aide pour la neutralité et nuit pour l'alimentation.
3. **Participation : échec.** Les personas jugent la journée du 27.09 très mobilisatrice, alors que la participation réelle a été faible ; la correspondance de quantiles ne fait pas mieux que la simple médiane historique de la commune (7,9 contre 7,8 sur les jours analogues, 16,8 contre 6,9 sur le 27.09). Conclusion : le panel ne sait pas prévoir la participation. La médiane historique, publiée à côté de la prévision, est la meilleure estimation disponible.
4. **Le résultat cantonal reste meilleur**, mais il n'est connu qu'après le vote : il sert de barre haute, pas de concurrent réel.
