"""
Rebuild results/secoes_apos_17h_BR.csv from the per-state results/secoes_apos_17h_<UF>.csv.

    python merge_resultados.py [--results-dir results]
    python merge_resultados.py --results-dir results_enc --prefix encerramentos   # closing-time scan

Rows are de-duplicated by (uf, municipio, zona, secao). The first kind is sorted by votes after
the cutoff (most first), the closing-time kind by uf/municipio/zona/secao. The file is only
rewritten when its content changes.
"""
import argparse
import csv
import glob
import io
import os


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results-dir", default="results")
    ap.add_argument("--prefix", default="secoes_apos_17h")
    args = ap.parse_args()

    out = os.path.join(args.results_dir, f"{args.prefix}_BR.csv")
    fields, rows = None, {}
    for path in sorted(glob.glob(os.path.join(args.results_dir, f"{args.prefix}_*.csv"))):
        if os.path.abspath(path) == os.path.abspath(out):
            continue
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            fields = fields or reader.fieldnames
            for r in reader:
                rows[(r["uf"], r["municipio"], r["zona"], r["secao"])] = r
    if not fields:
        print("no per-state results yet; nothing to merge")
        return

    votes_first = args.prefix == "secoes_apos_17h"
    ordered = sorted(rows.values(), key=lambda r: (-int(r["votos_apos_corte"]) if votes_first else 0,
                                                   r["uf"], r["municipio"], r["zona"], r["secao"]))
    buf = io.StringIO(newline="")
    w = csv.DictWriter(buf, fieldnames=fields, lineterminator="\n")
    w.writeheader()
    w.writerows(ordered)

    old = None
    if os.path.exists(out):
        with open(out, newline="", encoding="utf-8") as f:
            old = f.read()
    if old != buf.getvalue():
        with open(out, "w", newline="", encoding="utf-8") as f:
            f.write(buf.getvalue())
    print(f"{len(ordered)} sections in {out}"
          + ("" if old != buf.getvalue() else " (unchanged)"))


if __name__ == "__main__":
    main()
