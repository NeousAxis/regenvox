#!/usr/bin/env python3
# Construit data/scrutins_v2.json (votations communes à toutes les communes, avec recommandations officielles et mots d'ordre)
# et cases/<cas>/scrutins_reels_v2.json (résultats officiels par commune).
# Sources : données ouvertes OGD voteinfo (OFS / Chancellerie fédérale) et jeu de données Swissvotes (Année politique suisse).
# Usage : python3 -I scripts/build_scrutins_v2.py <dossier des téléchargements> <racine resonance>
import csv, json, os, sys

DL, ROOT = sys.argv[1], sys.argv[2]

COMMUNES = {  # cas : (numéro OFS, numéro du canton dans les fichiers OGD)
    "vuadens-bio": (2160, 10),
    "echallens": (5518, 22),
    "saviese": (6265, 23),
    "le-locle": (6436, 24),
    "meyrin": (6630, 25),
    "delemont": (6711, 26),
}

MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]

# vote_id, jour OGD, objet OGD, numéro Swissvotes, rôle, familles [(famille, sens)], résumé neutre.
# sens = +1 si le oui va dans le sens de la famille, -1 sinon. Familles et sens fixés sur le seul intitulé.
V = [
    ("a2004-avs-tva", "20040516", 5080, "508", "analogue", [("avs_tva", 1)], "Relèvement de la TVA en faveur de l'AVS et de l'AI, lié à la 11e révision de l'AVS soumise au vote le même jour."),
    ("a2009-ai-tva", "20090927", 5430, "543", "analogue", [("avs_tva", 1)], "Relèvement temporaire de la TVA (0,4 point pour le taux normal) de 2011 à 2017 pour assainir l'assurance-invalidité."),
    ("a2009-exportation", "20091129", 5460, "546", "analogue", [("armee", -1)], "Demandait d'interdire l'exportation de matériel de guerre et de biens militaires spécifiques, avec des aides à la reconversion pour les régions et les employés touchés."),
    ("a2013-service", "20130922", 5720, "572", "analogue", [("armee", -1)], "Demandait d'abolir l'obligation de servir dans l'armée et de la remplacer par un service militaire volontaire."),
    ("a2014-immigration", "20140209", 5800, "580", "analogue", [("souverainete", 1)], "Demandait que la Suisse gère de manière autonome l'immigration au moyen de plafonds et de contingents annuels, et renégocie les traités contraires, dont la libre circulation des personnes avec l'UE."),
    ("a2014-gripen", "20140518", 5840, "584", "analogue", [("armee", 1)], "Créait un fonds alimenté par le budget de l'armée pour acheter 22 avions de combat Gripen destinés à remplacer les F-5 Tiger. Un référendum avait été lancé contre cette loi."),
    ("a2016-couple", "20160228", 5960, "596", "analogue", [("couples_maries", 1)], "Demandait d'inscrire dans la Constitution que le mariage est l'union durable d'un homme et d'une femme formant une communauté économique, et que les couples mariés ne soient pas désavantagés par rapport aux autres formes de vie commune, notamment en matière d'impôts et d'assurances sociales."),
    ("a2017-avs-tva", "20170924", 6140, "614", "analogue", [("avs_tva", 1)], "Volet financier de la réforme Prévoyance vieillesse 2020 : relèvement progressif de la TVA de 0,6 point au plus en faveur de l'AVS, lié à la réforme soumise au vote le même jour (âge de la retraite des femmes porté à 65 ans, supplément de 70 francs sur les nouvelles rentes AVS)."),
    ("a2018-vaches", "20181125", 6230, "623", "analogue", [("protection_animale", 1)], "Demandait que la Confédération verse une contribution aux détenteurs de vaches, de taureaux reproducteurs, de chèvres et de boucs qui laissent les cornes à leurs animaux."),
    ("a2018-autodetermination", "20181125", 6240, "624", "analogue", [("souverainete", 1)], "Demandait que la Constitution fédérale prime sur le droit international, sauf règles impératives, et que les traités contraires à la Constitution soient renégociés et au besoin dénoncés."),
    ("a2019-armes", "20190519", 6280, "628", "analogue", [("souverainete", -1)], "Reprenait la directive de l'UE sur les armes (accord de Schengen) : autorisation exceptionnelle pour certaines armes semi-automatiques, avec des exceptions pour les tireurs et l'arme d'ordonnance. Un référendum avait été lancé."),
    ("a2020-limitation", "20200927", 6310, "631", "analogue", [("souverainete", 1)], "Demandait que la Suisse règle de manière autonome l'immigration des étrangers et mette fin à l'accord sur la libre circulation des personnes avec l'Union européenne, par la négociation ou, à défaut, par une dénonciation."),
    ("a2020-chasse", "20200927", 6320, "632", "analogue", [("protection_animale", -1)], "Révisait la loi sur la chasse : régulation facilitée d'espèces protégées comme le loup avant qu'elles ne causent des dégâts. Un référendum avait été lancé par des organisations de protection de la nature."),
    ("a2020-avions", "20200927", 6350, "635", "analogue", [("armee", 1)], "Autorisait l'achat de nouveaux avions de combat pour un montant maximal de 6 milliards de francs, le choix du modèle restant au Conseil fédéral. Un référendum avait été lancé contre cet arrêté."),
    ("a2020-materiel", "20201129", 6370, "637", "analogue", [("armee", -1)], "Demandait d'interdire à la Banque nationale, aux fondations et aux caisses de pension de financer les entreprises qui réalisent plus de 5 % de leur chiffre d'affaires avec du matériel de guerre."),
    ("a2021-eau", "20210613", 6410, "641", "analogue", [("contrainte_agriculture", 1)], "Demandait de réserver les paiements directs aux exploitations sans pesticides, sans antibiotiques à titre préventif et nourrissant leurs animaux avec le fourrage de l'exploitation."),
    ("a2021-pesticides", "20210613", 6420, "642", "analogue", [("contrainte_agriculture", 1)], "Demandait d'interdire l'utilisation de pesticides de synthèse dans l'agriculture et l'entretien du paysage, ainsi que l'importation de denrées produites avec ces pesticides, dans un délai de dix ans."),
    ("a2021-mariage", "20210926", 6470, "647", "analogue", [("couples_maries", -1)], "Ouvrait le mariage civil aux couples de même sexe, y compris l'accès au don de sperme pour les couples de femmes mariées. Un référendum avait été lancé."),
    ("a2022-experimentation", "20220213", 6510, "651", "analogue", [("protection_animale", 1)], "Demandait d'interdire l'expérimentation animale et les essais sur l'être humain, ainsi que l'importation de nouveaux produits développés grâce à de telles expériences."),
    ("a2022-frontex", "20220515", 6570, "657", "analogue", [("souverainete", -1)], "Augmentait la participation financière et en personnel de la Suisse à Frontex, l'agence européenne de garde-frontières et de garde-côtes (accord de Schengen). Un référendum avait été lancé."),
    ("a2022-elevage", "20220925", 6580, "658", "analogue", [("protection_animale", 1), ("contrainte_agriculture", 1)], "Demandait d'inscrire la protection de la dignité des animaux de rente dans la Constitution, avec des exigences au moins équivalentes au cahier des charges Bio Suisse de 2018, aussi pour les importations, et une transition pouvant aller jusqu'à 25 ans."),
    ("a2022-avs-tva", "20220925", 6590, "659", "analogue", [("avs_tva", 1)], "Volet financier de la réforme AVS 21 : relèvement de la TVA de 0,4 point (0,1 point pour le taux réduit) en faveur de l'AVS, lié à la modification de la loi sur l'AVS soumise au vote le même jour (âge de référence des femmes porté à 65 ans, mesures de compensation)."),
    ("a2024-biodiversite", "20240922", 6710, "671", "analogue", [("contrainte_agriculture", 1)], "Demandait que la Confédération et les cantons protègent davantage la biodiversité, les paysages et le patrimoine bâti, avec plus de surfaces et de moyens consacrés à la nature."),
    ("a2026-imposition", "20260308", 6850, "685", "analogue", [("couples_maries", -1)], "Introduisait l'imposition individuelle : chaque personne mariée serait imposée sur ses propres revenus et sa propre fortune, comme les personnes non mariées, aux niveaux fédéral et cantonal. Un référendum avait été lancé."),
    ("a2026-10-millions", "20260614", 6860, "686", "analogue", [("souverainete", 1)], "Demandait que la population résidante permanente de la Suisse ne dépasse pas 10 millions d'habitants avant 2050, avec des mesures sur l'asile et le regroupement familial et, en dernier recours, la dénonciation de la libre circulation des personnes."),
    ("a2026-service-civil", "20260614", 6870, "687", "analogue", [("armee", 1)], "Durcissait les conditions d'admission au service civil pour les personnes déjà incorporées dans l'armée, afin de limiter les départs de l'armée. Un référendum avait été lancé."),
    ("h2026-neutralite", "20260927", 6880, "688", "hors_echantillon", [("souverainete", 1)], "Demande d'inscrire dans la Constitution une neutralité perpétuelle et armée : pas d'adhésion à une alliance militaire ou défensive ni de coopération avec une telle alliance, sauf en cas d'attaque contre la Suisse ; pas de sanctions contre un État belligérant, sous réserve de celles de l'ONU et des mesures contre leur contournement ; recours à la neutralité pour la médiation."),
    ("h2026-alimentation", "20260927", 6890, "689", "hors_echantillon", [("contrainte_agriculture", 1)], "Demande qu'au moins 70 % des aliments consommés en Suisse soient produits dans le pays d'ici dix ans, en produisant moins d'aliments d'origine animale et davantage d'aliments végétaux, avec moins de produits phytosanitaires et d'engrais, et une meilleure protection de l'eau potable, des sols et de la biodiversité."),
    ("p2026-avs-tva", "20261129", None, "690", "prevision", [("avs_tva", 1)], "Relèvement de la TVA de 0,4 point pour financer en partie la 13e rente AVS acceptée par le peuple en mars 2024 (recettes estimées à 1,4 milliard de francs par an, denrées alimentaires et médicaments non touchés), au plus tôt dès 2028."),
    ("p2026-feux", "20261129", None, "691", "prevision", [("protection_animale", 1)], "Demande d'interdire la vente et l'utilisation des pièces d'artifice qui causent du bruit, pour protéger la population, les animaux et la nature. Les pièces peu bruyantes resteraient autorisées, et les cantons pourraient accorder des exceptions pour de grandes fêtes comme le 1er août, sans usage privé de pièces bruyantes."),
    ("p2026-couples", "20261129", None, "692", "prevision", [("couples_maries", 1)], "Le peuple a accepté le 8 mars 2026 l'imposition individuelle, applicable dès 2032. L'initiative demande au contraire d'inscrire dans la Constitution l'imposition commune des couples mariés pour l'impôt fédéral direct, avec la garantie qu'ils ne soient pas désavantagés par rapport aux autres contribuables (allègement estimé entre 680 millions et 3 milliards de francs par an)."),
    ("p2026-materiel-guerre", "20261129", None, "693", "prevision", [("armee", 1)], "Assouplit les règles d'exportation d'armes : livraison possible à un État partenaire impliqué dans un conflit armé si elle est compatible avec la neutralité et les intérêts de la Suisse, dérogation possible du Conseil fédéral en cas de circonstances exceptionnelles, et fin de l'obligation systématique pour l'acheteur de ne pas réexporter sans accord suisse. Un référendum a été lancé contre ces modifications."),
]

TITRES_29_11 = {
    "690": "Arrêté fédéral sur le financement additionnel de l'AVS par le biais d'un relèvement de la TVA",
    "691": "Initiative populaire « Pour une limitation des feux d'artifice »",
    "692": "Initiative populaire « Oui à des impôts fédéraux équitables pour les couples mariés, pour enfin en finir avec la discrimination du mariage ! »",
    "693": "Modification de la loi fédérale sur la matériel de guerre".replace("la matériel", "le matériel"),
}

PAROLE = {"1": "oui", "2": "non", "3": "pas de mot d'ordre", "4": "bulletin blanc", "5": "liberté de vote", "": "pas encore décidé"}
PARTIS = [("p-svp", "UDC"), ("p-sps", "PS"), ("p-fdp", "PLR"), ("p-cvp", "PDC"), ("p-mitte", "Le Centre"), ("p-gps", "Vert-e-s"), ("p-glp", "Vert'libéraux")]


def propre(t):
    return t.replace(" – ", ", ").replace(" - ", ", ").replace("per le biais", "par le biais").replace("I'abrogation", "l'abrogation")


def date_fr(j):
    return f"{int(j[6:8])} {MOIS[int(j[4:6]) - 1]} {j[:4]}".replace("1 ", "1er ", 1) if j[6:8] == "01" else f"{int(j[6:8])} {MOIS[int(j[4:6]) - 1]} {j[:4]}"


sv = {r["anr"]: r for r in csv.DictReader(open(os.path.join(DL, "swissvotes", "sv.csv"), encoding="utf-8-sig"), delimiter=";")}
ogd = {}
for jour in sorted({v[1] for v in V}):
    p = os.path.join(DL, f"vote{jour}", "v.json")
    if os.path.exists(p) and os.path.getsize(p) > 1000:
        ogd[jour] = json.load(open(p, encoding="utf-8"))

votations = []
for vid, jour, objet, anr, role, familles, resume in V:
    r = sv[anr]
    if objet is not None:
        o = next(x for x in ogd[jour]["schweiz"]["vorlagen"] if x["vorlagenId"] == objet)
        titre = propre(next(t["text"] for t in o["vorlagenTitel"] if t["langKey"] == "fr"))
    else:
        titre = TITRES_29_11[anr]
    reco = {"1": "oui", "2": "non"}[r["br-pos"]]
    paroles = []
    for col, nom in PARTIS:
        code = r[col].strip()
        if code in ("9999", "."):
            continue
        paroles.append(f"{nom} {PAROLE.get(code, 'pas de mot d’ordre')}")
    campagne = f"Recommandation du Conseil fédéral et du Parlement : {reco} (Conseil national : {r['nrja']} oui, {r['nrnein']} non). Mots d'ordre des partis : {', '.join(paroles)}."
    votations.append({"vote_id": vid, "date": date_fr(jour), "jour": jour, "objet_ogd": objet, "swissvotes": anr, "role": role, "familles": [{"famille": f, "sens": s} for f, s in familles], "titre": titre, "resume_neutre": resume, "campagne": campagne})

meta = {
    "_note": "Votations de l'étape scrutins2, communes à toutes les communes. Rôles, familles et sens ne sont jamais montrés aux personas. Recommandations et mots d'ordre : Swissvotes (Année politique suisse), état au 25.10.2026 ; « pas encore décidé » signifie que le parti n'avait pas publié de mot d'ordre à cette date. Titres : données ouvertes OGD (OFS), tirets remplacés par des virgules.",
    "votations": votations,
}
json.dump(meta, open(os.path.join(ROOT, "data", "scrutins_v2.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

for cas, (num, kt) in COMMUNES.items():
    res = []
    for v in votations:
        if v["objet_ogd"] is None:
            continue
        o = next(x for x in ogd[v["jour"]]["schweiz"]["vorlagen"] if x["vorlagenId"] == v["objet_ogd"])
        canton = next(k for k in o["kantone"] if int(k["geoLevelnummer"]) == kt)
        com = next((g for g in canton["gemeinden"] if int(g["geoLevelnummer"]) == num), None)
        if com is None or com["resultat"]["jaStimmenInProzent"] is None:
            print(f"{cas} : pas de résultat pour {v['vote_id']}")
            continue
        res.append({
            "vote_id": v["vote_id"],
            "commune_oui": round(com["resultat"]["jaStimmenInProzent"], 2),
            "commune_participation": round(com["resultat"]["stimmbeteiligungInProzent"], 2),
            "canton_oui": round(canton["resultat"]["jaStimmenInProzent"], 2),
            "suisse_oui": round(o["resultat"]["jaStimmenInProzent"], 2),
            "commune_nom_ogd": com["geoLevelname"],
            "source": f"https://ogd-static.voteinfo-app.ch/v1/ogd/sd-t-17-02-{v['jour']}-eidgAbstimmung.json (objet {v['objet_ogd']}, commune {num})",
        })
    os.makedirs(os.path.join(ROOT, "cases", cas), exist_ok=True)
    json.dump({"_note": "Résultats officiels (données ouvertes OFS / Chancellerie fédérale), lus le 25.10.2026. Seules les votations de rôle analogue servent à la correction.", "commune": num, "resultats": res}, open(os.path.join(ROOT, "cases", cas, "scrutins_reels_v2.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(cas, len(res), "résultats")
print(len(votations), "votations")
