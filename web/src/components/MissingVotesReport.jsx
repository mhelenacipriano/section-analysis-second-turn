import { useMemo, useState } from 'react';
import DataTable from './DataTable.jsx';
import { Note } from './ui.jsx';
import { useLang } from '../i18n.jsx';
import { fmtHM, fmtN, fmtPct } from '../format.js';
import { LIM_MIN, earlyByState, groups, zero } from '../stats.js';

const CUTS = [17 * 60 + 30, 18 * 60, 18 * 60 + 30, 18 * 60 + 50, 19 * 60];
const million = (n, lang) => `${(n / 1e6).toLocaleString(lang === 'en' ? 'en-US' : 'pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${lang === 'en' ? ' million' : ' milhões'}`;

/**
 * Plain answer to "which candidate was most affected by the sections that closed at that time?".
 * "Affected" = whoever has more votes in those sections: if something had kept part of the voters of
 * those sections from voting, that candidate would lose more votes (the missing voters are assumed to
 * vote like the others in the same section; 1st-round result by section).
 */
export default function MissingVotesReport({ data }) {
  const { L, lang } = useLang();
  const [cut, setCut] = useState(LIM_MIN);                // "sections closed BEFORE this time"
  const T = fmtHM(cut);

  const states = useMemo(() => earlyByState(data, cut), [data, cut]);
  const early = useMemo(() => {
    const c = zero();
    for (const s of states) for (const k of Object.keys(c)) c[k] += s.early[k];
    return c;
  }, [states]);
  const late = useMemo(() => groups(data, { uf: '', mun: '', alt: '', venc: '', lim: cut }).atT, [data, cut]);

  const perL = early.cp ? (early.vl / early.cp) * 1000 : 0;       // votes lost per 1,000 voters who could not vote
  const perF = early.cp ? (early.vf / early.cp) * 1000 : 0;
  const more = perL === perF ? 'empate' : perL > perF ? 'lula' : 'flavio';
  const name = (k) => (k === 'lula' ? 'Lula' : 'Flávio Bolsonaro');
  const other = more === 'lula' ? 'flavio' : 'lula';
  const vMore = more === 'lula' ? early.vl : early.vf, vOther = more === 'lula' ? early.vf : early.vl;
  const valid = early.vl + early.vf + early.vo;

  const rows = useMemo(() => states.map((s) => {
    const v = s.early.vl + s.early.vf + s.early.vo;
    const m = s.early.vl > s.early.vf ? 'lula' : s.early.vf > s.early.vl ? 'flavio' : 'empate';
    return { uf: s.uf, n: s.early.n, vl: s.early.vl, vf: s.early.vf, ls: v ? s.early.vl / v : null, fs: v ? s.early.vf / v : null, more: m };
  }), [states]);
  const lulaStates = rows.filter((r) => r.more === 'lula').length;
  const flavioStates = rows.filter((r) => r.more === 'flavio').length;

  const columns = [
    { key: 'uf', label: L('UF', 'State'), get: (r) => r.uf },
    { key: 'n', label: L('Seções encerradas antes do horário', 'Sections closed before the time'), num: true, get: (r) => r.n, render: (r) => fmtN(r.n) },
    { key: 'vl', label: L('Votos de Lula nelas', 'Lula votes in them'), num: true, get: (r) => r.vl, render: (r) => fmtN(r.vl) },
    { key: 'vf', label: L('Votos de Flávio nelas', 'Flávio votes in them'), num: true, get: (r) => r.vf, render: (r) => fmtN(r.vf) },
    { key: 'ls', label: L('Lula, % válidos', 'Lula, % of valid votes'), num: true, get: (r) => r.ls, render: (r) => fmtPct(r.ls), csv: (r) => r.ls?.toFixed(4) },
    { key: 'fs', label: L('Flávio, % válidos', 'Flávio, % of valid votes'), num: true, get: (r) => r.fs, render: (r) => fmtPct(r.fs), csv: (r) => r.fs?.toFixed(4) },
    { key: 'm', label: L('Mais afetado', 'More affected'), get: (r) => (r.more === 'empate' ? '–' : name(r.more)), render: (r) => (r.more === 'empate' ? '–' : <span className={`chip-venc ${r.more}`}>{name(r.more)}</span>) },
  ];

  return (
    <section className="story" id="relatorio-votos" aria-labelledby="mv">
      <h2 id="mv">{L('Qual candidato foi mais afetado?', 'Which candidate was most affected?')}</h2>

      <div className="chips-linha">
        <span className="note">{L('Seções que fecharam antes das', 'Sections that closed before')}</span>
        {CUTS.map((c) => <button key={c} type="button" className={`chip ${cut === c ? 'on' : ''}`} onClick={() => setCut(c)}>{fmtHM(c)}</button>)}
        <span className="note">({L('horário de Brasília', 'Brasília time')})</span>
      </div>

      <div className={`veredito ${more}`} role="status">
        <div className="veredito-k">{L(`Mais afetado nas seções encerradas antes das ${T}`, `Most affected in the sections closed before ${T}`)}</div>
        <div className="veredito-v">{more === 'empate' ? L('Os dois por igual', 'Both equally') : name(more)}</div>
      </div>

      <ul className="passos">
        <li>
          {L(
            <><strong>{fmtN(early.n)} seções</strong> fecharam antes das {T}. Nelas, <strong>{name(more)}</strong> teve <strong>{million(vMore, lang)} de votos</strong> e <strong>{name(other)}</strong> teve {million(vOther, lang)} ({fmtPct(vMore / valid)} contra {fmtPct(vOther / valid)} dos votos válidos, 1º turno).</>,
            <><strong>{fmtN(early.n)} sections</strong> closed before {T}. In them, <strong>{name(more)}</strong> had <strong>{million(vMore, lang)} votes</strong> and <strong>{name(other)}</strong> had {million(vOther, lang)} ({fmtPct(vMore / valid)} versus {fmtPct(vOther / valid)} of the valid votes, 1st round).</>,
          )}
        </li>
        <li>
          {L(
            <>Se algo tivesse impedido parte dos eleitores dessas seções de votar, <strong>{name(more)} perderia mais votos</strong>, porque tinha mais votos ali. Para cada <strong>1.000 eleitores</strong> que deixassem de votar: Lula perderia cerca de <strong>{fmtN(perL)}</strong> votos e Flávio cerca de <strong>{fmtN(perF)}</strong>.</>,
            <>If something had kept some of the voters in those sections from voting, <strong>{name(more)} would lose more votes</strong>, because they had more votes there. For every <strong>1,000 voters</strong> who did not vote: Lula would lose about <strong>{fmtN(perL)}</strong> votes and Flávio about <strong>{fmtN(perF)}</strong>.</>,
          )}
        </li>
        <li>
          {L(
            <>Por estado: <strong>Flávio</strong> seria o mais afetado em <strong>{flavioStates}</strong> estados e <strong>Lula</strong> em <strong>{lulaStates}</strong>.</>,
            <>By state: <strong>Flávio</strong> would be the more affected in <strong>{flavioStates}</strong> states and <strong>Lula</strong> in <strong>{lulaStates}</strong>.</>,
          )}
        </li>
        <li className="passo-outro">
          {L(
            <>Já as <strong>{fmtN(late.n)} seções</strong> que ficaram abertas até as {T} ou depois: Lula venceu {fmtN(late.wl)} e Flávio {fmtN(late.wf)} no 1º turno.</>,
            <>As for the <strong>{fmtN(late.n)} sections</strong> that stayed open until {T} or later: Lula won {fmtN(late.wl)} and Flávio {fmtN(late.wf)} in the 1st round.</>,
          )}
        </li>
      </ul>

      <Note>
        {L(
          'Isto é um cenário hipotético, não um fato: os dados não mostram votos faltantes. “Mais afetado” = quem tem mais votos nessas seções, supondo que os eleitores que faltassem votariam como os demais da mesma seção. Usamos o resultado do 1º turno por seção (não temos o do 2º). Os dois candidatos perdem a mesma fração dos seus votos ali; a diferença vem só de quem tinha mais votos.',
          'This is a hypothetical scenario, not a fact: the data do not show any missing votes. “Most affected” = who has more votes in those sections, assuming the missing voters would have voted like the others in the same section. We use the 1st-round result by section (we do not have the 2nd round). Both candidates lose the same fraction of their votes there; the difference only reflects who had more votes.',
        )}
      </Note>

      <details className="detalhes-estado">
        <summary>{L('Ver por estado', 'See by state')}</summary>
        <DataTable rows={rows} columns={columns} csvName={`mais_afetado_por_estado_${cut}.csv`} initialSort={{ key: 'n', dir: 'desc' }} pageSize={15} />
      </details>
    </section>
  );
}
