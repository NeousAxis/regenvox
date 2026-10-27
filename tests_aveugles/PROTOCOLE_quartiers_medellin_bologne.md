# Test à l'aveugle par quartier : Medellín et Bologne (fixé le 26 octobre 2026, avant toute donnée)

## Pourquoi

À Genève, le panel a le mieux classé les démarches (corrélation de rang 0,86) mais il en a surestimé le niveau d'un facteur 8. Piste retenue : garder le classement du panel et prendre le niveau chez le modèle seul. Ce test l'essaie pour la première fois, hors de Suisse, sur la question qu'une ville se pose en pratique : dans quels quartiers sa démarche prendra, et dans lesquels elle ne prendra pas.

## Démarches

- **Medellín (Colombie)** : Presupuesto Participativo 2026, vote du 16 au 21 septembre 2026, résultats publiés par territoire (16 comunas et 5 corregimientos). Le vote est postérieur à la date de fin d'apprentissage des modèles utilisés (juin 2026).
- **Bologne (Italie)** : Bilancio Partecipativo 2026, vote du 19 octobre au 9 novembre 2026 à 12 h, en cours. Résultats par quartier (6 quartieri) publiés après la clôture : c'est une vraie prévision.

## Données, à l'aveugle

- Textes de la démarche et données des quartiers (population éligible, âges, sexe, nationalité, strates ou revenus, activités, dernière élection) collectés par des agents séparés, à qui il est interdit d'ouvrir les résultats : `data/medellin_textes.json`, `data/bologne_textes.json`.
- Chiffres publiés relevés par d'autres agents, sous scellé, jamais ouverts avant que les prévisions soient commitées et poussées : `data/SCELLE_medellin_chiffres.json`, `data/SCELLE_bologne_chiffres.json` (pour Bologne, seulement l'édition précédente tant que le vote 2026 n'est pas clos). Contrôle automatique avant les panels : aucun chiffre sous scellé ne doit apparaître dans les textes (`npx tsx src/quartiers.ts fuite <ville>`, qui n'affiche que des décomptes).

## Votes ou votants

Le chiffre publié par quartier peut compter des votes et non des personnes, ou des votes reçus par les projets d'un quartier venus en partie d'habitants d'autres quartiers (cas de Barcelone, et peut-être de Bologne où votent aussi ceux qui travaillent ou étudient dans la ville). La nature exacte du chiffre est relevée par les agents et écrite dans le bilan. Un nombre constant de votes par votant ne change pas le classement des quartiers, mais il change le niveau : l'écart en facteur sera lu en conséquence.

## Méthodes

- **Panel seul** : un panel par territoire, 20 habitants par territoire à Medellín (21 territoires), 30 par quartier à Bologne (6 quartiers). Un appel isolé par habitant (Claude Haiku), avec la même consigne qu'à Lausanne et Genève. Participants prévus = taux pondéré du panel multiplié par la population éligible du territoire.
- **Modèle seul** : Claude Sonnet, un appel par ville, avec le texte de la démarche et les mêmes données des quartiers que les panels.
- **Hybride** : Claude Sonnet, un appel par ville, avec en plus le résumé des réponses des panels et le constat de Genève et de Lausanne (les panels surestiment le niveau).
- **Rang du panel, niveau du modèle** : le total prévu par le modèle seul, réparti entre les territoires comme le panel les répartit. Un calcul, sans appel supplémentaire.
- **Références naïves, hors critères** : la population seule, et l'édition précédente reconduite telle quelle quand ses chiffres par territoire existent.

## Critères, fixés d'avance (Medellín, 21 territoires)

1. Le panel classe les taux de participation des territoires mieux que le hasard : corrélation de rang positive, p < 0,05 au test par permutation.
2. Le panel classe ces taux mieux que le modèle seul.
3. « Rang du panel, niveau du modèle » a un écart médian en facteur plus petit que le panel seul et que le modèle seul.
4. Tout est publié, réussi ou non, y compris la comparaison avec l'édition précédente reconduite.

Bologne : mêmes calculs, lus de façon descriptive (6 quartiers ne suffisent pas pour un test de significativité). Prévision figée et poussée avant la clôture du vote le 9 novembre 2026 à 12 h, comparaison dès la publication des résultats par quartier.
