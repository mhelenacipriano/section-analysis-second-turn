"""
List the sections where the operator answered "Todas as pessoas presentes já votaram? SIM" around
19h (Brasília time), with the first-turn result of each one.

    python scripts/secoes_todos_votaram_19h.py                  # SIM at or after 18:50 Brasília
    python scripts/secoes_todos_votaram_19h.py --desde 19:00    # a stricter cut
    python scripts/secoes_todos_votaram_19h.py --root DIR       # DIR holds data/t1, state_enc, results_sim

Input: results_sim/todos_votaram_<UF>.csv, written by
    baixar_logs_resultados.py --evento sim --so-secoes results_enc/encerramentos_BR.csv
which reads the logs of the sections that closed late (conf >= 17:30 or without record) and keeps the
LAST "Todas as pessoas presentes já votaram? SIM" of 25/10 (the answer comes 2-6 s after "Operador
selecionou: Encerrar votação" and 20-60 s before "Procedimento de encerramento confirmado").
Every time is converted to Brasília time with the municipality clocks of the closing-time scan
(state_enc/), the same ones the site uses.

Output: results_sim/secoes_todos_votaram_19h.csv
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

NAMES = {13: "Lula", 22: "Flávio Bolsonaro"}
FIELDS = ["uf", "municipio", "nome_municipio", "zona", "secao", "todos_votaram_sim_brasilia",
          "encerrar_selecionado_brasilia", "encerramento_confirmado_brasilia", "ultimo_voto_brasilia",
          "votos_apos_17h", "aptos", "comparecimento", "lula", "flavio", "outros", "brancos", "nulos",
          "pct_lula_validos", "pct_flavio_validos", "vencedor_1turno"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.join(HERE, ".."))
    ap.add_argument("--desde", default="18:50", help="SIM at/after this, Brasília (HH:MM)")
    ap.add_argument("--ate", default="23:59", help="and before this (HH:MM)")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    lo, hi = secs(args.desde.replace(":", "") + "00"), secs(args.ate.replace(":", "") + "59")

    t1 = {}
    for p in sorted(glob.glob(os.path.join(root, "data", "t1", "secoes_t1_*.csv.gz"))):
        with gzip.open(p, "rt", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                t1[(r["uf"], r["municipio"], r["zona"], r["secao"])] = r
    if not t1:
        sys.exit("no data/t1/secoes_t1_*.csv.gz")

    # municipality clocks: from the closing time of EVERY section (state_enc/), as in build_site_data.py
    closing = {}
    for p in sorted(glob.glob(os.path.join(root, "state_enc", "done_[A-Z][A-Z].txt"))):
        uf = os.path.basename(p)[5:7]
        with open(p, encoding="utf-8") as f:
            for ln in f:
                parts = ln.strip().split(",")
                if len(parts) == 4 and parts[3] != "-":
                    closing.setdefault((uf, parts[0]), []).append(secs(parts[3]))
    if not closing:
        sys.exit("no closing times in state_enc/ (needed for the municipality clocks)")
    names = {(k[0], k[1]): r["nome_municipio"] for k, r in t1.items()}
    off, _ = muni_offsets(((k, v, names.get(k, "")) for k, v in closing.items()))

    scan, no_sim, scanned = [], 0, 0
    for p in sorted(glob.glob(os.path.join(root, "results_sim", "todos_votaram_[A-Z][A-Z].csv"))):
        if p.endswith("_BR.csv"):          # the merged national file: do not count the sections twice
            continue
        with open(p, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                scanned += 1
                if r["todos_votaram_sim"]:
                    scan.append(r)
                else:
                    no_sim += 1
    if not scanned:
        sys.exit("no results_sim/todos_votaram_<UF>.csv (run the --evento sim scan first)")

    rows, no_t1 = [], 0
    for r in scan:
        key = (r["uf"], r["municipio"], r["zona"], r["secao"])
        o = off.get((r["uf"], r["municipio"]), 0)
        br = secs(r["todos_votaram_sim"]) - o * 3600
        if not lo <= br <= hi:
            continue
        s = t1.get(key)
        if s is None:
            no_t1 += 1
            continue
        t = lambda col: clock(secs(r[col]) - o * 3600) if r.get(col) else ""
        l, f, oth = int(s["lula"]), int(s["flavio"]), int(s["outros"])
        valid = l + f + oth
        v = int(s["vencedor"])
        rows.append({
            "uf": key[0], "municipio": key[1], "nome_municipio": s["nome_municipio"], "zona": key[2],
            "secao": key[3], "todos_votaram_sim_brasilia": clock(br),
            "encerrar_selecionado_brasilia": t("encerrar_selecionado"),
            "encerramento_confirmado_brasilia": t("encerramento_confirmado"),
            "ultimo_voto_brasilia": t("ultimo_voto"), "votos_apos_17h": r.get("votos_apos_corte", ""),
            "aptos": s["aptos"], "comparecimento": s["comparecimento"], "lula": l, "flavio": f,
            "outros": oth, "brancos": s["brancos"], "nulos": s["nulos"],
            "pct_lula_validos": f"{l / valid * 100:.2f}" if valid else "",
            "pct_flavio_validos": f"{f / valid * 100:.2f}" if valid else "",
            "vencedor_1turno": NAMES.get(v, "Empate" if v == 0 else "Outro candidato"),
        })
    rows.sort(key=lambda r: (r["todos_votaram_sim_brasilia"], r["uf"], r["municipio"], r["zona"], r["secao"]), reverse=True)

    out = args.out or os.path.join(root, "results_sim", "secoes_todos_votaram_19h.csv")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)

    n = len(rows)
    lula = sum(r["vencedor_1turno"] == "Lula" for r in rows)
    fl = sum(r["vencedor_1turno"] == "Flávio Bolsonaro" for r in rows)
    print(f"{n} sections with 'Todas as pessoas presentes já votaram? SIM' between {args.desde} and {args.ate} "
          f"Brasília (of {scanned} late-closing sections read; {no_sim} of them have no such line)")
    print(f"first turn: Lula won {lula}, Flávio Bolsonaro won {fl}, others {n - lula - fl}")
    for uf, c in sorted(((u, sum(1 for r in rows if r['uf'] == u)) for u in {r['uf'] for r in rows}), key=lambda x: -x[1]):
        print(f"  {uf}: {c}")
    if no_t1:
        print(f"{no_t1} such sections have no first-turn result and were left out")
    print("->", os.path.relpath(out))


if __name__ == "__main__":
    main()
