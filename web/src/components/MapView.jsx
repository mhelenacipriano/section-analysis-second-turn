import { useEffect, useMemo } from 'react';
import { GeoJSON, MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
export function ramp(t, from, to) {
  const a = hex(from), b = hex(to);
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',')})`;
}

// identifies a geometry set, so a layer is rebuilt whenever its data changes (react-leaflet ignores new `data`)
const geoId = (geo) => `${geo.features.length}:${geo.features[0]?.properties?.id ?? geo.features[0]?.properties?.uf}`;

// the view follows the selection: the whole geometry, or the focused feature (selected municipality)
function Fit({ geo, focus, keyOf, room }) {
  const map = useMap();
  useEffect(() => {
    const ft = focus ? geo.features.find((f) => keyOf(f) === focus) : null;
    let b = ft ? L.geoJSON(ft).getBounds() : null;
    if (!b || !b.isValid()) b = L.geoJSON(geo).getBounds();     // a municipality without an outline: show the state
    if (b.isValid()) map.fitBounds(b, { paddingTopLeft: [8, 8], paddingBottomRight: [ft ? 8 : room, 8], maxZoom: ft ? 11 : undefined });
  }, [geo, focus, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ---- state labels, drawn like a printed map -------------------------------------------------------
// tagOf(feature) -> { a: 'RJ', b: '7.9%' } | null.  A label whose state is big enough is written inside it
// (UF over value, white or dark ink depending on the fill). Small states (the Northeast coast, ES, RJ, DF)
// get a callout: a dot on the state, a thin line and "UF value" in a tidy column beside the map.
// The layout is redone on every zoom/pan, so zooming in moves callouts into their states.
const brightness = (c) => {
  let r, g, b;
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) [r, g, b] = m[1].split(',').map(Number);
  else { const h = String(c).replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16); [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255]; }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
const ringArea = (r) => r.reduce((s, p, i) => (i ? s + (r[i - 1][0] * p[1] - p[0] * r[i - 1][1]) : s), 0) / 2;
function anchorOf(feature) {       // centroid of the biggest polygon, as [lat, lng]
  const g = feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let best = null, bestA = -1;
  for (const pl of polys) { const a = Math.abs(ringArea(pl[0])); if (a > bestA) { bestA = a; best = pl[0]; } }
  const A = ringArea(best);
  let cx = 0, cy = 0;
  for (let i = 1; i < best.length; i++) {
    const k = best[i - 1][0] * best[i][1] - best[i][0] * best[i - 1][1];
    cx += (best[i - 1][0] + best[i][0]) * k; cy += (best[i - 1][1] + best[i][1]) * k;
  }
  return A ? L.latLng(cy / (6 * A), cx / (6 * A)) : L.geoJSON(feature).getBounds().getCenter();
}

const inRing = (x, y, r) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  }
  return c;
};
const inFeature = (f, ll) => {       // is the point inside the polygon (holes ignored)?
  const g = f.geometry;
  return (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).some((pl) => inRing(ll.lng, ll.lat, pl[0]));
};

function Labels({ geo, tagOf, colorOf, colors, version }) {
  const map = useMap();
  useEffect(() => {
    if (!tagOf) return undefined;
    const items = geo.features.map((f) => {
      const tag = tagOf(f);
      if (!tag) return null;
      return { f, tag, anchor: anchorOf(f), bounds: L.geoJSON(f).getBounds(), fill: colorOf ? colorOf(f, colors) : colors.none };
    }).filter(Boolean);
    const group = L.layerGroup().addTo(map);
    const text = (cls, html, w, h, pos, anchor) => L.marker(pos, { interactive: false, keyboard: false,
      icon: L.divIcon({ className: cls, html, iconSize: [w, h], iconAnchor: anchor }) }).addTo(group);
    const draw = () => {
      group.clearLayers();
      let size;
      try { size = map.getSize(); map.getCenter(); } catch { return; }
      const small = size.x < 560;
      const fs = small ? 7.5 : 9.5;
      const needW = small ? 22 : 28, needH = small ? 18 : 23;
      const call = [];
      for (const it of items) {
        const sw = map.latLngToContainerPoint(it.bounds.getSouthWest()), ne = map.latLngToContainerPoint(it.bounds.getNorthEast());
        const w = Math.abs(ne.x - sw.x), h = Math.abs(sw.y - ne.y);
        // the text box must lie inside the state, not only inside its bounding box; try the centroid, then the
        // middle of the bounding box (a concave state can have its centroid outside)
        const hw = needW * 0.28, hh = needH * 0.28;
        const at = (ll) => { const q = map.latLngToContainerPoint(ll); return w >= needW && h >= needH && [[0, 0], [-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]].every(([dx, dy]) => inFeature(it.f, map.containerPointToLatLng([q.x + dx, q.y + dy]))) ? ll : null; };
        const spot = at(it.anchor) || at(it.bounds.getCenter());
        const dot = inFeature(it.f, it.anchor) ? it.anchor : it.bounds.getCenter();
        const p = map.latLngToContainerPoint(spot || dot);
        if (p.x < 0 || p.y < 0 || p.x > size.x || p.y > size.y) continue;
        if (spot) {
          const ink = brightness(it.fill) > 0.62 ? '#161616' : '#fff';
          text('uf-in', `<span style="color:${ink};font-size:${fs}px"><b>${it.tag.a}</b><br>${it.tag.b}</span>`, 40, 24, spot, [20, 12]);
        } else if (p.x < size.x * 0.58 && it.tag.a !== 'DF') {
          // inland or western and too small for its text: write it anyway, with a halo, rather than drag a long line across the country
          text('uf-in halo', `<span style="font-size:${fs}px"><b>${it.tag.a}</b><br>${it.tag.b}</span>`, 40, 24, dot, [20, 12]);
        } else call.push({ it: { ...it, anchor: dot }, p });
      }
      // callouts: clusters of neighbours (by height) share a column to the right of the right-most dot
      const east = call.filter((c) => c.it.tag.a !== 'DF').sort((a, b) => a.p.y - b.p.y);
      const lineH = small ? 11 : 13, tw = small ? 40 : 46;
      const clusters = [];
      for (const c of east) {
        const last = clusters[clusters.length - 1];
        if (last && c.p.y - last[last.length - 1].p.y < 46) last.push(c); else clusters.push([c]);
      }
      const ink = colors.fg;
      const callout = (c, x, y, side) => {
        const to = map.containerPointToLatLng([x, y]);
        L.polyline([c.it.anchor, to], { color: ink, weight: 0.8, opacity: 0.75, interactive: false }).addTo(group);
        L.circleMarker(c.it.anchor, { radius: 2, color: ink, fillColor: ink, fillOpacity: 1, weight: 1, interactive: false }).addTo(group);
        const html = `<span style="font-size:${fs}px"><b>${c.it.tag.a}</b> ${c.it.tag.b}</span>`;
        text(`uf-out ${side}`, html, tw, lineH, map.containerPointToLatLng([x + (side === 'r' ? 3 : -3), y]), [side === 'r' ? 0 : tw, lineH / 2]);
      };
      for (const cl of clusters) {
        const x = Math.min(Math.max(...cl.map((c) => c.p.x)) + 24, size.x - tw - 4);
        let y = -1e9;
        const ys = cl.map((c) => { y = Math.max(c.p.y, y + lineH); return y; });
        const over = ys[ys.length - 1] - (size.y - lineH);
        cl.forEach((c, i) => callout(c, x, ys[i] - Math.max(0, over), 'r'));
      }
      for (const c of call.filter((c) => c.it.tag.a === 'DF')) callout(c, c.p.x + 24, c.p.y + 6, 'r');
    };
    map.whenReady(draw);
    map.on('zoomend moveend resize', draw);
    return () => { map.off('zoomend moveend resize', draw); group.remove(); };
  }, [geo, version, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * Choropleth without base tiles (nothing to load, nothing to attribute but the borders).
 * valueOf(feature) -> number | null ; color is a ramp from the panel colour to `hue`.
 * `version` must change whenever the values change (the layer is rebuilt when it does).
 */
export default function MapView({ geo, keyOf, labelOf, valueOf, max, hue = 'accent', selected, focus, onPick, themeKey, version, colorOf, tagOf, plain }) {
  const colors = useMemo(() => ({ lo: css('--panel2'), hi: css(`--${hue}`), none: css('--soft'), line: css('--line'), sel: css('--fg'), lula: css('--lula'), flavio: css('--flavio'), outros: css('--outros'), fg: css('--fg') }), [hue, themeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = (f) => {
    const v = valueOf(f);
    const isSel = selected && keyOf(f) === selected;
    return {
      fillColor: colorOf ? colorOf(f, colors) : v == null ? colors.none : ramp(Math.min(1, Math.sqrt(v / (max || 1))), colors.lo, colors.hi),
      fillOpacity: 1, color: isSel ? colors.sel : colors.line, weight: isSel ? 2.4 : 0.6,
    };
  };
  const each = (f, layer) => {
    layer.bindTooltip(labelOf(f), { sticky: true });
    layer.on({ click: () => onPick?.(keyOf(f), f) });
  };
  return (
    <MapContainer className={`mapa ${plain ? 'plain' : ''}`} zoomSnap={0.25} attributionControl={false} scrollWheelZoom={false} minZoom={2}
      zoomControl={!plain} dragging={!plain} touchZoom={!plain} doubleClickZoom={!plain} boxZoom={!plain} keyboard={!plain}
      style={plain ? undefined : { background: 'var(--soft)' }}>
      <GeoJSON key={`${geoId(geo)}|${version}|${selected}|${themeKey}`} data={geo} style={style} onEachFeature={each} />
      <Fit geo={geo} focus={focus} keyOf={keyOf} room={tagOf ? 60 : 8} />
      {tagOf && <Labels geo={geo} tagOf={tagOf} colorOf={colorOf} colors={colors} version={`${version}|${themeKey}`} />}
    </MapContainer>
  );
}
