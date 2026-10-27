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
         --encerramento   second kind of scan: when did each urna CLOSE voting (see below)
         --no-keep-logs   parse each log in memory, never write it to disk
         --max-minutes N  stop taking new sections after N minutes (exit 0)

Progress is durable and resumable (all paths relative to the working directory):
  state/done_<UF>.txt                  "municipio,zona,secao" per section checked
  results/secoes_apos_17h_<UF>.csv     sections with late votes (rows are appended)
  results/problemas_<UF>.csv           sections that failed; retried on the next run
  state/complete_<UF>                  created once nothing is left to check
A rerun skips everything already in state/done_<UF>.txt. The files are flushed every
500 sections, on --max-minutes, on SIGINT/SIGTERM, and when the server rate-limits
(more than 50% of the requests in the last 200 sections were HTTP 429): in all these
cases the script saves its state and exits 0.
--encerramento reads the closing sequence of each urna log (the last "Procedimento de
encerramento confirmado" of the day) instead of the late votes. Every section's confirmed closing
time (urna clock, HHMMSS, or "-" if the log has none) is added to its line in
state_enc/done_<UF>.txt; sections that closed at/after --hora-registro (default 17:30 Brasília) or
have no closing record also get a full row in results_enc/encerramentos_<UF>.csv.
Without --no-keep-logs the logs are also cached in ./logs_urna/<UF>/.

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
import signal
import sys
import threading
import time
from collections import deque
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from datetime import datetime, timezone

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


class Throttled(Exception):
    """Gave up after repeated 429/503 answers: the server is rate-limiting us."""


# per-thread request counters: a section is handled start to finish by one worker
_tl = threading.local()


def _count(req=0, r429=0):
    _tl.req = getattr(_tl, "req", 0) + req
    _tl.r429 = getattr(_tl, "r429", 0) + r429


def get(url, binary=False, tries=8):
    for i in range(tries):
        try:
            _count(req=1)
            r = session.get(url, timeout=60)
            if r.status_code == 404:
                return None
            if r.status_code in (429, 503):
                if r.status_code == 429:
                    _count(r429=1)
                # server asked us to slow down: wait as told, or back off
                ra = r.headers.get("Retry-After", "")
                wait = int(ra) if ra.isdigit() else min(5 * 2 ** i, 120)
                if i == tries - 1:
                    raise Throttled(f"HTTP {r.status_code} after {tries} tries: {url}")
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
    f = cache_index.get(f"{s['mun']}{s['zona']}{s['secao']}") if cache_dir else None
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
            except Throttled:
                raise
            except Exception as e:
                last_err = str(e)
                continue
            if blob:
                fname = os.path.basename(name)
                if cache_dir:  # --no-keep-logs: never touch the disk
                    with open(os.path.join(cache_dir, fname), "wb") as fh:
                        fh.write(blob)
                return fname, blob, None
            last_err = f"not found: {url}"
    save_debug(uf, aux, aux_url)
    return None, None, f"log download failed ({last_err})"


HASH_KEYS = ("hash", "hs", "hashArquivos", "hash_arquivos", "cdHash")
_debug_saved = set()


def check_section(ciclo, pleito, uf, s, cache_dir, cache_index, cutoff, closure=False):
    """Returns (result, error, transient, (requests, 429s)).

    transient errors (rate limiting, network trouble) say nothing about the
    section itself, so they do not count as an attempt against it."""
    _tl.req = _tl.r429 = 0
    res = err = None
    transient = False
    try:
        name, blob, err = fetch_log(ciclo, pleito, uf, s, cache_dir, cache_index)
        if not err:
            r = analyse(blob, name, cutoff, closure=closure)
            res = (r[1], r[2], r[3], r[4]) + ((r[5],) if closure else ())
    except (Throttled, requests.RequestException) as e:
        err, transient = str(e), True
    except Exception as e:
        err = str(e)
    return res, err, transient, (_tl.req, _tl.r429)


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




RESULT_FIELDS = ["uf", "municipio", "nome_municipio", "zona", "secao", "hora_corte_local",
                 "votos_no_dia", "votos_apos_corte", "primeiro_voto_apos_corte", "ultimo_voto"]
ENC_FIELDS = ["uf", "municipio", "nome_municipio", "zona", "secao", "votos_no_dia", "votos_apos_corte",
              "ultimo_voto", "encerrar_selecionado", "encerramento_confirmado", "inicio_encerramento"]
# --evento sim: the same plus the time of the operator's "Todas as pessoas presentes já votaram? SIM"
ENC_FIELDS_SIM = ENC_FIELDS[:9] + ["todos_votaram_sim"] + ENC_FIELDS[9:]
PROBLEM_FIELDS = ["municipio", "zona", "secao", "problema", "tentativas", "indice"]
FLUSH_EVERY = 500       # sections
RATE_WINDOW = 200       # sections looked at by the 429 check
RATE_LIMIT = 0.5        # stop when more than this share of their requests were 429s


def key_of(s):
    return f"{s['mun']},{s['zona']},{s['secao']}"


class Progress:
    """The durable state of one UF: what was checked, what was found, what failed."""

    def __init__(self, uf, state_dir, results_dir, rows_name="secoes_apos_17h", fields=None):
        os.makedirs(state_dir, exist_ok=True)
        os.makedirs(results_dir, exist_ok=True)
        self.done_path = os.path.join(state_dir, f"done_{uf}.txt")
        self.complete_path = os.path.join(state_dir, f"complete_{uf}")
        self.rows_path = os.path.join(results_dir, f"{rows_name}_{uf}.csv")
        self.fields = fields or RESULT_FIELDS
        self.problems_path = os.path.join(results_dir, f"problemas_{uf}.csv")

        self.done, self.new_done = set(), []
        self.lead_newline = False
        if os.path.exists(self.done_path):
            with open(self.done_path, "rb") as f:
                data = f.read()
            self.lead_newline = bool(data) and not data.endswith(b"\n")  # killed mid-line
            # a line is "municipio,zona,secao" plus, for --encerramento, ",<closing time>"
            self.done = {",".join(ln.strip().split(",")[:3]) for ln in data.decode("utf-8").splitlines()
                         if ln.strip()}

        self.row_keys, self.new_rows = set(), []
        if os.path.exists(self.rows_path):
            with open(self.rows_path, newline="", encoding="utf-8") as f:
                for r in csv.DictReader(f):
                    self.row_keys.add(f"{r['municipio']},{r['zona']},{r['secao']}")

        self.problems, self.problems_dirty = {}, False
        if os.path.exists(self.problems_path):
            with open(self.problems_path, newline="", encoding="utf-8") as f:
                for r in csv.DictReader(f):
                    r["tentativas"] = int(r.get("tentativas") or 1)
                    self.problems[f"{r['municipio']},{r['zona']},{r['secao']}"] = r

    def attempts(self, key):
        return self.problems.get(key, {}).get("tentativas", 0)

    def add_done(self, key, extra=None):
        if key not in self.done:
            self.done.add(key)
            self.new_done.append(f"{key},{extra}" if extra else key)

    def add_row(self, row):
        key = f"{row['municipio']},{row['zona']},{row['secao']}"
        if key not in self.row_keys:  # a crash between the two appends can repeat a section
            self.row_keys.add(key)
            self.new_rows.append(row)

    def set_problem(self, s, err, attempts):
        self.problems[key_of(s)] = {"municipio": s["mun"], "zona": s["zona"], "secao": s["secao"],
                                    "problema": err, "tentativas": attempts,
                                    "indice": s.get("indice", "")}
        self.problems_dirty = True

    def clear_problem(self, key):
        if self.problems.pop(key, None) is not None:
            self.problems_dirty = True

    def flush(self):
        # results before done: a crash in between re-checks a section (the row is
        # then skipped as a duplicate) instead of losing it
        if self.new_rows:
            fresh = not os.path.exists(self.rows_path) or os.path.getsize(self.rows_path) == 0
            with open(self.rows_path, "a", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=self.fields)
                if fresh:
                    w.writeheader()
                w.writerows(self.new_rows)
            self.new_rows = []
        if self.new_done:
            with open(self.done_path, "a", encoding="utf-8") as f:
                f.write(("\n" if self.lead_newline else "") + "\n".join(self.new_done) + "\n")
            self.lead_newline, self.new_done = False, []
        # rewritten whole (it is small); kept as a header-only file once it has existed,
        # because a deleted file would not travel through the workflow's artifacts
        if self.problems_dirty and (self.problems or os.path.exists(self.problems_path)):
            tmp = self.problems_path + ".tmp"
            with open(tmp, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=PROBLEM_FIELDS)
                w.writeheader()
                w.writerows(self.problems[k] for k in sorted(self.problems))
            os.replace(tmp, self.problems_path)
        self.problems_dirty = False

    def mark_complete(self):
        if os.path.exists(self.complete_path):
            return
        with open(self.complete_path, "w", encoding="utf-8") as f:
            f.write(f"{datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ}\n")


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
    ap.add_argument("--no-keep-logs", action="store_true",
                    help="parse each log in memory and never write it to disk")
    ap.add_argument("--max-minutes", type=float, metavar="N",
                    help="stop taking new sections after N minutes, finish the ones in "
                         "flight, flush the state files and exit 0")
    ap.add_argument("--max-tentativas", type=int, default=3, metavar="N",
                    help="give up on a section after N failed runs (0 = never); transient "
                         "failures (429, network) do not count")
    ap.add_argument("--encerramento", action="store_true",
                    help="scan the closing sequence of each urna instead of the late votes")
    ap.add_argument("--evento", choices=("conf", "sim"), default="conf",
                    help="--encerramento: which log line gives the closing time. conf = 'Procedimento de "
                         "encerramento confirmado' (default); sim = 'Todas as pessoas presentes já "
                         "votaram? SIM' (its own state_sim/ and results_sim/)")
    ap.add_argument("--so-secoes", metavar="CSV",
                    help="only check the sections listed in this CSV (columns uf, municipio, zona, "
                         "secao), e.g. results_enc/encerramentos_BR.csv: the sections that closed late. "
                         "Never marks the state complete.")
    ap.add_argument("--hora-registro", default="17:30", metavar="HH:MM",
                    help="--encerramento: sections closing at/after this Brasília time get a row")
    ap.add_argument("--state-dir")
    ap.add_argument("--results-dir")
    args = ap.parse_args()
    sim = args.evento == "sim"
    args.encerramento = args.encerramento or sim
    args.state_dir = args.state_dir or ("state_sim" if sim else "state_enc" if args.encerramento else "state")
    args.results_dir = args.results_dir or ("results_sim" if sim else "results_enc" if args.encerramento else "results")
    uf = args.uf.upper()
    started = time.monotonic()
    deadline = started + args.max_minutes * 60 if args.max_minutes else None

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

    only = None
    if args.so_secoes:
        with open(args.so_secoes, newline="", encoding="utf-8") as fh:
            only = {f"{r['municipio']},{r['zona']},{r['secao']}" for r in csv.DictReader(fh) if r["uf"] == uf}
        sections = [s for s in sections if key_of(s) in only]
        print(f"--so-secoes: {len(sections)} of the listed {len(only)} sections found in the {uf} index")
    if args.municipio:
        sections = [s for s in sections if s["mun"] == args.municipio.zfill(5)]
        if not sections:
            sys.exit("No sections for that municipality code; use --listar-municipios.")

    base = datetime.strptime(f"{args.data} {args.hora}", "%d/%m/%Y %H:%M")
    cutoff = base if args.hora_local else local_cutoff(base, uf)
    print(f"cutoff: {args.hora} {'local' if args.hora_local else 'Brasília'} "
          f"= {cutoff:%H:%M} on {uf} urna clocks")

    record_cut = None
    if args.encerramento:
        reg = datetime.strptime(f"{args.data} {args.hora_registro}", "%d/%m/%Y %H:%M")
        record_cut = reg if args.hora_local else local_cutoff(reg, uf)
        print(f"closing times: rows for sections closed at/after {record_cut:%H:%M} on {uf} urna clocks")
    progress = Progress(uf, args.state_dir, args.results_dir,
                        "todos_votaram" if sim else "encerramentos" if args.encerramento else "secoes_apos_17h",
                        (ENC_FIELDS_SIM if sim else ENC_FIELDS) if args.encerramento else RESULT_FIELDS)
    merged = [s for s in sections if s["agregada_a"]]
    sections = [s for s in sections if not s["agregada_a"]]
    if merged:
        print(f"{len(merged)} merged sections skipped (their votes are in the main section's urna)")
        for s in merged:
            progress.add_done(key_of(s))

    pending = [s for s in sections if key_of(s) not in progress.done]
    limit = args.max_tentativas
    todo = [s for s in pending if not limit or progress.attempts(key_of(s)) < limit]
    # never-tried sections first: the "first 20 all failed" check below must not be
    # tripped by sections that already failed in an earlier run
    todo.sort(key=lambda s: progress.attempts(key_of(s)))
    print(f"{len(sections)} sections in {uf}" + (f" / {args.municipio}" if args.municipio else "")
          + f": {len(sections) - len(pending)} already done, {len(pending) - len(todo)} given up "
          f"after {limit} failed runs, {len(todo)} to check")

    cache_dir, cache_index = None, {}
    if not args.no_keep_logs:
        cache_dir = os.path.join("logs_urna", uf)
        os.makedirs(cache_dir, exist_ok=True)
        cache_index = build_cache_index(cache_dir)
        print(f"{len(cache_index)} logs already downloaded")
    print(f"{args.workers} parallel downloads"
          + (", logs are not written to disk" if args.no_keep_logs else "")
          + (f", stopping new sections after {args.max_minutes:g} min" if deadline else ""))

    stop = {"reason": None, "hard": False}

    def on_signal(signum, frame):
        stop["reason"] = stop["reason"] or f"signal {signum}"
        stop["hard"] = True
    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)

    def finish(code):  # leave without waiting for in-flight downloads
        progress.flush()
        sys.stdout.flush()
        os._exit(code)

    processed = found = problems_now = fresh_failures = 0
    failed_now = []
    window = deque(maxlen=RATE_WINDOW)  # (requests, 429s) of the last sections
    pool = ThreadPoolExecutor(max_workers=args.workers)
    inflight, it = {}, iter(todo)
    run_started = time.monotonic()
    while True:
        if not stop["reason"] and deadline and time.monotonic() >= deadline:
            stop["reason"] = f"--max-minutes {args.max_minutes:g} reached"
        while not stop["reason"] and len(inflight) < args.workers * 2:
            s = next(it, None)
            if s is None:
                break
            inflight[pool.submit(check_section, ciclo, pleito, uf, s,
                                 cache_dir, cache_index, cutoff, args.encerramento)] = s
        if not inflight or stop["hard"]:
            break
        finished, _ = wait(inflight, timeout=1, return_when=FIRST_COMPLETED)
        for fut in finished:
            s = inflight.pop(fut)
            key = key_of(s)
            res, err, transient, reqs = fut.result()
            processed += 1
            window.append(reqs)
            if err:
                problems_now += 1
                fresh_failures += 0 if transient else 1
                failed_now.append(key)
                progress.set_problem(s, err, progress.attempts(key) + (0 if transient else 1))
            else:
                total, late, first_late, last_vote = res[:4]
                progress.clear_problem(key)
                if args.encerramento:
                    conf = res[4][args.evento]       # closing time by the chosen log line
                    progress.add_done(key, conf.strftime("%H%M%S") if conf else "-")
                    if conf is None or conf >= record_cut:
                        found += 1
                        hms = lambda d: d.strftime("%H:%M:%S") if d else ""
                        progress.add_row({
                            "uf": uf, "municipio": s["mun"], "nome_municipio": s["nome"],
                            "zona": s["zona"], "secao": s["secao"], "votos_no_dia": total,
                            "votos_apos_corte": late, "ultimo_voto": hms(last_vote),
                            "encerrar_selecionado": hms(res[4]["sel"]),
                            "encerramento_confirmado": hms(res[4]["conf"]),
                            "inicio_encerramento": hms(res[4]["ini"]),
                            **({"todos_votaram_sim": hms(res[4]["sim"])} if sim else {}),
                        })
                    late = 0   # rows were handled above
                else:
                    progress.add_done(key)
                if late:
                    found += 1
                    progress.add_row({
                        "uf": uf, "municipio": s["mun"], "nome_municipio": s["nome"],
                        "zona": s["zona"], "secao": s["secao"],
                        "hora_corte_local": cutoff.strftime("%H:%M"),
                        "votos_no_dia": total, "votos_apos_corte": late,
                        "primeiro_voto_apos_corte": first_late.strftime("%H:%M:%S"),
                        "ultimo_voto": last_vote.strftime("%H:%M:%S"),
                    })
            if processed % FLUSH_EVERY == 0:
                progress.flush()
            if processed % 200 == 0 or processed == len(todo):
                el = time.monotonic() - run_started
                eta = el / processed * (len(todo) - processed)
                print(f"  {processed}/{len(todo)} checked, {found} with late votes, "
                      f"{problems_now} problems  [{processed / el:.1f}/s, ~{eta / 60:.0f} min left]")
            # stop early if the very first sections all fail: layout probably changed
            if processed == 20 and fresh_failures == 20:
                print("\nFirst 20 sections all failed. Example:", err)
                for k in failed_now:  # not the sections' fault: don't count it as an attempt
                    progress.clear_problem(k)
                finish(1)
            if len(window) == RATE_WINDOW and not stop["reason"]:
                n_req = sum(w[0] for w in window)
                n_429 = sum(w[1] for w in window)
                if n_req and n_429 / n_req > RATE_LIMIT:
                    stop["reason"] = (f"rate limited: {n_429} of {n_req} requests in the last "
                                      f"{RATE_WINDOW} sections were HTTP 429")

    if stop["hard"]:
        pool.shutdown(wait=False, cancel_futures=True)
        print(f"\nStopped ({stop['reason']}); saving state.")
        finish(0)
    pool.shutdown(wait=True)
    progress.flush()

    remaining = [s for s in todo if key_of(s) not in progress.done]
    what = (f"closed at or after {record_cut:%H:%M} local (or without closing record)"
            if args.encerramento else
            f"with votes at or after {cutoff:%H:%M} local "
            f"({args.hora} {'local' if args.hora_local else 'Brasília'})")
    print(f"\nThis run: {processed} sections checked, {found} {what}, "
          f"{problems_now} failed. Total done in {uf}: "
          f"{sum(key_of(s) in progress.done for s in sections)}/{len(sections)}.")
    if stop["reason"]:
        print(f"Stopped early: {stop['reason']}. State saved; {len(remaining)} sections left to try.")
    elif remaining:
        print(f"{len(remaining)} sections failed this run; they will be retried next run "
              f"(see {progress.problems_path}).")
    elif not args.municipio and not args.so_secoes:
        progress.mark_complete()
        print(f"Nothing left to check in {uf}: wrote {progress.complete_path}"
              + (f" ({len(pending) - len(todo)} sections given up, see {progress.problems_path})"
                 if len(pending) > len(todo) else ""))


if __name__ == "__main__":
    main()
