"""Construit medicaments.json à partir de la Base de données publique des médicaments (ANSM).

Usage :
  1. Télécharger CIS_bdpm.txt et CIS_COMPO_bdpm.txt depuis
     https://base-donnees-publique.medicaments.gouv.fr/telechargement
     dans un dossier, par exemple ./bdpm
  2. python3 outils/build_bdpm.py ./bdpm medicaments.json
  3. Mettre à jour la date "extrait" dans medicaments.json si besoin.
"""
import sys, json, re, unicodedata, collections
src, out = sys.argv[1], sys.argv[2]
def rd(name):
    b = open(f"{src}/{name}", "rb").read()
    try: t = b.decode("utf-8")
    except UnicodeDecodeError: t = b.decode("latin-1")
    return [l.split("\t") for l in t.splitlines() if l.strip()]
cis = {}
for r in rd("CIS_bdpm.txt"):
    if len(r) < 7: continue
    code, denom, forme, voies, statut, _, etat = [x.strip() for x in r[:7]]
    if etat != "Commercialisée" or "active" not in statut.lower(): continue
    if re.search(r"degré de dilution|BOIRON|LEHNING|WELEDA|\bCH\b|\bDH\b", denom, re.I): continue
    cis[code] = (denom, forme, voies)
comp = collections.defaultdict(lambda: collections.OrderedDict())
for r in rd("CIS_COMPO_bdpm.txt"):
    if len(r) < 8: continue
    code, elem, _, subst, dose, ref, nature, liaison = [x.strip() for x in r[:8]]
    if code not in cis: continue
    key = (elem, liaison)
    cur = comp[code].get(key)
    if cur is None or nature == "FT": comp[code][key] = (subst, dose, elem)
def sentence(s):
    s = s.strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s
def base_name(s):
    s = sentence(s)
    m = re.fullmatch(r"(.+?) \((acide)\)", s)
    if m: return f"acide {m.group(1)}"
    s = re.sub(r" \([^()]*\b(?:de|d')\)$", "", s)
    return s
def cap(s): return s[:1].upper() + s[1:]
def clean_dose(d):
    d = re.sub(r"\s+", " ", d.strip())
    d = re.sub(r"(\d),0+\b", r"\1", d)
    d = re.sub(r"(\d,\d*?)0+\b", r"\1", d)
    return d
known = set()
for code in cis:
    for c in comp.get(code, {}).values(): known.add(base_name(c[0]))
SALT = r"(?:di|mono|tri)?(?:chlorhydrate|sulfate|maléate|bésilate|tartrate|fumarate|succinate|citrate|mésilate|acétate|phosphate|bromhydrate|lactate|gluconate|nitrate|oxalate|tosilate|arginine|erbumine)"
def clean_name(n):
    cands = []
    m = re.fullmatch(SALT + r" (?:de |d')(.+)", n)
    if m: cands.append(m.group(1))
    m = re.fullmatch(r"(.+?) (?:anhydre|base|(?:hémi|sesqui|mono|di|tri)?hydraté(?:e)?|" + SALT + r")", n)
    if m: cands.append(m.group(1))
    for c in cands:
        if c in known and c != n: return c
    return n
entries = collections.OrderedDict()
for code, (denom, forme, voies) in cis.items():
    comps = list(comp.get(code, {}).values())
    if not comps: continue
    first_elem = comps[0][2]
    comps = [c for c in comps if c[2] == first_elem]
    if len(comps) > 4: continue
    names = [clean_name(base_name(c[0])) for c in comps]
    dci = cap(" + ".join(names))
    head = re.split(r",\s", denom)[0].strip()
    m = re.search(r"\s(\d[\d,.]*\s?(?:mg|g|µg|microgrammes?|nanogrammes?|UI|U\.I\.|%|ml|mL|millions?|M)(?![A-Za-z]).*)$", head) or re.search(r"\s(\d.*)$", head)
    if m:
        dose = m.group(1)
        dose = re.sub(r"\s*POUR\s*CENT\b", " %", dose, flags=re.I)
        fw = forme.strip().split(" ")[0].lower()
        cut = dose.lower().find(" " + fw + " ") if fw else -1
        if cut > 0: dose = dose[:cut].strip()
        elif fw and dose.lower().endswith(" " + fw): dose = dose[: -len(fw) - 1].strip()
        dose = re.sub(r"(\s+[A-ZÉÈÀÂÎÔÛÇ][A-ZÉÈÀÂÎÔÛÇ\-]{2,})+$", "", dose).strip()
        dose = re.sub(r"(\s+(?:nourrissons?|enfants?|adultes?|et|sans|sucre|nouveau-nés?))+$", "", dose, flags=re.I).strip()
        dose = re.sub(r"(\d) (\d{3})\b", r"\1\2", dose)
        dose = re.sub(r"\s*/\s*", " / ", dose)
        dose = clean_dose(dose)
    else:
        dose = ""
    dose = dose.replace("mL", "ml")
    if not dose or re.fullmatch(r"[\d,.\s]+", dose):
        dose = " / ".join(clean_dose(c[1]) for c in comps if c[1])
    dose = re.sub(r"^(\d+)000 mg$", lambda x: x.group(1) + " g", dose)
    forme_c = sentence(forme)
    brand = re.split(r"\s\d", head)[0].strip()
    k = (dci, dose, forme_c)
    e = entries.setdefault(k, set())
    nb = unicodedata.normalize("NFD", brand).encode("ascii", "ignore").decode().lower()
    subs = [unicodedata.normalize("NFD", n).encode("ascii", "ignore").decode().lower() for n in names]
    words = set(w[:6] for n in subs for w in re.split(r"[\s/]+", n) if len(w) > 3)
    bwords = [w[:6] for w in re.split(r"[\s/]+", nb) if w]
    if brand and "/" not in brand and not (bwords and bwords[0] in words): e.add(brand)
rows = []
for (dci, dose, forme), brands in entries.items():
    b = sorted(brands, key=lambda x: (len(x), x))[:4]
    rows.append([dci, dose, forme, "|".join(b)])
rows.sort(key=lambda r: (r[0].lower(), r[2], r[1]))
json.dump({"source": "Base de données publique des médicaments (ANSM)", "extrait": __import__("datetime").date.today().isoformat(), "rows": rows}, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
print(len(cis), "specialites commercialisees;", len(rows), "entrees")
