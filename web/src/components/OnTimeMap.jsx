import { useEffect, useMemo, useState } from 'react';
import MapView from './MapView.jsx';
import { Note } from './ui.jsx';
import { useLang } from '../i18n.jsx';
import { loadGeo } from '../data.js';
import { fmtPct } from '../format.js';
import { onTimeByState } from '../stats.js';

export const winnerName = (k, L) => ({ lula: 'Lula', flavio: 'Flávio Bolsonaro', outros: L('Outro candidato', 'Another candidate') }[k]);

/** Map of the states: colour = who won the state in the 1st turn (red Lula, blue Flávio),
 *  label = % of the state's sections that closed on time. */
export default function OnTimeMap({ data, go, themeKey }) {
  const { L } = useLang();
  const [geo, setGeo] = useState(null);
  const rows = useMemo(() => onTimeByState(data), [data]);
  const byUf = useMemo(() => new Map(rows.map((r) => [r.uf, r])), [rows]);
  useEffect(() => { loadGeo('uf.json').then(setGeo).catch(() => setGeo(null)); }, []);
  return (
    <>
      <div className="legend" aria-label={L('Legenda do mapa', 'Map legend')}>
        <span><i className="sw lula" />{L('Lula teve mais votos no estado (1º turno)', 'Lula had more votes in the state (1st round)')}</span>
        <span><i className="sw flavio" />{L('Flávio teve mais votos no estado (1º turno)', 'Flávio had more votes in the state (1st round)')}</span>
        <span><i className="sw neu" />{L('sem dados', 'no data')}</span>
      </div>
      <div className="mapa-caixa">
        {geo ? (
          <MapView
            geo={geo} themeKey={themeKey} version={`pontual|${rows.length}|${L('pt', 'en')}`}
            keyOf={(f) => f.properties.uf}
            valueOf={(f) => byUf.get(f.properties.uf)?.pct ?? null} max={1}
            colorOf={(f, c) => { const r = byUf.get(f.properties.uf); return r ? c[r.winner] : c.none; }}
            labelOf={(f) => { const r = byUf.get(f.properties.uf); return r ? `${f.properties.uf}: ${fmtPct(r.pct, 2)} ${L('no horário', 'on time')} · ${L('venceu', 'won by')} ${winnerName(r.winner, L)}` : `${f.properties.uf}: ${L('sem dados', 'no data')}`; }}
            tagOf={(f) => { const r = byUf.get(f.properties.uf); return r ? `<span><b>${f.properties.uf}</b><br>${fmtPct(r.pct, 1)}</span>` : ''; }}
            onPick={(uf) => byUf.has(uf) && go('/mapa', { uf })}
          />
        ) : <p className="empty">{L('Carregando mapa…', 'Loading map…')}</p>}
      </div>
      <Note>{L(
        'O número em cada estado é a porcentagem das seções que fecharam no horário (antes das 17h30), sem ficar abertas até mais tarde; a cor compara os votos de Lula e Flávio no 1º turno no estado inteiro (vermelho = Lula, azul = Flávio), também escrito na tabela e no ranking. Clique num estado para ver os municípios.',
        'The number on each state is the share of its sections that closed on time (before 17:30), without staying open later; the colour compares Lula’s and Flávio’s 1st-round votes in the whole state (red = Lula, blue = Flávio), also written in the table and the ranking. Click a state to see its municipalities.')}</Note>
    </>
  );
}
