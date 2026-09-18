"""Regenerates js/mapData.js from OpenStreetMap (Overpass) and Open-Meteo elevation.

Usage:  python tools/build_map.py
Origin is the Tichá street in Dobřany; local coordinates are metres, x = east, z = south.
"""
import json
import math
import os
import urllib.parse
import urllib.request

LAT0, LON0 = 49.65026, 13.29359   # Tichá, Dobřany
R = 420                             # keep features within this many metres
BBOX = (49.6465, 13.2870, 49.6540, 13.3000)
UA = {"User-Agent": "dobrany-kart-map-builder"}
OUT = os.path.join(os.path.dirname(__file__), "..", "js", "mapData.js")


def overpass():
    b = "(%f,%f,%f,%f)" % BBOX
    q = "[out:json][timeout:60];(" + "".join(
        f'way{b}["{k}"];' for k in ("highway", "building", "landuse", "leisure", "natural", "waterway", "amenity")
    ) + ");out geom tags;"
    req = urllib.request.Request("https://overpass-api.de/api/interpreter",
                                 data=urllib.parse.urlencode({"data": q}).encode(), headers=UA)
    return json.load(urllib.request.urlopen(req))


def elevation(n=11, size=800):
    lats, lons = [], []
    for j in range(n):
        for i in range(n):
            x = -size / 2 + size * i / (n - 1)
            y = -size / 2 + size * j / (n - 1)
            lats.append(LAT0 + y / 110540)
            lons.append(LON0 + x / (111320 * math.cos(math.radians(LAT0))))
    res = []
    for k in range(0, len(lats), 100):
        u = ("https://api.open-meteo.com/v1/elevation?latitude=" + ",".join("%.6f" % a for a in lats[k:k + 100])
             + "&longitude=" + ",".join("%.6f" % a for a in lons[k:k + 100]))
        res += json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA)))["elevation"]
    return {"n": n, "size": size, "h": res}


def xy(p):
    x = (p["lon"] - LON0) * 111320 * math.cos(math.radians(LAT0))
    y = (p["lat"] - LAT0) * 110540
    return [round(x, 1), round(-y, 1)]


def main():
    d = overpass()
    roads, buildings, areas, water = [], [], [], []
    for e in d["elements"]:
        t = e.get("tags", {})
        pts = [xy(p) for p in e["geometry"]]
        if not any(abs(x) < R and abs(z) < R for x, z in pts):
            continue
        if "building" in t:
            if pts[0] == pts[-1]:
                pts = pts[:-1]
            try:
                year = int(t.get("start_date", "")[:4])
            except ValueError:
                year = 0
            buildings.append({"p": pts, "t": t["building"], "l": int(float(t.get("building:levels", "1") or 1)),
                              "y": year, "r": t.get("roof:shape", "")})
        elif "highway" in t:
            roads.append({"p": pts, "t": t["highway"], "n": t.get("name", "")})
        elif "waterway" in t or t.get("natural") == "water":
            water.append({"p": pts, "t": t.get("waterway", "water")})
        else:
            kind = t.get("landuse") or t.get("leisure") or t.get("natural") or t.get("amenity")
            if pts[0] == pts[-1]:
                pts = pts[:-1]
            areas.append({"p": pts, "t": kind})
    out = {"origin": [LAT0, LON0], "elev": elevation(), "roads": roads, "buildings": buildings,
           "areas": areas, "water": water}
    with open(OUT, "w", encoding="utf8") as f:
        f.write("// Generated from OpenStreetMap (© OpenStreetMap contributors, ODbL) and Open-Meteo elevation (Copernicus DEM).\n"
                "// Local coordinates in metres around Tichá, Dobřany: x = east, z = south.\n"
                "export const MAP = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"{len(roads)} roads, {len(buildings)} buildings, {len(areas)} areas -> {OUT}")


if __name__ == "__main__":
    main()
