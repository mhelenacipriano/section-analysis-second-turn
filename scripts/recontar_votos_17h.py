"""
Re-count the votes after 17:00 BRASÍLIA for the sections where the first vote scan used the wrong clock
or missed the section:

  * municipalities whose urna clock is not their state's default (Fernando de Noronha, +1 h; the
    Amazonas municipalities on Acre time, -2 h: scripts/clocks.py), and
  * sections the first scan could not read (results/problemas_*.csv: rate limiting, no log listed).

Writes data/votos_apos_17h_corrigido.csv (uf, municipio, zona, secao, votos_apos_17h_brasilia,
valor_anterior), which scripts/build_site_data.py applies on top of results/secoes_apos_17h_*.csv.
Logs are read in memory and never saved.

    python scripts/recontar_votos_17h.py
"""
import csv
import datetime
import glob
import gzip
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import baixar_logs_resultados as b  # noqa: E402
import votos_apos_17h as v  # noqa: E402
from clocks import UF_OFFSET, muni_offsets  # noqa: E402

DAY = datetime.datetime(2026, 10, 25)


def main():
    t1, closing, names = {}, {}, {}
    for p in sorted(glob.glob(os.path.join(ROOT, "data", "t1", "secoes_t1_*.csv.gz"))):
        with gzip.open(p, "rt", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                t1[(r["uf"], r["municipio"], r["zona"], r["secao"])] = r
                names[(r["uf"], r["municipio"])] = r["nome_municipio"]
    for p in sorted(glob.glob(os.path.join(ROOT, "state_enc", "done_[A-Z][A-Z].txt"))):
        uf = os.path.basename(p)[5:7]
        for ln in open(p, encoding="utf-8"):
            a = ln.strip().split(",")
            if len(a) == 4 and a[3] != "-":
                closing.setdefault((uf, a[0]), []).append(int(a[3][:2]) * 3600 + int(a[3][2:4]) * 60 + int(a[3][4:6]))
    off, _ = muni_offsets(((k, vals, names.get(k, "")) for k, vals in closing.items()))

    todo = {}                                         # (uf, mun, zona, secao) -> clock offset of the urna
    for key in t1:
        if off.get(key[:2], 0) != UF_OFFSET.get(key[0], 0):
            todo[key] = off[key[:2]]
    for p in glob.glob(os.path.join(ROOT, "results", "problemas_*.csv")):
        uf = os.path.basename(p)[10:12]
        for r in csv.DictReader(open(p, encoding="utf-8")):
            key = (uf, r["municipio"], r["zona"], r["secao"])
            if key in t1:
                todo.setdefault(key, off.get(key[:2], UF_OFFSET.get(uf, 0)))
    print(f"{len(todo)} sections to re-count")

    before = {}
    for p in glob.glob(os.path.join(ROOT, "results", "secoes_apos_17h_[A-Z][A-Z].csv")):
        for r in csv.DictReader(open(p, encoding="utf-8")):
            before[(r["uf"], r["municipio"], r["zona"], r["secao"])] = int(r["votos_apos_corte"])

    def one(item):
        (uf, mun, zona, secao), o = item
        s = {"mun": mun, "zona": zona, "secao": secao}
        try:
            name, blob, err = b.fetch_log("ele2026", "3221", uf, s, None, {})
            if err:
                return item, None, err
            cutoff = DAY.replace(hour=17) + datetime.timedelta(hours=o)   # 17:00 Brasília on this urna's clock
            return item, v.analyse(blob, name, cutoff)[2], None
        except Exception as e:                        # noqa: BLE001
            return item, None, str(e)

    rows, failed = [], []
    with ThreadPoolExecutor(6) as ex:
        for i, (item, late, err) in enumerate(ex.map(one, sorted(todo.items())), 1):
            key = item[0]
            if err:
                failed.append((key, err))
            else:
                rows.append([*key, late, before.get(key, 0)])
            if i % 100 == 0:
                print(f"  {i}/{len(todo)}")
    out = os.path.join(ROOT, "data", "votos_apos_17h_corrigido.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["uf", "municipio", "zona", "secao", "votos_apos_17h_brasilia", "valor_anterior"])
        w.writerows(sorted(rows))
    print(f"{len(rows)} re-counted ({sum(r[4] for r in rows)} votes after 17:00, was {sum(r[5] for r in rows)}); {len(failed)} without a log")
    for key, err in failed[:10]:
        print("  no log:", key, err[:90])


if __name__ == "__main__":
    main()
