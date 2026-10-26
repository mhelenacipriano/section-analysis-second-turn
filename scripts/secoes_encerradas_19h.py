"""
List the sections whose urna confirmed the closing of voting around 19h (Brasília time), with the
first-turn result of each one.

    python scripts/secoes_encerradas_19h.py                  # closed at or after 18:50 Brasília
    python scripts/secoes_encerradas_19h.py --desde 19:00    # a stricter cut
    python scripts/secoes_encerradas_19h.py --root DIR       # DIR holds data/t1, state_enc, results_enc

Output: results_enc/secoes_encerradas_19h.csv, every time already converted to Brasília time
(the raw results_enc/encerramentos_<UF>.csv files are in the urna's LOCAL time: 16:30 on an
MT/MS/AM/RO/RR urna is 17:30 in Brasília). Needs state_enc/ from the tse-encerramento scan.
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
FIELDS = ["uf", "municipio", "nome_municipio", "zona", "secao", "encerramento_brasilia",
          "encerramento_urna", "inicio_encerramento_brasilia", "ultimo_voto_brasilia",
          "votos_apos_17h", "aptos", "comparecimento", "lula", "flavio", "outros", "brancos",
          "nulos", "pct_lula_validos", "pct_flavio_validos", "vencedor_1turno"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.join(HERE, ".."))
    ap.add_argument("--desde", default="18:50", help="closing time at/after this, Brasília (HH:MM)")
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

    closing, names = {}, {}      # (uf, mun) -> [local seconds]; section -> local seconds
    sections = {}
    for p in sorted(glob.glob(os.path.join(root, "state_enc", "done_[A-Z][A-Z].txt"))):
        uf = os.path.basename(p)[5:7]
        with open(p, encoding="utf-8") as f:
            for ln in f:
                parts = ln.strip().split(",")
                if len(parts) == 4 and parts[3] != "-":
                    sections[(uf,) + tuple(parts[:3])] = secs(parts[3])
                    closing.setdefault((uf, parts[0]), []).append(sections[(uf,) + tuple(parts[:3])])
    if not sections:
        sys.exit("no closing times in state_enc/ (run the tse-encerramento scan first)")
    for key, r in t1.items():
        names[(key[0], key[1])] = r["nome_municipio"]
    off, detected = muni_offsets(((k, v, names.get(k, "")) for k, v in closing.items()))

    detail = {}                   # extra times from the scan (local clock)
    for p in glob.glob(os.path.join(root, "results_enc", "encerramentos_[A-Z][A-Z].csv")):
        with open(p, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                detail[(r["uf"], r["municipio"], r["zona"], r["secao"])] = r

    rows, no_t1 = [], 0
    for key, local in sections.items():
        uf, mun, zona, secao = key
        o = off[(uf, mun)]
        br = local - o * 3600
        if not lo <= br <= hi:
            continue
        s = t1.get(key)
        if s is None:
            no_t1 += 1
            continue
        d = detail.get(key, {})
        t = lambda col: clock(secs(d[col]) - o * 3600) if d.get(col) else ""
        l, f, oth = int(s["lula"]), int(s["flavio"]), int(s["outros"])
        valid = l + f + oth
        v = int(s["vencedor"])
        rows.append({
            "uf": uf, "municipio": mun, "nome_municipio": s["nome_municipio"], "zona": zona,
            "secao": secao, "encerramento_brasilia": clock(br), "encerramento_urna": clock(local),
            "inicio_encerramento_brasilia": t("inicio_encerramento"),
            "ultimo_voto_brasilia": t("ultimo_voto"), "votos_apos_17h": d.get("votos_apos_corte", ""),
            "aptos": s["aptos"], "comparecimento": s["comparecimento"], "lula": l, "flavio": f,
            "outros": oth, "brancos": s["brancos"], "nulos": s["nulos"],
            "pct_lula_validos": f"{l / valid * 100:.2f}" if valid else "",
            "pct_flavio_validos": f"{f / valid * 100:.2f}" if valid else "",
            "vencedor_1turno": NAMES.get(v, "Empate" if v == 0 else "Outro candidato"),
        })
    rows.sort(key=lambda r: (r["encerramento_brasilia"], r["uf"], r["municipio"], r["zona"], r["secao"]), reverse=True)

    out = args.out or os.path.join(root, "results_enc", "secoes_encerradas_19h.csv")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)

    n = len(rows)
    lula = sum(r["vencedor_1turno"] == "Lula" for r in rows)
    fl = sum(r["vencedor_1turno"] == "Flávio Bolsonaro" for r in rows)
    print(f"{n} sections with confirmed closing between {args.desde} and {args.ate} Brasília "
          f"(of {len(sections)} sections with a closing record in {len({k[0] for k in sections})} states)")
    print(f"first turn: Lula won {lula}, Flávio Bolsonaro won {fl}, others {n - lula - fl}")
    for uf, c in sorted(((u, sum(1 for r in rows if r['uf'] == u)) for u in {r['uf'] for r in rows}), key=lambda x: -x[1]):
        print(f"  {uf}: {c}")
    if detected:
        print("clock detected from the data:", ", ".join(f"{d[0]} {d[2]} ({d[3]:+d}h -> {d[4]:+d}h)" for d in detected))
    if no_t1:
        print(f"{no_t1} such sections have no first-turn result and were left out")
    print("->", os.path.relpath(out))


if __name__ == "__main__":
    main()
