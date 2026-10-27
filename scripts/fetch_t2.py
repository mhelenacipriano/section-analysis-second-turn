"""
Official 2nd-round result of the presidential race (TSE), national and per state, for the page
"Peso dos votos tardios": total votes, Lula, Flávio and the margin.

    python scripts/fetch_t2.py

  data/t2/resultado_2t.json            as downloaded, trimmed to what the site uses
  web/public/data/t2.json              the same file, served by the site

Source: resultados.tse.jus.br/oficial/ele2026/6258/dados/<uf>/<uf>-c0001-e006258-u.json
(6258 = the 2nd-round presidential election; 3221 is the "pleito" the urna logs live under).
28 small requests, one per second.
"""
import json
import os
import time
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
BASE = "https://resultados.tse.jus.br/oficial/ele2026/6258/dados/{uf}/{uf}-c0001-e006258-u.json"
UFS = ["br", "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB",
       "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO", "ZZ"]
n = lambda x: int(x)


def parse(d):
    cands = {}
    for c in d["carg"][0]["agr"]:
        for par in c["par"]:
            for cd in par["cand"]:
                cands[cd["n"]] = n(cd["vap"])
    v = d["v"]
    return {"lula": cands["13"], "flavio": cands["22"], "validos": n(v["vv"]), "brancos": n(v["vb"]),
            "nulos": n(v["vn"]), "comparecimento": n(v["tv"]), "aptos": n(d["e"]["te"]),
            "secoes_totalizadas": n(d["s"]["st"]), "atualizado": f"{d['dg']} {d['hg']}"}


def main():
    out = {}
    for uf in UFS:
        key = "BR" if uf == "br" else uf
        req = urllib.request.Request(BASE.format(uf=uf.lower()), headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            out[key] = parse(json.load(r))
        print(key, out[key]["lula"], out[key]["flavio"], out[key]["comparecimento"])
        time.sleep(1)
    s = {k: sum(v[k] for u, v in out.items() if u != "BR") for k in ("lula", "flavio", "validos", "comparecimento")}
    print("sum of the states vs national:", {k: (s[k], out["BR"][k]) for k in s})
    for path in (os.path.join(ROOT, "data", "t2", "resultado_2t.json"),
                 os.path.join(ROOT, "web", "public", "data", "t2.json")):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        print("->", os.path.relpath(path, ROOT))


if __name__ == "__main__":
    main()
