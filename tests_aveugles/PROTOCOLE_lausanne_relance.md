# Relance du test de Lausanne avec le champ d'éligibilité corrigé (fixée le 25 octobre 2026, avant les réponses)

Au premier passage, le champ « qui pouvait participer » arrivait aux personas sous la forme « [object Object] » : ils ignoraient les conditions d'âge, de résidence et de nationalité. Le défaut est corrigé (`src/requests.ts`). Tout le reste est identique : même panel (même graine, vérifié octet par octet), mêmes textes, même calcul, mêmes critères que `PROTOCOLE_lausanne.md`.

Limite à connaître : contrairement au premier passage, nous connaissons maintenant les chiffres réels. La relance reste à l'aveugle pour le panel, et aucun réglage n'est fait en dehors de la correction du défaut. Les deux résultats sont publiés côte à côte (`lausanne_bilan.md` et `lausanne_bilan_relance.md`).
