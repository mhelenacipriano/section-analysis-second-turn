import { useEffect, useMemo, useState } from 'react';
import MapView from './MapView.jsx';
import { Note } from './ui.jsx';
import { loadGeo } from '../data.js';
import { fmtPct } from '../format.js';
import { onTimeByState } from '../stats.js';

export const WINNER = { lula: 'Lula', flavio: 'Flávio Bolsonaro', outros: 'Outro candidato' };

/** Map of the states: colour = who won the state in the 1st turn (red Lula, blue Flávio),
 *  label = % of the state's sections that closed on time. */
export default function OnTimeMap({ data, go, themeKey }) {
  const [geo, setGeo] = useState(null);
  const rows = useMemo(() => onTimeByState(data), [data]);
  const byUf = useMemo(() => new Map(rows.map((r) => [r.uf, r])), [rows]);
  useEffect(() => { loadGeo('uf.json').then(setGeo).catch(() => setGeo(null)); }, []);
  return (
    <>
      <div className="legend" aria-label="Legenda do mapa">
        <span><i className="sw lula" />Lula venceu o estado</span>
        <span><i className="sw flavio" />Flávio Bolsonaro venceu o estado</span>
        <span><i className="sw neu" />sem dados</span>
      </div>
      <div className="mapa-caixa">
        {geo ? (
          <MapView
            geo={geo} themeKey={themeKey} version={`pontual|${rows.length}`}
            keyOf={(f) => f.properties.uf}
            valueOf={(f) => byUf.get(f.properties.uf)?.pct ?? null} max={1}
            colorOf={(f, c) => { const r = byUf.get(f.properties.uf); return r ? c[r.winner] : c.none; }}
            labelOf={(f) => { const r = byUf.get(f.properties.uf); return r ? `${f.properties.uf}: ${fmtPct(r.pct, 2)} no horário · venceu ${WINNER[r.winner]}` : `${f.properties.uf}: sem dados`; }}
            tagOf={(f) => { const r = byUf.get(f.properties.uf); return r ? `<span><b>${f.properties.uf}</b><br>${fmtPct(r.pct, 1)}</span>` : ''; }}
            onPick={(uf) => byUf.has(uf) && go('/mapa', { uf })}
          />
        ) : <p className="empty">Carregando mapa…</p>}
      </div>
      <Note>O número em cada estado é a porcentagem das seções que fecharam no horário (antes das 17h30), sem ficar abertas até mais tarde; a cor é quem venceu o estado no 1º turno, também escrito na tabela e no ranking. Clique num estado para ver os municípios.</Note>
    </>
  );
}
