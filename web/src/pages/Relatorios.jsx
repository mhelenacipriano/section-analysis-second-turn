import { useMemo, useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import { Filters } from '../components/Filters.jsx';
import Histogram from '../components/Histogram.jsx';
import { Legend, Note, StackBar, Stat } from '../components/ui.jsx';
import { downloadCsv, fmtDec, fmtHM, fmtN, fmtPct, fmtPP, toCsv } from '../format.js';
import { expectedVsObserved, groups, histogram, sweep, wilson } from '../stats.js';
import { scopeLabel } from './Overview.jsx';

const TABS = [
  ['varredura', 'Varredura do limiar'],
  ['horario', 'Horário de encerramento'],
  ['esperado', 'Esperado × observado'],
  ['alteradas', 'Local de votação alterado'],
];
const THRESHOLDS = [17 * 60 + 30, 17 * 60 + 45, 18 * 60, 18 * 60 + 15, 18 * 60 + 30, 18 * 60 + 45, 18 * 60 + 55, 19 * 60, 19 * 60 + 5, 19 * 60 + 10, 19 * 60 + 15, 19 * 60 + 30];

function Varredura({ g, f, setF }) {
  const rows = useMemo(() => sweep(g.rows, THRESHOLDS), [g]);
  const csv = () => downloadCsv('varredura_limiar.csv', toCsv(rows, [
    { label: 'limiar (Brasília)', get: (r) => fmtHM(r.t) }, { label: 'seções', get: (r) => r.c.n },
    { label: 'Lula venceu', get: (r) => r.c.wl }, { label: 'Flávio venceu', get: (r) => r.c.wf }, { label: 'outros', get: (r) => r.c.wo }]));
  return (
    <>
      <p className="story-intro">
        Quanto mais tarde o limiar, menos seções restam — e menos confiável fica qualquer proporção. Cada linha mostra quem venceu, no 1º turno, as seções
        encerradas naquele horário ou depois ({scopeLabelText(f)}). Clique numa linha para usá-la como limiar.
      </p>
      <Legend />
      <div className="varredura">
        {rows.map(({ t, c }) => {
          const [lo, hi] = wilson(c.wl, c.n);
          return (
            <button key={t} type="button" className={`vr ${f.lim === t ? 'on' : ''}`} onClick={() => setF({ lim: t })}>
              <span className="vr-t">≥ {fmtHM(t)}</span>
              <span className="vr-n">{fmtN(c.n)} seções</span>
              <span className="vr-b"><StackBar l={c.wl} f={c.wf} o={c.wo} compact /></span>
              <span className="vr-ci">{c.n ? `Lula ${fmtPct(c.wl / c.n, 0)} (IC 95%: ${fmtPct(lo, 0)}–${fmtPct(hi, 0)})` : '–'}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="btn" onClick={csv}>Baixar CSV</button>
    </>
  );
}
const scopeLabelText = (f) => (f.uf ? (f.mun ? `${f.uf} / município` : f.uf) : 'todos os estados com dados');

function Horario({ g, f, setF }) {
  const [step, setStep] = useState(5);
  const bins = useMemo(() => histogram(g.rows, step), [g, step]);
  return (
    <>
      <p className="story-intro">Quando a urna confirmou o encerramento da votação, de 17h30 em diante. Clique numa barra para usar o horário como limiar.</p>
      <div className="chart-ctl">
        <span className="note">Largura das barras:</span>
        {[5, 10, 15].map((s) => <button key={s} type="button" className={`chip ${step === s ? 'on' : ''}`} onClick={() => setStep(s)}>{s} min</button>)}
      </div>
      <Legend />
      <Histogram bins={bins} lim={f.lim} onPick={(m) => setF({ lim: m })} />
      {g.noRec.n > 0 && <Note>{fmtN(g.noRec.n)} seções não têm registro de encerramento no log e ficam fora do gráfico.</Note>}
    </>
  );
}

function Esperado({ g, f, data }) {
  const ev = useMemo(() => expectedVsObserved(g, f, data), [g, f, data]);
  if (f.alt) return <p className="empty">Esta comparação não está disponível para o recorte “só seções com local alterado” (não há totais do município para ele).</p>;
  if (!ev || !ev.n) return <p className="empty">Nenhuma seção encerrada às {fmtHM(f.lim)} ou depois com esses filtros.</p>;
  const cols = [
    { key: 'uf', label: 'UF', get: (r) => r.mun.uf }, { key: 'nome', label: 'Município', get: (r) => r.mun.nome },
    { key: 'n', label: 'Seções', num: true, get: (r) => r.n, render: (r) => fmtN(r.n) },
    { key: 'ol', label: 'Lula venceu (obs.)', num: true, get: (r) => r.obsL, render: (r) => fmtN(r.obsL) },
    { key: 'el', label: 'Lula esperado', num: true, get: (r) => r.expL, render: (r) => fmtDec(r.expL), csv: (r) => r.expL.toFixed(2) },
    { key: 'of', label: 'Flávio venceu (obs.)', num: true, get: (r) => r.obsF, render: (r) => fmtN(r.obsF) },
    { key: 'ef', label: 'Flávio esperado', num: true, get: (r) => r.expF, render: (r) => fmtDec(r.expF), csv: (r) => r.expF.toFixed(2) },
    { key: 'pl', label: 'Voto de Lula vs. resto (p.p.)', num: true, get: (r) => r.ppL, render: (r) => fmtPP(r.ppL), csv: (r) => r.ppL.toFixed(2) },
    { key: 'pf', label: 'Voto de Flávio vs. resto (p.p.)', num: true, get: (r) => r.ppF, render: (r) => fmtPP(r.ppF), csv: (r) => r.ppF.toFixed(2) },
  ];
  return (
    <>
      <p className="story-intro">
        Para cada município, comparamos as seções encerradas às {fmtHM(f.lim)} ou depois com as <em>outras</em> seções da mesma cidade. “Esperado” é quantas vitórias teriam
        se votassem como o resto do município. É uma referência, não um teste de causa: seções com horários diferentes podem ter eleitores diferentes.
      </p>
      <div className="stats">
        <Stat k="Lula: observado × esperado" v={`${fmtN(ev.obsL)} × ${fmtDec(ev.expL)}`} sub={`desvio-padrão ${fmtDec(ev.sdL)}`} />
        <Stat k="Flávio: observado × esperado" v={`${fmtN(ev.obsF)} × ${fmtDec(ev.expF)}`} sub={`desvio-padrão ${fmtDec(ev.sdF)}`} />
        <Stat k="Voto válido de Lula vs. resto" v={fmtPP(ev.ppL)} sub={`${fmtN(ev.n)} seções`} />
        <Stat k="Voto válido de Flávio vs. resto" v={fmtPP(ev.ppF)} sub={`${fmtN(ev.n)} seções`} />
      </div>
      <DataTable rows={ev.per} columns={cols} csvName="esperado_observado.csv" initialSort={{ key: 'n', dir: 'desc' }} pageSize={15} />
    </>
  );
}

function Alteradas({ data, f, go }) {
  const T = f.lim * 60;
  const c = useMemo(() => {
    const k = { atT: 0, long: 0, noRec: 0, on: 0, n: 0, wl: 0, wf: 0 };
    for (const r of data.alt) {
      if (!r.s) continue;
      k.n++;
      if (r.enc == null) k.noRec++; else if (r.enc >= T) { k.atT++; } else if (r.enc >= 17.5 * 3600) k.long++; else k.on++;
    }
    return k;
  }, [data, T]);
  const all = useMemo(() => groups(data, { ...f, uf: '', mun: '', alt: '' }), [data, f]);
  if (!data.alt.length) return <p className="empty">A lista de seções com local alterado não foi carregada.</p>;
  const rate = c.n ? c.atT / c.n : 0, base = all.total.n ? all.atT.n / all.total.n : 0;
  return (
    <>
      <p className="story-intro">
        A lista do TSE traz {fmtN(data.alt.length)} seções do 2º turno que mudaram de local de votação. Aqui, quando elas encerraram a votação, em comparação com todas as seções.
      </p>
      <div className="stats">
        <Stat k={`Encerradas às ${fmtHM(f.lim)}+`} v={`${fmtN(c.atT)} de ${fmtN(c.n)}`} sub={fmtPct(rate, 2)} />
        <Stat k={`Entre 17h30 e ${fmtHM(f.lim)}`} v={fmtN(c.long)} sub={fmtPct(c.n ? c.long / c.n : 0, 2)} />
        <Stat k="Sem registro de encerramento" v={fmtN(c.noRec)} sub={fmtPct(c.n ? c.noRec / c.n : 0, 2)} />
        <Stat k="Todas as seções, encerradas no limiar ou depois" v={fmtPct(base, 3)} sub={`${fmtN(all.atT.n)} de ${fmtN(all.total.n)}`} />
      </div>
      <button type="button" className="btn primary" onClick={() => go('/secoes', { alt: '1', lim: f.lim, modo: 'todas' })}>Ver as seções alteradas que encerraram depois das 17h30</button>
    </>
  );
}

export default function Relatorios({ data, f, setF, query, go }) {
  const r = TABS.some(([k]) => k === query.r) ? query.r : 'varredura';
  const g = useMemo(() => groups(data, f), [data, f]);
  return (
    <div className="stack">
      <h1 className="page-title">Relatórios</h1>
      <p className="sub">Recorte: {scopeLabel(f, data)}{f.alt ? ' · só seções com local alterado' : ''}</p>
      <div className="subnav">
        {TABS.map(([k, l]) => <button key={k} type="button" aria-current={r === k ? 'page' : undefined} onClick={() => go(undefined, { ...query, r: k })}>{l}</button>)}
      </div>
      <Filters data={data} f={f} setF={setF} limiar={r !== 'varredura'} />
      {r === 'varredura' && <Varredura g={g} f={f} setF={setF} />}
      {r === 'horario' && <Horario g={g} f={f} setF={setF} />}
      {r === 'esperado' && <Esperado g={g} f={f} data={data} />}
      {r === 'alteradas' && <Alteradas data={data} f={f} go={go} />}
    </div>
  );
}
