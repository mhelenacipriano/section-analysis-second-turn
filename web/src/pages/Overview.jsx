import { useMemo } from 'react';
import { Filters } from '../components/Filters.jsx';
import { StackBar } from '../components/ui.jsx';
import { useLang } from '../i18n.jsx';
import { fmtHM, fmtN, fmtPct } from '../format.js';
import { groups, pesoTardio } from '../stats.js';

const pct = (x) => fmtPct(x, x < 0.0001 ? 4 : x < 0.01 ? 3 : 2);

export default function Overview({ data, f, setF, go }) {
  const { L } = useLang();
  const T = fmtHM(f.lim);
  const g = useMemo(() => groups(data, { ...f, mun: '', alt: '' }), [data, f]);
  const { scope: s } = useMemo(() => pesoTardio(data, f.lim, f.uf), [data, f.lim, f.uf]);
  const a = g.atT;
  const where = f.uf || L('no país', 'in the country');
  const pending = Object.values(data.meta.ufs).some((c) => c.t1 && c.scanned < c.t1);
  const W = s.winner === 'lula' ? 'Lula' : 'Flávio';

  return (
    <div className="stack">
      <header className="hero">
        <p className="eyebrow">{L('2º turno de 2026 · 25 de outubro', '2026 runoff · October 25')}</p>
        <h1>{L('Quantas urnas fecharam por volta das 19h?', 'How many urnas closed around 7 pm?')}</h1>
        <p className="hero-sub">
          {L(`Seções cuja urna confirmou o encerramento às ${T} ou depois (horário de Brasília), e como elas votaram no 1º turno.`,
            `Sections whose urna confirmed closing at ${T} or later (Brasília time), and how they voted in the 1st round.`)}
        </p>
      </header>

      <Filters data={data} f={f} setF={setF} basico />

      {a.n === 0 ? (
        <p className="empty">{L(`Nenhuma seção fechou às ${T} ou depois ${where}. Escolha um horário mais cedo.`, `No section closed at ${T} or later ${where}. Pick an earlier time.`)}</p>
      ) : (
        <div className="pcards">
          <article className="pcard">
            <header><span className="pcard-n">1</span><span className="pcard-k">{L('Seções', 'Sections')}</span></header>
            <div className="pcard-v">{fmtN(a.n)}</div>
            <div className="pcard-s">{L(`fecharam às ${T} ou depois`, `closed at ${T} or later`)}</div>
            <p className="pcard-t">{L(`${fmtPct(a.n / g.total.n, 2)} das ${fmtN(g.total.n)} seções analisadas.`, `${fmtPct(a.n / g.total.n, 2)} of the ${fmtN(g.total.n)} sections analysed.`)}</p>
          </article>

          <article className="pcard">
            <header><span className="pcard-n">2</span><span className="pcard-k">{L('Quem venceu nelas (1º turno)', 'Who won them (1st round)')}</span></header>
            <div className="pcard-v">{a.wl >= a.wf ? 'Lula' : 'Flávio'} <small>{fmtN(Math.max(a.wl, a.wf))}</small></div>
            <div className="pcard-s">{L(`contra ${fmtN(Math.min(a.wl, a.wf))} de ${a.wl >= a.wf ? 'Flávio' : 'Lula'}`, `against ${fmtN(Math.min(a.wl, a.wf))} for ${a.wl >= a.wf ? 'Flávio' : 'Lula'}`)}</div>
            <StackBar l={a.wl} f={a.wf} o={a.wo} compact />
          </article>

          <article className="pcard">
            <header><span className="pcard-n">3</span><span className="pcard-k">{L('Votos depois das 17h', 'Votes after 5 pm')}</span></header>
            <div className="pcard-v">{fmtN(s.va)}</div>
            <div className="pcard-s">{L(`${pct(s.pctVotes)} dos votos · ${pct(s.pctGap)} da vantagem de ${W}`, `${pct(s.pctVotes)} of the votes · ${pct(s.pctGap)} of ${W}’s margin`)}</div>
            <p className="pcard-t"><button type="button" className="linklike" onClick={() => go('/peso')}>{L('Ver o peso no resultado →', 'See the weight in the result →')}</button></p>
          </article>
        </div>
      )}

      <p className="atalhos">
        <button type="button" className="btn primary" onClick={() => go('/mapa')}>{L('Ver no mapa', 'See on the map')}</button>
        <button type="button" className="btn" onClick={() => go('/secoes')}>{L('Ver a lista de seções', 'See the list of sections')}</button>
      </p>

      {pending && <p className="note">{L('Cobertura incompleta em alguns estados (veja Metodologia).', 'Coverage is incomplete in some states (see Methodology).')}</p>}
    </div>
  );
}
