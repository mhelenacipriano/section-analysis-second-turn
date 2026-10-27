"""
Votes cast at/after 17:30 BRASÍLIA in every section (the site's "late vote" cut-off).

Candidates are the sections whose last vote is at/after 17:30 Brasília (last vote from the first vote
scan, results/secoes_apos_17h_<UF>.csv, plus the detail rows of the closing scan), the sections of the
municipalities whose clock is not their state's default and the sections the first scan could not read.
Their logs are read in memory (never saved) and the votes at/after 17:30 on the urna's own clock are
counted. Every other section has no vote at/after 17:30.

    python scripts/votos_apos_1730.py

Writes data/votos_apos_1730.csv (uf, municipio, zona, secao, votos_apos_1730), which
scripts/build_site_data.py reads.
"""
import csv
import datetime
import glob
import gzip
import os
import sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import baixar_logs_resultados as b  # noqa: E402
import votos_apos_17h as v  # noqa: E402
from clocks import UF_OFFSET, muni_offsets, secs  # noqa: E402

CUT = 17 * 3600 + 30 * 60
DAY = datetime.datetime(2026, 10, 25)


def main():
    t1, closing, names = set(), {}, {}
    for p in sorted(glob.glob(os.path.join(ROOT, "data", "t1", "secoes_t1_*.csv.gz"))):
        with gzip.open(p, "rt", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                t1.add((r["uf"], r["municipio"], r["zona"], r["secao"]))
                names[(r["uf"], r["municipio"])] = r["nome_municipio"]
    for p in sorted(glob.glob(os.path.join(ROOT, "state_enc", "done_[A-Z][A-Z].txt"))):
        uf = os.path.basename(p)[5:7]
        for ln in open(p, encoding="utf-8"):
            a = ln.strip().split(",")
            if len(a) == 4 and a[3] != "-":
                closing.setdefault((uf, a[0]), []).append(secs(a[3]))
    off, _ = muni_offsets(((k, vals, names.get(k, "")) for k, vals in closing.items()))

    todo = {}
    def add(key):
        if key in t1:
            todo[key] = off.get(key[:2], UF_OFFSET.get(key[0], 0))
    for p in glob.glob(os.path.join(ROOT, "results", "secoes_apos_17h_[A-Z][A-Z].csv")):      # last vote, urna clock
        for r in csv.DictReader(open(p, encoding="utf-8")):
            key = (r["uf"], r["municipio"], r["zona"], r["secao"])
            if key in t1 and secs(r["ultimo_voto"]) - off.get(key[:2], 0) * 3600 >= CUT:
                add(key)
    for p in glob.glob(os.path.join(ROOT, "results_enc", "encerramentos_[A-Z][A-Z].csv")):    # late-closing sections
        for r in csv.DictReader(open(p, encoding="utf-8")):
            if r["ultimo_voto"] and secs(r["ultimo_voto"]) - off.get((r["uf"], r["municipio"]), 0) * 3600 >= CUT:
                add((r["uf"], r["municipio"], r["zona"], r["secao"]))
    for key in t1:                                                                             # clocks that differ from the state's
        if off.get(key[:2], 0) != UF_OFFSET.get(key[0], 0):
            add(key)
    for p in glob.glob(os.path.join(ROOT, "results", "problemas_*.csv")):                      # unread by the first scan
        uf = os.path.basename(p)[10:12]
        for r in csv.DictReader(open(p, encoding="utf-8")):
            add((uf, r["municipio"], r["zona"], r["secao"]))
    print(f"{len(todo)} sections to read")

    def one(item):
        (uf, mun, zona, secao), o = item
        try:
            name, blob, err = b.fetch_log("ele2026", "3221", uf, {"mun": mun, "zona": zona, "secao": secao}, None, {})
            if err:
                return item, None, err
            cutoff = DAY.replace(hour=17, minute=30) + datetime.timedelta(hours=o)   # 17:30 Brasília on this urna's clock
            return item, v.analyse(blob, name, cutoff)[2], None
        except Exception as e:                        # noqa: BLE001
            return item, None, str(e)

    rows, failed = [], []
    with ThreadPoolExecutor(6) as ex:
        for i, (item, late, err) in enumerate(ex.map(one, sorted(todo.items())), 1):
            if err:
                failed.append((item[0], err))
            elif late:
                rows.append([*item[0], late])
            if i % 500 == 0:
                print(f"  {i}/{len(todo)}")
    out = os.path.join(ROOT, "data", "votos_apos_1730.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["uf", "municipio", "zona", "secao", "votos_apos_1730"])
        w.writerows(sorted(rows))
    print(f"{len(rows)} sections with votes at/after 17:30 ({sum(r[4] for r in rows)} votes); {len(failed)} without a log")
    for key, err in failed[:10]:
        print("  no log:", key, err[:90])


if __name__ == "__main__":
    main()
