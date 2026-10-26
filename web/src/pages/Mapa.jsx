import { useEffect, useMemo, useState } from 'react';
import MapView from '../components/MapView.jsx';
import { Filters } from '../components/Filters.jsx';
import { Legend, Note, StackBar, Stat } from '../components/ui.jsx';
import { loadGeo } from '../data.js';
import { fmtHM, fmtN, fmtPct } from '../format.js';
import { byUnit, groups } from '../stats.js';

const METRICS = {
  atT: { label: 'Seções encerradas no limiar ou depois (nº)', hue: 'accent', get: (u) => u.atT, fmt: fmtN },
  atTpct: { label: 'Seções encerradas no limiar ou depois (% das seções)', hue: 'accent', get: (u) => (u.n ? u.atT / u.n : null), fmt: (v) => fmtPct(v, 2) },
  late: { label: 'Seções encerradas depois das 17h30 (nº)', hue: 'accent', get: (u) => u.late, fmt: fmtN },
  lula: { label: 'Lula, % dos votos válidos no 1º turno', hue: 'accent', get: (u) => { const t = u.vl + u.vf + u.vo; return t ? u.vl / t : null; }, fmt: (v) => fmtPct(v), fixedMax: 1 },
  flavio: { label: 'Flávio Bolsonaro, % dos votos válidos no 1º turno', hue: 'flavio', get: (u) => { const t = u.vl + u.vf + u.vo; return t ? u.vf / t : null; }, fmt: (v) => fmtPct(v), fixedMax: 1 },
};

export default function Mapa({ data, f, setF, themeKey }) {
  const [metric, setMetric] = useState('atT');
  const [geo, setGeo] = useState(null);
  const [err, setErr] = useState(null);
  const level = f.uf ? 'mun' : 'uf';
  const M = METRICS[metric];

  useEffect(() => {
    let alive = true;
    setGeo(null); setErr(null);
    loadGeo(f.uf ? `mun_${f.uf}.json` : 'uf.json').then((g) => alive && setGeo(g)).catch((e) => alive && setErr(e));
    return () => { alive = false; };
  }, [f.uf]);

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
    return `${name}: ${v == null ? 'sem dados' : M.fmt(v)}`;
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
      <h1 className="page-title">Mapa</h1>
      <p className="sub">{f.uf ? `Municípios de ${f.uf}. Clique num município para filtrar.` : 'Clique num estado para ver os municípios.'}</p>
      <Filters data={data} f={f} setF={setF} />
      <div className="seg-ctl" role="group" aria-label="O que colorir no mapa">
        {Object.entries(METRICS).map(([k, m]) => (
          <button key={k} type="button" className={metric === k ? 'on' : ''} onClick={() => setMetric(k)}><small>{k === 'lula' || k === 'flavio' ? '1º turno' : `Encerrada às ${T}+`}</small>{m.label.replace(' no limiar ou depois', '')}</button>
        ))}
      </div>
      <div className="mapa-grid">
        <div className="mapa-caixa">
          {err && <p className="empty">Não foi possível carregar o mapa ({String(err.message || err)}).</p>}
          {!geo && !err && <p className="empty">Carregando mapa…</p>}
          {geo && <MapView geo={geo} keyOf={keyOf} labelOf={labelOf} valueOf={valueOf} max={max} hue={M.hue} selected={selected}
            onPick={onPick} themeKey={themeKey} version={`${level}|${f.uf}|${metric}|${f.lim}`} />}
          <div className="escala" aria-hidden="true"><span>{M.fmt(0)}</span><i className={`grad ${M.hue}`} /><span>{M.fmt(max)}</span></div>
          {f.uf && <button type="button" className="btn" onClick={() => setF({ uf: '', mun: '' })}>← Brasil</button>}
          {noPolygon > 0 && <Note>{noPolygon} município(s) de {f.uf} criado(s) recentemente não têm contorno no mapa; aparecem nas tabelas.</Note>}
        </div>
        <aside className="mapa-lado">
          <h2>{f.mun ? data.mun.find((m) => m.uf === f.uf && m.cod === f.mun)?.nome : f.uf || 'Brasil'}</h2>
          <Stat k={`Encerradas às ${T} ou depois`} v={fmtN(g.atT.n)} sub={`de ${fmtN(g.total.n)} seções`} />
          <Legend />
          <p className="note">Quem venceu nas seções encerradas às {T}+:</p>
          <StackBar l={g.atT.wl} f={g.atT.wf} o={g.atT.wo} compact />
          <p className="note">Todas as outras seções:</p>
          <StackBar l={g.rest.wl} f={g.rest.wf} o={g.rest.wo} compact />
          <h3>Maiores valores</h3>
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
