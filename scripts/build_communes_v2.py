#!/usr/bin/env python3
# Construit cases/<cas>/case.json et panel.json pour les communes de l'étape scrutins2, à partir des données ouvertes OFS :
# STATPOP 2025 (px-x-0102010000_101), élections au Conseil national 2023 (force des partis par commune),
# relevé des structures agricoles 2025 (px-x-0702000000_104).
# Usage : python3 -I scripts/build_communes_v2.py <dossier des téléchargements> <racine du moteur>
import itertools, json, os, sys

DL, ROOT = sys.argv[1], sys.argv[2]

COMMUNES = {
    "echallens": dict(num=5518, nom="Echallens", canton="VD", nom_canton="Vaud", description="Commune du canton de Vaud, chef-lieu du district du Gros-de-Vaud, bourg régional au nord de Lausanne.", orientation="de grandes cultures et d'élevage", lieux=[("centre du bourg", 0.45), ("quartier résidentiel", 0.45), ("hameau ou maison isolée", 0.10)], seed=20261101),
    "saviese": dict(num=6265, nom="Savièse", canton="VS", nom_canton="Valais", description="Commune du district de Sion (canton du Valais), sur le coteau au-dessus de Sion, formée de plusieurs villages, avec une tradition viticole.", orientation="viticole", lieux=[("un des villages de la commune", 0.55), ("quartier résidentiel récent", 0.35), ("mayen ou maison isolée", 0.10)], seed=20261102),
    "le-locle": dict(num=6436, nom="Le Locle", canton="NE", nom_canton="Neuchâtel", description="Ville des Montagnes neuchâteloises (canton de Neuchâtel), centre horloger dont l'urbanisme est inscrit avec La Chaux-de-Fonds au patrimoine mondial de l'UNESCO.", orientation="d'élevage laitier de montagne", lieux=[("centre-ville", 0.5), ("quartier résidentiel", 0.4), ("ferme ou hameau des environs", 0.10)], seed=20261103),
    "meyrin": dict(num=6630, nom="Meyrin", canton="GE", nom_canton="Genève", description="Commune suburbaine du canton de Genève, proche de l'aéroport et du CERN, avec une forte population étrangère.", orientation="maraîchère et de grandes cultures", lieux=[("cité de Meyrin (immeubles)", 0.6), ("quartier de villas", 0.3), ("hameau ou zone agricole", 0.10)], seed=20261104),
    "delemont": dict(num=6711, nom="Delémont", canton="JU", nom_canton="Jura", description="Chef-lieu du canton du Jura.", orientation="de grandes cultures et d'élevage", lieux=[("vieille ville ou centre", 0.4), ("quartier résidentiel", 0.5), ("ferme ou hameau des environs", 0.10)], seed=20261105),
    # Communes ajoutées pour le test à l'aveugle des votations cantonales du 27.09.2026 (Vaud et Genève).
    "carouge": dict(num=6608, nom="Carouge", canton="GE", nom_canton="Genève", description="Ville du canton de Genève, au sud de la ville de Genève, au bord de l'Arve, ancienne cité sarde.", orientation="maraîchère", lieux=[("vieux Carouge", 0.35), ("quartier d'immeubles", 0.55), ("quartier de villas", 0.10)], seed=20261106),
    "onex": dict(num=6631, nom="Onex", canton="GE", nom_canton="Genève", description="Commune suburbaine du canton de Genève, à l'ouest de la ville, avec de grands ensembles d'habitation.", orientation="maraîchère", lieux=[("cité d'Onex (grands ensembles)", 0.6), ("quartier de villas", 0.3), ("vieux village", 0.10)], seed=20261107),
    "collonge-bellerive": dict(num=6616, nom="Collonge-Bellerive", canton="GE", nom_canton="Genève", description="Commune résidentielle du canton de Genève, sur la rive gauche du lac Léman.", orientation="de grandes cultures et viticole", lieux=[("quartier de villas", 0.6), ("village", 0.3), ("hameau ou zone agricole", 0.10)], seed=20261108),
    "yverdon": dict(num=5938, nom="Yverdon-les-Bains", canton="VD", nom_canton="Vaud", description="Ville du nord vaudois, au bout du lac de Neuchâtel, chef-lieu du district du Jura-Nord vaudois (canton de Vaud).", orientation="de grandes cultures", lieux=[("centre-ville", 0.4), ("quartier d'immeubles", 0.4), ("quartier de villas", 0.20)], seed=20261109),
    # Commune ajoutée pour le test à l'aveugle sur les démarches participatives passées de la Ville de Lausanne.
    "lausanne": dict(num=5586, nom="Lausanne", canton="VD", nom_canton="Vaud", description="Chef-lieu du canton de Vaud, ville universitaire au bord du Léman, quatrième ville de Suisse par la population.", orientation="viticole et forestière", lieux=[("centre-ville", 0.35), ("quartier d'immeubles", 0.50), ("quartier de villas ou zone foraine", 0.15)], seed=20261111),
    # Communes ajoutées pour le test à l'aveugle sur les démarches participatives genevoises (panels réduits à 30 habitants).
    "geneve": dict(num=6621, nom="Genève", canton="GE", nom_canton="Genève", description="Ville de Genève, chef-lieu du canton, ville internationale ; le quartier de la Jonction est un quartier populaire et mixte au confluent du Rhône et de l'Arve.", orientation="maraîchère", lieux=[("quartier d'immeubles du centre", 0.7), ("quartier résidentiel", 0.25), ("quartier de villas", 0.05)], seed=20261112, N=30),
    "grand-saconnex": dict(num=6623, nom="Le Grand-Saconnex", canton="GE", nom_canton="Genève", description="Commune suburbaine du canton de Genève, entre l'aéroport et les organisations internationales.", orientation="maraîchère", lieux=[("quartier d'immeubles", 0.6), ("quartier de villas", 0.3), ("vieux village", 0.10)], seed=20261113, N=30),
    "lancy": dict(num=6628, nom="Lancy", canton="GE", nom_canton="Genève", description="Deuxième ville du canton de Genève, suburbaine, avec de grands quartiers d'habitation.", orientation="maraîchère", lieux=[("quartier d'immeubles", 0.65), ("quartier de villas", 0.3), ("vieux village", 0.05)], seed=20261114, N=30),
    "thonex": dict(num=6640, nom="Thônex", canton="GE", nom_canton="Genève", description="Commune suburbaine de la rive gauche du canton de Genève, à la frontière française.", orientation="maraîchère", lieux=[("quartier d'immeubles", 0.55), ("quartier de villas", 0.4), ("vieux village", 0.05)], seed=20261115, N=30),
    "versoix": dict(num=6644, nom="Versoix", canton="GE", nom_canton="Genève", description="Commune de la rive droite du lac Léman, au nord du canton de Genève.", orientation="de grandes cultures", lieux=[("bourg et bord du lac", 0.4), ("quartier d'immeubles", 0.3), ("quartier de villas", 0.3)], seed=20261116, N=30),
    "veyrier": dict(num=6645, nom="Veyrier", canton="GE", nom_canton="Genève", description="Commune résidentielle du sud du canton de Genève, au pied du Salève.", orientation="de grandes cultures", lieux=[("quartier de villas", 0.55), ("quartier d'immeubles récent", 0.35), ("hameau", 0.10)], seed=20261117, N=30),
    "nyon": dict(num=5724, nom="Nyon", canton="VD", nom_canton="Vaud", description="Ville de la Côte vaudoise, au bord du Léman entre Lausanne et Genève, chef-lieu du district de Nyon (canton de Vaud).", orientation="viticole et de grandes cultures", lieux=[("centre-ville", 0.4), ("quartier d'immeubles", 0.4), ("quartier de villas", 0.20)], seed=20261110),
}

PARTIS = {1: "PLR", 3: "PS", 4: "UDC", 7: "PEV", 8: "PCS", 9: "POP ou solidaritéS", 13: "Les Vert-e-s", 16: "UDF", 31: "Vert'libéraux", 33: "MCG", 34: "Le Centre", 35: "un petit parti local"}
TRANCHES = [("16-24", 16, 24), ("25-34", 25, 34), ("35-44", 35, 44), ("45-54", 45, 54), ("55-64", 55, 64), ("65-74", 65, 74), ("75+", 75, 92)]
ACTIVITES = [
    ("ouvrier·ère ou technicien·ne dans l'industrie", 0.18), ("artisan·e ou indépendant·e du bâtiment", 0.10),
    ("employé·e de commerce, de bureau ou d'administration", 0.24), ("professionnel·le de la santé, du social ou de l'éducation", 0.18),
    ("employé·e de la vente, de la restauration ou du transport", 0.12), ("cadre ou profession libérale", 0.12), ("parent au foyer ou sans emploi", 0.06),
]
ACTIVITES_HORLOGERES = [("ouvrier·ère ou technicien·ne dans l'horlogerie ou la microtechnique", 0.30)] + [(a, p) for a, p in ACTIVITES if not a.startswith("ouvrier")]


def jsonstat(path):
    d = json.load(open(path, encoding="utf-8"))
    dims = [d["dimension"][i]["category"] for i in d["id"]]
    labs = [[c["label"][k] for k, _ in sorted(c["index"].items(), key=lambda x: x[1])] for c in dims]
    return list(zip(itertools.product(*labs), d["value"]))


pop = jsonstat(os.path.join(DL, "pop5", "pop.json")) + jsonstat(os.path.join(DL, "pop5", "pop_b.json")) + jsonstat(os.path.join(DL, "pop5", "pop_c.json")) + jsonstat(os.path.join(DL, "pop5", "pop_d.json"))
agr = jsonstat(os.path.join(DL, "pop5", "agr.json")) + jsonstat(os.path.join(DL, "pop5", "agr_b.json")) + jsonstat(os.path.join(DL, "pop5", "agr_c.json")) + jsonstat(os.path.join(DL, "pop5", "agr_d.json"))
nrw = json.load(open(os.path.join(DL, "nrw2023_parteien.json"), encoding="utf-8"))["level_gemeinden"]


def age_of(label):
    return int(label.split()[0])


for cas, c in COMMUNES.items():
    tag = f"......{c['num']} "
    rows = [(k, v or 0) for k, v in pop if k[1].startswith(tag)]
    # k = (année, commune, type, nationalité, sexe, âge)
    def count(pred):
        return sum(v for k, v in rows if pred(k))
    tot = count(lambda k: True)
    p16 = count(lambda k: age_of(k[5]) >= 16)
    etr = count(lambda k: k[3] == "Étranger")
    f18 = count(lambda k: age_of(k[5]) >= 18 and k[4] == "Femme")
    a18 = count(lambda k: age_of(k[5]) >= 18)
    tranches = []
    for t, lo, hi in TRANCHES:
        n = count(lambda k: lo <= age_of(k[5]) <= (200 if t == "75+" else hi))
        ne = count(lambda k: lo <= age_of(k[5]) <= (200 if t == "75+" else hi) and k[3] == "Étranger")
        tranches.append({"tranche": t, "min": lo, "max": hi, "part": round(n / p16, 4), "part_etrangers": round(ne / n, 3)})
    a = {k[0]: v or 0 for k, v in agr if k[1].startswith(tag) and k[2] == "Système d'exploitation - total"}
    a_bio = {k[0]: v or 0 for k, v in agr if k[1].startswith(tag) and k[2] == "Exploitations biologiques"}
    emplois = a.get("Emplois total", 0)
    a.setdefault("Exploitations", 0)
    partis = sorted(((PARTIS[r["partei_id"]], r["partei_staerke"] / 100) for r in nrw if r["gemeinde_nummer"] == c["num"] and r["partei_staerke"] and r["partei_staerke"] >= 0.5 and r["partei_id"] in PARTIS), key=lambda x: -x[1])
    s = sum(p for _, p in partis)
    panel = {
        "univers": f"résidents de {c['nom']} âgés de 16 ans et plus (31.12.2025)",
        "population_16_plus": {"valeur": p16, "source": "OFS STATPOP 2025 (âges détaillés, px-x-0102010000_101)"},
        "tranches_age": tranches,
        "source_age": "OFS STATPOP 2025, population par âge et nationalité",
        "part_etrangers": {"valeur": round(etr / tot, 3), "source": "OFS STATPOP 2025"},
        "part_femmes": {"valeur": round(f18 / a18, 3), "source": "OFS STATPOP 2025 (18 ans et plus)"},
        "agriculteurs": {
            "part_16_plus": round(emplois / p16, 4),
            "source": f"OFS, relevé des structures agricoles 2025 ({emplois} emplois agricoles dans la commune, assimilés à des résidents)",
            "surechantillon": 4 if emplois >= 20 else 0, "age_min": 20, "age_max": 70,
            "part_bio": round(a_bio.get("Emplois total", 0) / emplois, 3) if emplois else 0,
            "orientation": c["orientation"],
            "part_hommes": round(a["Emplois hommes"] / emplois, 3) if emplois else 0.6, "part_suisses": round(a["Emplois Suisses"] / emplois, 3) if emplois else 0.8,
        },
        "activites_actifs": [{"activite": x, "part": p} for x, p in (ACTIVITES_HORLOGERES if cas == "le-locle" else ACTIVITES)],
        "source_activites": "hypothèse : les professions des résidents ne sont pas publiées à l'échelle de la commune ; répartition romande générique" + (", avec une forte part horlogère" if cas == "le-locle" else ""),
        "partis": [{"parti": n, "part": round(p / s, 4)} for n, p in partis],
        "source_partis": f"OFS, élections au Conseil national 2023, force des partis à {c['nom']} (partis à 0,5 % et plus, renormalisés)",
        "lieux_de_vie": [{"lieu": l, "part": p} for l, p in c["lieux"]],
        "hypotheses": [
            "Les emplois agricoles situés dans la commune sont assimilés à des résidents actifs dans l'agriculture ; orientation des exploitations décrite de façon générique.",
            "La répartition des activités professionnelles des résidents non agricoles est une hypothèse (donnée non publiée à l'échelle communale).",
            "Lieux de vie dans la commune : hypothèse générique.",
        ],
    }
    premier = partis[0]
    case = {
        "id": cas,
        "cible": {"type": "commune", "nom": c["nom"], "canton": c["canton"], "pays": "CH", "description": c["description"]},
        "decideur": "aucun (prévision de votations fédérales)",
        "enjeu": "prévoir le vote de la commune aux votations fédérales",
        "objectif": "publier une prévision avant le vote et la comparer au résultat officiel",
        "horizon_mois": 1,
        # Taille du panel choisie pour obtenir environ 40 électeurs suisses, quelle que soit la part d'étrangers.
        "panel": {"N": c["N"] if "N" in c else min(80, -(-40 * p16 // count(lambda k: age_of(k[5]) >= 18 and k[3] == "Suisse"))), "seed": c["seed"]},
        "contexte_factuel": [
            f"Population : {f'{tot:,}'.replace(',', ' ')} habitants au 31 décembre 2025, dont {round(100 * etr / tot)} % de nationalité étrangère (OFS, STATPOP).",
            f"Agriculture en 2025 : {a['Exploitations']} exploitations, {emplois} emplois agricoles (OFS, relevé des structures agricoles).",
            f"Élections au Conseil national 2023 : premier parti à {c['nom']}, {premier[0]} ({str(round(100 * premier[1], 1)).replace('.', ',')} %) (OFS).",
        ],
        "votations": [],
    }
    d = os.path.join(ROOT, "cases", cas)
    os.makedirs(d, exist_ok=True)
    json.dump(panel, open(os.path.join(d, "panel.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(case, open(os.path.join(d, "case.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(cas, "pop", tot, "16+", p16, "étrangers", round(etr / tot, 3), "agri", emplois, "partis", [(n, round(p, 3)) for n, p in partis[:4]])
