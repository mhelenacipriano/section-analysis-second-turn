import { useEffect, useMemo, useState } from 'react';
import MapView, { ramp } from '../components/MapView.jsx';
import { Filters } from '../components/Filters.jsx';
import { Legend, Note, StackBar, Stat } from '../components/ui.jsx';
import { loadGeo } from '../data.js';
import { useLang } from '../i18n.jsx';
import { fmtHM, fmtN, fmtPct } from '../format.js';
import { byUnit, groups } from '../stats.js';

// Six shade classes by quantile (about the same number of places per class), so a few very large values
// (RJ, SP) do not wash out everyone else. Zero stays neutral; the lightest class is already clearly tinted.
const CLASSES = 6;
const T_MIN = 0.28;
function classify(values) {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return { breaks: [], n: 0 };
  const raw = [];
  for (let j = 1; j < CLASSES; j++) raw.push(v[Math.min(v.length - 1, Math.floor((j * v.length) / CLASSES))]);
  const breaks = [...new Set(raw)].filter((b) => b < v[v.length - 1]);
  return { breaks, n: breaks.length + 1, max: v[v.length - 1] };
}
const classOf = (sc, x) => sc.breaks.filter((b) => x > b).length;
const tOf = (sc, i) => (sc.n <= 1 ? 1 : T_MIN + (1 - T_MIN) * (i / (sc.n - 1)));

const MIN_SECTIONS = 30;   // municipality ranking: ignore places too small for a percentage to mean anything
const share = (u, k) => (u.n ? u[k] / u.n : null);
const vshare = (u, k) => { const t = u.vl + u.vf + u.vo; return t ? u[k] / t : null; };

// Counts are shown as a share of the unit's own sections (with the count next to it), so big states
// do not win just by being big.
const metrics = (L) => ({
  atT: { label: L('Seções encerradas no limiar ou depois (% das seções)', 'Sections closed at the threshold or later (% of sections)'), short: L('Seções encerradas (% das seções)', 'Sections closed (% of sections)'), hue: 'accent', get: (u) => share(u, 'atT'), fmt: (v) => fmtPct(v, 2), sub: (u) => `${fmtN(u.atT)} ${L('de', 'of')} ${fmtN(u.n)}` },
  late: { label: L('Seções encerradas depois das 17h30 (% das seções)', 'Sections closed after 17:30 (% of sections)'), short: L('Encerradas depois das 17h30 (% das seções)', 'Closed after 17:30 (% of sections)'), hue: 'accent', get: (u) => share(u, 'late'), fmt: (v) => fmtPct(v, 2), sub: (u) => `${fmtN(u.late)} ${L('de', 'of')} ${fmtN(u.n)}`, plain: true },
  lula: { label: L('Lula, % dos votos válidos no 1º turno', 'Lula, % of valid votes in the 1st round'), short: L('Lula, % dos votos válidos', 'Lula, % of valid votes'), hue: 'accent', get: (u) => vshare(u, 'vl'), fmt: (v) => fmtPct(v), fixedMax: 1, round1: true },
  flavio: { label: L('Flávio Bolsonaro, % dos votos válidos no 1º turno', 'Flávio Bolsonaro, % of valid votes in the 1st round'), short: L('Flávio Bolsonaro, % dos votos válidos', 'Flávio Bolsonaro, % of valid votes'), hue: 'flavio', get: (u) => vshare(u, 'vf'), fmt: (v) => fmtPct(v), fixedMax: 1, round1: true },
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
  const unitOf = (feat) => units.get(level === 'uf' ? feat.properties.uf : `${f.uf}:${data.codeByIbge.get(feat.properties.id) ?? ''}`);
  const valueOf = (feat) => {
    const u = unitOf(feat);
    return u && u.n ? M.get(u) : null;
  };
  const scale = useMemo(() => {
    const vals = [];
    for (const u of units.values()) if (u.n && (level === 'uf' || u.uf === f.uf)) { const x = M.get(u); if (x != null) vals.push(x); }
    return { ...classify(vals), hasZero: vals.some((x) => x <= 0) };
  }, [units, M, level, f.uf]);
  const colorOf = (feat, c) => {
    const v = valueOf(feat);
    if (v == null) return c.none;
    if (v <= 0 || !scale.n) return c.lo;
    return ramp(tOf(scale, classOf(scale, v)), c.lo, c.hi);
  };
  const fl = (x) => (x < 0.001 ? fmtPct(x, 3) : M.fmt(x));   // tiny shares need a third decimal to tell the classes apart
  const classLabels = scale.n ? Array.from({ length: scale.n }, (_, i) => {
    const lo = i === 0 ? null : scale.breaks[i - 1], hi = i === scale.n - 1 ? null : scale.breaks[i];
    return { t: tOf(scale, i), text: lo == null ? `≤ ${fl(hi ?? scale.max)}` : hi == null ? `> ${fl(lo)}` : `${fl(lo)} – ${fl(hi)}` };
  }) : [];

  const keyOf = (feat) => (level === 'uf' ? feat.properties.uf : feat.properties.id);
  const labelOf = (feat) => {
    const v = valueOf(feat);
    const name = level === 'uf' ? feat.properties.uf : feat.properties.name;
    const u = unitOf(feat);
    return `${name}: ${v == null ? L('sem dados', 'no data') : `${M.fmt(v)}${M.sub && u ? ` (${M.sub(u)} ${L('seções', 'sections')})` : ''}`}`;
  };
  const onPick = (key) => {
    if (level === 'uf') { if (units.get(key)?.n) setF({ uf: key, mun: '' }); }
    else { const cod = data.codeByIbge.get(key); if (cod) setF({ mun: cod }); }
  };
  const selected = f.mun ? data.mun.find((m) => m.uf === f.uf && m.cod === f.mun)?.ibge : f.uf || null;

  const g = useMemo(() => groups(data, f), [data, f]);
  const T = fmtHM(f.lim);
  const ranking = useMemo(() => [...units.values()].filter((u) => u.n && (level === 'uf' || (u.uf === f.uf && u.n >= MIN_SECTIONS)))
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
          {geo && <MapView geo={geo} keyOf={keyOf} labelOf={labelOf} valueOf={valueOf} colorOf={colorOf} max={1} hue={M.hue} selected={selected}
            onPick={onPick} themeKey={themeKey} version={`${level}|${f.uf}|${metric}|${f.lim}|${lang}`} />}
          <div className="classes" aria-label={L('Legenda das cores', 'Colour legend')}>
            {scale.hasZero && <span><i style={{ background: 'var(--panel2)' }} />0</span>}
            {classLabels.map((c, i) => <span key={i}><i style={{ background: `color-mix(in srgb, var(--${M.hue}) ${Math.round(c.t * 100)}%, var(--panel2))` }} />{c.text}</span>)}
          </div>
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
              <li key={u.key}><button type="button" className="linklike" onClick={() => (level === 'uf' ? setF({ uf: u.uf, mun: '' }) : setF({ mun: u.mun.cod }))}>{level === 'uf' ? u.uf : u.mun.nome}</button><span>{M.fmt(v)}{M.sub && <small>{M.sub(u)} {L('seções', 'sections')}</small>}</span></li>
            ))}
          </ol>
          {level === 'mun' && <p className="note">{L(`Só municípios com pelo menos ${MIN_SECTIONS} seções.`, `Only municipalities with at least ${MIN_SECTIONS} sections.`)}</p>}
        </aside>
      </div>
    </div>
  );
}
