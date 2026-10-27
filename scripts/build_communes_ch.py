#!/usr/bin/env python3
# Construit data/communes_ch.json (panel et contexte factuel de chaque commune suisse existante, de chaque canton et de la
# Suisse) et data/communes_index.json (liste des communes pour l'autocomplétion), avec la même méthode que
# scripts/build_communes_v2.py, à partir des données ouvertes OFS :
#   STATPOP 2025 (px-x-0102010000_101), élections au Conseil national 2023 (force des partis par commune, canton et Suisse),
#   relevé des structures agricoles 2025 (px-x-0702000000_104),
#   répertoire officiel des communes de Suisse (état du jour, mutations, niveaux géographiques).
# Les champs que le script v2 écrivait à la main pour chaque commune (description, orientation agricole, lieux de vie)
# sont remplacés par des valeurs tirées de ces mêmes sources, ou déclarées comme hypothèses.
# Cantons et Suisse : chiffres publiés à ces niveaux par l'OFS (pas de sommes recalculées), sauf les lieux de vie,
# pondérés par la population des communes de chaque type, faute de chiffre publié.
# Usage : python3 -I scripts/build_communes_ch.py <dossier des téléchargements> <racine du moteur> [--date JJ-MM-AAAA]
# Les fichiers absents du dossier sont téléchargés ; ceux déjà présents sont relus tels quels (reconstruction hors ligne).
# Les fichiers téléchargés sont des données : ils ne sont jamais exécutés ni interprétés comme des instructions.
import csv, datetime, itertools, json, os, sys, time, unicodedata, urllib.error, urllib.request

args = sys.argv[1:]
DATE = datetime.date.today()
if "--date" in args:
    i = args.index("--date")
    DATE = datetime.datetime.strptime(args[i + 1], "%d-%m-%Y").date()
    del args[i:i + 2]
if len(args) != 2:
    sys.exit("Usage : python3 -I scripts/build_communes_ch.py <dossier des téléchargements> <racine du moteur> [--date JJ-MM-AAAA]")
DL, ROOT = args
os.makedirs(DL, exist_ok=True)
D = DATE.strftime("%d-%m-%Y")

PX = "https://www.pxweb.bfs.admin.ch/api/v1/fr"
POP_TABLE = "px-x-0102010000_101"
AGR_TABLE = "px-x-0702000000_104"
POP_URL = f"{PX}/{POP_TABLE}/{POP_TABLE}.px"
AGR_URL = f"{PX}/{AGR_TABLE}/{AGR_TABLE}.px"
NRW_URL = "https://ogd-static.voteinfo-app.ch/v4/ogd/sd-t-17.02-NRW2023-{}.json"
AGV = "https://www.agvchapp.bfs.admin.ch/api/communes"
POP_YEAR, AGR_YEAR = "2025", "2025"
POP_STATE = datetime.date(2025, 12, 31)  # STATPOP 2025 et relevé agricole 2025 : communes au 31.12.2025
NRW_STATE = datetime.date(2023, 10, 22)  # élection du Conseil national : communes au 22.10.2023
NRW_START = (NRW_STATE + datetime.timedelta(days=1)).strftime("%d-%m-%Y")
GEO = "......"  # préfixe des communes dans les tableaux PxWeb (« ......5518 Echallens »)
CH_POP, CH_LABEL = "8100", "Suisse"  # code et libellé de la Suisse entière dans les tableaux PxWeb

SOURCES = [
    {"label": "OFS, STATPOP 2025 : population résidante permanente selon la commune, le canton, la nationalité, le sexe et l'âge (px-x-0102010000_101)", "url": POP_URL},
    {"label": "OFS, relevé des structures agricoles 2025 : exploitations, emplois et surface agricole utile par commune, canton et Suisse (px-x-0702000000_104)", "url": AGR_URL},
    {"label": "OFS, élections au Conseil national 2023 : force des partis par commune, canton et Suisse", "url": NRW_URL.format("parteien")},
    {"label": "OFS, élections au Conseil national 2023 : métadonnées (noms des partis)", "url": NRW_URL.format("metadaten")},
    {"label": f"OFS, répertoire officiel des communes de Suisse : état au {DATE.strftime('%d.%m.%Y')}", "url": f"{AGV}/snapshot?date={D}"},
    {"label": f"OFS, répertoire officiel des communes de Suisse : mutations du {NRW_START.replace('-', '.')} au {DATE.strftime('%d.%m.%Y')}", "url": f"{AGV}/mutations?startPeriod={NRW_START}&endPeriod={D}&includeTerritoryExchange=false"},
    {"label": "OFS, niveaux géographiques de la Suisse : district, typologie des communes 2020, typologie urbain-rural 2020, région linguistique", "url": f"{AGV}/levels?date={D}&labelLanguages=fr"},
]

# Mêmes libellés que le script v2 ; les partis absents de ses communes romandes prennent le nom français publié par l'OFS.
PARTIS = {1: "PLR", 3: "PS", 4: "UDC", 7: "PEV", 8: "PCS", 9: "POP ou solidaritéS", 13: "Les Vert-e-s", 16: "UDF", 31: "Vert'libéraux", 33: "MCG", 34: "Le Centre", 35: "un petit parti local"}
TRANCHES = [("16-24", 16, 24), ("25-34", 25, 34), ("35-44", 35, 44), ("45-54", 45, 54), ("55-64", 55, 64), ("65-74", 65, 74), ("75+", 75, 92)]
ACTIVITES = [
    ("ouvrier·ère ou technicien·ne dans l'industrie", 0.18), ("artisan·e ou indépendant·e du bâtiment", 0.10),
    ("employé·e de commerce, de bureau ou d'administration", 0.24), ("professionnel·le de la santé, du social ou de l'éducation", 0.18),
    ("employé·e de la vente, de la restauration ou du transport", 0.12), ("cadre ou profession libérale", 0.12), ("parent au foyer ou sans emploi", 0.06),
]
# Lieux de vie : le type de commune vient de l'OFS (typologie urbain-rural 2020) ; libellés et parts sont des hypothèses.
LIEUX = {
    "Urbain": [("centre-ville ou quartier d'immeubles", 0.6), ("quartier résidentiel ou de villas", 0.35), ("hameau ou zone agricole", 0.05)],
    "Intermédiaire": [("centre du bourg ou du village", 0.45), ("quartier résidentiel", 0.45), ("hameau ou maison isolée", 0.10)],
    "Rural": [("village", 0.6), ("quartier résidentiel récent", 0.25), ("hameau, ferme ou maison isolée", 0.15)],
}
TYPE_ADJ = {"Urbain": "urbaine", "Intermédiaire": "intermédiaire", "Rural": "rurale"}
# Orientation agricole : type de surface agricole utile (SAU) majoritaire, plus le deuxième s'il en couvre au moins 25 %.
SAU = {"SAU - Terres ouvertes (en ha)": "de grandes cultures", "SAU - Surfaces herbagères (en ha)": "d'élevage", "SAU - Cultures pérennes (en ha)": "de vigne ou de vergers"}
SEUIL_SAU_SECONDAIRE = 0.25
CANTONS = {
    "ZH": ("Zurich", "de Zurich"), "BE": ("Berne", "de Berne"), "LU": ("Lucerne", "de Lucerne"), "UR": ("Uri", "d'Uri"),
    "SZ": ("Schwytz", "de Schwytz"), "OW": ("Obwald", "d'Obwald"), "NW": ("Nidwald", "de Nidwald"), "GL": ("Glaris", "de Glaris"),
    "ZG": ("Zoug", "de Zoug"), "FR": ("Fribourg", "de Fribourg"), "SO": ("Soleure", "de Soleure"), "BS": ("Bâle-Ville", "de Bâle-Ville"),
    "BL": ("Bâle-Campagne", "de Bâle-Campagne"), "SH": ("Schaffhouse", "de Schaffhouse"),
    "AR": ("Appenzell Rhodes-Extérieures", "d'Appenzell Rhodes-Extérieures"), "AI": ("Appenzell Rhodes-Intérieures", "d'Appenzell Rhodes-Intérieures"),
    "SG": ("Saint-Gall", "de Saint-Gall"), "GR": ("Grisons", "des Grisons"), "AG": ("Argovie", "d'Argovie"), "TG": ("Thurgovie", "de Thurgovie"),
    "TI": ("Tessin", "du Tessin"), "VD": ("Vaud", "de Vaud"), "VS": ("Valais", "du Valais"), "NE": ("Neuchâtel", "de Neuchâtel"),
    "GE": ("Genève", "de Genève"), "JU": ("Jura", "du Jura"),
}
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


def fetch(name, url, body=None):
    """Renvoie le chemin local du fichier ; le télécharge s'il n'est pas déjà dans le dossier."""
    path = os.path.join(DL, name)
    if os.path.exists(path):
        return path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"} if data else {})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                content = r.read()
            break
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == 5:
                raise
            print(f"  nouvel essai pour {name} ({e})", file=sys.stderr)
            time.sleep(10 * (attempt + 1))
    with open(path + ".part", "wb") as f:
        f.write(content)
    os.replace(path + ".part", path)
    time.sleep(0.5)  # PxWeb OFS : au plus 50 appels par 15 secondes
    print("  téléchargé", name, len(content), "octets", file=sys.stderr)
    return path


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def jsonstat(path):
    d = load_json(path)
    dims = [d["dimension"][i]["category"] for i in d["id"]]
    labs = [[c["label"][k] for k, _ in sorted(c["index"].items(), key=lambda x: x[1])] for c in dims]
    return list(zip(itertools.product(*labs), d["value"]))


def px_values(meta, prefix):
    v = [x for x in meta["variables"] if x["code"].startswith(prefix)]
    assert len(v) == 1, prefix
    return list(zip(v[0]["values"], v[0]["valueTexts"])), v[0]["code"]


def geo_num(label):
    return int(label[len(GEO):].split()[0])


def fr_date(d):
    return f"{'1er' if d.day == 1 else d.day} {MOIS[d.month - 1]} {d.year}"


def liste_fr(xs):
    return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " et " + xs[-1]


def milliers(n):
    return f"{n:,}".replace(",", " ")


def pct(x):
    return str(round(100 * x, 1)).replace(".", ",")


def age_of(label):
    return int(label.split()[0])


# 1. Communes actuelles (répertoire officiel) et mutations depuis l'élection de 2023.
snapshot = load_csv(fetch(f"agvch_snapshot_{D}.csv", f"{AGV}/snapshot?date={D}"))
levels = load_csv(fetch(f"agvch_levels_{D}.csv", f"{AGV}/levels?date={D}&labelLanguages=fr"))
mutations = load_csv(fetch(f"agvch_mutations_{NRW_START}_{D}.csv", f"{AGV}/mutations?startPeriod={NRW_START}&endPeriod={D}&includeTerritoryExchange=false"))
canton_abbr = {int(r["BfsCode"]): r["ShortName"] for r in snapshot if r["Level"] == "1"}
assert sorted(canton_abbr.values()) == sorted(CANTONS)
current = {int(r["BfsCode"]): r for r in levels}
assert set(current) == {int(r["BfsCode"]) for r in snapshot if r["Level"] == "3"}, "état des communes incohérent entre snapshot et levels"
cur_canton = {n: canton_abbr[int(r["CantonId"])] for n, r in current.items()}
for r in mutations:
    r["date"] = datetime.datetime.strptime(r["MutationDate"], "%d.%m.%Y").date()
mutations.sort(key=lambda r: (r["date"], int(r["MutationNumber"])))


def code_map(state):
    """Ancien numéro OFS -> (numéro actuel, date de la dernière mutation), pour les mutations postérieures à l'état `state`."""
    step = {}
    for r in mutations:
        a, b = int(r["InitialCode"]), int(r["TerminalCode"])
        if r["date"] <= state or a == b:
            continue  # échange de territoire ou commune maintenue : pas de changement de numéro
        assert step.get(a, (b,))[0] == b, f"commune {a} répartie entre plusieurs communes : cas non géré"
        step[a] = (b, r["date"])

    def resolve(code):
        d = None
        while code in step:
            code, d = step[code]
        return code, d

    return resolve


resolve_pop = code_map(POP_STATE)
resolve_nrw = code_map(NRW_STATE)

# 2. STATPOP 2025 : population résidante permanente par commune, canton et Suisse, nationalité, sexe et âge (requêtes par lots).
pop_meta = load_json(fetch(f"{POP_TABLE}_meta.json", POP_URL))
pop_geo, pop_geo_code = px_values(pop_meta, "Kanton")
assert POP_YEAR in [c for c, _ in px_values(pop_meta, "Jahr")[0]]
ages = [c for c, _ in px_values(pop_meta, "Alter")[0] if c != "-99999"]
canton_label = {l: c for c, l in pop_geo if l.startswith("- ")}  # « - Vaud » -> « VD »
assert sorted(canton_label.values()) == sorted(CANTONS)
assert (CH_POP, CH_LABEL) in pop_geo
old_canton, k = {}, None  # canton de chaque commune au 31.12.2025, d'après l'ordre hiérarchique du tableau
for c, l in pop_geo:
    if l in canton_label:
        k = canton_label[l]
    elif l.startswith(GEO):
        old_canton[geo_num(l)] = k
pop_communes = [(c, l) for c, l in pop_geo if l.startswith(GEO)]
pop_lots = [pop_communes[i:i + 200] for i in range(0, len(pop_communes), 200)]  # 200 x 404 cellules < 100 000 (limite PxWeb)
pop_lots.append([(CH_POP, CH_LABEL)] + [(c, l) for c, l in pop_geo if l in canton_label])
pop = []
for i, lot in enumerate(pop_lots):
    q = {"query": [
        {"code": "Jahr", "selection": {"filter": "item", "values": [POP_YEAR]}},
        {"code": pop_geo_code, "selection": {"filter": "item", "values": [c for c, _ in lot]}},
        {"code": "Bevölkerungstyp", "selection": {"filter": "item", "values": ["1"]}},
        {"code": "Staatsangehörigkeit (Kategorie)", "selection": {"filter": "item", "values": ["1", "2"]}},
        {"code": "Geschlecht", "selection": {"filter": "item", "values": ["1", "2"]}},
        {"code": "Alter", "selection": {"filter": "item", "values": ages}},
    ], "response": {"format": "json-stat2"}}
    name = f"pop_{POP_YEAR}_{i:02d}.json" if i < len(pop_lots) - 1 else f"pop_{POP_YEAR}_cantons_suisse.json"
    pop += jsonstat(fetch(name, POP_URL, q))
pop_rows = {}  # numéro OFS (état 31.12.2025), sigle du canton ou « CH » -> [(clé, effectif)]
for k, v in pop:  # k = (année, commune ou canton, type, nationalité, sexe, âge)
    key = geo_num(k[1]) if k[1].startswith(GEO) else canton_label.get(k[1], "CH" if k[1] == CH_LABEL else None)
    assert key is not None, k[1]
    pop_rows.setdefault(key, []).append((k, v or 0))
assert len(pop_rows) == len(pop_communes) + 27, "commune ou canton manquant dans STATPOP"

# 3. Relevé des structures agricoles 2025 : communes, cantons et Suisse.
agr_meta = load_json(fetch(f"{AGR_TABLE}_meta.json", AGR_URL))
agr_geo, agr_geo_code = px_values(agr_meta, "Kanton")
agr_year = [c for c, l in px_values(agr_meta, "Jahr")[0] if l == AGR_YEAR]
assert len(agr_year) == 1
units = {l: c for c, l in px_values(agr_meta, "Beobachtungseinheit")[0]}
UNITS = ["Exploitations", "Emplois total", "Emplois hommes", "Emplois Suisses", "SAU - Surface agricole utile totale (en ha)", *SAU]
agr_targets = [(c, l) for c, l in agr_geo if l.startswith(GEO) or l in canton_label or l == CH_LABEL]
agr = []
for i in range(0, len(agr_targets), 1000):
    q = {"query": [
        {"code": "Beobachtungseinheit", "selection": {"filter": "item", "values": [units[u] for u in UNITS]}},
        {"code": agr_geo_code, "selection": {"filter": "item", "values": [c for c, _ in agr_targets[i:i + 1000]]}},
        {"code": "Betriebssystem", "selection": {"filter": "item", "values": ["0", "1"]}},
        {"code": "Jahr", "selection": {"filter": "item", "values": agr_year}},
    ], "response": {"format": "json-stat2"}}
    agr += jsonstat(fetch(f"agr_{AGR_YEAR}_{i // 1000:02d}.json", AGR_URL, q))
agr_tot, agr_bio = {}, {}  # numéro OFS, sigle du canton ou « CH » -> {unité: valeur}
for k, v in agr:  # k = (unité, commune ou canton, système d'exploitation, année)
    key = geo_num(k[1]) if k[1].startswith(GEO) else canton_label.get(k[1], "CH" if k[1] == CH_LABEL else None)
    target = agr_tot if k[2] == "Système d'exploitation - total" else agr_bio
    target.setdefault(key, {})[k[0]] = v or 0
assert set(agr_tot) == set(pop_rows), "territoires différents entre STATPOP et le relevé agricole"

# 4. Élections au Conseil national 2023 : force des partis par commune, canton et Suisse.
nrw = load_json(fetch("nrw2023_parteien.json", NRW_URL.format("parteien")))
nrw_meta = load_json(fetch("nrw2023_metadaten.json", NRW_URL.format("metadaten")))
ofs_party = {p["partei_id"]: [t["text"].strip() for t in p["partei_bezeichnung"] if t["langKey"] == "fr"][0] for p in nrw_meta["parteien"]}
nrw_rows = {}
for r in nrw["level_gemeinden"]:
    if r["gemeinde_nummer"] < 9000:  # 19xxx : Suisses de l'étranger, pas une commune
        nrw_rows.setdefault(r["gemeinde_nummer"], []).append(r)
nrw_canton = {n: canton_abbr[rs[0]["kanton_nummer"]] for n, rs in nrw_rows.items()}
nrw_names = {n: rs[0]["gemeinde_bezeichnung"].strip() for n, rs in nrw_rows.items()}
nrw_level = {"CH": [(r["partei_id"], r["partei_staerke"]) for r in nrw["level_ch"]]}
for r in nrw["level_kantone"]:
    nrw_level.setdefault(canton_abbr[r["kanton_nummer"]], []).append((r["partei_id"], r["partei_staerke"]))
assert set(nrw_level) == set(CANTONS) | {"CH"}


def party_label(pid, canton, langue):
    if pid == 9 and langue != "Français":
        return ofs_party[9]
    if pid == 33 and canton != "GE":
        return ofs_party[33]
    return PARTIS.get(pid, ofs_party.get(pid))


def strengths(sources):
    """Force des partis en parts (0 à 1) : publiée telle quelle pour une commune inchangée,
    recalculée à partir des suffrages de parti quand plusieurs anciennes communes forment la commune actuelle."""
    if len(sources) == 1:
        return [(r["partei_id"], r["partei_staerke"] / 100) for r in nrw_rows[sources[0]] if r["partei_staerke"]]
    votes = {}
    for n in sources:
        for r in nrw_rows[n]:
            votes[r["partei_id"]] = votes.get(r["partei_id"], 0) + (r["stimmen_partei"] or 0)
    tot = sum(votes.values())
    return [(pid, v / tot) for pid, v in votes.items() if v] if tot else []


# 5. Regroupement des anciennes communes sur le territoire actuel.
pop_sources, nrw_sources = {}, {}
for n in pop_communes:
    pop_sources.setdefault(resolve_pop(geo_num(n[1]))[0], []).append(geo_num(n[1]))
for n in nrw_rows:
    nrw_sources.setdefault(resolve_nrw(n)[0], []).append(n)
assert set(pop_sources) == set(current), ("STATPOP ne couvre pas exactement les communes actuelles", set(pop_sources) ^ set(current))
assert set(nrw_sources) <= set(current), set(nrw_sources) - set(current)
missing_nrw = sorted(set(current) - set(nrw_sources))

# Communes ayant changé de canton depuis l'état des données (ex. Moutier) : signalées dans les panels des cantons concernés.
transferts = []
for n in pop_communes:
    old = geo_num(n[1])
    new, d = resolve_pop(old)
    if old_canton[old] != cur_canton[new]:
        transferts.append((current[new]["Name"], old_canton[old], cur_canton[new], d))
for old in nrw_rows:
    new, d = resolve_nrw(old)
    if nrw_canton[old] != cur_canton[new] and (current[new]["Name"], nrw_canton[old], cur_canton[new], d) not in transferts:
        transferts.append((current[new]["Name"], nrw_canton[old], cur_canton[new], d))


def sau_orientation(a):
    parts = sorted(((a.get(k, 0), lab) for k, lab in SAU.items()), reverse=True)
    tot = sum(x for x, _ in parts)
    if tot <= 0:
        return "non déterminée (aucune surface agricole recensée)"
    out = parts[0][1]
    if parts[1][0] / tot >= SEUIL_SAU_SECONDAIRE:
        out += " et " + parts[1][1]
    return out


def demography(rows):
    """Mêmes calculs que build_communes_v2.py."""
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
        tr = {"tranche": t, "min": lo, "max": hi, "part": round(n / p16, 4)}
        if n:  # tranche vide (très petite commune) : pas de part d'étrangers à publier
            tr["part_etrangers"] = round(ne / n, 3)
        tranches.append(tr)
    return dict(tot=tot, p16=p16, etr=etr, f18=f18, a18=a18, tranches=tranches)


def build_panel(*, univers, d, pop_source, a, bio_emplois, territoire, agr_fallback, raw_partis, source_partis, canton, langue, lieux, lieux_hyp, activites_hyp, hypotheses):
    """PanelSpec, même structure et mêmes règles que build_communes_v2.py. `territoire` : « la commune », « le canton », « la Suisse »."""
    emplois = a["Emplois total"]
    dans = {"la commune": "dans la commune", "le canton": "dans le canton", "la Suisse": "en Suisse"}[territoire]
    de = {"la commune": "de la commune", "le canton": "du canton", "la Suisse": "de la Suisse"}[territoire]
    hyps = [
        f"Les emplois agricoles situés {dans} sont assimilés à des résidents actifs dans l'agriculture ; orientation des exploitations déduite de la surface agricole utile {de} (OFS, relevé des structures agricoles 2025) : type de surface majoritaire (terres ouvertes : grandes cultures ; surfaces herbagères : élevage ; cultures pérennes : vigne ou vergers), complété du deuxième s'il en couvre au moins 25 % (règle d'hypothèse).",
        activites_hyp,
        lieux_hyp,
    ]
    agr_source = f"OFS, relevé des structures agricoles 2025 ({emplois} emplois agricoles {dans}, assimilés à des résidents)"
    if emplois:
        part_hommes, part_suisses = round(a["Emplois hommes"] / emplois, 3), round(a["Emplois Suisses"] / emplois, 3)
    else:
        fk, fa = agr_fallback
        part_hommes, part_suisses = round(fa["Emplois hommes"] / fa["Emplois total"], 3), round(fa["Emplois Suisses"] / fa["Emplois total"], 3)
        agr_source += f" ; parts d'hommes et de Suisses : emplois agricoles du canton {CANTONS[fk][1]} (même source)"
        hyps.append(f"Aucun emploi agricole recensé {dans} : aucun agriculteur dans le panel ; les parts d'hommes et de Suisses parmi les agriculteurs reprennent les valeurs du canton {CANTONS[fk][1]}, sans effet sur le panel.")
    partis = sorted(((party_label(pid, canton, langue), p) for pid, p in raw_partis if p >= 0.005 and party_label(pid, canton, langue)), key=lambda x: -x[1])
    s = sum(p for _, p in partis)
    panel = {
        "univers": univers,
        "population_16_plus": {"valeur": d["p16"], "source": pop_source},
        "tranches_age": d["tranches"],
        "source_age": "OFS STATPOP 2025, population par âge et nationalité",
        "part_etrangers": {"valeur": round(d["etr"] / d["tot"], 3), "source": "OFS STATPOP 2025"},
        "part_femmes": {"valeur": round(d["f18"] / d["a18"], 3), "source": "OFS STATPOP 2025 (18 ans et plus)"},
        "agriculteurs": {
            "part_16_plus": round(emplois / d["p16"], 4),
            "source": agr_source,
            "surechantillon": 4 if emplois >= 20 else 0, "age_min": 20, "age_max": 70,
            "part_bio": round(bio_emplois / emplois, 3) if emplois else 0,
            "orientation": sau_orientation(a),
            "part_hommes": part_hommes, "part_suisses": part_suisses,
        },
        "activites_actifs": [{"activite": x, "part": p} for x, p in ACTIVITES],
        "source_activites": "hypothèse : les professions des résidents ne sont pas publiées dans la nomenclature du panel ; répartition générique, la même pour toutes les communes, tous les cantons et la Suisse (établie pour la Suisse romande)",
        "partis": [{"parti": n, "part": round(p / s, 4)} for n, p in partis],
        "source_partis": source_partis,
        "lieux_de_vie": [{"lieu": l, "part": p} for l, p in lieux],
        "hypotheses": hyps + hypotheses,
    }
    return panel, partis[0]


def stalan(n):
    return current[n]["STALAN2020_fr"].split(" (")[0]


ACTIVITES_COMMUNE = "La répartition des activités professionnelles des résidents non agricoles est une hypothèse (donnée non publiée à l'échelle communale), identique pour toutes les communes."
ACTIVITES_LARGE = "La répartition des activités professionnelles des résidents non agricoles est une hypothèse, identique pour toutes les communes, tous les cantons et la Suisse : le relevé structurel publie des professions par canton, mais pas dans la nomenclature du panel."

# 6. Communes.
communes, index = {}, []
stats = {"fusion_statpop": 0, "fusion_nrw": 0, "partis_canton": 0, "sans_emploi_agricole": 0, "changement_canton": 0}
p16_by_commune = {}
for num in sorted(current):
    lv = current[num]
    nom = lv["Name"]
    canton = cur_canton[num]
    nom_canton, de_canton = CANTONS[canton]
    langue = lv["SPRGEB2020_fr"]
    srcs = sorted(pop_sources[num])
    d = demography([x for n in srcs for x in pop_rows[n]])
    p16_by_commune[num] = d["p16"]
    a = {u: sum(agr_tot[n].get(u, 0) for n in srcs) for u in UNITS}
    bio = sum(agr_bio[n].get("Emplois total", 0) for n in srcs)
    hyps = []
    if a["Emplois total"] == 0:
        stats["sans_emploi_agricole"] += 1

    # Partis : commune telle qu'elle était à l'élection de 2023, ou anciennes communes regroupées, ou repli sur le canton.
    nsrc = sorted(nrw_sources.get(num, []))
    if nsrc:
        raw = strengths(nsrc)
        lieu = f"à {nom}"
        source_partis = f"OFS, élections au Conseil national 2023, force des partis à {nom} (partis à 0,5 % et plus, renormalisés)"
        if len(nsrc) > 1:
            stats["fusion_nrw"] += 1
            anciennes = liste_fr([nrw_names[n] for n in nsrc])
            dm = max(resolve_nrw(n)[1] for n in nsrc if resolve_nrw(n)[1])
            source_partis = f"OFS, élections au Conseil national 2023, force des partis recalculée à partir des suffrages de parti des anciennes communes {anciennes}, réunies dans {nom} (partis à 0,5 % et plus, renormalisés)"
            hyps.append(f"Commune formée après l'élection de 2023 (fusion entrée en vigueur le {fr_date(dm)}) : force des partis du Conseil national 2023 recalculée à partir des suffrages de parti des anciennes communes {anciennes}.")
        k23 = sorted({nrw_canton[n] for n in nsrc})
        if k23 != [canton]:
            stats["changement_canton"] += 1
            avant = liste_fr([CANTONS[k][1] for k in k23])
            hyps.append(f"À l'élection de 2023, la commune appartenait au canton {avant} : partis et listes de ce canton.")
            lieu += f" (alors dans le canton {avant})"
    else:
        stats["partis_canton"] += 1
        raw = [(pid, p / 100) for pid, p in nrw_level[canton] if p]
        lieu = f"dans le canton {de_canton} (aucun résultat publié pour la commune)"
        source_partis = f"OFS, élections au Conseil national 2023, force des partis dans le canton {de_canton}, faute de résultat publié pour la commune (partis à 0,5 % et plus, renormalisés)"
        hyps.append(f"Aucune force de parti publiée pour la commune : répartition du canton {de_canton} (OFS, Conseil national 2023).")

    if len(srcs) > 1:
        stats["fusion_statpop"] += 1
        anciennes = liste_fr([nrw_names.get(n, str(n)) for n in srcs])
        dm = max(resolve_pop(n)[1] for n in srcs if resolve_pop(n)[1])
        hyps.append(f"Commune issue de la fusion du {fr_date(dm)} : effectifs STATPOP 2025 et relevé agricole 2025 des anciennes communes {anciennes} additionnés.")
        territoire = f" sur le territoire actuel (anciennes communes {anciennes}, réunies le {fr_date(dm)})"
        pop_source = f"OFS STATPOP 2025 (âges détaillés, px-x-0102010000_101), anciennes communes {anciennes} additionnées"
    else:
        territoire = ""
        pop_source = "OFS STATPOP 2025 (âges détaillés, px-x-0102010000_101)"

    panel, premier = build_panel(
        univers=f"résidents de {nom} âgés de 16 ans et plus (31.12.2025)", d=d, pop_source=pop_source, a=a, bio_emplois=bio,
        territoire="la commune", agr_fallback=(canton, agr_tot[canton]), raw_partis=raw, source_partis=source_partis,
        canton=canton, langue=langue, lieux=LIEUX[stalan(num)],
        lieux_hyp=f"Lieux de vie dans la commune : hypothèse générique pour une commune de type « {lv['STALAN2020_fr']} » (OFS, typologie urbain-rural 2020) ; libellés et parts non sourcés.",
        activites_hyp=ACTIVITES_COMMUNE, hypotheses=hyps,
    )
    district = lv["District"]
    description = f"Commune du canton {de_canton}"
    if not district.startswith(("Kanton ", "Canton ", "Cantone ")):
        description += f" ({district})"
    gdetyp = lv["GDETYP2020_9_fr"].replace("’", "'")
    description += f", {gdetyp[0].lower() + gdetyp[1:]} selon la typologie des communes de l'OFS (2020), région linguistique : {langue.lower()}."
    contexte = [
        f"Population : {milliers(d['tot'])} habitants au 31 décembre 2025{territoire}, dont {round(100 * d['etr'] / d['tot'])} % de nationalité étrangère (OFS, STATPOP).",
        f"Agriculture en 2025 : {a['Exploitations']} exploitations, {a['Emplois total']} emplois agricoles (OFS, relevé des structures agricoles).",
        f"Élections au Conseil national 2023 : premier parti {lieu}, {premier[0]} ({pct(premier[1])} %) (OFS).",
    ]
    communes[str(num)] = {"num": num, "nom": nom, "canton": canton, "nom_canton": nom_canton, "description": description, "panel": panel, "contexte_factuel": contexte}
    index.append({"num": num, "nom": nom, "canton": canton})


# 7. Cantons et Suisse : chiffres publiés à ces niveaux. Seuls les lieux de vie sont pondérés à partir des communes.
def lieux_ponderes(nums):
    """Mélange des lieux de vie hypothétiques des trois types de communes, pondéré par la population de 16 ans et plus
    vivant dans chaque type (OFS, STATPOP 2025 et typologie urbain-rural 2020)."""
    w = {}
    for n in nums:
        w[stalan(n)] = w.get(stalan(n), 0) + p16_by_commune[n]
    tot = sum(w.values())
    mix = {}
    for t, wt in w.items():
        for l, p in LIEUX[t]:
            mix[f"{l}, dans une commune {TYPE_ADJ[t]}"] = p * wt / tot
    poids = ", ".join(f"{t.lower()} {pct(w.get(t, 0) / tot)} %" for t in LIEUX)
    return [(l, round(p, 4)) for l, p in sorted(mix.items(), key=lambda x: -x[1])], poids


def langue_majoritaire(nums):
    w = {}
    for n in nums:
        w[current[n]["SPRGEB2020_fr"]] = w.get(current[n]["SPRGEB2020_fr"], 0) + p16_by_commune[n]
    return max(w, key=w.get)


def transfert_hyps(k):
    out = []
    for nom, avant, apres, dm in transferts:
        if k == avant:
            out.append(f"Chiffres publiés pour le territoire cantonal à la date des données (31 décembre 2025 pour STATPOP et le relevé agricole, 22 octobre 2023 pour l'élection) : ils comprennent {nom}, rattachée au canton {CANTONS[apres][1]} le {fr_date(dm)}.")
        if k == apres:
            out.append(f"Chiffres publiés pour le territoire cantonal à la date des données (31 décembre 2025 pour STATPOP et le relevé agricole, 22 octobre 2023 pour l'élection) : ils ne comprennent pas {nom}, rattachée au canton le {fr_date(dm)}.")
    return out


def large_entry(key, univers, territoire, lieu_txt, nums, hyps):
    d = demography(pop_rows[key])
    lieux, poids = lieux_ponderes(nums)
    langue = langue_majoritaire(nums)
    canton = key
    source_partis = f"OFS, élections au Conseil national 2023, force des partis {lieu_txt} (partis à 0,5 % et plus, renormalisés)"
    panel, premier = build_panel(
        univers=univers, d=d, pop_source=f"OFS STATPOP 2025 (âges détaillés, px-x-0102010000_101), chiffres publiés pour {territoire}",
        a={u: agr_tot[key].get(u, 0) for u in UNITS}, bio_emplois=agr_bio[key].get("Emplois total", 0), territoire=territoire,
        agr_fallback=None, raw_partis=[(pid, p / 100) for pid, p in nrw_level[key] if p], source_partis=source_partis,
        canton=canton, langue=langue, lieux=lieux,
        lieux_hyp=f"Lieux de vie : hypothèses génériques des communes urbaines, intermédiaires et rurales (libellés et parts non sourcés), pondérées par la part de la population de 16 ans et plus vivant dans chaque type ({poids} ; OFS, STATPOP 2025 et typologie urbain-rural 2020).",
        activites_hyp=ACTIVITES_LARGE, hypotheses=hyps,
    )
    a = agr_tot[key]
    contexte = [
        f"Population : {milliers(d['tot'])} habitants au 31 décembre 2025, dont {round(100 * d['etr'] / d['tot'])} % de nationalité étrangère (OFS, STATPOP).",
        f"Agriculture en 2025 : {a['Exploitations']} exploitations, {a['Emplois total']} emplois agricoles (OFS, relevé des structures agricoles).",
        f"Élections au Conseil national 2023 : premier parti {lieu_txt}, {premier[0]} ({pct(premier[1])} %) (OFS).",
    ]
    description = (f"{len(nums)} communes au {DATE.strftime('%d.%m.%Y')} (OFS, répertoire officiel des communes) ; population de 16 ans et plus "
                   f"selon le type de sa commune : {poids} (OFS, STATPOP 2025 et typologie urbain-rural 2020) ; région linguistique de la majorité des habitants : {langue.lower()}.")
    return panel, contexte, description


cantons = {}
for k, (nom_canton, de_canton) in CANTONS.items():
    nums = [n for n in current if cur_canton[n] == k]
    panel, contexte, description = large_entry(k, f"résidents du canton {de_canton} âgés de 16 ans et plus (31.12.2025)", "le canton",
                                               f"dans le canton {de_canton}", nums, transfert_hyps(k))
    cantons[k] = {"canton": k, "nom": nom_canton, "description": f"Canton {de_canton} : {description}", "panel": panel, "contexte_factuel": contexte}
panel, contexte, description = large_entry("CH", "résidents de Suisse âgés de 16 ans et plus (31.12.2025)", "la Suisse", "en Suisse", list(current), [])
suisse = {"nom": "Suisse", "description": f"Suisse entière, 26 cantons et {description}", "panel": panel, "contexte_factuel": contexte}


def sort_key(e):
    base = unicodedata.normalize("NFD", e["nom"]).encode("ascii", "ignore").decode().casefold()
    return (base, e["nom"], e["num"])


index.sort(key=sort_key)
out = {"genere_le": datetime.datetime.now().astimezone().isoformat(timespec="seconds"), "etat_des_communes": DATE.strftime("%d.%m.%Y"),
       "sources": SOURCES, "communes": communes, "cantons": cantons, "suisse": suisse}
os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
for name, data in (("communes_ch.json", out), ("communes_index.json", index)):
    with open(os.path.join(ROOT, "data", name), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
print(len(communes), "communes,", len(cantons), "cantons et la Suisse ;", stats, "; sans résultat 2023 :", missing_nrw, "; changements de canton :", transferts)
