import { useEffect, useMemo, useState } from 'react';
import MapView, { ramp } from '../components/MapView.jsx';
import { Filters } from '../components/Filters.jsx';
import { Note, StackBar, Stat } from '../components/ui.jsx';
import { loadGeo } from '../data.js';
import { useLang } from '../i18n.jsx';
import { fmtHM, fmtN, fmtPct } from '../format.js';
import { byUnit, groups, leader } from '../stats.js';

// View 1 colours by the share of each place's sections that closed at/after the chosen time, whoever won.
// Five quantile classes (about the same number of places in each) so RJ/SP do not wash out everyone else;
// zero stays neutral and even the lightest class is clearly tinted.
const CLASSES = 5;
const T_MIN = 0.28;
function classify(values) {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return { breaks: [], n: 0, max: 0 };
  const raw = [];
  for (let j = 1; j < CLASSES; j++) raw.push(v[Math.min(v.length - 1, Math.floor((j * v.length) / CLASSES))]);
  const breaks = [...new Set(raw)].filter((b) => b < v[v.length - 1]);
  return { breaks, n: breaks.length + 1, max: v[v.length - 1] };
}
const classOf = (sc, x) => sc.breaks.filter((b) => x > b).length;
const tOf = (sc, i) => (sc.n <= 1 ? 1 : T_MIN + (1 - T_MIN) * (i / (sc.n - 1)));
const pctText = (x) => fmtPct(x, x < 0.001 ? 3 : 2);   // tiny shares need a third decimal to tell the classes apart

const winnerName = (k, L) => ({ lula: 'Lula', flavio: 'Flávio Bolsonaro', outros: L('Empate', 'Tie') }[k]);
const MIN_SECTIONS = 30;   // municipality ranking: ignore places too small for a percentage to mean anything

/**
 * Two views of the places that have sections closed at/after the chosen time:
 *   1 (default)  shades = share of the place's sections that closed then, whoever won
 *   2            red = Lula, blue = Flávio, by 1st-round votes: the sections of that time put together
 *                (their votes added up) or the whole state / municipality
 */
export default function Mapa({ data, f, setF, query, go, themeKey }) {
  const { L, lang } = useLang();
  const vista = query.vista === 'vencedor' ? 'vencedor' : 'pct';
  const quem = query.quem === 'estado' ? 'estado' : 'secoes';
  const file = f.uf ? `mun_${f.uf}.json` : 'uf.json';
  const [loaded, setLoaded] = useState(null);          // { file, data }
  const [err, setErr] = useState(null);
  const level = f.uf ? 'mun' : 'uf';
  const T = fmtHM(f.lim);
  const W = (k) => winnerName(k, L);
  // only ever draw geometry that belongs to the current level: a stale one (the previous
  // state's municipalities) must never reach the map while the new file is loading
  const geo = loaded && loaded.file === file ? loaded.data : null;

  useEffect(() => {
    let alive = true;
    setErr(null);
    loadGeo(file).then((d) => alive && setLoaded({ file, data: d })).catch((e) => alive && setErr(e));
    return () => { alive = false; };
  }, [file]);

  const units = useMemo(() => byUnit(data, f.lim, level, !!f.alt), [data, f.lim, level, f.alt]);
  const unitOf = (feat) => units.get(level === 'uf' ? feat.properties.uf : `${f.uf}:${data.codeByIbge.get(feat.properties.id) ?? ''}`);

  // who won there: the sections closed at/after T put together (their votes added up), or the whole place
  const stat = (u) => {
    if (!u || !u.atT) return null;
    const [vl, vf, vo] = quem === 'secoes' ? [u.atVl, u.atVf, u.atVo] : [u.vl, u.vf, u.vo];
    const valid = vl + vf + vo;
    return { winner: leader(vl, vf), vl, vf, l: valid ? vl / valid : 0, fl: valid ? vf / valid : 0 };
  };
  const valueOf = (feat) => { const u = unitOf(feat); return u && u.n ? u.atT / u.n : null; };
  const scale = useMemo(() => {
    const vals = [];
    for (const u of units.values()) if (u.n && (level === 'uf' || u.uf === f.uf)) vals.push(u.atT / u.n);
    return { ...classify(vals), hasZero: vals.some((x) => x <= 0) };
  }, [units, level, f.uf]);
  const colorOf = (feat, c) => {
    if (vista === 'pct') {
      const v = valueOf(feat);
      if (v == null) return c.none;
      if (v <= 0 || !scale.n) return c.lo;
      return ramp(tOf(scale, classOf(scale, v)), c.lo, c.hi);
    }
    const s = stat(unitOf(feat));
    return s ? c[s.winner] : c.none;
  };
  const classLabels = scale.n ? Array.from({ length: scale.n }, (_, i) => {
    const lo = i === 0 ? null : scale.breaks[i - 1], hi = i === scale.n - 1 ? null : scale.breaks[i];
    return { t: tOf(scale, i), text: lo == null ? `≤ ${pctText(hi ?? scale.max)}` : hi == null ? `> ${pctText(lo)}` : `${pctText(lo)} – ${pctText(hi)}` };
  }) : [];
  const labelOf = (feat) => {
    const u = unitOf(feat);
    const name = level === 'uf' ? feat.properties.uf : feat.properties.name;
    const s = stat(u);
    if (!u || !u.n) return `${name}: ${L('sem dados', 'no data')}`;
    if (vista === 'pct') return `${name}: ${fmtPct(u.atT / u.n, 2)} · ${fmtN(u.atT)} ${L('de', 'of')} ${fmtN(u.n)} ${L('seções encerradas às', 'sections closed at')} ${T}${L(' ou depois', ' or later')}`;
    if (!s) return `${name}: ${L(`nenhuma seção encerrada às ${T} ou depois`, `no section closed at ${T} or later`)}`;
    return `${name}: ${fmtN(u.atT)} ${L('de', 'of')} ${fmtN(u.n)} ${L('seções', 'sections')} (${fmtPct(u.atT / u.n, 2)}) · ${L('votos no 1º turno', '1st-round votes')}: Lula ${fmtN(s.vl)} (${fmtPct(s.l)}) × Flávio ${fmtN(s.vf)} (${fmtPct(s.fl)}) → ${W(s.winner)}`;
  };
  const tagOf = level === 'uf'
    ? (feat) => { const u = unitOf(feat); return u && u.n && (u.atT || vista === 'pct') ? { a: feat.properties.uf, b: fmtPct(u.atT / u.n, 1) } : null; }
    : undefined;
  const keyOf = (feat) => (level === 'uf' ? feat.properties.uf : feat.properties.id);
  const onPick = (key) => {
    if (level === 'uf') { if (units.get(key)?.n) setF({ uf: key, mun: '' }); }
    else { const cod = data.codeByIbge.get(key); if (cod) setF({ mun: cod }); }
  };
  const selected = f.mun ? data.mun.find((m) => m.uf === f.uf && m.cod === f.mun)?.ibge : f.uf || null;

  const g = useMemo(() => groups(data, f), [data, f]);
  const ranking = useMemo(() => [...units.values()].filter((u) => u.atT && (level === 'uf' || (u.uf === f.uf && (f.alt || u.n >= MIN_SECTIONS))))
    .map((u) => ({ u, p: u.atT / u.n, s: stat(u) })).sort((a, b) => b.p - a.p).slice(0, 10), [units, level, f.uf, f.alt, quem]); // eslint-disable-line react-hooks/exhaustive-deps
  const withSections = useMemo(() => [...units.values()].filter((u) => u.atT && (level === 'uf' || u.uf === f.uf)), [units, level, f.uf]);
  const redN = withSections.filter((u) => stat(u)?.winner === 'lula').length;
  const blueN = withSections.filter((u) => stat(u)?.winner === 'flavio').length;
  const noPolygon = f.uf ? data.mun.filter((m) => m.uf === f.uf && !m.ibge).length : 0;
  const unitWord = level === 'uf' ? L('estados', 'states') : L('municípios', 'municipalities');

  return (
    <div className="stack">
      <h1 className="page-title">{L('Mapa', 'Map')}</h1>
      <p className="sub">
        {vista === 'pct'
          ? L(`Quanto mais escuro, maior a % das seções do lugar que fecharam às ${T} ou depois.`, `The darker, the larger the share of the place’s sections that closed at ${T} or later.`)
          : L('Vermelho: Lula teve mais votos no 1º turno. Azul: Flávio.', 'Red: Lula had more 1st-round votes. Blue: Flávio.')}
      </p>
      <Filters data={data} f={f} setF={setF} />

      <div className="subnav" role="group" aria-label={L('Vista do mapa', 'Map view')}>
        {[['pct', L(`1. Onde mais seções fecharam às ${T}+ (%)`, `1. Where the most sections closed at ${T}+ (%)`)], ['vencedor', L('2. Quem venceu no 1º turno (vermelho/azul)', '2. Who won the 1st round (red/blue)')]].map(([k, label]) => (
          <button key={k} type="button" aria-current={vista === k ? 'page' : undefined} onClick={() => go(undefined, { ...query, vista: k === 'pct' ? '' : k })}>{label}</button>
        ))}
      </div>

      {vista === 'vencedor' && (
        <>
          <div className="subnav" role="group" aria-label={L('Quem venceu', 'Who won')}>
            {[['secoes', L(`Quem venceu nas seções encerradas às ${T}+ (somadas)`, `Who won the sections closed at ${T}+ (added together)`)], ['estado', f.uf ? L('Quem venceu no município inteiro', 'Who won the whole municipality') : L('Quem venceu no estado inteiro', 'Who won the whole state')]].map(([k, label]) => (
              <button key={k} type="button" aria-current={quem === k ? 'page' : undefined} onClick={() => go(undefined, { ...query, quem: k })}>{label}</button>
            ))}
          </div>
          <div className="legend" aria-label={L('Legenda do mapa', 'Map legend')}>
            <span><i className="sw lula" />{L('Lula teve mais votos no 1º turno', 'Lula had more 1st-round votes')}</span>
            <span><i className="sw flavio" />{L('Flávio teve mais votos no 1º turno', 'Flávio had more 1st-round votes')}</span>
            <span><i className="sw neu" />{L(`nenhuma seção encerrada às ${T}+`, `no section closed at ${T}+`)}</span>
          </div>
        </>
      )}

      <div className="mapa-grid">
        <div className="mapa-caixa">
          {err && <p className="empty">{L('Não foi possível carregar o mapa', 'Could not load the map')} ({String(err.message || err)}).</p>}
          {!geo && !err && <p className="empty">{L('Carregando mapa…', 'Loading map…')}</p>}
          {geo && <MapView geo={geo} keyOf={keyOf} labelOf={labelOf} valueOf={valueOf} colorOf={colorOf} tagOf={tagOf} max={1} selected={selected} focus={f.mun ? selected : null}
            onPick={onPick} themeKey={themeKey} plain={level === 'uf'} hue="fecha" version={`${vista}|${level}|${f.uf}|${quem}|${f.lim}|${f.alt}|${lang}`} />}
          {level === 'uf' && <p className="hint">{L('Clique num estado para ver os municípios.', 'Click a state to see its municipalities.')}</p>}
          {vista === 'pct' && (
            <div className="escala" role="img" aria-label={L('Legenda das cores, de menos a mais seções', 'Colour legend, from fewer to more sections')}>
              <span>{L('menos', 'less')}</span>
              {classLabels.map((c, i) => <i key={i} title={c.text} style={{ background: `color-mix(in srgb, var(--fecha) ${Math.round(c.t * 100)}%, var(--panel2))` }} />)}
              <span>{L('mais seções', 'more sections')}</span>
            </div>
          )}
          {f.uf && <button type="button" className="btn" onClick={() => setF({ uf: '', mun: '' })}>← {L('Brasil', 'Brazil')}</button>}
          {noPolygon > 0 && <Note>{L(`${noPolygon} município(s) de ${f.uf} criado(s) recentemente não têm contorno no mapa; aparecem nas tabelas.`, `${noPolygon} recently created municipality(ies) of ${f.uf} have no outline on the map; they appear in the tables.`)}</Note>}
        </div>
        <aside className="mapa-lado">
          <h2>{f.mun ? data.mun.find((m) => m.uf === f.uf && m.cod === f.mun)?.nome : f.uf || L('Brasil', 'Brazil')}</h2>
          <Stat k={L(`Encerradas às ${T} ou depois`, `Closed at ${T} or later`)} v={fmtN(g.atT.n)} sub={L(`de ${fmtN(g.total.n)} seções`, `of ${fmtN(g.total.n)} sections`)} />
          {vista === 'vencedor' && (
            <>
              <Stat k={L(`${unitWord[0].toUpperCase()}${unitWord.slice(1)} com seções às ${T}+`, `${unitWord[0].toUpperCase()}${unitWord.slice(1)} with sections at ${T}+`)} v={`${fmtN(withSections.length)}`} sub={L(`vermelho (Lula): ${fmtN(redN)} · azul (Flávio): ${fmtN(blueN)}`, `red (Lula): ${fmtN(redN)} · blue (Flávio): ${fmtN(blueN)}`)} />
              <p className="note">{L(`Votos no 1º turno nas seções encerradas às ${T}+:`, `1st-round votes in the sections closed at ${T}+:`)}</p>
              <StackBar l={g.atT.vl} f={g.atT.vf} o={g.atT.vo} compact votes />
              <p className="note">{L('Votos no 1º turno em todas as outras seções:', '1st-round votes in all the other sections:')}</p>
              <StackBar l={g.rest.vl} f={g.rest.vf} o={g.rest.vo} compact votes />
            </>
          )}
          <h3>{L(`Maior % de seções encerradas às ${T}+`, `Highest % of sections closed at ${T}+`)}</h3>
          <ol className="rank">
            {ranking.map(({ u, p, s }) => (
              <li key={u.key}>
                <button type="button" className="linklike" onClick={() => (level === 'uf' ? setF({ uf: u.uf, mun: '' }) : setF({ mun: u.mun.cod }))}>{level === 'uf' ? u.uf : u.mun.nome}</button>
                <span>{fmtPct(p, 2)}<small>{fmtN(u.atT)} {L('de', 'of')} {fmtN(u.n)} {L('seções', 'sections')}</small>{vista === 'vencedor' && <small className={`quem ${s.winner}`}>{W(s.winner)}</small>}</span>
              </li>
            ))}
          </ol>
          {level === 'mun' && <p className="note">{L(`Só municípios com pelo menos ${MIN_SECTIONS} seções.`, `Only municipalities with at least ${MIN_SECTIONS} sections.`)}</p>}
        </aside>
      </div>
    </div>
  );
}
