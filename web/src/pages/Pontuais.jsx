import { useMemo } from 'react';
import DataTable from '../components/DataTable.jsx';
import OnTimeMap, { WINNER } from '../components/OnTimeMap.jsx';
import { Legend, Note, Stat } from '../components/ui.jsx';
import { fmtN, fmtPct } from '../format.js';
import { CAT_LABEL, onTimeByState } from '../stats.js';

export default function Pontuais({ data, go, themeKey }) {
  const rows = useMemo(() => onTimeByState(data).sort((a, b) => b.pct - a.pct), [data]);
  const byUf = useMemo(() => new Map(rows.map((r) => [r.uf, r])), [rows]);

  const all = rows.reduce((a, r) => ({ n: a.n + r.n, on: a.on + r.on.n }), { n: 0, on: 0 });
  const best = rows[0], worst = rows[rows.length - 1];
  const wins = { lula: rows.filter((r) => r.winner === 'lula').length, flavio: rows.filter((r) => r.winner === 'flavio').length };
  const top = rows.slice(0, 10);

  const columns = [
    { key: 'uf', label: 'UF', get: (r) => r.uf },
    { key: 'pct', label: 'Seções encerradas no horário', num: true, get: (r) => r.pct, render: (r) => fmtPct(r.pct, 2), csv: (r) => (r.pct * 100).toFixed(3) },
    { key: 'on', label: 'No horário', num: true, get: (r) => r.on.n, render: (r) => fmtN(r.on.n) },
    { key: 'n', label: 'Seções analisadas', num: true, get: (r) => r.n, render: (r) => fmtN(r.n) },
    { key: 'late', label: 'Encerradas depois das 17h30', num: true, get: (r) => r.late, render: (r) => fmtN(r.late) },
    { key: 'w', label: 'Venceu no estado (1º turno)', get: (r) => WINNER[r.winner], render: (r) => <span className={`chip-venc ${r.winner}`}>{WINNER[r.winner]}</span> },
    { key: 'l', label: 'Lula, % válidos', num: true, get: (r) => r.lulaShare, render: (r) => fmtPct(r.lulaShare), csv: (r) => r.lulaShare?.toFixed(4) },
    { key: 'f', label: 'Flávio, % válidos', num: true, get: (r) => r.flavioShare, render: (r) => fmtPct(r.flavioShare), csv: (r) => r.flavioShare?.toFixed(4) },
    { key: 'ol', label: 'Seções no horário vencidas por Lula', num: true, get: (r) => r.on.wl, render: (r) => fmtN(r.on.wl) },
    { key: 'of', label: 'Seções no horário vencidas por Flávio', num: true, get: (r) => r.on.wf, render: (r) => fmtN(r.on.wf) },
  ];

  return (
    <div className="stack">
      <h1 className="page-title">Estados em que mais seções fecharam às 17h</h1>
      <p className="sub">Contamos as seções que <strong>não</strong> ficaram abertas até mais tarde: a urna confirmou o encerramento antes das 17h30 (Brasília), o horário normal. Nenhuma seção fechou antes das 17h. E quem venceu cada estado no 1º turno.</p>

      <div className="stats">
        <Stat k="Seções que fecharam no horário (antes das 17h30)" v={fmtPct(all.n ? all.on / all.n : 0, 2)} sub={`todas as seções dos ${rows.length} estados com dados, juntas`} />
        {best && <Stat k="Maior percentual" v={`${best.uf} ${fmtPct(best.pct, 2)}`} sub={`venceu: ${WINNER[best.winner]}`} />}
        {worst && <Stat k="Menor percentual" v={`${worst.uf} ${fmtPct(worst.pct, 2)}`} sub={`venceu: ${WINNER[worst.winner]}`} />}
        <Stat k="Estados vencidos no 1º turno" v={`Lula ${wins.lula} · Flávio ${wins.flavio}`} sub="entre os estados com dados" />
      </div>

      <section className="story" aria-labelledby="mp">
        <h2 id="mp">Mapa: cor = quem venceu o estado, número = % das seções que fecharam no horário</h2>
        <OnTimeMap data={data} go={go} themeKey={themeKey} />
      </section>

      <section className="story" aria-labelledby="rk">
        <h2 id="rk">Os 10 estados com maior porcentagem de seções que fecharam no horário (sem ficar abertas até mais tarde)</h2>
        <ol className="rank-bars">
          {top.map((r) => (
            <li key={r.uf}>
              <span className="rb-uf">{r.uf}</span>
              <span className="rb-track" role="img" aria-label={`${r.uf}: ${fmtPct(r.pct, 2)} das seções no horário; venceu ${WINNER[r.winner]}`}>
                <span className={`rb-fill ${r.winner}`} style={{ width: `${r.pct * 100}%` }}><b>{fmtPct(r.pct, 2)}</b> · {CAT_LABEL[r.winner] || WINNER[r.winner]}</span>
              </span>
            </li>
          ))}
        </ol>
        <Legend />
        <Note>Ranking só por porcentagem (parcela das seções de cada estado que fechou no horário), não por número de seções. As barras começam em 0%: a diferença entre os estados é pequena, por isso os percentuais têm duas casas decimais.</Note>
      </section>

      <section className="story" aria-labelledby="tb">
        <h2 id="tb">Todos os estados</h2>
        <DataTable rows={rows} columns={columns} csvName="estados_encerradas_no_horario.csv" initialSort={{ key: 'pct', dir: 'desc' }} pageSize={30}
          onRow={(r) => go('/mapa', { uf: r.uf })} />
        <Note>“No horário” = o log da urna confirma o encerramento antes das 17h30 (Brasília). Seções sem registro de encerramento não contam como “no horário”, mas entram no total.</Note>
      </section>
    </div>
  );
}
