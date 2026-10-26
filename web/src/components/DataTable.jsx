import { useMemo, useState } from 'react';
import { downloadCsv, fmtN, toCsv } from '../format.js';

/** columns: { key, label, get(row), render?(row), num?, csv?(row), title? } */
export default function DataTable({ rows, columns, csvName, initialSort, pageSize = 25, search = true, onRow, empty = 'Nenhuma linha com esses filtros.' }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(initialSort || null);   // { key, dir }
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => columns.some((c) => !c.num && String(c.get(r) ?? '').toLowerCase().includes(t)));
  }, [rows, q, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const c = columns.find((x) => x.key === sort.key);
    if (!c) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = c.get(a), y = c.get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')) * dir;
    });
  }, [filtered, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const view = sorted.slice(cur * pageSize, (cur + 1) * pageSize);
  const toggle = (key) => { setSort((s) => (s && s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })); setPage(0); };

  return (
    <div className="tabela">
      <div className="tabela-top">
        {search && <input type="search" className="busca" placeholder="Buscar na tabela" aria-label="Buscar na tabela" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />}
        <span className="note">{fmtN(sorted.length)} linhas</span>
        {csvName && <button type="button" className="btn" onClick={() => downloadCsv(csvName, toCsv(sorted, columns))}>Baixar CSV</button>}
      </div>
      <div className="tabela-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.num ? 'num' : ''} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} title={c.title}>
                  <button type="button" onClick={() => toggle(c.key)}>{c.label}{sort?.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={i} className={onRow ? 'clicavel' : ''} onClick={onRow ? () => onRow(r) : undefined}>
                {columns.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.render ? c.render(r) : c.get(r) ?? '–'}</td>)}
              </tr>
            ))}
            {!view.length && <tr><td colSpan={columns.length} className="empty">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          <button type="button" className="btn" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Anterior</button>
          <span>Página {cur + 1} de {pages}</span>
          <button type="button" className="btn" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Próxima</button>
        </div>
      )}
    </div>
  );
}
