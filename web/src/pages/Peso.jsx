import { useMemo } from 'react';
import DataTable from '../components/DataTable.jsx';
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

  const chipsAndState = (
    <section className="filtros peso-filtros" aria-label={L('Escolha o recorte', 'Choose the view')}>
      <label>{L('Onde', 'Where')}
        <select value={f.uf} onChange={(e) => setF({ uf: e.target.value, mun: '' })}>
          <option value="">{L('Brasil inteiro', 'Whole country')}</option>
          {data.ufs.filter((u) => data.t2[u]).map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </label>
      <div className="limiar">
        <label htmlFor="lim-peso">{L('Urnas que fecharam às', 'Urnas that closed at')} <strong>{T}</strong> {L('ou depois', 'or later')} <small>({L('Brasília', 'Brasília time')})</small></label>
        <input id="lim-peso" type="range" min={17 * 60 + 30} max={20 * 60} step={5} value={f.lim} onChange={(e) => setF({ lim: Number(e.target.value) })} />
        <div className="chips">
          {CUTS.map((c) => <button key={c} type="button" className={`chip ${f.lim === c ? 'on' : ''}`} onClick={() => setF({ lim: c })}>{fmtHM(c)}</button>)}
        </div>
      </div>
    </section>
  );

  return (
    <div className="stack">
      <h1 className="page-title">{L('Peso dos votos tardios', 'Weight of the late votes')}</h1>
      <p className="sub">
        {L('Quantos votos entraram depois das 17h nas urnas que fecharam tarde, e quanto isso pesa no resultado oficial do 2º turno.',
          'How many votes came in after 5 pm in the urnas that closed late, and how much that weighs in the official 2nd-round result.')}
      </p>

      {chipsAndState}

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
            {L(`Quase todas as urnas fecharam no horário normal. Só estas ficaram abertas até as ${T} ou depois.`,
              `Almost every urna closed at the normal time. Only these stayed open until ${T} or later.`)}
          </Card>
          <Card n="2" kicker={L('Dos votos', 'Of the votes')} big={pct(s.pctVotes)}
            bigSub={L(`${fmtN(s.va)} de ${fmtN(s.votes)} votos`, `${fmtN(s.va)} of ${fmtN(s.votes)} votes`)} meter={<Meter share={s.pctVotes} />}>
            {oneIn ? L(`Cerca de 1 voto em cada ${fmtN(oneIn)} do 2º turno em ${where} foi dado depois das 17h nessas urnas.`,
              `About 1 vote in every ${fmtN(oneIn)} of the 2nd round in ${where} was cast after 5 pm in those urnas.`) : '–'}
          </Card>
          <Card n="3" kicker={L(`Da vantagem de ${W}`, `Of ${W}’s margin`)} big={pct(s.pctGap)}
            bigSub={L(`vantagem de ${fmtN(s.gap)} votos`, `margin of ${fmtN(s.gap)} votes`)} meter={<Meter share={s.pctGap} tone={s.winner} />}>
            {left > 0
              ? L(`Mesmo que todos esses votos fossem de ${W} e desaparecessem, a vantagem ainda seria de ${fmtN(left)} votos.`,
                `Even if all of those votes were ${W}’s and vanished, the margin would still be ${fmtN(left)} votes.`)
              : L(`Esses votos são maiores que a vantagem de ${W} em ${where}.`, `Those votes are larger than ${W}’s margin in ${where}.`)}
          </Card>
          <Card n="4" kicker={L('Estimativa pelo 1º turno', 'Estimate from the 1st round')}
            big={`${s.net >= 0 ? '+' : '−'}${fmtN(Math.abs(s.net))}`}
            bigSub={L(`votos líquidos a favor de ${s.net >= 0 ? 'Lula' : 'Flávio'} (${pct(Math.abs(s.netPctGap))} da vantagem)`, `net votes for ${s.net >= 0 ? 'Lula' : 'Flávio'} (${pct(Math.abs(s.netPctGap))} of the margin)`)}
            meter={<Meter share={Math.abs(s.netPctGap)} tone={s.net >= 0 ? 'lula' : 'flavio'} />}>
            {L(`Suposição: quem votou tarde votou como a própria seção no 1º turno (Lula ${pct(s.shareL)} × Flávio ${pct(s.shareF)} dos votos válidos nessas urnas). É uma estimativa, não um dado.`,
              `Assumption: late voters voted like their own section did in the 1st round (Lula ${pct(s.shareL)} × Flávio ${pct(s.shareF)} of the valid votes in those urnas). It is an estimate, not data.`)}
          </Card>
        </div>
      </section>

      <section className="story" aria-labelledby="escala">
        <h2 id="escala">{L('Na mesma escala', 'On the same scale')}</h2>
        <ol className="escala-barras">
          {[
            [L(`Votos do 2º turno em ${where}`, `2nd-round votes in ${where}`), s.votes, 1, 'neutro'],
            [L(`Vantagem de ${W}`, `${W}’s margin`), s.gap, s.gap / s.votes, s.winner],
            [L('Votos depois das 17h nessas urnas', 'Votes after 5 pm in those urnas'), s.va, s.va / s.votes, 'fecha'],
          ].map(([label, v, share, tone]) => (
            <li key={label}>
              <div className="eb-top"><span>{label}</span><b>{fmtN(v)}</b></div>
              <div className="eb-track"><i className={tone} style={{ width: `${Math.max(share * 100, 0.4)}%` }} /></div>
            </li>
          ))}
        </ol>
        <Note>{L('As três barras usam a mesma régua. A última é fina porque o número é pequeno perto das outras, não porque o gráfico esteja cortado.',
          'All three bars use the same ruler. The last one is thin because the number is small next to the others, not because the chart is cut.')}</Note>
      </section>

      <section className="story" aria-labelledby="cortes">
        <h2 id="cortes">{L('E se o horário de corte mudar?', 'What if the cut-off time changes?')}</h2>
        <p className="story-intro">{L(`Cada linha conta as urnas que fecharam naquele horário ou depois (${where}). Clique numa linha para usar esse horário.`,
          `Each row counts the urnas that closed at that time or later (${where}). Click a row to use that time.`)}</p>
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
        <p className="story-intro">{L(`Estados com urnas fechadas às ${T} ou depois. O peso é medido contra os votos e a vantagem do próprio estado. Clique numa linha para ver só esse estado.`,
          `States with urnas closed at ${T} or later. The weight is measured against the state’s own votes and margin. Click a row to see only that state.`)}</p>
        <DataTable rows={rows} columns={columns} csvName={`peso_votos_tardios_${f.lim}.csv`} initialSort={{ key: 'pv', dir: 'desc' }} pageSize={30}
          onRow={(r) => setF({ uf: r.uf })} />
      </section>

      <Note>
        {L(
          <>“Votos depois das 17h” são os votos que a urna registrou a partir das 17h (horário de Brasília) nas urnas que fecharam no horário escolhido. Incluem eleitores que já estavam na fila às 17h, que podem votar normalmente. Os totais do 2º turno (votos, Lula, Flávio) são os oficiais do TSE e incluem o exterior; “votos” é o comparecimento, com brancos e nulos, como nos logs. Esta página mede tamanho, não prova irregularidade.</>,
          <>“Votes after 5 pm” are the votes the urna recorded from 5 pm (Brasília time) on, in the urnas that closed at the chosen time. They include voters who were already in line at 5 pm, who may vote normally. The 2nd-round totals (votes, Lula, Flávio) are the official TSE figures and include the overseas vote; “votes” is the turnout, with blank and null votes, as in the logs. This page measures size; it does not prove any irregularity.</>,
        )}
      </Note>
    </div>
  );
}

export default function Peso(props) {
  const { L } = useLang();
  if (!props.data.t2) return <p className="aviso">{L('O resultado oficial do 2º turno não foi carregado.', 'The official 2nd-round result could not be loaded.')}</p>;
  return <PesoInner {...props} />;
}
