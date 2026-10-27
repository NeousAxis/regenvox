// Généré par scripts/calibration.ts à partir des bilans des tests à l'aveugle. Ne pas modifier à la main.
export const CALIBRATION = {
  "genere_le": "2026-10-27",
  "methode": "estimation directe du nombre de participants par le modèle seul, à partir du texte de la démarche",
  "demarches": {
    "n": 41,
    "facteur_median": 1.42,
    "dans_un_facteur_2": 33,
    "dans_un_facteur_3": 38,
    "facteur_max": 6.06,
    "surestimations": 18,
    "sources": [
      "tests_aveugles/lausanne_bilan_relance.json",
      "tests_aveugles/geneve_bilan.json",
      "tests_aveugles/medellin_bilan.json"
    ]
  },
  "petitions": {
    "n": 20,
    "facteur_median": 2.23,
    "dans_un_facteur_2": 10,
    "dans_un_facteur_3": 12,
    "facteur_max": 77.78,
    "surestimations": 13,
    "sources": [
      "tests_aveugles/mobilisations_bilan.json"
    ]
  }
} as const;
