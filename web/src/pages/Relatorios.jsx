import { useMemo, useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import { Filters } from '../components/Filters.jsx';
import MissingVotesReport from '../components/MissingVotesReport.jsx';
import Histogram from '../components/Histogram.jsx';
import { Legend, Note, StackBar, Stat } from '../components/ui.jsx';
import { useLang } from '../i18n.jsx';
import { downloadCsv, fmtDec, fmtHM, fmtN, fmtPct, fmtPP, toCsv } from '../format.js';
import { expectedVsObserved, groups, histogram, sweep, wilson } from '../stats.js';
import { scopeLabel } from './Overview.jsx';

const THRESHOLDS = [17 * 60 + 30, 17 * 60 + 45, 18 * 60, 18 * 60 + 15, 18 * 60 + 30, 18 * 60 + 45, 18 * 60 + 55, 19 * 60, 19 * 60 + 5, 19 * 60 + 10, 19 * 60 + 15, 19 * 60 + 30];

function Varredura({ g, f, setF }) {
  const { L } = useLang();
  const rows = useMemo(() => sweep(g.rows, THRESHOLDS), [g]);
  const scope = f.uf ? (f.mun ? `${f.uf} / ${L('município', 'municipality')}` : f.uf) : L('todos os estados com dados', 'all states with data');
  const csv = () => downloadCsv('varredura_limiar.csv', toCsv(rows, [
    { label: L('limiar (Brasília)', 'threshold (Brasília time)'), get: (r) => fmtHM(r.t) }, { label: L('seções', 'sections'), get: (r) => r.c.n },
    { label: L('Lula venceu', 'Lula won'), get: (r) => r.c.wl }, { label: L('Flávio venceu', 'Flávio won'), get: (r) => r.c.wf }, { label: L('outros', 'others'), get: (r) => r.c.wo }]));
  return (
    <>
      <p className="story-intro">
        {L(
          `Quanto mais tarde o limiar, menos seções restam — e menos confiável fica qualquer proporção. Cada linha mostra quem venceu, no 1º turno, as seções encerradas naquele horário ou depois (${scope}). Clique numa linha para usá-la como limiar.`,
          `The later the threshold, the fewer sections remain, and the less reliable any proportion becomes. Each row shows who won, in the 1st round, the sections closed at that time or later (${scope}). Click a row to use it as the threshold.`,
        )}
      </p>
      <Legend />
      <div className="varredura">
        {rows.map(({ t, c }) => {
          const [lo, hi] = wilson(c.wl, c.n);
          return (
            <button key={t} type="button" className={`vr ${f.lim === t ? 'on' : ''}`} onClick={() => setF({ lim: t })}>
              <span className="vr-t">≥ {fmtHM(t)}</span>
              <span className="vr-n">{fmtN(c.n)} {L('seções', 'sections')}</span>
              <span className="vr-b"><StackBar l={c.wl} f={c.wf} o={c.wo} compact /></span>
              <span className="vr-ci">{c.n ? `Lula ${fmtPct(c.wl / c.n, 0)} (${L('IC 95%', '95% CI')}: ${fmtPct(lo, 0)}–${fmtPct(hi, 0)})` : '–'}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="btn" onClick={csv}>{L('Baixar CSV', 'Download CSV')}</button>
    </>
  );
}

function Horario({ g, f, setF, data }) {
  const { L } = useLang();
  const [step, setStep] = useState(5);
  const bins = useMemo(() => histogram(g.rows, step), [g, step]);
  return (
    <>
      <MissingVotesReport data={data} />
      <section className="story" aria-labelledby="hc">
        <h2 id="hc">{L('Quando as seções fecharam', 'When the sections closed')}</h2>
        <p className="story-intro">
          {L(
            <>Cada barra mostra <strong>quantas seções</strong> fecharam naquele intervalo de tempo, de 17h30 em diante (as que fecharam antes são o caso normal e não aparecem). <span className="pos">Vermelho</span> = seções em que Lula venceu no 1º turno; <span className="neg">azul listrado</span> = Flávio Bolsonaro. A barra alta perto das 19h mostra onde o encerramento se concentrou. Clique numa barra para usar aquele horário.</>,
            <>Each bar shows <strong>how many sections</strong> closed in that time window, from 17:30 onwards (those that closed earlier are the normal case and are not shown). <span className="pos">Red</span> = sections Lula won in the 1st round; <span className="neg">striped blue</span> = Flávio Bolsonaro. The tall bar near 7 pm shows where closing clustered. Click a bar to use that time.</>,
          )}
        </p>
        <div className="chart-ctl">
          <span className="note">{L('Largura das barras:', 'Bar width:')}</span>
          {[5, 10, 15].map((s) => <button key={s} type="button" className={`chip ${step === s ? 'on' : ''}`} onClick={() => setStep(s)}>{s} min</button>)}
        </div>
        <Legend />
        <Histogram bins={bins} lim={f.lim} onPick={(m) => setF({ lim: m })} />
        {g.noRec.n > 0 && <Note>{L(`${fmtN(g.noRec.n)} seções não têm registro de encerramento no log e ficam fora do gráfico.`, `${fmtN(g.noRec.n)} sections have no closing record in the log and are left out of the chart.`)}</Note>}
      </section>
    </>
  );
}

function Esperado({ g, f, data }) {
  const { L } = useLang();
  const ev = useMemo(() => expectedVsObserved(g, f, data), [g, f, data]);
  if (f.alt) return <p className="empty">{L('Esta comparação não está disponível para o recorte “só seções com local alterado” (não há totais do município para ele).', 'This comparison is not available for the “only sections with a changed polling place” cut (there are no municipality totals for it).')}</p>;
  if (!ev || !ev.n) return <p className="empty">{L(`Nenhuma seção encerrada às ${fmtHM(f.lim)} ou depois com esses filtros.`, `No section closed at ${fmtHM(f.lim)} or later with these filters.`)}</p>;
  const cols = [
    { key: 'uf', label: L('UF', 'State'), get: (r) => r.mun.uf }, { key: 'nome', label: L('Município', 'Municipality'), get: (r) => r.mun.nome },
    { key: 'n', label: L('Seções', 'Sections'), num: true, get: (r) => r.n, render: (r) => fmtN(r.n) },
    { key: 'ol', label: L('Lula venceu (obs.)', 'Lula won (obs.)'), num: true, get: (r) => r.obsL, render: (r) => fmtN(r.obsL) },
    { key: 'el', label: L('Lula esperado', 'Lula expected'), num: true, get: (r) => r.expL, render: (r) => fmtDec(r.expL), csv: (r) => r.expL.toFixed(2) },
    { key: 'of', label: L('Flávio venceu (obs.)', 'Flávio won (obs.)'), num: true, get: (r) => r.obsF, render: (r) => fmtN(r.obsF) },
    { key: 'ef', label: L('Flávio esperado', 'Flávio expected'), num: true, get: (r) => r.expF, render: (r) => fmtDec(r.expF), csv: (r) => r.expF.toFixed(2) },
    { key: 'pl', label: L('Voto de Lula vs. resto (p.p.)', 'Lula vote vs. rest (p.p.)'), num: true, get: (r) => r.ppL, render: (r) => fmtPP(r.ppL), csv: (r) => r.ppL.toFixed(2) },
    { key: 'pf', label: L('Voto de Flávio vs. resto (p.p.)', 'Flávio vote vs. rest (p.p.)'), num: true, get: (r) => r.ppF, render: (r) => fmtPP(r.ppF), csv: (r) => r.ppF.toFixed(2) },
  ];
  return (
    <>
      <p className="story-intro">
        {L(
          <>Para cada município, comparamos as seções encerradas às {fmtHM(f.lim)} ou depois com as <em>outras</em> seções da mesma cidade. “Esperado” é quantas vitórias teriam se votassem como o resto do município. É uma referência, não um teste de causa: seções com horários diferentes podem ter eleitores diferentes.</>,
          <>For each municipality we compare the sections closed at {fmtHM(f.lim)} or later with the <em>other</em> sections of the same city. “Expected” is how many wins they would have if they voted like the rest of the municipality. It is a reference, not a causal test: sections with different closing times may have different voters.</>,
        )}
      </p>
      <div className="stats">
        <Stat k={L('Lula: observado × esperado', 'Lula: observed × expected')} v={`${fmtN(ev.obsL)} × ${fmtDec(ev.expL)}`} sub={L(`desvio-padrão ${fmtDec(ev.sdL)}`, `standard deviation ${fmtDec(ev.sdL)}`)} />
        <Stat k={L('Flávio: observado × esperado', 'Flávio: observed × expected')} v={`${fmtN(ev.obsF)} × ${fmtDec(ev.expF)}`} sub={L(`desvio-padrão ${fmtDec(ev.sdF)}`, `standard deviation ${fmtDec(ev.sdF)}`)} />
        <Stat k={L('Voto válido de Lula vs. resto', 'Lula valid vote vs. rest')} v={fmtPP(ev.ppL)} sub={L(`${fmtN(ev.n)} seções`, `${fmtN(ev.n)} sections`)} />
        <Stat k={L('Voto válido de Flávio vs. resto', 'Flávio valid vote vs. rest')} v={fmtPP(ev.ppF)} sub={L(`${fmtN(ev.n)} seções`, `${fmtN(ev.n)} sections`)} />
      </div>
      <DataTable rows={ev.per} columns={cols} csvName="esperado_observado.csv" initialSort={{ key: 'n', dir: 'desc' }} pageSize={15} />
    </>
  );
}

function Alteradas({ data, f, go }) {
  const { L } = useLang();
  const T = f.lim * 60;
  const c = useMemo(() => {
    const k = { atT: 0, long: 0, noRec: 0, on: 0, n: 0 };
    for (const r of data.alt) {
      if (!r.s) continue;
      k.n++;
      if (r.enc == null) k.noRec++; else if (r.enc >= T) { k.atT++; } else if (r.enc >= 17.5 * 3600) k.long++; else k.on++;
    }
    return k;
  }, [data, T]);
  const all = useMemo(() => groups(data, { ...f, uf: '', mun: '', alt: '' }), [data, f]);
  if (!data.alt.length) return <p className="empty">{L('A lista de seções com local alterado não foi carregada.', 'The list of sections with a changed polling place was not loaded.')}</p>;
  const rate = c.n ? c.atT / c.n : 0, base = all.total.n ? all.atT.n / all.total.n : 0;
  return (
    <>
      <p className="story-intro">
        {L(`A lista do TSE traz ${fmtN(data.alt.length)} seções do 2º turno que mudaram de local de votação. Aqui, quando elas encerraram a votação, em comparação com todas as seções.`, `The TSE list has ${fmtN(data.alt.length)} runoff sections that changed polling place. Here, when they closed voting, compared with all sections.`)}
      </p>
      <div className="stats">
        <Stat k={L(`Encerradas às ${fmtHM(f.lim)}+`, `Closed at ${fmtHM(f.lim)}+`)} v={L(`${fmtN(c.atT)} de ${fmtN(c.n)}`, `${fmtN(c.atT)} of ${fmtN(c.n)}`)} sub={fmtPct(rate, 2)} />
        <Stat k={L(`Entre 17h30 e ${fmtHM(f.lim)}`, `Between 17:30 and ${fmtHM(f.lim)}`)} v={fmtN(c.long)} sub={fmtPct(c.n ? c.long / c.n : 0, 2)} />
        <Stat k={L('Sem registro de encerramento', 'No closing record')} v={fmtN(c.noRec)} sub={fmtPct(c.n ? c.noRec / c.n : 0, 2)} />
        <Stat k={L('Todas as seções, encerradas no limiar ou depois', 'All sections, closed at the threshold or later')} v={fmtPct(base, 3)} sub={L(`${fmtN(all.atT.n)} de ${fmtN(all.total.n)}`, `${fmtN(all.atT.n)} of ${fmtN(all.total.n)}`)} />
      </div>
      <button type="button" className="btn primary" onClick={() => go('/secoes', { alt: '1', lim: f.lim, modo: 'todas' })}>{L('Ver as seções alteradas que encerraram depois das 17h30', 'See the changed sections that closed after 17:30')}</button>
    </>
  );
}

export default function Relatorios({ data, f, setF, query, go }) {
  const { L } = useLang();
  const TABS = [
    ['varredura', L('Varredura do limiar', 'Threshold sweep')],
    ['horario', L('Horário de encerramento', 'Closing time')],
    ['esperado', L('Esperado × observado', 'Expected × observed')],
    ['alteradas', L('Local de votação alterado', 'Changed polling place')],
  ];
  const r = TABS.some(([k]) => k === query.r) ? query.r : 'varredura';
  const g = useMemo(() => groups(data, f), [data, f]);
  return (
    <div className="stack">
      <h1 className="page-title">{L('Relatórios', 'Reports')}</h1>
      <p className="sub">{L('Recorte', 'Selection')}: {scopeLabel(f, data, L)}{f.alt ? L(' · só seções com local alterado', ' · only sections with a changed polling place') : ''}</p>
      <div className="subnav">
        {TABS.map(([k, l]) => <button key={k} type="button" aria-current={r === k ? 'page' : undefined} onClick={() => go(undefined, { ...query, r: k })}>{l}</button>)}
      </div>
      <Filters data={data} f={f} setF={setF} limiar={r !== 'varredura'} />
      {r === 'varredura' && <Varredura g={g} f={f} setF={setF} />}
      {r === 'horario' && <Horario g={g} f={f} setF={setF} data={data} />}
      {r === 'esperado' && <Esperado g={g} f={f} data={data} />}
      {r === 'alteradas' && <Alteradas data={data} f={f} go={go} />}
    </div>
  );
}
