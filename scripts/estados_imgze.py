"""
States ordered by when their first section wrote "Gerando arquivo de resultado [imgze.dat] + [Término]"
(the urna finished its result file, i.e. the count of that section was ready), among the sections that closed late.

    python scripts/estados_imgze.py                  # sections whose line is at/after 18:50 Brasília
    python scripts/estados_imgze.py --desde 17:30    # every late-closing section read

Input: results_imgze/imgze_<UF>.csv from
    baixar_logs_resultados.py --evento imgze --so-secoes results_enc/encerramentos_BR.csv
Times are converted from the urna clock to Brasília time with the municipality clocks of state_enc/.
Output: results_imgze/estados_imgze.csv (state, first time, section, how many sections, last time)
"""
import argparse
import csv
import glob
import gzip
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from clocks import clock, muni_offsets, secs  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.join(HERE, ".."))
    ap.add_argument("--desde", default="18:50", help="keep lines at/after this, Brasília (HH:MM)")
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    lo = secs(args.desde.replace(":", "") + "00")

    names, closing = {}, {}
    for p in sorted(glob.glob(os.path.join(root, "data", "t1", "secoes_t1_*.csv.gz"))):
        with gzip.open(p, "rt", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                names[(r["uf"], r["municipio"])] = r["nome_municipio"]
    for p in sorted(glob.glob(os.path.join(root, "state_enc", "done_[A-Z][A-Z].txt"))):
        uf = os.path.basename(p)[5:7]
        for ln in open(p, encoding="utf-8"):
            a = ln.strip().split(",")
            if len(a) == 4 and a[3] != "-":
                closing.setdefault((uf, a[0]), []).append(secs(a[3]))
    off, _ = muni_offsets(((k, v, names.get(k, "")) for k, v in closing.items()))

    per, read, none = {}, 0, 0
    for p in sorted(glob.glob(os.path.join(root, "results_imgze", "imgze_[A-Z][A-Z].csv"))):
        for r in csv.DictReader(open(p, newline="", encoding="utf-8")):
            read += 1
            if not r["imgze_termino"]:
                none += 1
                continue
            br = secs(r["imgze_termino"]) - off.get((r["uf"], r["municipio"]), 0) * 3600
            if br >= lo:
                per.setdefault(r["uf"], []).append((br, r))
    rows = []
    for uf, items in per.items():
        items.sort(key=lambda x: x[0])
        t, r = items[0]
        rows.append({"uf": uf, "primeiro": clock(t), "municipio": r["nome_municipio"], "zona": r["zona"], "secao": r["secao"],
                     "secoes": len(items), "ultimo": clock(items[-1][0])})
    rows.sort(key=lambda r: r["primeiro"])
    out = os.path.join(root, "results_imgze", "estados_imgze.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["uf", "primeiro", "municipio", "zona", "secao", "secoes", "ultimo"])
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} states with a section whose imgze.dat finished at/after {args.desde} Brasília "
          f"({read} late-closing sections read, {none} without the line)")
    for i, r in enumerate(rows, 1):
        print(f"{i:2d}. {r['uf']}  {r['primeiro']}  {r['municipio']} z{r['zona']} s{r['secao']}  ({r['secoes']} sections, last {r['ultimo']})")
    print("->", os.path.relpath(out, root))


if __name__ == "__main__":
    main()
