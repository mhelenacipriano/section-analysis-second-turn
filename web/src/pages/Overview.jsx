import { useMemo } from 'react';
import Histogram from '../components/Histogram.jsx';
import { Filters } from '../components/Filters.jsx';
import { Legend, Note, StackBar, Stat } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';
import MissingVotesReport from '../components/MissingVotesReport.jsx';
import OnTimeMap from '../components/OnTimeMap.jsx';
import { useLang } from '../i18n.jsx';
import { fmtDec, fmtHM, fmtN, fmtPct, fmtPP } from '../format.js';
import { expectedVsObserved, groups, histogram, voteShare, wilson } from '../stats.js';

export function Ci({ k, n }) {
  const { L } = useLang();
  if (!n) return null;
  const [lo, hi] = wilson(k, n);
  return <span className="ic" title={L('Intervalo de confiança de 95% (Wilson)', '95% confidence interval (Wilson)')}>{L('IC 95%', '95% CI')}: {fmtPct(lo, 0)}–{fmtPct(hi, 0)}</span>;
}

export function scopeLabel(f, data, L) {
  if (f.mun) return data.mun.find((m) => m.uf === f.uf && m.cod === f.mun)?.nome || f.mun;
  return f.uf || L('todo o país (estados com dados)', 'the whole country (states with data)');
}

export default function Overview({ data, f, setF, go, themeKey }) {
  const { L } = useLang();
  const g = useMemo(() => groups(data, f), [data, f]);
  const ev = useMemo(() => expectedVsObserved(g, f, data), [g, f, data]);
  const bins = useMemo(() => histogram(g.rows), [g]);
  const T = fmtHM(f.lim);
  const scope = scopeLabel(f, data, L) + (f.alt ? L(' · só seções com local alterado', ' · only sections with a changed polling place') : '');
  const a = g.atT, r = g.rest;
  const vs = voteShare(a), vsr = voteShare(r);

  const top = useMemo(() => {
    const by = new Map();
    for (const x of g.atRows) {
      const u = by.get(x.mi) || { mun: x.mun, n: 0, wl: 0, wf: 0 };
      u.n++; u.wl += x.v === 13; u.wf += x.v === 22;
      by.set(x.mi, u);
    }
    return [...by.values()].sort((p, q) => q.n - p.n);
  }, [g]);

  const pending = Object.entries(data.meta.ufs).filter(([, c]) => !c.t1 || c.scanned < c.t1);

  return (
    <div className="stack">
      <header className="hero">
        <p className="eyebrow">{L('2º turno de 2026 · 25 de outubro', '2026 runoff · October 25')}</p>
        <h1>{L('Quantas seções encerraram a votação por volta das 19h?', 'How many sections closed voting around 7 pm?')}</h1>
        <p className="hero-sub">
          {L(
            `Seções eleitorais cujo log da urna registra o encerramento da votação às ${T} ou depois (horário de Brasília) — e como essas mesmas seções votaram no 1º turno.`,
            `Polling sections whose urna log records the closing of voting at ${T} or later (Brasília time), and how those same sections voted in the 1st round.`,
          )}
        </p>
        <p className="disclaimer">
          {L(
            <>“Encerramento” é o registro <em>Procedimento de encerramento confirmado</em> no log de cada urna, não necessariamente um voto àquela hora. Análise descritiva de dados públicos do TSE: o site mostra quando e onde as urnas foram encerradas, não explica por quê, e não afirma irregularidade.</>,
            <>“Closing” is the <em>Procedimento de encerramento confirmado</em> entry in each urna’s log, not necessarily a vote at that time. This is a descriptive analysis of public TSE data: the site shows when and where urnas were closed, does not explain why, and does not claim any irregularity.</>,
          )}
        </p>
      </header>

      <p><a className="btn primary" href="#mapa-estados" onClick={(e) => { e.preventDefault(); document.getElementById('mapa-estados')?.scrollIntoView({ behavior: 'smooth' }); }}>{L('Ver o mapa dos estados ↓', 'See the state map ↓')}</a></p>

      <Filters data={data} f={f} setF={setF} />

      <section className="story" aria-labelledby="resp">
        <h2 id="resp">{L('A resposta, em', 'The answer, for')} {scope}</h2>
        {a.n === 0 ? (
          <p className="empty">{L(`Nenhuma seção foi encerrada às ${T} ou depois com esses filtros. Reduza o limiar ou mude o estado.`, `No section closed at ${T} or later with these filters. Lower the threshold or change the state.`)}</p>
        ) : (
          <>
            <div className="stats">
              <Stat k={L(`Seções encerradas às ${T} ou depois`, `Sections closed at ${T} or later`)} v={fmtN(a.n)} sub={L(`${fmtPct(a.n / (g.total.n || 1), 3)} das ${fmtN(g.total.n)} seções analisadas`, `${fmtPct(a.n / (g.total.n || 1), 3)} of the ${fmtN(g.total.n)} sections analysed`)} />
              <Stat k={L('Lula venceu no 1º turno', 'Lula won the 1st round')} v={fmtN(a.wl)} sub={<>{fmtPct(a.wl / a.n)} {L('dessas seções', 'of these sections')} <Ci k={a.wl} n={a.n} /></>} />
              <Stat k={L('Flávio Bolsonaro venceu no 1º turno', 'Flávio Bolsonaro won the 1st round')} v={fmtN(a.wf)} sub={<>{fmtPct(a.wf / a.n)} {L('dessas seções', 'of these sections')} <Ci k={a.wf} n={a.n} /></>} />
              <Stat k={L('Outro candidato / empate', 'Another candidate / tie')} v={fmtN(a.wo)} sub={fmtPct(a.wo / a.n)} />
            </div>
            <p className="leitura">
              {L(
                <>Entre as <strong>{fmtN(a.n)}</strong> seções cuja urna foi encerrada às {T} ou depois, <strong className="pos">Lula venceu em {fmtN(a.wl)}</strong> e <strong className="neg">Flávio Bolsonaro em {fmtN(a.wf)}</strong> no 1º turno. Nas <strong>{fmtN(r.n)}</strong> demais seções (encerradas antes das {T}), Lula venceu em <strong className="pos">{fmtN(r.wl)} ({fmtPct(r.wl / (r.n || 1))})</strong> e Flávio em <strong className="neg">{fmtN(r.wf)} ({fmtPct(r.wf / (r.n || 1))})</strong>.</>,
                <>Of the <strong>{fmtN(a.n)}</strong> sections whose urna closed at {T} or later, <strong className="pos">Lula won {fmtN(a.wl)}</strong> and <strong className="neg">Flávio Bolsonaro {fmtN(a.wf)}</strong> in the 1st round. In the other <strong>{fmtN(r.n)}</strong> sections (closed before {T}), Lula won <strong className="pos">{fmtN(r.wl)} ({fmtPct(r.wl / (r.n || 1))})</strong> and Flávio <strong className="neg">{fmtN(r.wf)} ({fmtPct(r.wf / (r.n || 1))})</strong>.</>,
              )}
            </p>
            {a.n < 30 && <Note>{L(`Com ${fmtN(a.n)} seções, qualquer proporção é muito instável: veja o intervalo de confiança e a comparação com o resto do município logo abaixo.`, `With ${fmtN(a.n)} sections any proportion is very unstable: see the confidence interval and the comparison with the rest of the municipality below.`)}</Note>}
          </>
        )}

        <div className="comp">
          <Legend />
          {[
            [L(`Urna encerrada às ${T} ou depois`, `Urna closed at ${T} or later`), a, 'a'],
            [L(`Encerrada entre 17h30 e ${T}`, `Closed between 17:30 and ${T}`), g.long, 'b'],
            [L('Encerrada antes das 17h30 (o normal)', 'Closed before 17:30 (the normal case)'), g.onTime, 'c'],
            ...(g.noRec.n ? [[L('Sem registro de encerramento no log', 'No closing record in the log'), g.noRec, 'f']] : []),
            [L(`Todas as outras (tudo menos as de ${T}+)`, `All the others (everything except ${T}+)`), r, 'd'],
            [L('Todas as seções analisadas', 'All sections analysed'), g.total, 'e'],
          ].map(([label, c, k]) => (
            <div key={k} className="comp-linha">
              <div className="comp-rotulo"><strong>{label}</strong><span>{fmtN(c.n)} {L('seções · quem venceu a seção no 1º turno', 'sections · who won each section in the 1st round')}</span></div>
              <StackBar l={c.wl} f={c.wf} o={c.wo} />
            </div>
          ))}
        </div>
        {vs && vsr && (
          <Note>{L(
            `Votos válidos no 1º turno: nas seções de ${T}+ Lula teve ${fmtPct(vs.l)} e Flávio ${fmtPct(vs.f)} (${fmtN(vs.valid)} votos); nas demais, Lula ${fmtPct(vsr.l)} e Flávio ${fmtPct(vsr.f)}.`,
            `Valid votes in the 1st round: in the ${T}+ sections Lula had ${fmtPct(vs.l)} and Flávio ${fmtPct(vs.f)} (${fmtN(vs.valid)} votes); in the others, Lula ${fmtPct(vsr.l)} and Flávio ${fmtPct(vsr.f)}.`,
          )}</Note>
        )}
      </section>

      <section className="story" id="mapa-estados" aria-labelledby="mpe">
        <h2 id="mpe">{L('Mapa dos estados: quem venceu e quanto fechou no horário', 'State map: who won and how much closed on time')}</h2>
        <OnTimeMap data={data} go={go} themeKey={themeKey} />
        <p><button type="button" className="btn" onClick={() => go('/pontuais')}>{L('Ver o ranking completo dos estados →', 'See the full state ranking →')}</button></p>
      </section>

      <MissingVotesReport data={data} />

      {ev && ev.n > 0 && (
        <section className="story" aria-labelledby="esp">
          <h2 id="esp">{L('Comparando com o resto do mesmo município', 'Compared with the rest of the same municipality')}</h2>
          <p className="story-intro">
            {L(
              <>Seções que ficam abertas mais tempo costumam estar em cidades grandes, onde o voto é diferente da média do país. Por isso a comparação justa é com as outras seções <em>do mesmo município</em>: se essas {fmtN(ev.n)} seções votassem como o resto de suas cidades, quantas vitórias esperaríamos?</>,
              <>Sections that stay open longer tend to be in big cities, where the vote differs from the national average. So the fair comparison is with the other sections <em>of the same municipality</em>: if these {fmtN(ev.n)} sections had voted like the rest of their cities, how many wins would we expect?</>,
            )}
          </p>
          <div className="stats">
            <Stat k={L('Lula: vitórias observadas', 'Lula: wins observed')} v={fmtN(ev.obsL)} sub={L(`esperado ${fmtDec(ev.expL)} (faixa de 95%: ${fmtDec(Math.max(0, ev.expL - 1.96 * ev.sdL))}–${fmtDec(Math.min(ev.n, ev.expL + 1.96 * ev.sdL))})`, `expected ${fmtDec(ev.expL)} (95% range: ${fmtDec(Math.max(0, ev.expL - 1.96 * ev.sdL))}–${fmtDec(Math.min(ev.n, ev.expL + 1.96 * ev.sdL))})`)} />
            <Stat k={L('Flávio: vitórias observadas', 'Flávio: wins observed')} v={fmtN(ev.obsF)} sub={L(`esperado ${fmtDec(ev.expF)} (faixa de 95%: ${fmtDec(Math.max(0, ev.expF - 1.96 * ev.sdF))}–${fmtDec(Math.min(ev.n, ev.expF + 1.96 * ev.sdF))})`, `expected ${fmtDec(ev.expF)} (95% range: ${fmtDec(Math.max(0, ev.expF - 1.96 * ev.sdF))}–${fmtDec(Math.min(ev.n, ev.expF + 1.96 * ev.sdF))})`)} />
            <Stat k={L('Voto válido de Lula vs. resto do município', 'Lula valid vote vs. rest of municipality')} v={fmtPP(ev.ppL)} sub={L('no 1º turno, média ponderada por votos', '1st round, vote-weighted average')} />
            <Stat k={L('Voto válido de Flávio vs. resto do município', 'Flávio valid vote vs. rest of municipality')} v={fmtPP(ev.ppF)} sub={L('no 1º turno, média ponderada por votos', '1st round, vote-weighted average')} />
          </div>
          <p className="leitura">
            {Math.abs(ev.obsL - ev.expL) <= 1.96 * ev.sdL
              ? L('O resultado observado está dentro da faixa calculada para seções que votassem como o resto de seus municípios.', 'The observed result is inside the range calculated for sections voting like the rest of their municipalities.')
              : L('O resultado observado ficou fora da faixa calculada para seções que votassem como o resto de seus municípios.', 'The observed result fell outside the range calculated for sections voting like the rest of their municipalities.')}
            {' '}{L(
              'A faixa trata cada seção como independente e, por isso, tende a ser estreita demais: seções do mesmo bairro votam de forma parecida. Leia como indício a investigar, não como prova. Isto mede só o 1º turno e não explica por que as seções foram encerradas mais tarde.',
              'The range treats each section as independent and therefore tends to be too narrow: sections in the same neighbourhood vote alike. Read it as a lead to investigate, not as proof. It measures only the 1st round and does not explain why the sections closed later.',
            )}
            {ev.skipped > 0 && L(` (${ev.skipped} seções sem outras seções no município ficaram de fora.)`, ` (${ev.skipped} sections with no other section in their municipality were left out.)`)}
          </p>
        </section>
      )}

      <section className="story" aria-labelledby="hor">
        <h2 id="hor">{L('Horário do encerramento', 'Closing time')}</h2>
        <p className="story-intro">
          {L(
            'Cada barra é um intervalo de 5 minutos, de 17h30 em diante (as seções encerradas antes disso são o caso normal e não aparecem aqui). Clique numa barra para usar o horário como limiar.',
            'Each bar is a 5-minute interval, from 17:30 onwards (sections closed before that are the normal case and do not appear here). Click a bar to use that time as the threshold.',
          )}
        </p>
        <Legend />
        <Histogram bins={bins} lim={f.lim} onPick={(m) => setF({ lim: m })} />
      </section>

      {top.length > 0 && (
        <section className="story" aria-labelledby="onde">
          <h2 id="onde">{L(`Onde estão as seções encerradas às ${T} ou depois`, `Where the sections closed at ${T} or later are`)}</h2>
          <DataTable
            rows={top} pageSize={10} search={false} csvName="municipios_limiar.csv"
            onRow={(u) => go('/secoes', { uf: u.mun.uf, mun: u.mun.cod, lim: f.lim })}
            columns={[
              { key: 'uf', label: L('UF', 'State'), get: (u) => u.mun.uf },
              { key: 'nome', label: L('Município', 'Municipality'), get: (u) => u.mun.nome },
              { key: 'n', label: L(`Seções ${T}+`, `Sections ${T}+`), num: true, get: (u) => u.n, render: (u) => fmtN(u.n) },
              { key: 'p', label: L('% das seções do município', '% of the municipality’s sections'), num: true, get: (u) => u.n / u.mun.n, render: (u) => `${fmtPct(u.n / u.mun.n, 2)} (${fmtN(u.n)} ${L('de', 'of')} ${fmtN(u.mun.n)})`, csv: (u) => (u.n / u.mun.n).toFixed(5) },
              { key: 'wl', label: L('Lula venceu', 'Lula won'), num: true, get: (u) => u.wl, render: (u) => fmtN(u.wl) },
              { key: 'wf', label: L('Flávio venceu', 'Flávio won'), num: true, get: (u) => u.wf, render: (u) => fmtN(u.wf) },
            ]}
          />
          <Note>{L('Clique numa linha para ver as seções do município.', 'Click a row to see the municipality’s sections.')}</Note>
        </section>
      )}

      {pending.length > 0 && (
        <aside className="aviso">
          <strong>{L('Cobertura incompleta.', 'Incomplete coverage.')}</strong>{' '}
          {pending.map(([u, c]) => (c.t1 ? L(`${u} (${fmtN(c.t1 - c.scanned)} seções ainda não conferidas)`, `${u} (${fmtN(c.t1 - c.scanned)} sections not yet read)`) : L(`${u} (sem dados do 1º turno)`, `${u} (no 1st-round data)`))).join(', ')}.
          {' '}{L('Essas seções ficam fora das contas, nunca contadas como “fecharam no horário”. Detalhes em Metodologia.', 'These sections are left out of the counts, never counted as “closed on time”. Details under Methodology.')}
        </aside>
      )}
    </div>
  );
}
