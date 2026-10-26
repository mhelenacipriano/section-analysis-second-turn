import { useEffect, useMemo, useState } from 'react';
import MapView from '../components/MapView.jsx';
import { Filters } from '../components/Filters.jsx';
import { Legend, Note, StackBar, Stat } from '../components/ui.jsx';
import { loadGeo } from '../data.js';
import { useLang } from '../i18n.jsx';
import { fmtHM, fmtN, fmtPct } from '../format.js';
import { byUnit, groups } from '../stats.js';

const metrics = (L) => ({
  atT: { label: L('Seções encerradas no limiar ou depois (nº)', 'Sections closed at the threshold or later (no.)'), short: L('Seções encerradas (nº)', 'Sections closed (no.)'), hue: 'accent', get: (u) => u.atT, fmt: fmtN },
  atTpct: { label: L('Seções encerradas no limiar ou depois (% das seções)', 'Sections closed at the threshold or later (% of sections)'), short: L('Seções encerradas (% das seções)', 'Sections closed (% of sections)'), hue: 'accent', get: (u) => (u.n ? u.atT / u.n : null), fmt: (v) => fmtPct(v, 2) },
  late: { label: L('Seções encerradas depois das 17h30 (nº)', 'Sections closed after 17:30 (no.)'), short: L('Seções encerradas depois das 17h30 (nº)', 'Sections closed after 17:30 (no.)'), hue: 'accent', get: (u) => u.late, fmt: fmtN, plain: true },
  lula: { label: L('Lula, % dos votos válidos no 1º turno', 'Lula, % of valid votes in the 1st round'), short: L('Lula, % dos votos válidos', 'Lula, % of valid votes'), hue: 'accent', get: (u) => { const t = u.vl + u.vf + u.vo; return t ? u.vl / t : null; }, fmt: (v) => fmtPct(v), fixedMax: 1, round1: true },
  flavio: { label: L('Flávio Bolsonaro, % dos votos válidos no 1º turno', 'Flávio Bolsonaro, % of valid votes in the 1st round'), short: L('Flávio Bolsonaro, % dos votos válidos', 'Flávio Bolsonaro, % of valid votes'), hue: 'flavio', get: (u) => { const t = u.vl + u.vf + u.vo; return t ? u.vf / t : null; }, fmt: (v) => fmtPct(v), fixedMax: 1, round1: true },
});

export default function Mapa({ data, f, setF, themeKey }) {
  const { L, lang } = useLang();
  const METRICS = metrics(L);
  const [metric, setMetric] = useState('atT');
  const file = f.uf ? `mun_${f.uf}.json` : 'uf.json';
  const [loaded, setLoaded] = useState(null);          // { file, data }
  const [err, setErr] = useState(null);
  const level = f.uf ? 'mun' : 'uf';
  const M = METRICS[metric];
  // only ever draw geometry that belongs to the current level: a stale one (the previous
  // state's municipalities) must never reach the map while the new file is loading
  const geo = loaded && loaded.file === file ? loaded.data : null;

  useEffect(() => {
    let alive = true;
    setErr(null);
    loadGeo(file).then((data) => alive && setLoaded({ file, data })).catch((e) => alive && setErr(e));
    return () => { alive = false; };
  }, [file]);

  const units = useMemo(() => byUnit(data, f.lim, level), [data, f.lim, level]);
  const valueOf = (feat) => {
    const key = level === 'uf' ? feat.properties.uf : `${f.uf}:${data.codeByIbge.get(feat.properties.id) ?? ''}`;
    const u = units.get(key);
    return u && u.n ? M.get(u) : null;
  };
  const max = useMemo(() => {
    if (M.fixedMax) return M.fixedMax;
    let m = 0;
    for (const u of units.values()) if (level === 'uf' || u.uf === f.uf) m = Math.max(m, M.get(u) || 0);
    return m || 1;
  }, [units, M, level, f.uf]);

  const keyOf = (feat) => (level === 'uf' ? feat.properties.uf : feat.properties.id);
  const labelOf = (feat) => {
    const v = valueOf(feat);
    const name = level === 'uf' ? feat.properties.uf : feat.properties.name;
    return `${name}: ${v == null ? L('sem dados', 'no data') : M.fmt(v)}`;
  };
  const onPick = (key) => {
    if (level === 'uf') { if (units.get(key)?.n) setF({ uf: key, mun: '' }); }
    else { const cod = data.codeByIbge.get(key); if (cod) setF({ mun: cod }); }
  };
  const selected = f.mun ? data.mun.find((m) => m.uf === f.uf && m.cod === f.mun)?.ibge : f.uf || null;

  const g = useMemo(() => groups(data, f), [data, f]);
  const T = fmtHM(f.lim);
  const ranking = useMemo(() => [...units.values()].filter((u) => u.n && (level === 'uf' || u.uf === f.uf))
    .map((u) => ({ u, v: M.get(u) })).filter((x) => x.v != null).sort((a, b) => b.v - a.v).slice(0, 10), [units, M, level, f.uf]);
  const noPolygon = f.uf ? data.mun.filter((m) => m.uf === f.uf && !m.ibge).length : 0;

  return (
    <div className="stack">
      <h1 className="page-title">{L('Mapa', 'Map')}</h1>
      <p className="sub">{f.uf ? L(`Municípios de ${f.uf}. Clique num município para filtrar.`, `Municipalities of ${f.uf}. Click a municipality to filter.`) : L('Clique num estado para ver os municípios.', 'Click a state to see its municipalities.')}</p>
      <Filters data={data} f={f} setF={setF} />
      <div className="seg-ctl" role="group" aria-label={L('O que colorir no mapa', 'What to colour the map by')}>
        {Object.entries(METRICS).map(([k, m]) => (
          <button key={k} type="button" className={metric === k ? 'on' : ''} onClick={() => setMetric(k)}><small>{m.round1 ? L('1º turno', '1st round') : m.plain ? L('Depois das 17h30', 'After 17:30') : L(`Encerrada às ${T}+`, `Closed at ${T}+`)}</small>{m.short}</button>
        ))}
      </div>
      <div className="mapa-grid">
        <div className="mapa-caixa">
          {err && <p className="empty">{L('Não foi possível carregar o mapa', 'Could not load the map')} ({String(err.message || err)}).</p>}
          {!geo && !err && <p className="empty">{L('Carregando mapa…', 'Loading map…')}</p>}
          {geo && <MapView geo={geo} keyOf={keyOf} labelOf={labelOf} valueOf={valueOf} max={max} hue={M.hue} selected={selected}
            onPick={onPick} themeKey={themeKey} version={`${level}|${f.uf}|${metric}|${f.lim}|${lang}`} />}
          <div className="escala" aria-hidden="true"><span>{M.fmt(0)}</span><i className={`grad ${M.hue}`} /><span>{M.fmt(max)}</span></div>
          {f.uf && <button type="button" className="btn" onClick={() => setF({ uf: '', mun: '' })}>← {L('Brasil', 'Brazil')}</button>}
          {noPolygon > 0 && <Note>{L(`${noPolygon} município(s) de ${f.uf} criado(s) recentemente não têm contorno no mapa; aparecem nas tabelas.`, `${noPolygon} recently created municipality(ies) of ${f.uf} have no outline on the map; they appear in the tables.`)}</Note>}
        </div>
        <aside className="mapa-lado">
          <h2>{f.mun ? data.mun.find((m) => m.uf === f.uf && m.cod === f.mun)?.nome : f.uf || L('Brasil', 'Brazil')}</h2>
          <Stat k={L(`Encerradas às ${T} ou depois`, `Closed at ${T} or later`)} v={fmtN(g.atT.n)} sub={L(`de ${fmtN(g.total.n)} seções`, `of ${fmtN(g.total.n)} sections`)} />
          <Legend />
          <p className="note">{L(`Quem venceu nas seções encerradas às ${T}+:`, `Who won the sections closed at ${T}+:`)}</p>
          <StackBar l={g.atT.wl} f={g.atT.wf} o={g.atT.wo} compact />
          <p className="note">{L('Todas as outras seções:', 'All the other sections:')}</p>
          <StackBar l={g.rest.wl} f={g.rest.wf} o={g.rest.wo} compact />
          <h3>{L('Maiores valores', 'Highest values')}</h3>
          <ol className="rank">
            {ranking.map(({ u, v }) => (
              <li key={u.key}><button type="button" className="linklike" onClick={() => (level === 'uf' ? setF({ uf: u.uf, mun: '' }) : setF({ mun: u.mun.cod }))}>{level === 'uf' ? u.uf : u.mun.nome}</button><span>{M.fmt(v)}</span></li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
