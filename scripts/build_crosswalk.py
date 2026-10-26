"""
Match TSE municipality codes to IBGE ids (needed to draw the map). TSE and IBGE use different
codes, so municipalities are matched by name inside each state.

    python scripts/build_crosswalk.py

Reads data/t1/secoes_t1_<UF>.csv.gz and web/public/geo/mun_<UF>.json, writes data/tse_ibge.csv
(uf, municipio, ibge, nome_tse, nome_ibge, como) and prints municipalities it could not match.
A fuzzy match is only accepted when it is unambiguous; fix the rest in OVERRIDES.
"""
import csv
import difflib
import glob
import gzip
import json
import os
import re
import unicodedata

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
# (uf, normalised TSE name) -> IBGE name, for municipalities renamed since the boundary file.
# Municipalities created recently (e.g. Pinto Bandeira RS, Balneário Rincão SC, Pescaria Brava SC,
# Paraíso das Águas MS, Nazária PI, Mojuí dos Campos PA, Boa Esperança do Norte MT) have no
# polygon in the source; they show up in the tables but not on the map.
OVERRIDES = {
    ("GO", "BOMJESUS"): "Bom Jesus de Goiás",
    ("PB", "JOCACLAUDINO"): "Santarém",
    ("PB", "SAOVICENTEDOSERIDO"): "Seridó",
    ("PB", "TACIMA"): "Campo de Santana",
    ("RN", "ASSU"): "Açu",
    ("RN", "AREZ"): "Arês",
    ("RN", "CAMPOGRANDE"): "Augusto Severo",
    ("RN", "BOASAUDE"): "Januário Cicco",
    ("RN", "SERRACAIADA"): "Presidente Juscelino",
    ("SP", "EMBUDASARTES"): "Embu",
    ("TO", "TABOCAO"): "Fortaleza do Tabocão",
    ("TO", "SAOVALERIO"): "São Valério da Natividade",
}


def norm(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]", "", s)


def main():
    rows = []
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "t1", "secoes_t1_*.csv.gz"))):
        uf = os.path.basename(path).split("_")[-1].split(".")[0]
        gj = os.path.join(ROOT, "web", "public", "geo", f"mun_{uf}.json")
        if not os.path.exists(gj):
            print(f"{uf}: no geometry, skipped")
            continue
        ibge = {}
        for f in json.load(open(gj, encoding="utf-8"))["features"]:
            ibge.setdefault(norm(f["properties"]["name"]), []).append(
                (f["properties"]["id"], f["properties"]["name"]))
        tse = {}
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                tse[r["municipio"]] = r["nome_municipio"]

        used, pending = set(), []
        for code, name in sorted(tse.items()):
            key = norm(name)
            if (uf, key) in OVERRIDES:
                i, nm = ibge[norm(OVERRIDES[(uf, key)])][0]
                rows.append((uf, code, i, name, nm, "manual")); used.add(i)
            elif key in ibge and len(ibge[key]) == 1:
                i, nm = ibge[key][0]
                rows.append((uf, code, i, name, nm, "nome")); used.add(i)
            else:
                pending.append((code, name))
        left = {k: v for k, v in ibge.items() if v[0][0] not in used}
        for code, name in pending:
            hit = difflib.get_close_matches(norm(name), list(left), n=2, cutoff=0.8)
            if hit and (len(hit) == 1 or difflib.SequenceMatcher(None, norm(name), hit[0]).ratio()
                        - difflib.SequenceMatcher(None, norm(name), hit[1]).ratio() > 0.05):
                i, nm = left[hit[0]][0]
                rows.append((uf, code, i, name, nm, "aproximado")); used.add(i)
                left.pop(hit[0])
            else:
                print(f"  {uf} {code} {name}: no match (candidates left: "
                      f"{[v[0][1] for v in left.values()][:6]})")
        print(f"{uf}: {len(tse)} TSE municipalities, {sum(1 for r in rows if r[0] == uf)} matched")

    out = os.path.join(ROOT, "data", "tse_ibge.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["uf", "municipio", "ibge", "nome_tse", "nome_ibge", "como"])
        w.writerows(sorted(rows))
    approx = [r for r in rows if r[5] == "aproximado"]
    print(f"\n{len(rows)} matched ({len(approx)} approximate) -> {os.path.relpath(out)}")
    for r in approx:
        print(f"  approx: {r[0]} {r[3]!r} -> {r[4]!r}")


if __name__ == "__main__":
    main()
