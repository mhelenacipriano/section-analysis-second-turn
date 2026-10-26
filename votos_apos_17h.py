"""
Find electoral sections whose urna recorded votes after a cutoff time
(default: 17:00 on 25/10/2026, 2º turno).

Input: a folder with the TSE *urna log* files (NOT the Gedai logs), either
  - the per-UF .zip files as downloaded, or
  - extracted .logjez files (one per section).
Each .logjez is a 7z archive holding the urna event log (logd.dat),
tab-separated, latin-1 encoded, one line per event:
  DD/MM/YYYY HH:MM:SS <TAB> level <TAB> urna id <TAB> app <TAB> message <TAB> hash

Usage:
    pip install py7zr
    python votos_apos_17h.py /path/to/folder
    python votos_apos_17h.py /path/to/folder --date 25/10/2026 --hora 17:00
Output: secoes_votos_apos_17h.csv
"""
import argparse
import csv
import io
import os
import re
import sys
import tempfile
import zipfile
from datetime import datetime, timedelta

import py7zr

VOTE_MSG = "o voto do eleitor foi computado"
# 2022/2024: o00407-0100700090001.logjez   -> municipio 01007, zona 0009, secao 0001
# 2026:      o03221ms5502600430383-log.jez -> municipio 55026, zona 0043, secao 0383
NAME_RE = re.compile(r"(\d{5})(\d{4})(\d{4})(?:\.logjez|-log\.jez)$", re.I)
LOG_EXT = (".logjez", "-log.jez")
# 2026 file names carry the state: o03221ac0100700090001-log.jez -> AC
UF_RE = re.compile(r"o\d{5}([a-z]{2})\d{13}-log\.jez$", re.I)

# Urnas log in LOCAL time; voting hours are set in Brasília time (8h-17h).
# Hours to add to Brasília time to get each state's clock. Not covered:
# western Amazonas municipalities on Acre time (-2h) and Fernando de
# Noronha (+1h); check those by hand or with --hora-local.
UF_OFFSET = {"AC": -2, "AM": -1, "RR": -1, "RO": -1, "MT": -1, "MS": -1}


def local_cutoff(cutoff_brasilia, uf):
    return cutoff_brasilia + timedelta(hours=UF_OFFSET.get((uf or "").upper(), 0))


def uf_from_name(*names):
    for n in names:
        m = UF_RE.search(n or "")
        if m:
            return m.group(1).upper()
        m = re.search(r"_([A-Z]{2})_", n or "")
        if m:
            return m.group(1)
    return ""
FIELD_RES = {
    "municipio": re.compile(r"Munic[ií]pio:\s*(\d+)", re.I),
    "zona": re.compile(r"Zona Eleitoral:\s*(\d+)", re.I),
    "secao": re.compile(r"Se[cç][aã]o Eleitoral:\s*(\d+)", re.I),
}


def iter_logjez(folder):
    """Yield (uf_source, filename, bytes) for every .logjez in folder or its zips."""
    for root, _, files in os.walk(folder):
        for f in sorted(files):
            path = os.path.join(root, f)
            low = f.lower()
            if low.endswith(LOG_EXT):
                with open(path, "rb") as fh:
                    yield f, f, fh.read()
            elif low.endswith(".zip"):
                try:
                    with zipfile.ZipFile(path) as z:
                        for name in z.namelist():
                            if name.lower().endswith(LOG_EXT):
                                yield f, os.path.basename(name), z.read(name)
                except zipfile.BadZipFile:
                    print(f"skipping unreadable zip: {f}", file=sys.stderr)


def unpack(blob, name="", depth=0):
    """Yield (name, bytes) for every plain file inside blob, opening
    7z / zip / xz archives at any nesting level (2026 logs are zip files,
    2022/2024 logs were 7z)."""
    if depth > 5:
        return
    if blob.startswith(b"7z\xbc\xaf\x27\x1c"):
        # extract to a temp folder: works on every py7zr version
        with tempfile.TemporaryDirectory() as tmp:
            with py7zr.SevenZipFile(io.BytesIO(blob), mode="r") as arc:
                arc.extractall(path=tmp)
            for root, _, files in os.walk(tmp):
                for n in sorted(files):
                    with open(os.path.join(root, n), "rb") as fh:
                        yield from unpack(fh.read(), n, depth + 1)
    elif blob.startswith(b"PK\x03\x04"):
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            for n in sorted(z.namelist()):
                if not n.endswith("/"):
                    yield from unpack(z.read(n), n, depth + 1)
    elif blob.startswith(b"\xfd7zXZ\x00"):
        import lzma
        yield from unpack(lzma.decompress(blob), name, depth + 1)
    else:
        yield name, blob


def read_log_lines(blob):
    for name, data in unpack(blob):
        low = name.lower()
        # skip obvious non-log members (signatures, certificates, images)
        if low.endswith((".sig", ".vsc", ".crt", ".cer", ".pem", ".p7s", ".png", ".jpg")):
            continue
        yield from data.decode("latin-1", errors="replace").splitlines()


def analyse(blob, filename, cutoff):
    ids = {}
    m = NAME_RE.search(filename)
    if m:
        ids = {"municipio": m.group(1), "zona": m.group(2), "secao": m.group(3)}

    # Fast path: one regex over the whole text finds only the vote lines of
    # the target day (instead of splitting and parsing ~9,000 lines in Python).
    day = cutoff.strftime("%d/%m/%Y")
    vote_re = re.compile(
        r"^" + re.escape(day) + r" (\d\d):(\d\d):(\d\d)\t[^\t\n]*\t[^\t\n]*\t[^\t\n]*\t"
        r"O voto do eleitor foi computado\t?([^\t\n]*)",
        re.M | re.I,
    )
    cut = cutoff.hour * 3600 + cutoff.minute * 60 + cutoff.second
    total = late = 0
    first_late = last_vote = None  # seconds since midnight
    seen = set()  # the same line can appear in more than one file of an archive
    for _, text in iter_texts(blob):
        if not m:
            for k, rx in FIELD_RES.items():
                if k not in ids:
                    hit = rx.search(text)
                    if hit:
                        ids[k] = hit.group(1)
        for v in vote_re.finditer(text):
            key = v.group(0)
            if key in seen:
                continue
            seen.add(key)
            t = int(v.group(1)) * 3600 + int(v.group(2)) * 60 + int(v.group(3))
            total += 1
            if last_vote is None or t > last_vote:
                last_vote = t
            if t >= cut:
                late += 1
                if first_late is None or t < first_late:
                    first_late = t

    def as_dt(sec):
        return None if sec is None else cutoff.replace(
            hour=sec // 3600, minute=sec % 3600 // 60, second=sec % 60)

    return ids, total, late, as_dt(first_late), as_dt(last_vote)


def iter_texts(blob):
    for name, data in unpack(blob):
        if name.lower().endswith((".sig", ".vsc", ".crt", ".cer", ".pem", ".p7s", ".png", ".jpg")):
            continue
        yield name, data.decode("latin-1", errors="replace")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--date", default="25/10/2026")
    ap.add_argument("--hora", default="17:00")
    ap.add_argument("--out", default="secoes_votos_apos_17h.csv")
    ap.add_argument("--hora-local", action="store_true",
                    help="treat --hora as each urna's local clock (no time-zone conversion)")
    args = ap.parse_args()
    base = datetime.strptime(f"{args.date} {args.hora}", "%d/%m/%Y %H:%M")

    rows, checked = [], 0
    for source, fname, blob in iter_logjez(args.folder):
        checked += 1
        uf = uf_from_name(fname, source)
        cutoff = base if args.hora_local else local_cutoff(base, uf)
        try:
            ids, total, late, first_late, last_vote = analyse(blob, fname, cutoff)
        except Exception as e:
            print(f"error in {fname}: {e}", file=sys.stderr)
            continue
        if late:
            rows.append({
                "uf": uf,
                "hora_corte_local": cutoff.strftime("%H:%M"),
                "arquivo_origem": source,
                "arquivo_log": fname,
                "municipio": ids.get("municipio", ""),
                "zona": ids.get("zona", ""),
                "secao": ids.get("secao", ""),
                "votos_no_dia": total,
                "votos_apos_corte": late,
                "primeiro_voto_apos_corte": first_late.strftime("%H:%M:%S"),
                "ultimo_voto": last_vote.strftime("%H:%M:%S"),
            })
        if checked % 1000 == 0:
            print(f"{checked} sections checked, {len(rows)} with late votes")

    if checked == 0:
        sys.exit("No .logjez files found. Is this the urna log dataset? "
                 "Gedai preparation logs don't contain votes.")

    rows.sort(key=lambda r: -r["votos_apos_corte"])
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ["secao"])
        w.writeheader()
        w.writerows(rows)
    print(f"\n{checked} sections checked; {len(rows)} recorded votes at or after "
          f"{args.hora} {'local time' if args.hora_local else 'Brasília time'} on {args.date}. "
          f"Saved to {args.out}")


if __name__ == "__main__":
    main()