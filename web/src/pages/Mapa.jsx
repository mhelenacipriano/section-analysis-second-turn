import { useEffect, useMemo, useState } from 'react';
import MapView from '../components/MapView.jsx';
import { winnerName } from '../components/OnTimeMap.jsx';
import { Filters } from '../components/Filters.jsx';
import { Note, StackBar, Stat } from '../components/ui.jsx';
import { loadGeo } from '../data.js';
import { useLang } from '../i18n.jsx';
import { fmtHM, fmtN, fmtPct } from '../format.js';
import { byUnit, groups, leader } from '../stats.js';

const MIN_SECTIONS = 30;   // municipality ranking: ignore places too small for a percentage to mean anything

/**
 * Map of the places that have sections closed at/after the chosen time, coloured by who won in the
 * 1st round: red = Lula, blue = Flávio. "Who won" is either the sections of that time put together
 * (their votes added up) or the whole state / municipality.
 */
export default function Mapa({ data, f, setF, query, go, themeKey }) {
  const { L, lang } = useLang();
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

  const units = useMemo(() => byUnit(data, f.lim, level), [data, f.lim, level]);
  const unitOf = (feat) => units.get(level === 'uf' ? feat.properties.uf : `${f.uf}:${data.codeByIbge.get(feat.properties.id) ?? ''}`);

  // who won there: the sections closed at/after T put together (their votes added up), or the whole place
  const stat = (u) => {
    if (!u || !u.atT) return null;
    const [vl, vf, vo] = quem === 'secoes' ? [u.atVl, u.atVf, u.atVo] : [u.vl, u.vf, u.vo];
    const valid = vl + vf + vo;
    return { winner: leader(vl, vf, vo), l: valid ? vl / valid : 0, fl: valid ? vf / valid : 0 };
  };
  const colorOf = (feat, c) => {
    const s = stat(unitOf(feat));
    return s ? c[s.winner] : c.none;
  };
  const valueOf = (feat) => { const u = unitOf(feat); return u && u.atT ? u.atT / u.n : null; };
  const labelOf = (feat) => {
    const u = unitOf(feat);
    const name = level === 'uf' ? feat.properties.uf : feat.properties.name;
    const s = stat(u);
    if (!u || !u.n) return `${name}: ${L('sem dados', 'no data')}`;
    if (!s) return `${name}: ${L(`nenhuma seção encerrada às ${T} ou depois`, `no section closed at ${T} or later`)}`;
    return `${name}: ${fmtN(u.atT)} ${L('de', 'of')} ${fmtN(u.n)} ${L('seções', 'sections')} (${fmtPct(u.atT / u.n, 2)}) · ${L('venceu', 'won by')} ${W(s.winner)} (Lula ${fmtPct(s.l)} · Flávio ${fmtPct(s.fl)})`;
  };
  const tagOf = level === 'uf'
    ? (feat) => { const u = unitOf(feat); return u && u.atT ? `<span><b>${feat.properties.uf}</b><br>${fmtPct(u.atT / u.n, 1)}</span>` : ''; }
    : undefined;
  const keyOf = (feat) => (level === 'uf' ? feat.properties.uf : feat.properties.id);
  const onPick = (key) => {
    if (level === 'uf') { if (units.get(key)?.n) setF({ uf: key, mun: '' }); }
    else { const cod = data.codeByIbge.get(key); if (cod) setF({ mun: cod }); }
  };
  const selected = f.mun ? data.mun.find((m) => m.uf === f.uf && m.cod === f.mun)?.ibge : f.uf || null;

  const g = useMemo(() => groups(data, f), [data, f]);
  const ranking = useMemo(() => [...units.values()].filter((u) => u.atT && (level === 'uf' || (u.uf === f.uf && u.n >= MIN_SECTIONS)))
    .map((u) => ({ u, p: u.atT / u.n, s: stat(u) })).sort((a, b) => b.p - a.p).slice(0, 10), [units, level, f.uf, quem]); // eslint-disable-line react-hooks/exhaustive-deps
  const withSections = useMemo(() => [...units.values()].filter((u) => u.atT && (level === 'uf' || u.uf === f.uf)), [units, level, f.uf]);
  const redN = withSections.filter((u) => stat(u)?.winner === 'lula').length;
  const blueN = withSections.filter((u) => stat(u)?.winner === 'flavio').length;
  const noPolygon = f.uf ? data.mun.filter((m) => m.uf === f.uf && !m.ibge).length : 0;
  const unitWord = level === 'uf' ? L('estados', 'states') : L('municípios', 'municipalities');

  return (
    <div className="stack">
      <h1 className="page-title">{L('Mapa', 'Map')}</h1>
      <p className="sub">
        {L(
          `Todos os ${unitWord} com seções encerradas às ${T} ou depois, coloridos por quem venceu no 1º turno: vermelho = Lula, azul = Flávio Bolsonaro.`,
          `All ${unitWord} with sections closed at ${T} or later, coloured by who won the 1st round: red = Lula, blue = Flávio Bolsonaro.`,
        )}
        {' '}{f.uf ? L('Clique num município para filtrar.', 'Click a municipality to filter.') : L('Clique num estado para ver os municípios.', 'Click a state to see its municipalities.')}
      </p>
      <Filters data={data} f={f} setF={setF} />

      <div className="subnav" role="group" aria-label={L('Quem venceu', 'Who won')}>
        {[['secoes', L(`Quem venceu nas seções encerradas às ${T}+ (somadas)`, `Who won the sections closed at ${T}+ (added together)`)], ['estado', f.uf ? L('Quem venceu no município inteiro', 'Who won the whole municipality') : L('Quem venceu no estado inteiro', 'Who won the whole state')]].map(([k, label]) => (
          <button key={k} type="button" aria-current={quem === k ? 'page' : undefined} onClick={() => go(undefined, { ...query, quem: k })}>{label}</button>
        ))}
      </div>

      <div className="legend" aria-label={L('Legenda do mapa', 'Map legend')}>
        <span><i className="sw lula" />{L('Lula venceu', 'Lula won')}</span>
        <span><i className="sw flavio" />{L('Flávio Bolsonaro venceu', 'Flávio Bolsonaro won')}</span>
        <span><i className="sw neu" />{L(`nenhuma seção encerrada às ${T}+`, `no section closed at ${T}+`)}</span>
      </div>

      <div className="mapa-grid">
        <div className="mapa-caixa">
          {err && <p className="empty">{L('Não foi possível carregar o mapa', 'Could not load the map')} ({String(err.message || err)}).</p>}
          {!geo && !err && <p className="empty">{L('Carregando mapa…', 'Loading map…')}</p>}
          {geo && <MapView geo={geo} keyOf={keyOf} labelOf={labelOf} valueOf={valueOf} colorOf={colorOf} tagOf={tagOf} max={1} selected={selected}
            onPick={onPick} themeKey={themeKey} version={`${level}|${f.uf}|${quem}|${f.lim}|${lang}`} />}
          {level === 'uf' && <Note>{L('O número em cada estado é a porcentagem das suas seções que fecharam às ' + T + ' ou depois.', `The number on each state is the share of its sections that closed at ${T} or later.`)}</Note>}
          {f.uf && <button type="button" className="btn" onClick={() => setF({ uf: '', mun: '' })}>← {L('Brasil', 'Brazil')}</button>}
          {noPolygon > 0 && <Note>{L(`${noPolygon} município(s) de ${f.uf} criado(s) recentemente não têm contorno no mapa; aparecem nas tabelas.`, `${noPolygon} recently created municipality(ies) of ${f.uf} have no outline on the map; they appear in the tables.`)}</Note>}
        </div>
        <aside className="mapa-lado">
          <h2>{f.mun ? data.mun.find((m) => m.uf === f.uf && m.cod === f.mun)?.nome : f.uf || L('Brasil', 'Brazil')}</h2>
          <Stat k={L(`Encerradas às ${T} ou depois`, `Closed at ${T} or later`)} v={fmtN(g.atT.n)} sub={L(`de ${fmtN(g.total.n)} seções`, `of ${fmtN(g.total.n)} sections`)} />
          <Stat k={L(`${unitWord[0].toUpperCase()}${unitWord.slice(1)} com seções às ${T}+`, `${unitWord[0].toUpperCase()}${unitWord.slice(1)} with sections at ${T}+`)} v={`${fmtN(withSections.length)}`} sub={L(`vermelho (Lula): ${fmtN(redN)} · azul (Flávio): ${fmtN(blueN)}`, `red (Lula): ${fmtN(redN)} · blue (Flávio): ${fmtN(blueN)}`)} />
          <p className="note">{L(`Quem venceu nas seções encerradas às ${T}+ (contagem de seções):`, `Who won the sections closed at ${T}+ (count of sections):`)}</p>
          <StackBar l={g.atT.wl} f={g.atT.wf} o={g.atT.wo} compact />
          <p className="note">{L('Todas as outras seções:', 'All the other sections:')}</p>
          <StackBar l={g.rest.wl} f={g.rest.wf} o={g.rest.wo} compact />
          <h3>{L(`Maior % de seções encerradas às ${T}+`, `Highest % of sections closed at ${T}+`)}</h3>
          <ol className="rank">
            {ranking.map(({ u, p, s }) => (
              <li key={u.key}>
                <button type="button" className="linklike" onClick={() => (level === 'uf' ? setF({ uf: u.uf, mun: '' }) : setF({ mun: u.mun.cod }))}>{level === 'uf' ? u.uf : u.mun.nome}</button>
                <span>{fmtPct(p, 2)}<small>{fmtN(u.atT)} {L('de', 'of')} {fmtN(u.n)} {L('seções', 'sections')}</small><small className={`quem ${s.winner}`}>{W(s.winner)}</small></span>
              </li>
            ))}
          </ol>
          {level === 'mun' && <p className="note">{L(`Só municípios com pelo menos ${MIN_SECTIONS} seções.`, `Only municipalities with at least ${MIN_SECTIONS} sections.`)}</p>}
        </aside>
      </div>
    </div>
  );
}
