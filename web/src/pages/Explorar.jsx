import { useMemo } from 'react';
import DataTable from '../components/DataTable.jsx';
import { Filters } from '../components/Filters.jsx';
import { Note } from '../components/ui.jsx';
import { fmtHM, fmtN, fmtPct } from '../format.js';
import { byUnit } from '../stats.js';

const vs = (u, k) => { const t = u.vl + u.vf + u.vo; return t ? u[k] / t : null; };

export default function Explorar({ data, f, setF, query, go }) {
  const aba = query.aba === 'municipios' ? 'municipios' : 'estados';
  const T = fmtHM(f.lim);
  const units = useMemo(() => byUnit(data, f.lim, aba === 'estados' ? 'uf' : 'mun'), [data, f.lim, aba]);
  const rows = useMemo(() => [...units.values()].filter((u) => u.n && (aba === 'estados' || !f.uf || u.uf === f.uf)), [units, aba, f.uf]);
  const base = [
    { key: 'n', label: 'Seções analisadas', num: true, get: (u) => u.n, render: (u) => fmtN(u.n) },
    { key: 'late', label: 'Encerradas depois das 17h30', num: true, get: (u) => u.late, render: (u) => fmtN(u.late) },
    { key: 'atT', label: `Encerradas às ${T}+`, num: true, get: (u) => u.atT, render: (u) => fmtN(u.atT) },
    { key: 'atTp', label: `% das seções às ${T}+`, num: true, get: (u) => (u.n ? u.atT / u.n : null), render: (u) => fmtPct(u.atT / u.n, 2), csv: (u) => (u.atT / u.n).toFixed(5) },
    { key: 'atTl', label: `Lula venceu (${T}+)`, num: true, get: (u) => u.atTl, render: (u) => fmtN(u.atTl) },
    { key: 'atTf', label: `Flávio venceu (${T}+)`, num: true, get: (u) => u.atTf, render: (u) => fmtN(u.atTf) },
    { key: 'l1', label: 'Lula, % válidos 1º turno', num: true, get: (u) => vs(u, 'vl'), render: (u) => fmtPct(vs(u, 'vl')), csv: (u) => vs(u, 'vl')?.toFixed(5) },
    { key: 'f1', label: 'Flávio, % válidos 1º turno', num: true, get: (u) => vs(u, 'vf'), render: (u) => fmtPct(vs(u, 'vf')), csv: (u) => vs(u, 'vf')?.toFixed(5) },
  ];
  const columns = aba === 'estados'
    ? [{ key: 'uf', label: 'UF', get: (u) => u.uf }, ...base]
    : [{ key: 'uf', label: 'UF', get: (u) => u.uf }, { key: 'nome', label: 'Município', get: (u) => u.mun.nome }, ...base];

  return (
    <div className="stack">
      <h1 className="page-title">Explorar</h1>
      <div className="subnav" role="tablist">
        {[['estados', 'Estados'], ['municipios', 'Municípios']].map(([k, l]) => (
          <button key={k} type="button" aria-current={aba === k ? 'page' : undefined} onClick={() => go(undefined, { ...query, aba: k })}>{l}</button>
        ))}
      </div>
      <Filters data={data} f={f} setF={setF} />
      <DataTable key={aba} rows={rows} columns={columns} csvName={`${aba}_encerramento_${f.lim}.csv`} initialSort={{ key: 'atT', dir: 'desc' }}
        onRow={(u) => (aba === 'estados' ? go(undefined, { ...query, aba: 'municipios', uf: u.uf, mun: '' }) : go('/secoes', { uf: u.uf, mun: u.mun.cod, lim: f.lim }))} />
      <Note>Clique numa linha para {aba === 'estados' ? 'ver os municípios do estado' : 'ver as seções do município'}. Apenas estados com dados do 1º turno e do log das urnas aparecem.</Note>
    </div>
  );
}
