import { useMemo, useState } from 'react';
import DataTable from './DataTable.jsx';
import { Note, Stat } from './ui.jsx';
import { useLang } from '../i18n.jsx';
import { fmtDec, fmtHM, fmtN, fmtPct } from '../format.js';
import { LIM_MIN, earlyByState, missingScenario, zero } from '../stats.js';

const CUTS = [17 * 60 + 30, 18 * 60, 18 * 60 + 30, 18 * 60 + 50, 19 * 60];

/** Hypothetical report: which candidate would be more affected if votes were missing in the sections that closed early. */
export default function MissingVotesReport({ data }) {
  const { L } = useLang();
  const [cut, setCut] = useState(LIM_MIN);       // sections closed BEFORE this time
  const [pct, setPct] = useState(1);              // % of the voters who turned out there that could not vote
  const p = pct / 100;

  const states = useMemo(() => earlyByState(data, cut), [data, cut]);
  const total = useMemo(() => {
    const c = zero();
    for (const s of states) for (const k of Object.keys(c)) c[k] += s.early[k];
    return c;
  }, [states]);
  const sc = missingScenario(total, p);
  const who = (k) => (k === 'lula' ? 'Lula' : k === 'flavio' ? 'Flávio Bolsonaro' : L('nenhum dos dois', 'neither'));
  const other = (k) => (k === 'lula' ? 'Flávio Bolsonaro' : 'Lula');
  const T = fmtHM(cut);
  const valid = total.vl + total.vf + total.vo;

  const rows = useMemo(() => states.map((s) => {
    const r = missingScenario(s.early, p);
    const v = s.early.vl + s.early.vf + s.early.vo;
    return { uf: s.uf, n: s.early.n, vl: s.early.vl, vf: s.early.vf, ls: v ? s.early.vl / v : null, fs: v ? s.early.vf / v : null, ...r };
  }), [states, p]);
  const lulaMore = rows.filter((r) => r.more === 'lula').length;
  const flavioMore = rows.filter((r) => r.more === 'flavio').length;

  const columns = [
    { key: 'uf', label: L('UF', 'State'), get: (r) => r.uf },
    { key: 'n', label: L('Seções encerradas antes do corte', 'Sections closed before the cut'), num: true, get: (r) => r.n, render: (r) => fmtN(r.n) },
    { key: 'vl', label: L('Votos de Lula nessas seções (1º turno)', 'Lula votes in those sections (1st round)'), num: true, get: (r) => r.vl, render: (r) => fmtN(r.vl) },
    { key: 'vf', label: L('Votos de Flávio nessas seções (1º turno)', 'Flávio votes in those sections (1st round)'), num: true, get: (r) => r.vf, render: (r) => fmtN(r.vf) },
    { key: 'ls', label: L('Lula, % válidos', 'Lula, % of valid votes'), num: true, get: (r) => r.ls, render: (r) => fmtPct(r.ls), csv: (r) => r.ls?.toFixed(4) },
    { key: 'fs', label: L('Flávio, % válidos', 'Flávio, % of valid votes'), num: true, get: (r) => r.fs, render: (r) => fmtPct(r.fs), csv: (r) => r.fs?.toFixed(4) },
    { key: 'll', label: L('Perda esperada de Lula (votos)', 'Expected Lula loss (votes)'), num: true, get: (r) => r.lossL, render: (r) => fmtN(r.lossL), csv: (r) => r.lossL.toFixed(1) },
    { key: 'lf', label: L('Perda esperada de Flávio (votos)', 'Expected Flávio loss (votes)'), num: true, get: (r) => r.lossF, render: (r) => fmtN(r.lossF), csv: (r) => r.lossF.toFixed(1) },
    { key: 'm', label: L('Mais afetado', 'More affected'), get: (r) => who(r.more), render: (r) => <span className={`chip-venc ${r.more === 'lula' ? 'lula' : r.more === 'flavio' ? 'flavio' : 'outros'}`}>{who(r.more)}</span> },
  ];

  return (
    <section className="story" id="relatorio-votos" aria-labelledby="mv">
      <h2 id="mv">{L('E se faltassem votos nas seções que fecharam cedo?', 'What if votes were missing in the sections that closed early?')}</h2>
      <p className="story-intro">
        {L(
          <>Os dados <strong>não indicam</strong> votos faltantes: isto é um cenário hipotético. Ele supõe que uma parte dos eleitores que compareceram nas seções encerradas antes do horário escolhido <em>não conseguiu votar</em>, e que esses eleitores teriam votado como os demais da mesma seção. Como só temos o resultado por seção do <strong>1º turno</strong>, usamos ele como aproximação. Nesse caso cada candidato perde votos na proporção dos votos que teve nessas seções.</>,
          <>The data <strong>do not indicate</strong> any missing votes: this is a hypothetical scenario. It assumes that some of the voters who turned out in sections that closed before the chosen time <em>could not vote</em>, and that they would have voted like the others in the same section. We only have the <strong>1st-round</strong> result by section, so we use it as an approximation. Each candidate then loses votes in proportion to the votes they had in those sections.</>,
        )}
      </p>

      <div className="filtros" aria-label={L('Parâmetros do cenário', 'Scenario settings')}>
        <div className="limiar">
          <label htmlFor="cut">{L('Seções encerradas antes das', 'Sections closed before')} <strong>{T}</strong> <small>({L('Brasília', 'Brasília time')})</small></label>
          <div className="chips">
            {CUTS.map((c) => <button key={c} type="button" className={`chip ${cut === c ? 'on' : ''}`} onClick={() => setCut(c)}>{fmtHM(c)}</button>)}
          </div>
        </div>
        <div className="limiar">
          <label htmlFor="mvp">{L('Eleitores que compareceram e não conseguiram votar', 'Voters who turned out but could not vote')}: <strong>{fmtDec(pct, 1)}%</strong></label>
          <input id="mvp" type="range" min="0.1" max="5" step="0.1" value={pct} onChange={(e) => setPct(Number(e.target.value))} />
        </div>
      </div>

      <div className="stats">
        <Stat k={L(`Seções encerradas antes das ${T}`, `Sections closed before ${T}`)} v={fmtN(total.n)} sub={L(`${fmtN(total.cp)} eleitores compareceram`, `${fmtN(total.cp)} voters turned out`)} />
        <Stat k={L('Perda esperada de Lula', 'Expected loss for Lula')} v={`−${fmtN(sc.lossL)}`} sub={L(`de ${fmtN(total.vl)} votos nessas seções`, `out of ${fmtN(total.vl)} votes in those sections`)} />
        <Stat k={L('Perda esperada de Flávio Bolsonaro', 'Expected loss for Flávio Bolsonaro')} v={`−${fmtN(sc.lossF)}`} sub={L(`de ${fmtN(total.vf)} votos nessas seções`, `out of ${fmtN(total.vf)} votes in those sections`)} />
        <Stat k={L('Mais afetado em votos absolutos', 'More affected in absolute votes')} v={who(sc.more)} sub={sc.more === 'empate' ? '' : L(`a margem entre os dois encolhe ${fmtN(Math.abs(sc.marginEffect))} votos a favor de ${other(sc.more)}`, `the gap between them shrinks by ${fmtN(Math.abs(sc.marginEffect))} votes in favour of ${other(sc.more)}`)} />
      </div>

      <p className="leitura">
        {sc.more === 'empate'
          ? L('Os dois teriam a mesma perda.', 'Both would lose the same.')
          : L(
            <>Se {fmtDec(pct, 1)}% dos eleitores dessas {fmtN(total.n)} seções não tivessem conseguido votar, <strong>{who(sc.more)}</strong> seria o mais afetado em votos absolutos: teve {fmtN(sc.more === 'lula' ? total.vl : total.vf)} votos nelas, contra {fmtN(sc.more === 'lula' ? total.vf : total.vl)} de {other(sc.more)} ({fmtPct(sc.more === 'lula' ? total.vl / valid : total.vf / valid)} contra {fmtPct(sc.more === 'lula' ? total.vf / valid : total.vl / valid)} dos votos válidos). Em termos relativos os dois perdem a <em>mesma</em> fração ({fmtDec(pct, 1)}% dos seus votos nessas seções), por isso a diferença vem só de quem tinha mais votos ali.</>,
            <>If {fmtDec(pct, 1)}% of the voters in those {fmtN(total.n)} sections had been unable to vote, <strong>{who(sc.more)}</strong> would be more affected in absolute votes: they had {fmtN(sc.more === 'lula' ? total.vl : total.vf)} votes there, against {fmtN(sc.more === 'lula' ? total.vf : total.vl)} for {other(sc.more)} ({fmtPct(sc.more === 'lula' ? total.vl / valid : total.vf / valid)} versus {fmtPct(sc.more === 'lula' ? total.vf / valid : total.vl / valid)} of the valid votes). In relative terms both lose the <em>same</em> fraction ({fmtDec(pct, 1)}% of their votes in those sections), so the difference only reflects who had more votes there.</>,
          )}
        {' '}{L(`Por estado, Lula seria o mais afetado em ${lulaMore} e Flávio em ${flavioMore}.`, `By state, Lula would be the more affected in ${lulaMore} and Flávio in ${flavioMore}.`)}
      </p>

      <DataTable rows={rows} columns={columns} csvName={`votos_faltantes_cenario_${cut}.csv`} initialSort={{ key: 'n', dir: 'desc' }} pageSize={15} />
      <Note>
        {L(
          'Cenário ilustrativo, não previsão: usa o resultado do 1º turno por seção, supõe que os eleitores que faltassem votariam como os demais da mesma seção e não inclui nenhuma informação sobre o 2º turno nem sobre a causa do fechamento. “Fecharam cedo” = a urna confirmou o encerramento antes do horário escolhido; seções sem registro de encerramento ficam de fora.',
          'Illustrative scenario, not a forecast: it uses the 1st-round result by section, assumes the missing voters would have voted like the others in the same section, and contains no information about the 2nd round or about why a section closed when it did. “Closed early” = the urna confirmed closing before the chosen time; sections with no closing record are left out.',
        )}
      </Note>
    </section>
  );
}
