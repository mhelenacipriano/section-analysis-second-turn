"""
Urna clocks. Logs carry the urna's LOCAL time; the election rules are in Brasília time.

  Brasília time = local time - offset      (offset in hours, see below)

State defaults follow votos_apos_17h.UF_OFFSET (AC -2h; AM, RO, RR, MT, MS -1h; others 0).
Exceptions inside a state:
  * Fernando de Noronha (PE) is +1h: fixed in MUN_OFFSET.
  * Some Amazonas municipalities (the southwest) use Acre time (-2h). Instead of keeping a list,
    the offset of an Amazonas municipality is read from its own sections: they confirm closing a
    few minutes after 17:00 Brasília, so the median local closing time says which clock it uses.
"""
import statistics

UF_OFFSET = {"AC": -2, "AM": -1, "RR": -1, "RO": -1, "MT": -1, "MS": -1}
MUN_OFFSET = {("PE", "30015"): +1}   # Fernando de Noronha, UTC-2
DETECT_OFFSET = {"AM"}
NORMAL_CLOSE = 17 * 3600 + 4 * 60    # typical closing time of a section, Brasília, seconds


def secs(hms):
    """'HHMMSS' or 'HH:MM:SS' -> seconds since midnight."""
    s = hms.replace(":", "")
    return int(s[0:2]) * 3600 + int(s[2:4]) * 60 + int(s[4:6])


def clock(sec):
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


def muni_offsets(items):
    """items: iterable of ((uf, municipio), [closing times, local seconds], name).
    Returns ({(uf, municipio): offset hours}, [(uf, municipio, name, state offset, detected)])."""
    out, detected = {}, []
    for (uf, mun), values, name in items:
        off = MUN_OFFSET.get((uf, mun), UF_OFFSET.get(uf, 0))
        if uf in DETECT_OFFSET and len(values) >= 3:
            k = round((statistics.median(values) - NORMAL_CLOSE) / 3600)
            if k != off and -3 <= k <= 1:
                detected.append((uf, mun, name, off, k))
                off = k
        out[(uf, mun)] = off
    return out, detected
