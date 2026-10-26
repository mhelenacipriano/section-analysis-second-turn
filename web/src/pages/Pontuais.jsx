import { useMemo } from 'react';
import DataTable from '../components/DataTable.jsx';
import MissingVotesReport from '../components/MissingVotesReport.jsx';
import OnTimeMap, { winnerName } from '../components/OnTimeMap.jsx';
import { Legend, Note, Stat } from '../components/ui.jsx';
import { useLang } from '../i18n.jsx';
import { fmtN, fmtPct } from '../format.js';
import { onTimeByState } from '../stats.js';

export default function Pontuais({ data, go, themeKey }) {
  const { L } = useLang();
  const W = (k) => winnerName(k, L);
  const rows = useMemo(() => onTimeByState(data).sort((a, b) => b.pct - a.pct), [data]);

  const all = rows.reduce((a, r) => ({ n: a.n + r.n, on: a.on + r.on.n }), { n: 0, on: 0 });
  const best = rows[0], worst = rows[rows.length - 1];
  const wins = { lula: rows.filter((r) => r.winner === 'lula').length, flavio: rows.filter((r) => r.winner === 'flavio').length };
  const top = rows.slice(0, 10);

  const columns = [
    { key: 'uf', label: L('UF', 'State'), get: (r) => r.uf },
    { key: 'pct', label: L('Seções encerradas no horário', 'Sections closed on time'), num: true, get: (r) => r.pct, render: (r) => fmtPct(r.pct, 2), csv: (r) => (r.pct * 100).toFixed(3) },
    { key: 'on', label: L('No horário', 'On time'), num: true, get: (r) => r.on.n, render: (r) => fmtN(r.on.n) },
    { key: 'n', label: L('Seções analisadas', 'Sections analysed'), num: true, get: (r) => r.n, render: (r) => fmtN(r.n) },
    { key: 'late', label: L('Encerradas depois das 17h30', 'Closed after 17:30'), num: true, get: (r) => r.late, render: (r) => fmtN(r.late) },
    { key: 'w', label: L('Venceu no estado (1º turno)', 'Won the state (1st round)'), get: (r) => W(r.winner), render: (r) => <span className={`chip-venc ${r.winner}`}>{W(r.winner)}</span> },
    { key: 'l', label: L('Lula, % válidos', 'Lula, % of valid votes'), num: true, get: (r) => r.lulaShare, render: (r) => fmtPct(r.lulaShare), csv: (r) => r.lulaShare?.toFixed(4) },
    { key: 'f', label: L('Flávio, % válidos', 'Flávio, % of valid votes'), num: true, get: (r) => r.flavioShare, render: (r) => fmtPct(r.flavioShare), csv: (r) => r.flavioShare?.toFixed(4) },
    { key: 'ol', label: L('Seções no horário vencidas por Lula', 'On-time sections won by Lula'), num: true, get: (r) => r.on.wl, render: (r) => fmtN(r.on.wl) },
    { key: 'of', label: L('Seções no horário vencidas por Flávio', 'On-time sections won by Flávio'), num: true, get: (r) => r.on.wf, render: (r) => fmtN(r.on.wf) },
  ];

  return (
    <div className="stack">
      <h1 className="page-title">{L('Estados em que mais seções fecharam às 17h', 'States where the most sections closed at 5 pm')}</h1>
      <p className="sub">
        {L(
          <>Contamos as seções que <strong>não</strong> ficaram abertas até mais tarde: a urna confirmou o encerramento antes das 17h30 (Brasília), o horário normal. Nenhuma seção fechou antes das 17h. E quem venceu cada estado no 1º turno.</>,
          <>We count the sections that did <strong>not</strong> stay open later: the urna confirmed closing before 17:30 (Brasília time), the normal time. No section closed before 17:00. And who won each state in the 1st round.</>,
        )}
      </p>

      <div className="stats">
        <Stat k={L('Seções que fecharam no horário (antes das 17h30)', 'Sections closed on time (before 17:30)')} v={fmtPct(all.n ? all.on / all.n : 0, 2)} sub={L(`todas as seções dos ${rows.length} estados com dados, juntas`, `all sections of the ${rows.length} states with data, together`)} />
        {best && <Stat k={L('Maior percentual', 'Highest share')} v={`${best.uf} ${fmtPct(best.pct, 2)}`} sub={`${L('venceu', 'won by')}: ${W(best.winner)}`} />}
        {worst && <Stat k={L('Menor percentual', 'Lowest share')} v={`${worst.uf} ${fmtPct(worst.pct, 2)}`} sub={`${L('venceu', 'won by')}: ${W(worst.winner)}`} />}
        <Stat k={L('Estados vencidos no 1º turno', 'States won in the 1st round')} v={`Lula ${wins.lula} · Flávio ${wins.flavio}`} sub={L('entre os estados com dados', 'among the states with data')} />
      </div>

      <section className="story" aria-labelledby="mp">
        <h2 id="mp">{L('Mapa: cor = quem venceu o estado, número = % das seções que fecharam no horário', 'Map: colour = who won the state, number = % of sections that closed on time')}</h2>
        <OnTimeMap data={data} go={go} themeKey={themeKey} />
      </section>

      <MissingVotesReport data={data} />

      <section className="story" aria-labelledby="rk">
        <h2 id="rk">{L('Os 10 estados com maior porcentagem de seções que fecharam no horário (sem ficar abertas até mais tarde)', 'The 10 states with the highest share of sections that closed on time (without staying open later)')}</h2>
        <ol className="rank-bars">
          {top.map((r) => (
            <li key={r.uf}>
              <span className="rb-uf">{r.uf}</span>
              <span className="rb-track" role="img" aria-label={L(`${r.uf}: ${fmtPct(r.pct, 2)} das seções no horário; venceu ${W(r.winner)}`, `${r.uf}: ${fmtPct(r.pct, 2)} of sections on time; won by ${W(r.winner)}`)}>
                <span className={`rb-fill ${r.winner}`} style={{ width: `${r.pct * 100}%` }}><b>{fmtPct(r.pct, 2)}</b> · {W(r.winner)}</span>
              </span>
            </li>
          ))}
        </ol>
        <Legend />
        <Note>{L(
          'Ranking só por porcentagem (parcela das seções de cada estado que fechou no horário), não por número de seções. As barras começam em 0%: a diferença entre os estados é pequena, por isso os percentuais têm duas casas decimais.',
          'Ranking by percentage only (the share of each state’s sections that closed on time), not by number of sections. Bars start at 0%: the differences between states are small, which is why percentages have two decimals.',
        )}</Note>
      </section>

      <section className="story" aria-labelledby="tb">
        <h2 id="tb">{L('Todos os estados', 'All states')}</h2>
        <DataTable rows={rows} columns={columns} csvName="estados_encerradas_no_horario.csv" initialSort={{ key: 'pct', dir: 'desc' }} pageSize={30}
          onRow={(r) => go('/mapa', { uf: r.uf })} />
        <Note>{L(
          '“No horário” = o log da urna confirma o encerramento antes das 17h30 (Brasília). Seções sem registro de encerramento não contam como “no horário”, mas entram no total.',
          '“On time” = the urna log confirms closing before 17:30 (Brasília time). Sections with no closing record do not count as “on time” but are part of the total.',
        )}</Note>
      </section>
    </div>
  );
}
