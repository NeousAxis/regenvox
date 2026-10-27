# Registre des prévisions RegenVox

Ce registre sert à prouver que le moteur prédit, et pas seulement qu'il explique après coup. Une prévision n'a de valeur que si elle est publiée **avant** l'événement et **jamais modifiée** ensuite.

## Règles

1. Une prévision est un fichier `predictions/<date de l'événement>_<sujet>.json`, au format décrit plus bas.
2. Elle est commitée et poussée sur GitHub avant l'événement. La date de réception du push par GitHub fait foi (journal d'activité du dépôt, horodaté par GitHub).
3. Le fichier n'est plus jamais modifié. Une erreur se corrige par une nouvelle prévision, publiée elle aussi avant l'événement, qui mentionne celle qu'elle remplace.
4. Les critères de réussite sont écrits dans la prévision elle-même, avant l'événement.
5. Les résultats officiels sont ajoutés après coup dans `predictions/resultats/<même nom>.json`, avec leur source.
6. Le bilan publie tout, échecs compris.

## Commandes

```bash
npx tsx src/registre.ts verifier
npx tsx src/registre.ts bilan
```

`verifier` contrôle le format, que la publication précède l'événement, que le fichier n'a pas changé depuis son premier commit, et la date de push enregistrée par GitHub. `bilan` compare les prévisions aux résultats et écrit `predictions/BILAN.md`.

## Format d'une prévision

```json
{
  "id": "2026-11-29_votations-federales",
  "publie_le": "2026-10-26",
  "evenement": { "type": "votation_federale", "date": "2026-11-29", "description": "Votations fédérales du 29 novembre 2026" },
  "methode": { "moteur": "RegenVox", "runs": ["run-004"], "correction": "par famille de votations, en validation croisée" },
  "criteres_reussite": ["Écart moyen sur le oui inférieur à celui du résultat cantonal, toutes communes confondues"],
  "previsions": [
    { "commune": "Vuadens", "objet": "v2026-11-exemple", "titre": "Titre officiel", "oui_pct": 41.0, "intervalle_pct": [33.0, 49.0], "participation_pct": 44.0 }
  ]
}
```

## Format d'un résultat

```json
{
  "id": "2026-11-29_votations-federales",
  "renseigne_le": "2026-11-30",
  "source": "OFS, résultats officiels par commune (voteinfo)",
  "resultats": [
    { "commune": "Vuadens", "objet": "v2026-11-exemple", "oui_pct": 38.2, "participation_pct": 41.5, "canton_oui_pct": 44.0 }
  ]
}
```
