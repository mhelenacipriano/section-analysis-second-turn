"""
Download municipality boundaries (tbrugz/geodata-br, derived from IBGE) and write simplified,
topology-preserving copies for the site:

    python scripts/fetch_geo.py            # all 27 states
    python scripts/fetch_geo.py SP RJ      # only these

  web/public/geo/mun_<UF>.json   municipalities of one state, properties {id (IBGE, 7 digits), name}
  web/public/geo/uf.json         state outlines (dissolved from the municipalities), properties {uf}

Needs Node (uses `npx mapshaper`) for simplifying. Run once; the output is committed.
"""
import json
import os
import subprocess
import sys
import tempfile
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "web", "public", "geo")
SRC = "https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-{code}-mun.json"
MAPSHAPER = ["npx", "--yes", "mapshaper@0.6.100"]
# IBGE state code -> sigla
UF_CODES = {11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO", 21: "MA",
            22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL", 28: "SE", 29: "BA",
            31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR", 42: "SC", 43: "RS", 50: "MS",
            51: "MT", 52: "GO", 53: "DF"}


def ring_area(r):
    return sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1)) / 2


def fix_islands(geom):
    """The source writes some coastal municipalities (Rio de Janeiro, Vitória, Ilhabela...) as ONE
    Polygon whose islands are extra rings with the SAME winding as the mainland. Read as holes they
    make the whole shape vanish after simplifying, so rings that wind like the first one become
    polygons of their own and only oppositely wound rings stay holes."""
    if geom["type"] != "Polygon" or len(geom["coordinates"]) < 2:
        return geom
    rings = geom["coordinates"]
    outer_sign = ring_area(rings[0]) > 0
    polys = []
    for r in rings:
        if (ring_area(r) > 0) == outer_sign or not polys:
            polys.append([r])
        else:
            polys[-1].append(r)
    return {"type": "MultiPolygon", "coordinates": polys} if len(polys) > 1 else geom


def run(args):
    subprocess.run(MAPSHAPER + args, check=True, stdout=subprocess.DEVNULL)


def main():
    want = {a.upper() for a in sys.argv[1:]} or set(UF_CODES.values())
    os.makedirs(OUT, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for code, uf in UF_CODES.items():
            if uf not in want:
                continue
            raw = os.path.join(tmp, f"{uf}.json")
            with urllib.request.urlopen(SRC.format(code=code), timeout=120) as r:
                data = json.load(r)
            for f in data["features"]:  # keep only what the site needs
                f["geometry"] = fix_islands(f["geometry"])
                f["properties"] = {"id": f["properties"]["id"], "name": f["properties"]["name"],
                                   "uf": uf}
            with open(raw, "w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=False)
            out = os.path.join(OUT, f"mun_{uf}.json")
            run([raw, "-simplify", "20%", "keep-shapes", "-o", out, "precision=0.0001",
                 "format=geojson"])
            print(f"{uf}: {len(data['features'])} municipalities, {os.path.getsize(out) // 1024} KB")

        # state outlines from whatever municipality files exist now
        files = [os.path.join(OUT, f"mun_{u}.json") for u in UF_CODES.values()
                 if os.path.exists(os.path.join(OUT, f"mun_{u}.json"))]
        if len(files) == len(UF_CODES):
            run(files + ["combine-files", "-merge-layers", "-dissolve", "uf", "-simplify", "30%",
                         "keep-shapes", "-o", os.path.join(OUT, "uf.json"), "precision=0.001",
                         "format=geojson"])
            print(f"uf.json: {os.path.getsize(os.path.join(OUT, 'uf.json')) // 1024} KB")


if __name__ == "__main__":
    main()
