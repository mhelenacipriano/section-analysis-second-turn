"""
Extract the late-closing sections from the public dataset github.com/apolinario/urnas-tardias
(secoes.csv: one row per urna, with "Procedimento de encerramento confirmado" already converted to
Brasília time) and add the first-turn result of each section.

    git clone --depth 1 https://github.com/apolinario/urnas-tardias /tmp/urnas-tardias
    python scripts/extrair_urnas_tardias.py /tmp/urnas-tardias/secoes.csv              # >= 18:50
    python scripts/extrair_urnas_tardias.py /tmp/urnas-tardias/secoes.csv --desde 19:00

Output: results_tardias/secoes_encerradas_19h_urnas-tardias.csv (the source is third-party data;
it is read here, not copied). Its closing times match this project's own scan to the second on
every section both cover (see README).
"""
import argparse
import csv
import glob
import gzip
import os

HERE = os.path.dirname(os.path.abspath(__file__))
NAMES = {13: "Lula", 22: "Flávio Bolsonaro"}
FIELDS = ["uf", "municipio", "nome_municipio", "zona", "secao", "encerramento_brasilia", "abertura_brasilia",
          "ultimo_voto_brasilia", "votos_apos_17h", "votos_total", "aptos", "comparecimento", "lula",
          "flavio", "outros", "brancos", "nulos", "pct_lula_validos", "pct_flavio_validos", "vencedor_1turno"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fonte", help="secoes.csv of apolinario/urnas-tardias")
    ap.add_argument("--root", default=os.path.join(HERE, ".."))
    ap.add_argument("--desde", default="18:50", help="closing at/after this, Brasília (HH:MM)")
    ap.add_argument("--ate", default="23:59")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    lo, hi = args.desde + ":00", args.ate + ":59"

    t1 = {}
    for p in sorted(glob.glob(os.path.join(root, "data", "t1", "secoes_t1_*.csv.gz"))):
        with gzip.open(p, "rt", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                t1[(r["uf"], r["municipio"], r["zona"], r["secao"])] = r

    rows, total, no_t1, no_close = [], 0, 0, 0
    with open(args.fonte, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            total += 1
            enc = r["encerramento_brt"]
            if not enc:
                no_close += 1
                continue
            if not lo <= enc <= hi:
                continue
            key = (r["uf"], r["cd_mun"], r["zona"], r["secao"])
            s = t1.get(key)
            if s is None:
                no_t1 += 1
                continue
            l, fl, oth = int(s["lula"]), int(s["flavio"]), int(s["outros"])
            valid = l + fl + oth
            v = int(s["vencedor"])
            rows.append({
                "uf": key[0], "municipio": key[1], "nome_municipio": s["nome_municipio"], "zona": key[2],
                "secao": key[3], "encerramento_brasilia": enc, "abertura_brasilia": r["abertura_brt"],
                "ultimo_voto_brasilia": r["ultimo_voto_brt"], "votos_apos_17h": r["votos_apos_17h"],
                "votos_total": r["votos_total"], "aptos": s["aptos"], "comparecimento": s["comparecimento"],
                "lula": l, "flavio": fl, "outros": oth, "brancos": s["brancos"], "nulos": s["nulos"],
                "pct_lula_validos": f"{l / valid * 100:.2f}" if valid else "",
                "pct_flavio_validos": f"{fl / valid * 100:.2f}" if valid else "",
                "vencedor_1turno": NAMES.get(v, "Empate" if v == 0 else "Outro candidato"),
            })
    rows.sort(key=lambda r: (r["encerramento_brasilia"], r["uf"], r["municipio"], r["zona"], r["secao"]), reverse=True)

    out = args.out or os.path.join(root, "results_tardias", "secoes_encerradas_19h_urnas-tardias.csv")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)

    n = len(rows)
    lula = sum(r["vencedor_1turno"] == "Lula" for r in rows)
    fl = sum(r["vencedor_1turno"] == "Flávio Bolsonaro" for r in rows)
    print(f"{n} sections closed between {args.desde} and {args.ate} Brasília (of {total} rows; {no_close} without closing time)")
    print(f"first turn: Lula won {lula}, Flávio Bolsonaro won {fl}, others {n - lula - fl}")
    for uf, c in sorted(((u, sum(1 for r in rows if r['uf'] == u)) for u in {r['uf'] for r in rows}), key=lambda x: -x[1]):
        print(f"  {uf}: {c}")
    if no_t1:
        print(f"{no_t1} such sections have no first-turn result and were left out")
    print("->", os.path.relpath(out))


if __name__ == "__main__":
    main()
