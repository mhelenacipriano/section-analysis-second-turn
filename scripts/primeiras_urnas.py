"""
The urnas that closed FIRST, and in which states.

Closing time comes from the closing scan (state_enc/: confirmed closing of every section). For the sections
that closed earliest (the N earliest of the country and of each state) the log is read in memory to get the
time of "Gerando arquivo de resultado [imgze.dat] + [Término]" (the urna's result file is ready); the
sections are then ordered by that line. Logs are not saved, except with --salvar-top K, which writes the K
first logs (original .jez plus a readable .txt) into a folder you name.

    python scripts/primeiras_urnas.py                       # 150 earliest per state + 400 earliest of the country
    python scripts/primeiras_urnas.py --por-estado 300 --salvar-top 5 --pasta /tmp/primeiras

Output: results_imgze/primeiras_urnas.csv (every section read, ordered by its imgze.dat time, Brasília)
This is the first among the sections read (the earliest closers); it is not a proof over all ~500k logs.
"""
import argparse
import csv
import datetime
import glob
import gzip
import io
import os
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import baixar_logs_resultados as b  # noqa: E402
import votos_apos_17h as v  # noqa: E402
from clocks import clock, muni_offsets, secs  # noqa: E402

DAY = datetime.datetime(2026, 10, 25)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--por-estado", type=int, default=150)
    ap.add_argument("--pais", type=int, default=400)
    ap.add_argument("--salvar-top", type=int, default=0)
    ap.add_argument("--pasta", default=None)
    args = ap.parse_args()

    names = {}
    for p in sorted(glob.glob(os.path.join(ROOT, "data", "t1", "secoes_t1_*.csv.gz"))):
        with gzip.open(p, "rt", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                names[(r["uf"], r["municipio"])] = r["nome_municipio"]
    closing, sec_loc = {}, {}
    for p in sorted(glob.glob(os.path.join(ROOT, "state_enc", "done_[A-Z][A-Z].txt"))):
        uf = os.path.basename(p)[5:7]
        for ln in open(p, encoding="utf-8"):
            a = ln.strip().split(",")
            if len(a) == 4 and a[3] != "-":
                t = secs(a[3])
                closing.setdefault((uf, a[0]), []).append(t)
                sec_loc[(uf, a[0], a[1], a[2])] = t
    off, _ = muni_offsets(((k, vals, names.get(k, "")) for k, vals in closing.items()))
    brt = {k: t - off[k[:2]] * 3600 for k, t in sec_loc.items()}

    chosen = set()
    by_state = {}
    for k, t in brt.items():
        by_state.setdefault(k[0], []).append((t, k))
    for uf, lst in by_state.items():
        chosen.update(k for _, k in sorted(lst)[: args.por_estado])
    chosen.update(k for _, k in sorted((t, k) for k, t in brt.items())[: args.pais])
    print(f"{len(chosen)} earliest-closing sections to read")

    saved = {}
    def one(key):
        uf, mun, zona, secao = key
        try:
            name, blob, err = b.fetch_log("ele2026", "3221", uf, {"mun": mun, "zona": zona, "secao": secao}, None, {})
            if err:
                return key, None, err, None
            r = v.analyse(blob, name, DAY.replace(hour=17), closure=True)[5]
            return key, r, None, (name, blob)
        except Exception as e:                       # noqa: BLE001
            return key, None, str(e), None

    rows, failed = [], []
    with ThreadPoolExecutor(6) as ex:
        for i, (key, r, err, raw) in enumerate(ex.map(one, sorted(chosen)), 1):
            if err or not r or not r.get("imgze"):
                failed.append((key, err or "no imgze line"))
                continue
            o = off[key[:2]]
            to_brt = lambda d: (d.hour * 3600 + d.minute * 60 + d.second) - o * 3600
            rows.append({"uf": key[0], "municipio": key[1], "nome_municipio": names.get((key[0], key[1]), ""), "zona": key[2], "secao": key[3],
                         "encerramento_confirmado": clock(brt[key]), "imgze_termino": clock(to_brt(r["imgze"])), "_t": to_brt(r["imgze"]), "_raw": raw})
            if i % 500 == 0:
                print(f"  {i}/{len(chosen)}")
    rows.sort(key=lambda r: (r["_t"], r["uf"], r["municipio"], r["zona"], r["secao"]))

    out = os.path.join(ROOT, "results_imgze", "primeiras_urnas.csv")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    cols = ["uf", "municipio", "nome_municipio", "zona", "secao", "encerramento_confirmado", "imgze_termino"]
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    first = {}
    for r in rows:
        first.setdefault(r["uf"], r)
    print(f"\n{len(rows)} read, {len(failed)} failed. States, by the first section to finish imgze.dat (Brasília time):")
    for i, r in enumerate(sorted(first.values(), key=lambda r: r["_t"]), 1):
        print(f"{i:2d}. {r['uf']}  imgze {r['imgze_termino']}  (closing confirmed {r['encerramento_confirmado']})  {r['nome_municipio']} z{r['zona']} s{r['secao']}")
    print("\nthe 10 first sections of the country:")
    for r in rows[:10]:
        print(f"    {r['imgze_termino']}  {r['uf']}  {r['nome_municipio']} z{r['zona']} s{r['secao']}  (closing {r['encerramento_confirmado']})")
    if args.salvar_top and args.pasta:
        os.makedirs(args.pasta, exist_ok=True)
        for r in rows[: args.salvar_top]:
            name, blob = r["_raw"]
            base = f"{r['uf']}_{r['nome_municipio'].replace(' ', '_')}_z{r['zona']}_s{r['secao']}"
            open(os.path.join(args.pasta, f"{base}.jez"), "wb").write(blob)
            with zipfile.ZipFile(io.BytesIO(blob)) as z:
                text = z.read(z.namelist()[0]).decode("latin-1")
            lines = [l.split("\t") for l in text.splitlines() if l.startswith("25/10/2026")]
            with open(os.path.join(args.pasta, f"{base}.txt"), "w", encoding="utf-8") as f:
                f.write(f"Log da urna: {r['nome_municipio']} ({r['uf']}), zona {r['zona']}, seção {r['secao']}; dia 25/10/2026 (hora da própria urna)\n"
                        f"Encerramento confirmado {r['encerramento_confirmado']} e imgze.dat pronto {r['imgze_termino']} (horário de Brasília)\n\n")
                f.write("\n".join(f"{p[0]}  {p[1]:<6} {p[3]:<5} {p[4]}" for p in lines if len(p) >= 5) + "\n")
        print(f"\nlogs of the first {args.salvar_top} saved in {args.pasta}")


if __name__ == "__main__":
    main()
