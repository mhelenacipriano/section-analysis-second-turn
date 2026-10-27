import { useMemo } from 'react';
import DataTable from '../components/DataTable.jsx';
import { Filters } from '../components/Filters.jsx';
import { Note } from '../components/ui.jsx';
import { useLang } from '../i18n.jsx';
import { fmtHM, fmtN, fmtPct } from '../format.js';
import { pesoTardio } from '../stats.js';

const CUTS = [17 * 60 + 30, 17 * 60 + 45, 18 * 60, 18 * 60 + 30, 18 * 60 + 50, 19 * 60];
const EARLY = 17 * 60 + 30;
// a share this small needs more decimals to be read at all
const pct = (x) => fmtPct(x, x < 0.0001 ? 4 : x < 0.01 ? 3 : 2);
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
  const { states, scope: s, early, all } = useMemo(() => pesoTardio(data, f.lim, f.uf, cedo), [data, f.lim, f.uf, cedo]);
  const where = f.uf || L('o país', 'the country');
  const whereLead = f.uf ? L(`Em ${f.uf}`, `In ${f.uf}`) : L('No país', 'Across the country');
  const W = winnerName(s.winner);
  const oneIn = s.pctVotes ? Math.round(1 / s.pctVotes) : null;
  const left = s.gap - s.va;
  const when = cedo ? L('antes das 17:30', 'before 17:30') : L(`às ${T} ou depois`, `at ${T} or later`);

  // every row is a share of the same totals: early + 17:30-or-later = all urnas; the cut-offs below are parts of "17:30 or later"
  const cuts = useMemo(() => CUTS.map((c) => ({ c, ...pesoTardio(data, c, f.uf).scope })), [data, f.uf]);
  const rest = useMemo(() => ({ ...all, n: all.n - early.n, va: all.va - early.va, pctSections: (all.n - early.n) / (all.sections || 1),
    pctVotes: (all.va - early.va) / all.votes, pctGap: (all.va - early.va) / all.gap }), [all, early]);
  const noRec = rest.n - cuts[0].n;
  const rows = useMemo(() => states.filter((r) => r.n > 0), [states]);

  const columns = [
    { key: 'uf', label: L('UF', 'State'), get: (r) => r.uf },
    { key: 'n', label: cedo ? L('Urnas fechadas antes das 17:30', 'Urnas closed before 17:30') : L('Urnas fechadas tarde', 'Urnas closed late'), num: true, get: (r) => r.n, render: (r) => `${fmtN(r.n)} (${fmtPct(r.pctSections, 2)})`, csv: (r) => r.n },
    { key: 'va', label: L('Votos depois das 17h', 'Votes after 5 pm'), num: true, get: (r) => r.va, render: (r) => fmtN(r.va) },
    { key: 'pv', label: L('% dos votos do estado', '% of the state’s votes'), num: true, get: (r) => r.pctVotes, render: (r) => pct(r.pctVotes), csv: (r) => (r.pctVotes * 100).toFixed(4) },
    { key: 'w', label: L('Venceu o estado (2º turno)', 'Won the state (2nd round)'), get: (r) => winnerName(r.winner), render: (r) => <span className={`chip-venc ${r.winner}`}>{winnerName(r.winner)}</span> },
    { key: 'g', label: L('Vantagem do vencedor', 'Winner’s margin'), num: true, get: (r) => r.gap, render: (r) => fmtN(r.gap) },
    { key: 'pg', label: L('Votos tardios ÷ vantagem', 'Late votes ÷ margin'), num: true, get: (r) => r.pctGap, render: (r) => pct(r.pctGap), csv: (r) => (r.pctGap * 100).toFixed(4) },
  ];

  // the table of closing times: every row against the same totals
  const line = (key, label, r, { sub = false, sel = false, onClick, strong = false } = {}) => (
    <tr key={key} className={`${sub ? 'sub' : ''} ${sel ? 'sel' : ''} ${strong ? 'total' : ''}`} onClick={onClick} tabIndex={onClick ? 0 : undefined} onKeyDown={(e) => onClick && e.key === 'Enter' && onClick()}>
      <td>{strong ? <strong>{label}</strong> : label}</td><td className="num">{fmtN(r.n)} <small>({fmtPct(r.pctSections, 2)})</small></td><td className="num">{fmtN(r.va)}</td>
      <td className="num">{pct(r.pctVotes)}</td><td className="num">{pct(r.pctGap)}</td>
    </tr>
  );

  return (
    <div className="stack">
      <header className="hero">
        <p className="eyebrow">{L('2º turno de 2026 · 25 de outubro', '2026 runoff · October 25')}</p>
        <h1>{L('Quanto pesaram os votos depois das 17h?', 'How much did the votes after 5 pm weigh?')}</h1>
        <p className="hero-sub">
          {L('Algumas urnas ficaram abertas até as 19h. Quantos votos entraram depois das 17h nelas, e quanto isso pesa no total de votos e na diferença entre o vencedor e o perdedor.',
            'Some urnas stayed open until 7 pm. How many votes came in after 5 pm in them, and how much that weighs against all votes and against the gap between winner and loser.')}
        </p>
      </header>

      <Filters data={data} f={f} setF={setF} basico cedo />

      <section className={`peso-veredito ${s.winner}`} role="status" aria-label={L('Resumo', 'Summary')}>
        <p className="pv-lead">
          {L(
            <><strong>{whereLead}</strong>, <strong>{fmtN(s.n)} urnas</strong> fecharam {when}. Nelas, <strong>{fmtN(s.va)} votos</strong> foram dados depois das 17h.</>,
            <><strong>{whereLead}</strong>, <strong>{fmtN(s.n)} urnas</strong> closed {when}. In them, <strong>{fmtN(s.va)} votes</strong> were cast after 5 pm.</>,
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
            {cedo ? L('A grande maioria das urnas fechou no horário normal.', 'Most urnas closed at the normal time.') : L('Quase todas fecharam no horário normal.', 'Almost all closed at the normal time.')}
          </Card>
          <Card n="2" kicker={L('Dos votos', 'Of the votes')} big={pct(s.pctVotes)}
            bigSub={L(`${fmtN(s.va)} de ${fmtN(s.votes)} votos`, `${fmtN(s.va)} of ${fmtN(s.votes)} votes`)} meter={<Meter share={s.pctVotes} />}>
            {oneIn ? L(`1 voto em cada ${fmtN(oneIn)}.`, `1 vote in every ${fmtN(oneIn)}.`) : '–'}
          </Card>
          <Card n="3" kicker={L(`Da vantagem de ${W}`, `Of ${W}’s margin`)} big={pct(s.pctGap)}
            bigSub={L(`vantagem total de ${fmtN(s.gap)} votos`, `total margin of ${fmtN(s.gap)} votes`)} meter={<Meter share={s.pctGap} tone={s.winner} />}>
            {cedo
              ? (all.va ? (early.va / all.va > 0.5
                ? L(`São a maioria dos votos depois das 17h: ${fmtPct(early.va / all.va, 0)} (${fmtN(early.va)} de ${fmtN(all.va)}) foram dados em urnas que fecharam no horário normal.`,
                  `They are the majority of the votes after 5 pm: ${fmtPct(early.va / all.va, 0)} (${fmtN(early.va)} of ${fmtN(all.va)}) were cast in urnas that closed at the normal time.`)
                : L(`São ${fmtPct(early.va / all.va, 0)} dos votos depois das 17h (${fmtN(early.va)} de ${fmtN(all.va)}); o resto foi dado em urnas que fecharam tarde.`,
                  `They are ${fmtPct(early.va / all.va, 0)} of the votes after 5 pm (${fmtN(early.va)} of ${fmtN(all.va)}); the rest was cast in urnas that closed late.`)) : '–')
              : left > 0
                ? L(`Sem esses votos, a vantagem ainda seria de ${fmtN(left)}.`, `Without these votes, the margin would still be ${fmtN(left)}.`)
                : L(`Esses votos são maiores que a vantagem de ${W}.`, `These votes are larger than ${W}’s margin.`)}
          </Card>
        </div>
      </section>

      <section className="story" aria-labelledby="cortes">
        <h2 id="cortes">{L('Todas as urnas, por horário de encerramento', 'All urnas, by closing time')}</h2>
        <p className="story-intro">{L(`As urnas fechadas antes das 17:30 mais as fechadas às 17:30 ou depois somam o total (${where}). Clique numa linha para ver só aquele grupo.`,
          `Urnas closed before 17:30 plus those closed at 17:30 or later add up to the total (${where}). Click a row to see only that group.`)}</p>
        <div className="tabela-scroll">
          <table>
            <thead><tr>
              <th>{L('Horário de encerramento', 'Closing time')}</th><th className="num">{L('Urnas', 'Urnas')}</th><th className="num">{L('Votos depois das 17h', 'Votes after 5 pm')}</th>
              <th className="num">{L('% dos votos', '% of votes')}</th><th className="num">{L('% da vantagem', '% of the margin')}</th></tr></thead>
            <tbody>
              {line('all', L('Todas as urnas (total)', 'All urnas (total)'), all, { strong: true })}
              {line('early', L('Antes das 17:30', 'Before 17:30'), early, { sel: cedo, onClick: () => setF({ cedo: '1' }) })}
              {line('rest', L('17:30 ou depois', '17:30 or later'), rest, { sel: false, onClick: () => setF({ lim: EARLY }) })}
              {cuts.map((r) => line(`c${r.c}`, <>{L('a partir das', 'from')} {fmtHM(r.c)}</>, r, { sub: true, sel: !cedo && r.c === f.lim, onClick: () => setF({ lim: r.c }) }))}
            </tbody>
          </table>
        </div>
        {noRec > 0 && <p className="note">{L(`“17:30 ou depois” inclui ${fmtN(noRec)} urnas sem registro de encerramento no log; as linhas “a partir das” não as contam.`,
          `“17:30 or later” includes ${fmtN(noRec)} urnas with no closing record in the log; the “from” rows do not count them.`)}</p>}
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

      <Note>{L('“Votos depois das 17h” incluem quem já estava na fila às 17h, o que é permitido. Totais do 2º turno: oficiais do TSE. Mede tamanho, não prova irregularidade.',
        '“Votes after 5 pm” include people already in line at 5 pm, which is allowed. 2nd-round totals: official TSE. This measures size; it does not prove irregularity.')}</Note>
    </div>
  );
}

export default function Resumo(props) {
  const { L } = useLang();
  if (!props.data.t2) return <p className="aviso">{L('O resultado oficial do 2º turno não foi carregado.', 'The official 2nd-round result could not be loaded.')}</p>;
  return <ResumoInner {...props} />;
}
