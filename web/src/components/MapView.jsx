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

function Fit({ geo }) {
  const map = useMap();
  useEffect(() => {
    const b = L.geoJSON(geo).getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [8, 8] });
  }, [geo, map]);
  return null;
}

/**
 * Choropleth without base tiles (nothing to load, nothing to attribute but the borders).
 * valueOf(feature) -> number | null ; color is a ramp from the panel colour to `hue`.
 * `version` must change whenever the values change (the layer is rebuilt when it does).
 */
export default function MapView({ geo, keyOf, labelOf, valueOf, max, hue = 'accent', selected, onPick, themeKey, version }) {
  const colors = useMemo(() => ({ lo: css('--panel2'), hi: css(`--${hue}`), none: css('--soft'), line: css('--line'), sel: css('--fg') }), [hue, themeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = (f) => {
    const v = valueOf(f);
    const isSel = selected && keyOf(f) === selected;
    return {
      fillColor: v == null ? colors.none : ramp(Math.min(1, Math.sqrt(v / (max || 1))), colors.lo, colors.hi),
      fillOpacity: 1, color: isSel ? colors.sel : colors.line, weight: isSel ? 2.4 : 0.6,
    };
  };
  const each = (f, layer) => {
    layer.bindTooltip(labelOf(f), { sticky: true });
    layer.on({ click: () => onPick?.(keyOf(f), f) });
  };
  return (
    <MapContainer className="mapa" zoomSnap={0.25} attributionControl={false} scrollWheelZoom={false} minZoom={2} style={{ background: 'var(--soft)' }}>
      <GeoJSON key={`${version}|${selected}|${themeKey}`} data={geo} style={style} onEachFeature={each} />
      <Fit geo={geo} />
    </MapContainer>
  );
}
