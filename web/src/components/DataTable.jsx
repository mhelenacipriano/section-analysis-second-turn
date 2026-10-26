import { useMemo, useState } from 'react';
import { useLang } from '../i18n.jsx';
import { downloadCsv, fmtN, toCsv } from '../format.js';

/** columns: { key, label, get(row), render?(row), num?, csv?(row), title? } */
export default function DataTable({ rows, columns, csvName, initialSort, pageSize = 25, search = true, onRow, empty }) {
  const { L } = useLang();
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
        {search && <input type="search" className="busca" placeholder={L('Buscar na tabela', 'Search the table')} aria-label={L('Buscar na tabela', 'Search the table')} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />}
        <span className="note">{fmtN(sorted.length)} {L('linhas', 'rows')}</span>
        {csvName && <button type="button" className="btn" onClick={() => downloadCsv(csvName, toCsv(sorted, columns))}>{L('Baixar CSV', 'Download CSV')}</button>}
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
            {!view.length && <tr><td colSpan={columns.length} className="empty">{empty || L('Nenhuma linha com esses filtros.', 'No rows with these filters.')}</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          <button type="button" className="btn" disabled={cur === 0} onClick={() => setPage(cur - 1)}>{L('Anterior', 'Previous')}</button>
          <span>{L('Página', 'Page')} {cur + 1} {L('de', 'of')} {pages}</span>
          <button type="button" className="btn" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>{L('Próxima', 'Next')}</button>
        </div>
      )}
    </div>
  );
}
