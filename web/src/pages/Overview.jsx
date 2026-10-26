import { useMemo } from 'react';
import Histogram from '../components/Histogram.jsx';
import { Filters } from '../components/Filters.jsx';
import { Legend, Note, StackBar, Stat } from '../components/ui.jsx';
import DataTable from '../components/DataTable.jsx';
import { fmtDec, fmtHM, fmtN, fmtPct, fmtPP } from '../format.js';
import { expectedVsObserved, groups, histogram, voteShare, wilson } from '../stats.js';

export function Ci({ k, n }) {
  if (!n) return null;
  const [lo, hi] = wilson(k, n);
  return <span className="ic" title="Intervalo de confiança de 95% (Wilson)">IC 95%: {fmtPct(lo, 0)}–{fmtPct(hi, 0)}</span>;
}

export function scopeLabel(f, data) {
  if (f.mun) return data.mun.find((m) => m.uf === f.uf && m.cod === f.mun)?.nome || f.mun;
  return f.uf || 'todo o país (estados com dados)';
}

export default function Overview({ data, f, setF, go }) {
  const g = useMemo(() => groups(data, f), [data, f]);
  const ev = useMemo(() => expectedVsObserved(g, f, data), [g, f, data]);
  const bins = useMemo(() => histogram(g.rows), [g]);
  const T = fmtHM(f.lim);
  const scope = scopeLabel(f, data) + (f.alt ? ' · só seções com local alterado' : '');
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
        <p className="eyebrow">2º turno de 2026 · 25 de outubro</p>
        <h1>Quantas seções encerraram a votação por volta das 19h?</h1>
        <p className="hero-sub">
          Seções eleitorais cujo log da urna registra o encerramento da votação às {T} ou depois (horário de Brasília) — e como essas mesmas seções votaram no 1º turno.
        </p>
        <p className="disclaimer">
          “Encerramento” é o registro <em>Procedimento de encerramento confirmado</em> no log de cada urna, não necessariamente um voto àquela hora.
          Análise descritiva de dados públicos do TSE: o site mostra quando e onde as urnas foram encerradas, não explica por quê, e não afirma irregularidade.
        </p>
      </header>

      <Filters data={data} f={f} setF={setF} />

      <section className="story" aria-labelledby="resp">
        <h2 id="resp">A resposta, em {scope}</h2>
        {a.n === 0 ? (
          <p className="empty">Nenhuma seção foi encerrada às {T} ou depois com esses filtros. Reduza o limiar ou mude o estado.</p>
        ) : (
          <>
            <div className="stats">
              <Stat k={`Seções encerradas às ${T} ou depois`} v={fmtN(a.n)} sub={`${fmtPct(a.n / (g.total.n || 1), 3)} das ${fmtN(g.total.n)} seções analisadas`} />
              <Stat k="Lula venceu no 1º turno" v={fmtN(a.wl)} sub={<>{fmtPct(a.wl / a.n)} dessas seções <Ci k={a.wl} n={a.n} /></>} />
              <Stat k="Flávio Bolsonaro venceu no 1º turno" v={fmtN(a.wf)} sub={<>{fmtPct(a.wf / a.n)} dessas seções <Ci k={a.wf} n={a.n} /></>} />
              <Stat k="Outro candidato / empate" v={fmtN(a.wo)} sub={fmtPct(a.wo / a.n)} />
            </div>
            <p className="leitura">
              Entre as <strong>{fmtN(a.n)}</strong> seções cuja urna foi encerrada às {T} ou depois, <strong className="pos">Lula venceu em {fmtN(a.wl)}</strong>{' '}
              e <strong className="neg">Flávio Bolsonaro em {fmtN(a.wf)}</strong> no 1º turno.
              Nas <strong>{fmtN(r.n)}</strong> demais seções (encerradas antes das {T}), Lula venceu em <strong className="pos">{fmtN(r.wl)} ({fmtPct(r.wl / (r.n || 1))})</strong>{' '}
              e Flávio em <strong className="neg">{fmtN(r.wf)} ({fmtPct(r.wf / (r.n || 1))})</strong>.
            </p>
            {a.n < 30 && <Note>Com {fmtN(a.n)} seções, qualquer proporção é muito instável: veja o intervalo de confiança e a comparação com o resto do município logo abaixo.</Note>}
          </>
        )}

        <div className="comp">
          <Legend />
          {[
            [`Urna encerrada às ${T} ou depois`, a, 'a'],
            [`Encerrada entre 17h30 e ${T}`, g.long, 'b'],
            ['Encerrada antes das 17h30 (o normal)', g.onTime, 'c'],
            ...(g.noRec.n ? [['Sem registro de encerramento no log', g.noRec, 'f']] : []),
            [`Todas as outras (tudo menos as de ${T}+)`, r, 'd'],
            ['Todas as seções analisadas', g.total, 'e'],
          ].map(([label, c, k]) => (
            <div key={k} className="comp-linha">
              <div className="comp-rotulo"><strong>{label}</strong><span>{fmtN(c.n)} seções · quem venceu a seção no 1º turno</span></div>
              <StackBar l={c.wl} f={c.wf} o={c.wo} />
            </div>
          ))}
        </div>
        {vs && vsr && (
          <Note>Votos válidos no 1º turno: nas seções de {T}+ Lula teve {fmtPct(vs.l)} e Flávio {fmtPct(vs.f)} ({fmtN(vs.valid)} votos); nas demais, Lula {fmtPct(vsr.l)} e Flávio {fmtPct(vsr.f)}.</Note>
        )}
      </section>

      {ev && ev.n > 0 && (
        <section className="story" aria-labelledby="esp">
          <h2 id="esp">Comparando com o resto do mesmo município</h2>
          <p className="story-intro">
            Seções que ficam abertas mais tempo costumam estar em cidades grandes, onde o voto é diferente da média do país. Por isso a comparação justa é com as
            outras seções <em>do mesmo município</em>: se essas {fmtN(ev.n)} seções votassem como o resto de suas cidades, quantas vitórias esperaríamos?
          </p>
          <div className="stats">
            <Stat k="Lula: vitórias observadas" v={fmtN(ev.obsL)} sub={`esperado ${fmtDec(ev.expL)} (faixa de 95%: ${fmtDec(Math.max(0, ev.expL - 1.96 * ev.sdL))}–${fmtDec(Math.min(ev.n, ev.expL + 1.96 * ev.sdL))})`} />
            <Stat k="Flávio: vitórias observadas" v={fmtN(ev.obsF)} sub={`esperado ${fmtDec(ev.expF)} (faixa de 95%: ${fmtDec(Math.max(0, ev.expF - 1.96 * ev.sdF))}–${fmtDec(Math.min(ev.n, ev.expF + 1.96 * ev.sdF))})`} />
            <Stat k="Voto válido de Lula vs. resto do município" v={fmtPP(ev.ppL)} sub="no 1º turno, média ponderada por votos" />
            <Stat k="Voto válido de Flávio vs. resto do município" v={fmtPP(ev.ppF)} sub="no 1º turno, média ponderada por votos" />
          </div>
          <p className="leitura">
            {Math.abs(ev.obsL - ev.expL) <= 1.96 * ev.sdL
              ? 'O resultado observado está dentro da faixa calculada para seções que votassem como o resto de seus municípios.'
              : 'O resultado observado ficou fora da faixa calculada para seções que votassem como o resto de seus municípios.'}
            {' '}A faixa trata cada seção como independente e, por isso, tende a ser estreita demais: seções do mesmo bairro votam de forma parecida. Leia como
            indício a investigar, não como prova. Isto mede só o 1º turno e não explica por que as seções foram encerradas mais tarde.
            {ev.skipped > 0 && ` (${ev.skipped} seções sem outras seções no município ficaram de fora.)`}
          </p>
        </section>
      )}

      <section className="story" aria-labelledby="hor">
        <h2 id="hor">Horário do encerramento</h2>
        <p className="story-intro">
          Cada barra é um intervalo de 5 minutos, de 17h30 em diante (as seções encerradas antes disso são o caso normal e não aparecem aqui).
          Clique numa barra para usar o horário como limiar.
        </p>
        <Legend />
        <Histogram bins={bins} lim={f.lim} onPick={(m) => setF({ lim: m })} />
      </section>

      {top.length > 0 && (
        <section className="story" aria-labelledby="onde">
          <h2 id="onde">Onde estão as seções encerradas às {T} ou depois</h2>
          <DataTable
            rows={top} pageSize={10} search={false} csvName="municipios_limiar.csv"
            onRow={(u) => go('/secoes', { uf: u.mun.uf, mun: u.mun.cod, lim: f.lim })}
            columns={[
              { key: 'uf', label: 'UF', get: (u) => u.mun.uf },
              { key: 'nome', label: 'Município', get: (u) => u.mun.nome },
              { key: 'n', label: `Seções ${T}+`, num: true, get: (u) => u.n, render: (u) => fmtN(u.n) },
              { key: 'wl', label: 'Lula venceu', num: true, get: (u) => u.wl, render: (u) => fmtN(u.wl) },
              { key: 'wf', label: 'Flávio venceu', num: true, get: (u) => u.wf, render: (u) => fmtN(u.wf) },
            ]}
          />
          <Note>Clique numa linha para ver as seções do município.</Note>
        </section>
      )}

      {pending.length > 0 && (
        <aside className="aviso">
          <strong>Cobertura incompleta.</strong>{' '}
          {pending.map(([u, c]) => (c.t1 ? `${u} (${fmtN(c.t1 - c.scanned)} seções ainda não conferidas)` : `${u} (sem dados do 1º turno)`)).join(', ')}.
          {' '}Essas seções ficam fora das contas, nunca contadas como “fecharam no horário”. Detalhes em Metodologia.
        </aside>
      )}
    </div>
  );
}
