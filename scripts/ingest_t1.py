"""
Turn the TSE first-turn presidential results by section (votacao_presidente_t1_<UF>.csv,
usually sent as <UF>.zip) into one compact file per state: data/t1/secoes_t1_<UF>.csv.gz.

    python scripts/ingest_t1.py /path/to/AC.zip /path/to/AL.zip /path/to/folder-with-csvs ...

Accepts .zip files (with the csv inside), .csv files, or folders holding either. A state sent
in several parts (SP_parte_01.zip ...) must be given in the same run: the parts are joined
before summarising, because one section's rows can straddle two parts. Running it again for a
state replaces that state's file; other states are left alone, so the data can be added five
states at a time.

Output columns (one row per section):
  municipio     TSE municipality code, 5 digits (same as results/secoes_apos_17h_*.csv)
  nome_municipio, zona (4 digits), secao (4 digits)
  aptos, comparecimento
  lula (13), flavio (22), outros (every other candidate), brancos, nulos
  vencedor      number of the candidate with the most votes (0 = tie)

The TSE file only lists candidates that got votes in a section, so a missing row means zero.
"""
import argparse
import glob
import io
import os
import sys
import zipfile

import pandas as pd

LULA, FLAVIO, BRANCO, NULO = 13, 22, 95, 96
USECOLS = ["sg_uf", "cd_municipio", "nm_municipio", "nr_zona", "nr_secao", "nr_votavel",
           "qt_aptos", "qt_comparecimento", "qt_votos", "nr_turno", "ds_cargo"]
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "t1")


def read_inputs(paths):
    """Yield (label, bytes) for every first-turn csv found in paths."""
    for p in paths:
        if os.path.isdir(p):
            found = sorted(glob.glob(os.path.join(p, "**", "*.zip"), recursive=True)
                           + glob.glob(os.path.join(p, "**", "votacao_presidente_t1_*.csv"), recursive=True))
            yield from read_inputs(found)
        elif p.lower().endswith(".zip"):
            with zipfile.ZipFile(p) as z:
                for n in z.namelist():
                    if n.lower().endswith(".csv"):
                        yield f"{p}:{n}", z.read(n)
        elif p.lower().endswith(".csv"):
            with open(p, "rb") as f:
                yield p, f.read()


def parse(raw, label):
    df = pd.read_csv(io.BytesIO(raw), sep=";", encoding="cp1252", dtype=str, usecols=USECOLS)
    if not (df.nr_turno == "1").all() or not (df.ds_cargo == "Presidente").all():
        sys.exit(f"{label}: expected only first-turn Presidente rows")
    return df


def summarise(df):
    ufs = df.sg_uf.unique()
    if len(ufs) != 1:
        sys.exit(f"expected one state, found {list(ufs)}")
    uf = ufs[0]

    df["municipio"] = df.cd_municipio.str.zfill(5)
    df["zona"] = df.nr_zona.str.zfill(4)
    df["secao"] = df.nr_secao.str.zfill(4)
    df["cand"] = df.nr_votavel.astype(int)
    df["votos"] = df.qt_votos.astype(int)
    key = ["municipio", "zona", "secao"]

    per_cand = df.groupby(key + ["cand"], as_index=False, sort=False).votos.sum()
    wide = per_cand.pivot_table(index=key, columns="cand", values="votos", aggfunc="sum",
                                fill_value=0)
    cands = [c for c in wide.columns if c not in (BRANCO, NULO)]
    out = pd.DataFrame(index=wide.index)
    out["lula"] = wide.get(LULA, 0)
    out["flavio"] = wide.get(FLAVIO, 0)
    out["outros"] = wide[cands].sum(axis=1) - out.lula - out.flavio
    out["brancos"] = wide.get(BRANCO, 0)
    out["nulos"] = wide.get(NULO, 0)

    top = wide[cands]
    best = top.max(axis=1)
    out["vencedor"] = top.idxmax(axis=1)
    out.loc[(top.eq(best, axis=0)).sum(axis=1) > 1, "vencedor"] = 0  # tie

    meta = (df.groupby(key, sort=False)
              .agg(nome_municipio=("nm_municipio", "first"),
                   aptos=("qt_aptos", lambda s: int(s.iloc[0])),
                   comparecimento=("qt_comparecimento", lambda s: int(s.iloc[0]))))
    out = out.join(meta).reset_index()
    out.insert(0, "uf", uf)

    # sanity: votes counted must equal turnout
    diff = (out.lula + out.flavio + out.outros + out.brancos + out.nulos - out.comparecimento)
    bad = int((diff != 0).sum())
    cols = ["uf", "municipio", "nome_municipio", "zona", "secao", "aptos", "comparecimento",
            "lula", "flavio", "outros", "brancos", "nulos", "vencedor"]
    out = out[cols].sort_values(["municipio", "zona", "secao"])
    out["vencedor"] = out.vencedor.astype(int)
    return uf, out, bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+", help=".zip / .csv files or folders")
    ap.add_argument("--out-dir", default=OUT_DIR)
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)

    by_uf = {}
    for label, raw in read_inputs(args.inputs):
        df = parse(raw, label)
        print(f"read {label}: {len(df)} rows")
        by_uf.setdefault(df.sg_uf.iloc[0], []).append(df)
    if not by_uf:
        sys.exit("no first-turn csv found in the given inputs")

    for uf, parts in sorted(by_uf.items()):
        df = pd.concat(parts, ignore_index=True)
        before = len(df)
        df = df.drop_duplicates()  # overlapping parts
        if len(df) != before:
            print(f"{uf}: dropped {before - len(df)} duplicated rows")
        uf, out, bad = summarise(df)
        path = os.path.join(args.out_dir, f"secoes_t1_{uf}.csv.gz")
        out.to_csv(path, index=False, compression={"method": "gzip", "mtime": 0})
        print(f"{uf}: {len(out):6d} sections, {out.municipio.nunique():4d} municipalities, "
              f"Lula won {int((out.vencedor == LULA).sum())}, Flávio won {int((out.vencedor == FLAVIO).sum())}, "
              f"{bad} sections where votes != turnout  -> {os.path.relpath(path)}")


if __name__ == "__main__":
    main()
