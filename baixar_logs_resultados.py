"""
Download urna logs (.logjez / 2026: -log.jez) for one state or one municipality from the TSE
Portal Resultados and list the sections with votes at or after 17h.

Needs votos_apos_17h.py in the same folder (it reuses its log parser).

    pip install requests py7zr

    # 1) find the municipality code
    python baixar_logs_resultados.py --uf PB --listar-municipios
    # 2) test on one municipality first
    python baixar_logs_resultados.py --uf PB --municipio 20516
    # 3) whole state
    python baixar_logs_resultados.py --uf PB

Options: --hora 17:00  --data 25/10/2026  --pleito <code>  --workers 6
Logs are cached in ./logs_urna/<UF>/ so reruns skip finished sections.
Output: secoes_apos_17h_<UF>[_<mun>].csv

Paths follow the layout the portal used in 2022/2024:
  {BASE}/{ciclo}/arquivo-urna/{pleito}/config/{uf}/{uf}-p{pleito6}-cs.json
  {BASE}/{ciclo}/arquivo-urna/{pleito}/dados/{uf}/{mun}/{zona}/{secao}/
        p{pleito6}-{uf}-m{mun}-z{zona}-s{secao}-aux.json
        {hash}/{file}.logjez
If TSE changed them for 2026, the script stops and shows the URL that failed.
"""
import argparse
import csv
import json
import os
import random
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import requests

from votos_apos_17h import analyse, local_cutoff

BASE = "https://resultados.tse.jus.br/oficial"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "application/json, */*",
}
session = requests.Session()
session.headers.update(HEADERS)
_adapter = requests.adapters.HTTPAdapter(pool_connections=64, pool_maxsize=64)
session.mount("https://", _adapter)


def get(url, binary=False, tries=8):
    for i in range(tries):
        try:
            r = session.get(url, timeout=60)
            if r.status_code == 404:
                return None
            if r.status_code in (429, 503):
                # server asked us to slow down: wait as told, or back off
                ra = r.headers.get("Retry-After", "")
                wait = int(ra) if ra.isdigit() else min(5 * 2 ** i, 120)
                if i == tries - 1:
                    r.raise_for_status()
                time.sleep(wait + random.random() * 3)
                continue
            r.raise_for_status()
            return r.content if binary else r.json()
        except (requests.RequestException, ValueError):
            if i == tries - 1:
                raise
            time.sleep(min(3 * 2 ** i, 60) + random.random() * 2)


def find_pleito(date_str, override, ciclo_override="ele2026"):
    if override:
        # no request needed: saves one call per state on a rate-limited server
        return ciclo_override, str(override)
    cfg = get(f"{BASE}/comum/config/ele-c.json")
    if not cfg:
        sys.exit(f"Could not read {BASE}/comum/config/ele-c.json")
    ciclo = cfg.get("c") or "ele2026"
    for pl in cfg.get("pl", []):
        if pl.get("dt") == date_str:
            return ciclo, str(pl["cd"])
    print("Pleitos found in ele-c.json:", file=sys.stderr)
    for pl in cfg.get("pl", []):
        print(f"  cd={pl.get('cd')} dt={pl.get('dt')}", file=sys.stderr)
    sys.exit(f"No pleito dated {date_str}; rerun with --pleito <cd>.")


def load_sections(ciclo, pleito, uf):
    p6 = pleito.zfill(6)
    ufl = uf.lower()
    urls = [
        f"{BASE}/{ciclo}/arquivo-urna/{pleito}/config/{ufl}/{ufl}-p{p6}-cs.json",
        f"{BASE}/{ciclo}/arquivo-urna/{pleito}/config/mu-e{p6}-cs.json",
    ]
    for url in urls:
        cfg = get(url)
        if cfg:
            break
    else:
        sys.exit("Section index not found. Tried:\n  " + "\n  ".join(urls))

    out = []
    for abr in cfg.get("abr", []):
        if abr.get("cd", "").upper() != uf.upper():
            continue
        for mu in abr.get("mu", []):
            for zon in mu.get("zon", []):
                for sec in zon.get("sec", []):
                    ns = str(sec.get("ns") or sec.get("cd")).zfill(4)
                    # merged section (seção agregada): its votes are in the
                    # main section's urna, which is listed separately
                    nsp = sec.get("nsp")
                    nsp = str(nsp).zfill(4) if nsp not in (None, "") else ns
                    out.append({
                        "mun": str(mu["cd"]).zfill(5),
                        "nome": mu.get("nm", ""),
                        "zona": str(zon["cd"]).zfill(4),
                        "secao": ns,
                        "agregada_a": nsp if nsp != ns else "",
                        "indice": json.dumps(sec, ensure_ascii=False),
                    })
    if not out:
        sys.exit(f"Index loaded but no sections for {uf} (format may have changed): {url}")
    return out


def fetch_log(ciclo, pleito, uf, s, cache_dir, cache_index):
    ufl = uf.lower()
    p6 = pleito.zfill(6)
    folder = f"{BASE}/{ciclo}/arquivo-urna/{pleito}/dados/{ufl}/{s['mun']}/{s['zona']}/{s['secao']}"
    aux_url = f"{folder}/p{p6}-{ufl}-m{s['mun']}-z{s['zona']}-s{s['secao']}-aux.json"

    # cached? (index built once at start, not a folder listing per section)
    f = cache_index.get(f"{s['mun']}{s['zona']}{s['secao']}")
    if f:
        with open(os.path.join(cache_dir, f), "rb") as fh:
            return f, fh.read(), None

    aux = get(aux_url)
    if not aux:
        return None, None, f"no aux file ({aux_url})"

    # Find every .logjez name anywhere in the aux JSON, with the nearest hash
    # above it. Works with the 2022/2024 layout (hashes[].nmarq) and with
    # renamed or nested fields.
    found = find_logjez(aux)
    if not found:
        save_debug(uf, aux, aux_url)
        return None, None, (f"no .logjez listed (status: {aux.get('st')}); "
                            f"sample saved to debug_aux_{uf}.json")

    last_err = None
    for h, name in reversed(found):  # latest transmission first
        candidates = [f"{folder}/{h}/{name}"] if h else []
        candidates.append(f"{folder}/{name}")
        for url in candidates:
            try:
                blob = get(url, binary=True)
            except Exception as e:
                last_err = str(e)
                continue
            if blob:
                fname = os.path.basename(name)
                with open(os.path.join(cache_dir, fname), "wb") as fh:
                    fh.write(blob)
                return fname, blob, None
            last_err = f"not found: {url}"
    save_debug(uf, aux, aux_url)
    return None, None, f"log download failed ({last_err})"


HASH_KEYS = ("hash", "hs", "hashArquivos", "hash_arquivos", "cdHash")
_debug_saved = set()


def check_section(ciclo, pleito, uf, s, cache_dir, cache_index, cutoff):
    name, blob, err = fetch_log(ciclo, pleito, uf, s, cache_dir, cache_index)
    if err:
        return None, err
    _, total, late, first_late, last_vote = analyse(blob, name, cutoff)
    return (total, late, first_late, last_vote), None


CACHE_RE = re.compile(r"(\d{13})(?:\.logjez|-log\.jez)$", re.I)


def build_cache_index(cache_dir):
    idx = {}
    for f in os.listdir(cache_dir):
        m = CACHE_RE.search(f)
        if m:
            idx[m.group(1)] = f
    return idx


def find_logjez(node, cur_hash=None, out=None):
    if out is None:
        out = []
    if isinstance(node, dict):
        for k in HASH_KEYS:
            v = node.get(k)
            if isinstance(v, str) and v:
                cur_hash = v
                break
        for v in node.values():
            find_logjez(v, cur_hash, out)
    elif isinstance(node, list):
        for v in node:
            find_logjez(v, cur_hash, out)
    elif isinstance(node, str) and node.lower().endswith((".logjez", "-log.jez")):
        out.append((cur_hash, node))
    return out


def save_debug(uf, aux, url):
    if uf in _debug_saved:
        return
    _debug_saved.add(uf)
    import json
    with open(f"debug_aux_{uf}.json", "w", encoding="utf-8") as f:
        json.dump({"url": url, "content": aux}, f, ensure_ascii=False, indent=2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--uf", required=True)
    ap.add_argument("--municipio", help="5-digit TSE municipality code")
    ap.add_argument("--listar-municipios", action="store_true")
    ap.add_argument("--data", default="25/10/2026")
    ap.add_argument("--hora", default="17:00")
    ap.add_argument("--pleito")
    ap.add_argument("--ciclo", default="ele2026", help="used only with --pleito")
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--hora-local", action="store_true",
                    help="treat --hora as the urna's local clock (no time-zone conversion)")
    args = ap.parse_args()
    uf = args.uf.upper()

    ciclo, pleito = find_pleito(args.data, args.pleito, args.ciclo)
    print(f"ciclo={ciclo} pleito={pleito}")
    sections = load_sections(ciclo, pleito, uf)

    if args.listar_municipios:
        seen = {}
        for s in sections:
            seen.setdefault(s["mun"], [s["nome"], 0])[1] += 1
        for cd, (nm, n) in sorted(seen.items(), key=lambda x: x[1][0]):
            print(f"{cd}  {nm}  ({n} seções)")
        return

    if args.municipio:
        sections = [s for s in sections if s["mun"] == args.municipio.zfill(5)]
        if not sections:
            sys.exit("No sections for that municipality code; use --listar-municipios.")

    base = datetime.strptime(f"{args.data} {args.hora}", "%d/%m/%Y %H:%M")
    cutoff = base if args.hora_local else local_cutoff(base, uf)
    print(f"cutoff: {args.hora} {'local' if args.hora_local else 'Brasília'} "
          f"= {cutoff:%H:%M} on {uf} urna clocks")
    merged = [s for s in sections if s["agregada_a"]]
    sections = [s for s in sections if not s["agregada_a"]]
    if merged:
        print(f"{len(merged)} merged sections skipped (their votes are in the main section's urna)")
    cache_dir = os.path.join("logs_urna", uf)
    os.makedirs(cache_dir, exist_ok=True)
    print(f"{len(sections)} sections to check in {uf}"
          + (f" / {args.municipio}" if args.municipio else ""))

    cache_index = build_cache_index(cache_dir)
    print(f"{len(cache_index)} logs already downloaded, {args.workers} parallel downloads")
    started = time.time()
    rows, problems, done = [], [], 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(check_section, ciclo, pleito, uf, s, cache_dir, cache_index, cutoff): s
                for s in sections}
        for fut in as_completed(futs):
            s = futs[fut]
            done += 1
            try:
                res, err = fut.result()
                if err:
                    problems.append((s, err))
                else:
                    total, late, first_late, last_vote = res
                    if late:
                        rows.append({
                            "uf": uf, "municipio": s["mun"], "nome_municipio": s["nome"],
                            "zona": s["zona"], "secao": s["secao"],
                            "hora_corte_local": cutoff.strftime("%H:%M"),
                            "votos_no_dia": total, "votos_apos_corte": late,
                            "primeiro_voto_apos_corte": first_late.strftime("%H:%M:%S"),
                            "ultimo_voto": last_vote.strftime("%H:%M:%S"),
                        })
            except Exception as e:
                problems.append((s, str(e)))
            if done % 200 == 0 or done == len(sections):
                el = time.time() - started
                eta = el / done * (len(sections) - done)
                print(f"  {done}/{len(sections)} checked, {len(rows)} with late votes, "
                      f"{len(problems)} problems  [{done / el:.1f}/s, ~{eta / 60:.0f} min left]")
            # stop early if the very first sections all fail: layout probably changed
            if done == 20 and len(problems) == 20:
                print("\nFirst 20 sections all failed. Example:", problems[0][1])
                pool.shutdown(cancel_futures=True)
                sys.exit(1)

    suffix = f"_{args.municipio}" if args.municipio else ""
    out = f"secoes_apos_17h_{uf}{suffix}.csv"
    rows.sort(key=lambda r: (-r["votos_apos_corte"], r["municipio"], r["zona"], r["secao"]))
    fields = ["uf", "municipio", "nome_municipio", "zona", "secao", "hora_corte_local", "votos_no_dia",
              "votos_apos_corte", "primeiro_voto_apos_corte", "ultimo_voto"]
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

    if problems:
        with open(f"problemas_{uf}{suffix}.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["municipio", "zona", "secao", "problema", "indice"])
            for s, err in problems:
                w.writerow([s["mun"], s["zona"], s["secao"], err, s.get("indice", "")])

    print(f"\n{len(rows)} of {len(sections)} sections had votes at or after {cutoff:%H:%M} "
          f"local ({args.hora} {'local' if args.hora_local else 'Brasília'}). "
          f"Saved to {out}" + (f"; {len(problems)} sections couldn't be read "
                                f"(see problemas_{uf}{suffix}.csv)" if problems else ""))


if __name__ == "__main__":
    main()