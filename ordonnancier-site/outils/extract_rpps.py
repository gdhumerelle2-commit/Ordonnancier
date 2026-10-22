"""Lit l'extraction PS_LibreAcces (personne-activite) sur l'entrée standard et écrit rpps;nom;prenom des médecins."""
import sys, io, csv
out = open(sys.argv[1], "w", encoding="utf-8", newline="")
w = csv.writer(out, delimiter=";")
inp = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")
header = inp.readline().rstrip("\n\r").split("|")
idx = {h: i for i, h in enumerate(header)}
print("colonnes:", header[:12], file=sys.stderr)
c_type, c_id = idx["Type d'identifiant PP"], idx["Identifiant PP"]
c_nom, c_pre, c_prof = idx["Nom d'exercice"], idx["Prénom d'exercice"], idx["Code profession"]
seen = set(); n = 0
for line in inp:
    f = line.rstrip("\n\r").split("|")
    if len(f) <= c_prof: continue
    n += 1
    if f[c_prof] != "10" or f[c_type] != "8": continue
    r = f[c_id].strip()
    if len(r) != 11 or not r.isdigit() or r in seen: continue
    seen.add(r); w.writerow([r, f[c_nom].strip(), f[c_pre].strip()])
print(f"lignes lues {n}, medecins {len(seen)}", file=sys.stderr)
