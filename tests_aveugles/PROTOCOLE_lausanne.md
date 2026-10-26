# Test à l'aveugle : participation aux démarches participatives de Lausanne (fixé le 25 octobre 2026, avant les réponses du panel)

## Ce qui est testé

Le cœur de Résonance : prévoir combien d'habitants participent à une démarche participative, selon la manière dont elle est posée. On rejoue 10 démarches réelles de la Ville de Lausanne (6 éditions du budget participatif de 2019 à 2025, et 4 consultations de 2017 à 2022) dont la participation a été publiée.

## À l'aveugle

- Contrôle fait le 25 octobre 2026 : interrogé sans outil, le modèle des personas déclare ne connaître aucun de ces chiffres.
- Les textes (`data/lausanne_textes.json`) ne contiennent aucun chiffre de participation (contrôle automatique). Les chiffres sont dans `data/SCELLE_lausanne_chiffres.json`, collectés par un agent séparé et non ouverts par le prévisionniste.
- Ordre vérifiable dans l'historique Git : ce protocole et les requêtes, puis les prévisions, puis seulement la comparaison.

## Méthode

Un panel de 73 habitants de Lausanne tiré par quotas (OFS 2025), étrangers et jeunes compris. Chaque persona reçoit les 10 démarches et donne sa probabilité d'y avoir participé. Prévision : taux de participation pondéré par démarche. Référence à battre : un modèle seul (Claude Sonnet, un appel) qui estime directement le nombre de participants à partir des mêmes textes.

## Critères, fixés d'avance

1. Corrélation de rang (Spearman) positive entre le taux prévu et le taux réel (participants publiés rapportés à la population de la ville), avec une probabilité de hasard inférieure à 5 % (permutation).
2. Corrélation du panel supérieure à celle du modèle seul.
3. Niveau : rapport entre taux prévu et taux réel, publié sans critère (le panel surestime la participation, constaté sur les votations).

Limite assumée : les chiffres publiés ne mesurent pas tous la même chose (votants, répondants, contributions) ; chaque texte précise ce qui compte comme participation.
