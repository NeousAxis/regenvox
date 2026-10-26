# Test à l'aveugle : quelles pétitions mobilisent le plus ? (fixé le 25 octobre 2026, avant les réponses des panels)

## Ce qui est testé

La promesse de Résonance : dire à l'avance quelle formulation mobilise le plus. Ici, sans toucher personne, on rejoue 20 mobilisations réelles déjà lancées : les 20 premières pétitions en français listées sur act.campax.org, lancées entre le 1er juillet et le 30 septembre 2026, adressées à une autorité suisse. La sélection suit l'ordre du site, sans tri selon les signatures.

## À l'aveugle

- Le modèle des personas a des connaissances arrêtées en juin 2026 : ces pétitions lui sont inconnues.
- Les textes (`data/mobilisations_textes.json`) ne contiennent aucun chiffre de signatures, contrôle automatique fait. Les signatures relevées le 25 octobre 2026 sont dans `data/SCELLE_mobilisations_chiffres.json`, collectées par un agent séparé et non ouvertes par le prévisionniste.
- Ordre vérifiable dans l'historique Git : ce protocole et les requêtes, puis les prévisions (`mobilisations_previsions.json`), puis seulement la comparaison (`src/mobilisations.ts comparer`).

## Méthode

Trois panels de communes romandes (Meyrin, Yverdon-les-Bains, Savièse ; 120 électeurs, un appel isolé chacun). Chaque persona reçoit les 20 pétitions et donne sa probabilité de signer et de partager. Indice principal : probabilité moyenne de signer (pondérée, chaque panel pesant autant). Indice secondaire : signer multiplié par un plus la probabilité de partager. Référence à battre : un modèle seul (Claude Sonnet, un seul appel) qui estime directement le nombre de signatures de chaque pétition à partir des mêmes textes.

## Critères, fixés d'avance

1. Corrélation de rang (Spearman) positive entre l'indice du panel et les signatures réelles, avec une probabilité de hasard inférieure à 5 % (test par permutation).
2. Corrélation du panel supérieure à celle du modèle seul.
3. Au moins 3 des 5 pétitions prévues en tête parmi les 5 qui ont réellement le plus mobilisé.

Limite assumée : les signatures dépendent aussi de la diffusion par le porteur (taille de son réseau), que le texte ne montre pas.
