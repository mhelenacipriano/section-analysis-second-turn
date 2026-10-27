import { useMemo } from 'react';
import DataTable from '../components/DataTable.jsx';
import { Filters } from '../components/Filters.jsx';
import { Note } from '../components/ui.jsx';
import { useLang } from '../i18n.jsx';
import { fmtHM, fmtN, fmtPct } from '../format.js';
import { pesoTardio } from '../stats.js';

const CUTS = [17 * 60 + 30, 17 * 60 + 45, 18 * 60, 18 * 60 + 30, 18 * 60 + 50, 19 * 60];
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

function PesoInner({ data, f, setF }) {
  const { L } = useLang();
  const T = fmtHM(f.lim);
  const { states, scope: s } = useMemo(() => pesoTardio(data, f.lim, f.uf), [data, f.lim, f.uf]);
  const where = f.uf || L('o país', 'the country');
  const whereLead = f.uf ? L(`Em ${f.uf}`, `In ${f.uf}`) : L('No país', 'Across the country');
  const W = winnerName(s.winner);
  const oneIn = s.pctVotes ? Math.round(1 / s.pctVotes) : null;
  const left = s.gap - s.va;

  const cuts = useMemo(() => CUTS.map((c) => ({ c, ...pesoTardio(data, c, f.uf).scope })), [data, f.uf]);
  const rows = useMemo(() => states.filter((r) => r.n > 0), [states]);
  const stateOf = (r) => r.uf;

  const columns = [
    { key: 'uf', label: L('UF', 'State'), get: stateOf },
    { key: 'n', label: L('Urnas fechadas tarde', 'Urnas closed late'), num: true, get: (r) => r.n, render: (r) => `${fmtN(r.n)} (${fmtPct(r.pctSections, 2)})`, csv: (r) => r.n },
    { key: 'va', label: L('Votos depois das 17h', 'Votes after 5 pm'), num: true, get: (r) => r.va, render: (r) => fmtN(r.va) },
    { key: 'pv', label: L('% dos votos do estado', '% of the state’s votes'), num: true, get: (r) => r.pctVotes, render: (r) => pct(r.pctVotes), csv: (r) => (r.pctVotes * 100).toFixed(4) },
    { key: 'w', label: L('Venceu o estado (2º turno)', 'Won the state (2nd round)'), get: (r) => winnerName(r.winner), render: (r) => <span className={`chip-venc ${r.winner}`}>{winnerName(r.winner)}</span> },
    { key: 'g', label: L('Vantagem do vencedor', 'Winner’s margin'), num: true, get: (r) => r.gap, render: (r) => fmtN(r.gap) },
    { key: 'pg', label: L('Votos tardios ÷ vantagem', 'Late votes ÷ margin'), num: true, get: (r) => r.pctGap, render: (r) => pct(r.pctGap), csv: (r) => (r.pctGap * 100).toFixed(4) },
  ];

  return (
    <div className="stack">
      <h1 className="page-title">{L('Peso dos votos tardios', 'Weight of the late votes')}</h1>
      <p className="sub">
        {L('Quantos votos entraram depois das 17h nas urnas que fecharam tarde, e quanto isso pesa no 2º turno.',
          'How many votes came in after 5 pm in the urnas that closed late, and how much that weighs in the 2nd round.')}
      </p>

      <Filters data={data} f={f} setF={setF} basico />

      <section className={`peso-veredito ${s.winner}`} role="status" aria-label={L('Resumo', 'Summary')}>
        <p className="pv-lead">
          {L(
            <><strong>{whereLead}</strong>, <strong>{fmtN(s.n)} urnas</strong> fecharam às {T} ou depois. Nelas, <strong>{fmtN(s.va)} votos</strong> foram dados depois das 17h.</>,
            <><strong>{whereLead}</strong>, <strong>{fmtN(s.n)} urnas</strong> closed at {T} or later. In them, <strong>{fmtN(s.va)} votes</strong> were cast after 5 pm.</>,
          )}
        </p>
        <div className="pv-nums">
          <div><span className="pv-big">{pct(s.pctVotes)}</span><span className="pv-cap">{L('de todos os votos do 2º turno', 'of all 2nd-round votes')}</span></div>
          <div><span className="pv-big">{pct(s.pctGap)}</span><span className="pv-cap">{L(`da vantagem de ${W}`, `of ${W}’s margin`)}</span></div>
        </div>
      </section>

      <section aria-label={L('Quatro perspectivas', 'Four perspectives')}>
        <div className="pcards">
          <Card n="1" kicker={L('Das urnas', 'Of the urnas')} big={pct(s.pctSections)}
            bigSub={L(`${fmtN(s.n)} de ${fmtN(s.sections)} urnas`, `${fmtN(s.n)} of ${fmtN(s.sections)} urnas`)} meter={<Meter share={s.pctSections} />}>
            {L(`Quase todas fecharam no horário normal.`, `Almost all closed at the normal time.`)}
          </Card>
          <Card n="2" kicker={L('Dos votos', 'Of the votes')} big={pct(s.pctVotes)}
            bigSub={L(`${fmtN(s.va)} de ${fmtN(s.votes)} votos`, `${fmtN(s.va)} of ${fmtN(s.votes)} votes`)} meter={<Meter share={s.pctVotes} />}>
            {oneIn ? L(`1 voto em cada ${fmtN(oneIn)}.`, `1 vote in every ${fmtN(oneIn)}.`) : '–'}
          </Card>
          <Card n="3" kicker={L(`Da vantagem de ${W}`, `Of ${W}’s margin`)} big={pct(s.pctGap)}
            bigSub={L(`vantagem de ${fmtN(s.gap)} votos`, `margin of ${fmtN(s.gap)} votes`)} meter={<Meter share={s.pctGap} tone={s.winner} />}>
            {left > 0
              ? L(`Sem esses votos, a vantagem ainda seria de ${fmtN(left)}.`, `Without these votes, the margin would still be ${fmtN(left)}.`)
              : L(`Esses votos são maiores que a vantagem de ${W}.`, `These votes are larger than ${W}’s margin.`)}
          </Card>
        </div>
      </section>

      <section className="story" aria-labelledby="cortes">
        <h2 id="cortes">{L('E se o horário de corte mudar?', 'What if the cut-off time changes?')}</h2>
        <div className="tabela-scroll">
          <table>
            <thead><tr>
              <th>{L('Fecharam às… ou depois', 'Closed at… or later')}</th><th className="num">{L('Urnas', 'Urnas')}</th><th className="num">{L('Votos depois das 17h', 'Votes after 5 pm')}</th>
              <th className="num">{L('% dos votos', '% of votes')}</th><th className="num">{L('% da vantagem', '% of the margin')}</th></tr></thead>
            <tbody>
              {cuts.map((r) => (
                <tr key={r.c} className={r.c === f.lim ? 'sel' : ''} onClick={() => setF({ lim: r.c })} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setF({ lim: r.c })}>
                  <td><strong>{fmtHM(r.c)}</strong></td><td className="num">{fmtN(r.n)} <small>({fmtPct(r.pctSections, 2)})</small></td><td className="num">{fmtN(r.va)}</td>
                  <td className="num">{pct(r.pctVotes)}</td><td className="num">{pct(r.pctGap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="story" aria-labelledby="ufs">
        <h2 id="ufs">{L('Por estado', 'By state')}</h2>
        <DataTable rows={rows} columns={columns} csvName={`peso_votos_tardios_${f.lim}.csv`} initialSort={{ key: 'pv', dir: 'desc' }} pageSize={30}
          onRow={(r) => setF({ uf: r.uf })} />
      </section>

      <Note>{L('“Votos depois das 17h” incluem quem já estava na fila às 17h, o que é permitido. Totais do 2º turno: oficiais do TSE. Mede tamanho, não prova irregularidade.',
        '“Votes after 5 pm” include people already in line at 5 pm, which is allowed. 2nd-round totals: official TSE. This measures size; it does not prove irregularity.')}</Note>
    </div>
  );
}

export default function Peso(props) {
  const { L } = useLang();
  if (!props.data.t2) return <p className="aviso">{L('O resultado oficial do 2º turno não foi carregado.', 'The official 2nd-round result could not be loaded.')}</p>;
  return <PesoInner {...props} />;
}
