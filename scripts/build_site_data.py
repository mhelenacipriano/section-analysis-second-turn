"""
Build the JSON files the website reads (web/public/data/*.json) from

  data/t1/secoes_t1_<UF>.csv.gz       first-turn results per section      (scripts/ingest_t1.py)
  state_enc/done_<UF>.txt             closing time of EVERY section        (tse-encerramento scan)
  results_enc/encerramentos_<UF>.csv  detail of the sections that closed late or have no record
  data/tse_ibge.csv                   TSE -> IBGE municipality codes      (scripts/build_crosswalk.py)
  data/secoes_alteradas_2t.csv        (optional) sections whose polling place changed

    python scripts/build_site_data.py [--root DIR] [--out DIR]

"Closing time" = the last "Procedimento de encerramento confirmado" the urna logged on election
day, converted to Brasília time. Universe: a section is analysed only if we have its first-turn
result AND the scan has read its log; a section the scan never reached is unknown and is left
out, never counted as "closed on time". Re-run after adding states; nothing else changes.

Detail rows (web/public/data/encerramentos.json) exist for sections that closed at or after
RECORD_FROM (17:30 Brasília) or have no closing record; every other section only enters the
municipality totals (municipios.json). Times are seconds since midnight, Brasília time.
"""
import argparse
import csv
import glob
import json
import os
import sys
from datetime import datetime, timezone

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from clocks import muni_offsets  # noqa: E402
LULA, FLAVIO = 13, 22
RECORD_FROM = 17 * 3600 + 30 * 60
UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB",
       "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO", "ZZ"]


def hms(t):
    return int(t[0:2]) * 3600 + int(t[2:4]) * 60 + int(t[4:6])


def colon(t):
    return int(t[0:2]) * 3600 + int(t[3:5]) * 60 + int(t[6:8])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.join(HERE, ".."))
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    out_dir = args.out or os.path.join(root, "web", "public", "data")

    frames = [pd.read_csv(p, dtype={"municipio": str, "zona": str, "secao": str})
              for p in sorted(glob.glob(os.path.join(root, "data", "t1", "secoes_t1_*.csv.gz")))]
    if not frames:
        sys.exit("no data/t1/secoes_t1_*.csv.gz; run scripts/ingest_t1.py first")
    t1 = pd.concat(frames, ignore_index=True)
    t1["key"] = t1.municipio + "," + t1.zona + "," + t1.secao

    # --- closing time of every scanned section (local clock, seconds) ------------------------
    close_local = {}                      # (uf, key) -> seconds or None (no closing record)
    scanned_uf = {}
    for uf in sorted(t1.uf.unique()):
        p = os.path.join(root, "state_enc", f"done_{uf}.txt")
        n = 0
        if os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                for ln in f:
                    parts = ln.strip().split(",")
                    if len(parts) == 4:
                        close_local[(uf, ",".join(parts[:3]))] = None if parts[3] == "-" else hms(parts[3])
                        n += 1
        scanned_uf[uf] = n
    t1["scanned"] = [(u, k) in close_local for u, k in zip(t1.uf, t1.key)]
    uni = t1[t1.scanned].copy().reset_index(drop=True)
    if uni.empty:
        sys.exit("no section has both a first-turn result and a closing time yet (state_enc/ empty?)")
    uni["loc"] = [close_local[(u, k)] for u, k in zip(uni.uf, uni.key)]

    # --- clock of each municipality ------------------------------------------------------------
    muni_off, detected = muni_offsets(
        ((key, [v for v in g["loc"] if v is not None], g.nome_municipio.iloc[0])
         for key, g in uni.groupby(["uf", "municipio"])))
    uni["off"] = [muni_off[(u, m)] for u, m in zip(uni.uf, uni.municipio)]
    uni["enc"] = [None if l is None else l - o * 3600 for l, o in zip(uni["loc"], uni.off)]
    if detected:
        print("municipalities whose urna clock differs from the state's (detected from closing times):")
        for d in detected:
            print(f"   {d[0]} {d[1]} {d[2]}: state offset {d[3]:+d}h -> {d[4]:+d}h")

    # --- detail rows from the scan (last vote, selecting/starting times, votes after 17h) -----
    det = {}
    for p in sorted(glob.glob(os.path.join(root, "results_enc", "encerramentos_[A-Z][A-Z].csv"))):
        with open(p, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                det[(r["uf"], f"{r['municipio']},{r['zona']},{r['secao']}")] = r

    # votes at/after 17:30 BRASÍLIA (the site's "late vote" cut-off): scripts/votos_apos_1730.py reads the logs of
    # every section whose last vote is at/after 17:30; any other section has none
    va30 = {}
    p30 = os.path.join(root, "data", "votos_apos_1730.csv")
    if os.path.exists(p30):
        with open(p30, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                va30[(r["uf"], f"{r['municipio']},{r['zona']},{r['secao']}")] = int(r["votos_apos_1730"])

    def det_time(r, col, off):
        v = r.get(col) if r else None
        return None if not v else colon(v) - off * 3600

    uni["sel"] = None; uni["ini"] = None; uni["ult"] = None; uni["vd"] = 0; uni["va"] = 0
    where = {(u, k): i for i, (u, k) in enumerate(zip(uni.uf, uni.key))}
    for (uf, key), r in det.items():
        i = where.get((uf, key))
        if i is None:
            continue
        off = int(uni.at[i, "off"])
        uni.at[i, "sel"] = det_time(r, "encerrar_selecionado", off)
        uni.at[i, "ini"] = det_time(r, "inicio_encerramento", off)
        uni.at[i, "ult"] = det_time(r, "ultimo_voto", off)
        uni.at[i, "vd"] = int(r["votos_no_dia"])
    uni["registrar"] = uni.enc.isna() | (uni.enc.fillna(0) >= RECORD_FROM)
    uni["va"] = [va30.get((u, k), 0) for u, k in zip(uni.uf, uni.key)]               # votes at/after 17:30
    # ... of which in the sections that closed before 17:30 (a vote after the confirmed closing cannot exist: ~0)
    uni["va0"] = [0 if reg else v for reg, v in zip(uni.registrar, uni.va)]

    # --- municipalities --------------------------------------------------------------------
    xw = pd.read_csv(os.path.join(root, "data", "tse_ibge.csv"), dtype=str)
    ibge = {(r.uf, r.municipio): r.ibge for r in xw.itertuples()}
    g = uni.groupby(["uf", "municipio"], sort=True)
    mun = g.agg(nome=("nome_municipio", "first"), n=("key", "size"),
                wl=("vencedor", lambda s: int((s == LULA).sum())),
                wf=("vencedor", lambda s: int((s == FLAVIO).sum())),
                vl=("lula", "sum"), vf=("flavio", "sum"), vo=("outros", "sum"),
                vb=("brancos", "sum"), vn=("nulos", "sum"),
                ap=("aptos", "sum"), cp=("comparecimento", "sum"), va0=("va0", "sum")).reset_index()
    mun["wo"] = mun.n - mun.wl - mun.wf
    mun["ibge"] = [ibge.get((u, m), "") for u, m in zip(mun.uf, mun.municipio)]
    mun_index = {(u, m): i for i, (u, m) in enumerate(zip(mun.uf, mun.municipio))}
    mcols = ["uf", "cod", "ibge", "nome", "n", "wl", "wf", "wo", "vl", "vf", "vo", "vb", "vn",
             "ap", "cp", "va0"]
    mrows = [[r.uf, r.municipio, r.ibge, r.nome, int(r.n), int(r.wl), int(r.wf), int(r.wo),
              int(r.vl), int(r.vf), int(r.vo), int(r.vb), int(r.vn), int(r.ap), int(r.cp), int(r.va0)]
             for r in mun.itertuples()]

    # --- changed polling places --------------------------------------------------------------
    alt_path = os.path.join(root, "data", "secoes_alteradas_2t.csv")
    alt_keys, alt_rows = set(), []
    nn = lambda v: None if v is None or (isinstance(v, float) and pd.isna(v)) else int(v)
    if os.path.exists(alt_path):
        a = pd.read_csv(alt_path, sep=";", encoding="cp1252", dtype=str)
        look = {(r.uf, int(r.zona), int(r.secao)): r for r in uni.itertuples()}
        for r in a.itertuples():
            s = look.get((r.sg_uf, int(r.nr_zona), int(r.nr_secao)))
            row = {"uf": r.sg_uf, "nome": r.nm_municipio, "zona": int(r.nr_zona),
                   "secao": int(r.nr_secao), "ini": r.nm_local_votacao_inicial,
                   "fim": r.nm_local_votacao_final, "eleitores": int(r.qt_eleitores), "s": None}
            if s is not None:
                alt_keys.add((s.uf, s.key))
                row["mi"] = mun_index[(s.uf, s.municipio)]
                row["s"] = [int(s.aptos), int(s.comparecimento), int(s.lula), int(s.flavio),
                            int(s.outros), int(s.brancos), int(s.nulos), int(s.vencedor),
                            nn(s.enc), nn(s.ult), int(s.va), 1 if s.enc is None or pd.isna(s.enc) else 0]
            alt_rows.append(row)

    # --- detail rows ---------------------------------------------------------------------------
    L = uni[uni.registrar].sort_values(["uf", "municipio", "zona", "secao"])
    dcols = ["mi", "zona", "secao", "enc", "sel", "ini", "ult", "vd", "va", "ap", "cp", "l", "f",
             "o", "b", "n", "v", "alt", "sr"]          # sr = 1: no closing record in the log
    drows = [[mun_index[(r.uf, r.municipio)], int(r.zona), int(r.secao), nn(r.enc), nn(r.sel),
              nn(r.ini), nn(r.ult), int(r.vd), int(r.va), int(r.aptos), int(r.comparecimento),
              int(r.lula), int(r.flavio), int(r.outros), int(r.brancos), int(r.nulos),
              int(r.vencedor), 1 if (r.uf, r.key) in alt_keys else 0,
              1 if r.enc is None or pd.isna(r.enc) else 0]
             for r in L.itertuples()]

    # --- coverage / meta -------------------------------------------------------------------
    coverage = {}
    for uf in UFS:
        m = uni.uf == uf
        coverage[uf] = {
            "t1": int((t1.uf == uf).sum()), "scanned": int(((t1.uf == uf) & t1.scanned).sum()),
            "complete": os.path.exists(os.path.join(root, "state_enc", f"complete_{uf}")),
            "universe": int(m.sum()), "registradas": int((m & uni.registrar).sum()),
            "sem_registro": int((m & uni.enc.isna()).sum()),
        }
    meta = {
        "gerado_em": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "registro_a_partir_de": "17:30",
        "candidatos": {"13": "Lula", "22": "Flávio Bolsonaro"},
        "ufs": coverage,
        "sem_t1": [u for u in UFS if coverage[u]["t1"] == 0],
        "relogios": [{"uf": d[0], "cod": d[1], "nome": d[2], "estado": d[3], "detectado": d[4]} for d in detected],
        "totais": {"secoes": int(len(uni)), "registradas": int(uni.registrar.sum()),
                   "sem_registro": int(uni.enc.isna().sum())},
        "mcols": mcols, "dcols": dcols,
    }
    print(f"universe: {len(uni)} sections in {uni.uf.nunique()} states; "
          f"{int(uni.registrar.sum())} closed at/after 17:30 or without record "
          f"({int(uni.enc.isna().sum())} without closing record)")

    os.makedirs(out_dir, exist_ok=True)

    def dump(name, obj):
        p = os.path.join(out_dir, name)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  {name}: {os.path.getsize(p) / 1024:.0f} KB")

    dump("meta.json", meta)
    dump("municipios.json", mrows)
    dump("encerramentos.json", drows)
    if alt_rows:
        dump("alteradas.json", alt_rows)


if __name__ == "__main__":
    main()
