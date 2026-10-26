# Test à l'aveugle de la méthode hybride sur 10 démarches participatives genevoises (fixé le 25 octobre 2026, avant les réponses)

## Pourquoi

À Lausanne et sur les pétitions, un modèle seul a mieux classé le niveau de mobilisation que le panel, tandis que le panel restait meilleur sur les différences entre communes. Cyril a retenu une méthode hybride : le modèle estime le niveau de mobilisation après avoir lu les réponses du panel. Ce test la compare au panel seul et au modèle seul.

## Données, à l'aveugle

10 démarches de communes genevoises (Lancy, Thônex, Meyrin, Le Grand-Saconnex, Genève Jonction, Carouge, Versoix, Veyrier), 2023 à 2025, collectées par un agent séparé. Textes sans chiffres (`data/geneve_textes.json`, contrôle automatique : la mesure publiée n'apparaît dans aucun texte). Chiffres sous scellé (`data/SCELLE_geneve_chiffres.json`), jamais ouverts.

## Méthode

- **Panel seul** : un panel de 30 habitants par commune (OFS 2025), un appel isolé par habitant ; participants prévus = taux pondéré multiplié par les habitants de 16 ans et plus.
- **Modèle seul** : Claude Sonnet, un appel, à partir des textes et de la population des communes.
- **Hybride** : Claude Sonnet, un appel, avec en plus le résumé des réponses du panel par démarche (taux, part d'habitants motivés, raisons tirées au hasard) et le constat de Lausanne (les panels surestiment la participation, d'un facteur médian de 2,7).

## Critères, fixés d'avance

1. L'hybride bat le modèle seul sur la corrélation de rang avec la participation réelle.
2. L'hybride bat le modèle seul sur l'écart médian en facteur multiplicatif.
3. Les trois méthodes sont publiées, réussies ou non.
