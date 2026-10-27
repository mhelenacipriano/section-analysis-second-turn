import { useMemo } from 'react';
import DataTable from '../components/DataTable.jsx';
import { Filters } from '../components/Filters.jsx';
import { Note } from '../components/ui.jsx';
import { useLang } from '../i18n.jsx';
import { fmtHM, fmtN, fmtPct } from '../format.js';
import { ateHorario, pesoTardio } from '../stats.js';

// a share this small needs more decimals to be read at all
const pct = (x) => (x === 0 ? '0%' : fmtPct(x, x < 0.0001 ? 4 : x < 0.01 ? 3 : 2));
const winnerName = (k) => (k === 'lula' ? 'Lula' : 'Flávio Bolsonaro');

/** A bar on its own scale: the filled part is `share` of the track (never thinner than a visible sliver). */
const Meter = ({ share, tone = 'fecha' }) => (
  <div className="meter" aria-hidden="true"><i className={tone} style={{ width: `${Math.max(Math.min(share, 1) * 100, 0.6)}%` }} /></div>
);

function Card({ n, kicker, big, bigSub, meter, children }) {
  return (
    <article className="pcard">
      <header><span className="pcard-n">{n}</span><span className="pcard-k">{kicker}</span></header>
      <div className="pcard-v">{big}</div>
      {bigSub && <div className="pcard-s">{bigSub}</div>}
      {meter}
      <p className="pcard-t">{children}</p>
    </article>
  );
}

function ResumoInner({ data, f, setF, go }) {
  const { L } = useLang();
  const cedo = !!f.cedo;
  const T = fmtHM(f.lim);
  const { states, scope: s } = useMemo(() => pesoTardio(data, f.lim, f.uf, cedo), [data, f.lim, f.uf, cedo]);
  const where = f.uf || L('o país', 'the country');
  const whereLead = f.uf ? L(`Em ${f.uf}`, `In ${f.uf}`) : L('No país', 'Across the country');
  const W = winnerName(s.winner);
  const oneIn = s.pctVotes ? Math.round(1 / s.pctVotes) : null;
  const left = s.gap - s.va;
  const when = cedo ? L('antes das 17:30', 'before 17:30') : L(`às ${T} ou depois`, `at ${T} or later`);

  const table = useMemo(() => ateHorario(data, f.uf), [data, f.uf]);
  const rows = useMemo(() => states.filter((r) => r.n > 0), [states]);

  const columns = [
    { key: 'uf', label: L('UF', 'State'), get: (r) => r.uf },
    { key: 'n', label: cedo ? L('Urnas fechadas antes das 17:30', 'Urnas closed before 17:30') : L('Urnas fechadas tarde', 'Urnas closed late'), num: true, get: (r) => r.n, render: (r) => `${fmtN(r.n)} (${fmtPct(r.pctSections, 2)})`, csv: (r) => r.n },
    { key: 'va', label: L('Votos depois das 17:30', 'Votes after 5:30 pm'), num: true, get: (r) => r.va, render: (r) => fmtN(r.va) },
    { key: 'pv', label: L('% dos votos do estado', '% of the state’s votes'), num: true, get: (r) => r.pctVotes, render: (r) => pct(r.pctVotes), csv: (r) => (r.pctVotes * 100).toFixed(4) },
    { key: 'w', label: L('Venceu o estado (2º turno)', 'Won the state (2nd round)'), get: (r) => winnerName(r.winner), render: (r) => <span className={`chip-venc ${r.winner}`}>{winnerName(r.winner)}</span> },
    { key: 'g', label: L('Vantagem do vencedor', 'Winner’s margin'), num: true, get: (r) => r.gap, render: (r) => fmtN(r.gap) },
    { key: 'pg', label: L('Votos tardios ÷ vantagem', 'Late votes ÷ margin'), num: true, get: (r) => r.pctGap, render: (r) => pct(r.pctGap), csv: (r) => (r.pctGap * 100).toFixed(4) },
  ];

  // one row of the table: urnas already closed by the time, and the total votes cast until then
  const line = (key, label, r, strong = false) => (
    <tr key={key} className={strong ? 'total' : ''}>
      <td>{strong ? <strong>{label}</strong> : label}</td><td className="num">{fmtN(r.n)} <small>({fmtPct(r.pctSections, 2)})</small></td>
      <td className="num">{fmtN(r.until)}</td><td className="num">{fmtPct(r.pctVotes, 4)}</td>
    </tr>
  );

  return (
    <div className="stack">
      <header className="hero">
        <p className="eyebrow">{L('2º turno de 2026 · 25 de outubro', '2026 runoff · October 25')}</p>
        <h1>{L('Quanto pesaram os votos depois das 17:30?', 'How much did the votes after 5:30 pm weigh?')}</h1>
        <p className="hero-sub">
          {L('Algumas urnas ficaram abertas até as 19h. Quantos votos entraram depois das 17:30 nelas, e quanto isso pesa no total de votos e na diferença entre o vencedor e o perdedor.',
            'Some urnas stayed open until 7 pm. How many votes came in after 5:30 pm in them, and how much that weighs against all votes and against the gap between winner and loser.')}
        </p>
      </header>

      <Filters data={data} f={f} setF={setF} basico cedo />

      {cedo ? (
        <>
          <section className="peso-veredito normal" role="status" aria-label={L('Resumo', 'Summary')}>
            <span className="selo">{L('✓ Fecharam no horário normal', '✓ Closed at the normal time')}</span>
            <p className="pv-lead">
              {L(
                <><strong>{whereLead}</strong>, <strong>{fmtN(s.n)} urnas</strong> fecharam no horário, antes das 17:30. Elas reuniram <strong>{fmtN(s.inGroup)} votos</strong>, quase todos os votos do 2º turno. {s.va ? <>Só <strong>{fmtN(s.va)}</strong> foram dados depois das 17:30.</> : <><strong>Nenhum voto</strong> foi dado depois das 17:30: essas urnas já tinham fechado.</>}</>,
                <><strong>{whereLead}</strong>, <strong>{fmtN(s.n)} urnas</strong> closed on time, before 17:30. They held <strong>{fmtN(s.inGroup)} votes</strong>, almost all the votes of the 2nd round. {s.va ? <>Only <strong>{fmtN(s.va)}</strong> were cast after 5:30 pm.</> : <><strong>No vote</strong> was cast after 5:30 pm: these urnas had already closed.</>}</>,
              )}
            </p>
            <div className="pv-nums">
              <div><span className="pv-big">{fmtPct(s.pctSections, 2)}</span><span className="pv-cap">{L('das urnas', 'of the urnas')}</span></div>
              <div><span className="pv-big">{fmtPct(s.pctInGroup, 2)}</span><span className="pv-cap">{L('de todos os votos do 2º turno', 'of all 2nd-round votes')}</span></div>
            </div>
          </section>

          <section aria-label={L('Duas perspectivas', 'Two perspectives')}>
            <div className="pcards">
              <Card n="1" kicker={L('Das urnas', 'Of the urnas')} big={fmtPct(s.pctSections, 2)}
                bigSub={L(`${fmtN(s.n)} de ${fmtN(s.sections)} urnas`, `${fmtN(s.n)} of ${fmtN(s.sections)} urnas`)} meter={<Meter share={s.pctSections} />}>
                {L('Fecharam no horário normal, antes das 17:30.', 'Closed at the normal time, before 17:30.')}
              </Card>
              <Card n="2" kicker={L('Dos votos do 2º turno', 'Of the 2nd-round votes')} big={fmtPct(s.pctInGroup, 2)}
                bigSub={L(`${fmtN(s.inGroup)} de ${fmtN(s.votes)} votos`, `${fmtN(s.inGroup)} of ${fmtN(s.votes)} votes`)} meter={<Meter share={s.pctInGroup} />}>
                {L('Quase todos os votos foram dados em urnas que fecharam no horário.', 'Almost all the votes were cast in urnas that closed on time.')}
              </Card>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className={`peso-veredito ${s.winner}`} role="status" aria-label={L('Resumo', 'Summary')}>
            <p className="pv-lead">
              {L(
                <><strong>{whereLead}</strong>, <strong>{fmtN(s.n)} urnas</strong> fecharam {when}. Nelas, <strong>{fmtN(s.va)} votos</strong> foram dados depois das 17:30.</>,
                <><strong>{whereLead}</strong>, <strong>{fmtN(s.n)} urnas</strong> closed {when}. In them, <strong>{fmtN(s.va)} votes</strong> were cast after 5:30 pm.</>,
              )}
            </p>
            <div className="pv-nums">
              <div><span className="pv-big">{pct(s.pctVotes)}</span><span className="pv-cap">{L('de todos os votos do 2º turno', 'of all 2nd-round votes')}</span></div>
              <div><span className="pv-big">{pct(s.pctGap)}</span><span className="pv-cap">{L(`da vantagem de ${W}`, `of ${W}’s margin`)}</span></div>
            </div>
          </section>

          <section aria-label={L('Três perspectivas', 'Three perspectives')}>
            <div className="pcards">
              <Card n="1" kicker={L('Das urnas', 'Of the urnas')} big={pct(s.pctSections)}
                bigSub={L(`${fmtN(s.n)} de ${fmtN(s.sections)} urnas`, `${fmtN(s.n)} of ${fmtN(s.sections)} urnas`)} meter={<Meter share={s.pctSections} />}>
                {L('Quase todas fecharam no horário normal.', 'Almost all closed at the normal time.')}
              </Card>
              <Card n="2" kicker={L('Dos votos', 'Of the votes')} big={pct(s.pctVotes)}
                bigSub={L(`${fmtN(s.va)} de ${fmtN(s.votes)} votos`, `${fmtN(s.va)} of ${fmtN(s.votes)} votes`)} meter={<Meter share={s.pctVotes} />}>
                {oneIn ? L(`1 voto em cada ${fmtN(oneIn)}.`, `1 vote in every ${fmtN(oneIn)}.`) : '–'}
              </Card>
              <Card n="3" kicker={L(`Da vantagem de ${W}`, `Of ${W}’s margin`)} big={pct(s.pctGap)}
                bigSub={L(`vantagem total de ${fmtN(s.gap)} votos`, `total margin of ${fmtN(s.gap)} votes`)} meter={<Meter share={s.pctGap} tone={s.winner} />}>
                {left > 0
                  ? L(`Sem esses votos, a vantagem ainda seria de ${fmtN(left)}.`, `Without these votes, the margin would still be ${fmtN(left)}.`)
                  : L(`Esses votos são maiores que a vantagem de ${W}.`, `These votes are larger than ${W}’s margin.`)}
              </Card>
            </div>
          </section>
        </>
      )}

      <section className="story" aria-labelledby="cortes">
        <h2 id="cortes">{L('Urnas fechadas e votos contados, até cada horário', 'Urnas closed and votes counted, until each time')}</h2>
        <div className="tabela-scroll">
          <table>
            <thead><tr>
              <th>{L('Horário', 'Time')}</th><th className="num">{L('Urnas fechadas até o horário', 'Urnas closed until the time')}</th><th className="num">{L('Total de votos até o horário', 'Total votes until the time')}</th>
              <th className="num">{L('% de todos os votos', '% of all votes')}</th></tr></thead>
            <tbody>
              {line('all', L('Todas as urnas (total)', 'All urnas (total)'), table.total, true)}
              {table.rows.map((r) => line(`c${r.c}`, `${L('até as', 'until')} ${fmtHM(r.c)}`, r))}
            </tbody>
          </table>
        </div>
        <p className="note">{L(`Em ${where}: urnas com encerramento confirmado antes do horário e todos os votos dados até ele, em todas as urnas.`,
          `In ${where}: urnas whose closing was confirmed before the time, and all the votes cast until then, in all urnas.`)}</p>
      </section>

      <section className="story" aria-labelledby="ufs">
        <h2 id="ufs">{L('Por estado', 'By state')}</h2>
        <DataTable rows={rows} columns={columns} csvName={`peso_votos_tardios_${cedo ? 'antes_1730' : f.lim}.csv`} initialSort={{ key: 'pv', dir: 'desc' }} pageSize={30}
          onRow={(r) => setF({ uf: r.uf })} />
      </section>

      <p className="atalhos">
        <button type="button" className="btn primary" onClick={() => go('/mapa')}>{L('Ver no mapa', 'See on the map')}</button>
        <button type="button" className="btn" onClick={() => go('/secoes')}>{L('Ver a lista de seções', 'See the list of sections')}</button>
      </p>

      <Note>{L('A votação deveria acabar às 17h, mas quem já estava na fila podia votar. Aqui só contamos os votos depois das 17:30. Totais do 2º turno: oficiais do TSE. Mede tamanho, não prova irregularidade.',
        'Voting was due to end at 5 pm, but people already in line could vote. Here we only count votes after 5:30 pm. 2nd-round totals: official TSE. This measures size; it does not prove irregularity.')}</Note>
    </div>
  );
}

export default function Resumo(props) {
  const { L } = useLang();
  if (!props.data.t2) return <p className="aviso">{L('O resultado oficial do 2º turno não foi carregado.', 'The official 2nd-round result could not be loaded.')}</p>;
  return <ResumoInner {...props} />;
}
