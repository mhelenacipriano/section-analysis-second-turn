import { useMemo } from 'react';
import DataTable from '../components/DataTable.jsx';
import { Filters } from '../components/Filters.jsx';
import { useLang } from '../i18n.jsx';
import { fmtHM, fmtN, fmtPct, fmtTime } from '../format.js';
import { catLabel, category, groups } from '../stats.js';

const pct = (x, t) => (t ? x / t : null);

export default function Secoes({ data, f, setF }) {
  const { L } = useLang();
  const g = useMemo(() => groups(data, f), [data, f]);
  const T = fmtHM(f.lim);
  const rows = useMemo(() => {
    const base = g.atRows;
    return base.filter((r) => !f.venc || category(r.v) === f.venc);
  }, [g, f.venc]);

  const val = (r) => r.l + r.f + r.o;
  const noRec = L('sem registro', 'no record');
  const columns = [
    { key: 'uf', label: L('UF', 'State'), get: (r) => r.mun.uf },
    { key: 'mun', label: L('Município', 'Municipality'), get: (r) => r.mun.nome },
    { key: 'zona', label: L('Zona', 'Zone'), num: true, get: (r) => r.zona },
    { key: 'secao', label: L('Seção', 'Section'), num: true, get: (r) => r.secao },
    { key: 'enc', label: L('Encerramento (Brasília)', 'Closing (Brasília time)'), num: true, get: (r) => r.enc, render: (r) => (r.enc == null ? <em>{noRec}</em> : fmtTime(r.enc)), csv: (r) => (r.enc == null ? '' : fmtTime(r.enc)) },
    { key: 'va', label: L('Votos depois das 17h', 'Votes after 17:00'), num: true, get: (r) => r.va, render: (r) => fmtN(r.va) },
    { key: 'lp', label: L('Lula, % válidos', 'Lula, % valid'), num: true, get: (r) => pct(r.l, val(r)), render: (r) => fmtPct(pct(r.l, val(r))), csv: (r) => pct(r.l, val(r))?.toFixed(4) },
    { key: 'fp', label: L('Flávio, % válidos', 'Flávio, % valid'), num: true, get: (r) => pct(r.f, val(r)), render: (r) => fmtPct(pct(r.f, val(r))), csv: (r) => pct(r.f, val(r))?.toFixed(4) },
    { key: 'v', label: L('Venceu no 1º turno', 'Won the 1st round'), get: (r) => catLabel(category(r.v), L), render: (r) => <span className={`chip-venc ${category(r.v)}`}>{catLabel(category(r.v), L)}</span> },
  ];

  return (
    <div className="stack">
      <h1 className="page-title">{L('Seções', 'Sections')}</h1>
      <p className="sub">{L(`${fmtN(rows.length)} seções fecharam às ${T} ou depois.`, `${fmtN(rows.length)} sections closed at ${T} or later.`)}</p>
      <Filters data={data} f={f} setF={setF} venc />
      <DataTable rows={rows} columns={columns} csvName={`secoes_encerradas_${f.lim}.csv`} initialSort={{ key: 'enc', dir: 'desc' }} />
    </div>
  );
}
