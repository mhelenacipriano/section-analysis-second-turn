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

function Fit({ geo }) {
  const map = useMap();
  useEffect(() => {
    const b = L.geoJSON(geo).getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [8, 8] });
  }, [geo, map]);
  return null;
}

// Permanent text labels (e.g. "SP 98,7%") at each feature's centre. Small neighbouring states
// (the Northeast) would overlap, so a label that does not fit is moved to the nearest free spot
// and joined to its state by a thin line; the layout is redone on every zoom/pan, so zooming in
// puts each label back on its state.
const LW = 50, LH = 30;
const OFFSETS = (() => {
  const o = [[0, 0]];
  for (const r of [36, 66, 96, 126]) for (const a of [0, 40, -40, 80, -80, 120, -120, 160, -160, 180]) o.push([Math.round(r * Math.cos((a * Math.PI) / 180)), Math.round(r * Math.sin((a * Math.PI) / 180))]);
  return o;
})();

function Labels({ geo, tagOf, version }) {
  const map = useMap();
  useEffect(() => {
    if (!tagOf) return undefined;
    const items = geo.features.map((f) => {
      const html = tagOf(f);
      if (!html) return null;
      const b = L.geoJSON(f).getBounds();
      return { html, center: b.getCenter(), area: (b.getNorth() - b.getSouth()) * (b.getEast() - b.getWest()) };
    }).filter(Boolean).sort((p, q) => q.area - p.area);   // big states keep the centre spot
    const group = L.layerGroup().addTo(map);
    const draw = () => {
      group.clearLayers();
      let size;
      try { size = map.getSize(); map.getCenter(); } catch { return; }
      const placed = [];
      const clash = (r) => placed.some((q) => r.x < q.x + LW && r.x + LW > q.x && r.y < q.y + LH && r.y + LH > q.y);
      for (const it of items) {
        const p = map.latLngToContainerPoint(it.center);
        let pick = null;
        for (const [dx, dy] of OFFSETS) {
          const r = { x: p.x + dx - LW / 2, y: p.y + dy - LH / 2 };
          if (r.x < 0 || r.y < 0 || r.x + LW > size.x || r.y + LH > size.y) continue;
          if (!clash(r)) { pick = { r, dx, dy }; break; }
        }
        if (!pick) continue;                              // no room at this zoom: appears when zooming in
        placed.push(pick.r);
        const pos = map.containerPointToLatLng([p.x + pick.dx, p.y + pick.dy]);
        if (pick.dx || pick.dy) L.polyline([it.center, pos], { color: '#fff', weight: 1.2, opacity: 0.9, interactive: false }).addTo(group);
        L.marker(pos, { interactive: false, keyboard: false,
          icon: L.divIcon({ className: 'uf-tag', html: it.html, iconSize: [LW, LH], iconAnchor: [LW / 2, LH / 2] }) }).addTo(group);
      }
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
export default function MapView({ geo, keyOf, labelOf, valueOf, max, hue = 'accent', selected, onPick, themeKey, version, colorOf, tagOf }) {
  const colors = useMemo(() => ({ lo: css('--panel2'), hi: css(`--${hue}`), none: css('--soft'), line: css('--line'), sel: css('--fg'), lula: css('--lula'), flavio: css('--flavio'), outros: css('--outros') }), [hue, themeKey]); // eslint-disable-line react-hooks/exhaustive-deps
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
    <MapContainer className="mapa" zoomSnap={0.25} attributionControl={false} scrollWheelZoom={false} minZoom={2} style={{ background: 'var(--soft)' }}>
      <GeoJSON key={`${geoId(geo)}|${version}|${selected}|${themeKey}`} data={geo} style={style} onEachFeature={each} />
      <Fit geo={geo} />
      {tagOf && <Labels geo={geo} tagOf={tagOf} version={`${version}|${themeKey}`} />}
    </MapContainer>
  );
}
