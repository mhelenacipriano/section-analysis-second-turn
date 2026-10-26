import { useMemo } from 'react';
import DataTable from '../components/DataTable.jsx';
import { Filters } from '../components/Filters.jsx';
import { Note } from '../components/ui.jsx';
import { useLang } from '../i18n.jsx';
import { fmtDec, fmtHM, fmtN, fmtPct, fmtTime } from '../format.js';
import { catLabel, category, groups, vsMunicipality } from '../stats.js';

const pct = (x, t) => (t ? x / t : null);

export default function Secoes({ data, f, setF, query, go }) {
  const { L } = useLang();
  const modo = query.modo === 'todas' ? 'todas' : 'limiar';
  const g = useMemo(() => groups(data, f), [data, f]);
  const T = fmtHM(f.lim);
  const rows = useMemo(() => {
    const base = modo === 'limiar' ? g.atRows : g.rows;
    return base.filter((r) => !f.venc || category(r.v) === f.venc).map((r) => ({ ...r, cmp: vsMunicipality(r) }));
  }, [g, modo, f.venc]);

  const val = (r) => r.l + r.f + r.o;
  const noRec = L('sem registro', 'no record');
  const columns = [
    { key: 'uf', label: L('UF', 'State'), get: (r) => r.mun.uf },
    { key: 'mun', label: L('Município', 'Municipality'), get: (r) => r.mun.nome },
    { key: 'zona', label: L('Zona', 'Zone'), num: true, get: (r) => r.zona },
    { key: 'secao', label: L('Seção', 'Section'), num: true, get: (r) => r.secao },
    { key: 'enc', label: L('Encerramento confirmado (Brasília)', 'Closing confirmed (Brasília time)'), num: true, get: (r) => r.enc, render: (r) => (r.enc == null ? <em>{noRec}</em> : fmtTime(r.enc)), csv: (r) => (r.enc == null ? '' : fmtTime(r.enc)) },
    { key: 'ini', label: L('Início do encerramento', 'Closing procedure start'), num: true, get: (r) => r.ini, render: (r) => fmtTime(r.ini), csv: (r) => (r.ini == null ? '' : fmtTime(r.ini)) },
    { key: 'ult', label: L('Último voto', 'Last vote'), num: true, get: (r) => r.ult, render: (r) => fmtTime(r.ult), csv: (r) => (r.ult == null ? '' : fmtTime(r.ult)) },
    { key: 'va', label: L('Votos depois das 17h', 'Votes after 17:00'), num: true, get: (r) => r.va, render: (r) => fmtN(r.va) },
    { key: 'ap', label: L('Eleitores aptos', 'Eligible voters'), num: true, get: (r) => r.ap, render: (r) => fmtN(r.ap) },
    { key: 'l', label: L('Lula (votos 1º turno)', 'Lula (1st-round votes)'), num: true, get: (r) => r.l, render: (r) => fmtN(r.l) },
    { key: 'lp', label: L('Lula, % válidos', 'Lula, % valid'), num: true, get: (r) => pct(r.l, val(r)), render: (r) => fmtPct(pct(r.l, val(r))), csv: (r) => pct(r.l, val(r))?.toFixed(4) },
    { key: 'f', label: L('Flávio (votos 1º turno)', 'Flávio (1st-round votes)'), num: true, get: (r) => r.f, render: (r) => fmtN(r.f) },
    { key: 'fp', label: L('Flávio, % válidos', 'Flávio, % valid'), num: true, get: (r) => pct(r.f, val(r)), render: (r) => fmtPct(pct(r.f, val(r))), csv: (r) => pct(r.f, val(r))?.toFixed(4) },
    { key: 'v', label: L('Venceu no 1º turno', 'Won the 1st round'), get: (r) => catLabel(category(r.v), L), render: (r) => <span className={`chip-venc ${category(r.v)}`}>{catLabel(category(r.v), L)}</span> },
    { key: 'dl', label: L('Lula vs. resto do município', 'Lula vs. rest of municipality'), num: true, title: L('Diferença em pontos percentuais de voto válido, comparando com as demais seções do mesmo município', 'Difference in percentage points of valid vote versus the other sections of the same municipality'), get: (r) => r.cmp?.l, render: (r) => (r.cmp ? `${r.cmp.l > 0 ? '+' : ''}${fmtDec(r.cmp.l)} p.p.` : '–'), csv: (r) => r.cmp?.l.toFixed(2) },
    { key: 'alt', label: L('Local alterado', 'Polling place changed'), get: (r) => (r.alt ? L('sim', 'yes') : L('não', 'no')) },
  ];

  return (
    <div className="stack">
      <h1 className="page-title">{L('Seções', 'Sections')}</h1>
      <p className="sub">{L(
        `${fmtN(rows.length)} seções${modo === 'limiar' ? ` encerradas às ${T} ou depois` : ' encerradas depois das 17h30 (ou sem registro de encerramento)'}.`,
        `${fmtN(rows.length)} sections${modo === 'limiar' ? ` closed at ${T} or later` : ' closed after 17:30 (or with no closing record)'}.`,
      )}</p>
      <div className="subnav">
        {[['limiar', L(`Encerradas às ${T}+`, `Closed at ${T}+`)], ['todas', L('Todas depois das 17h30', 'All after 17:30')]].map(([k, l]) => (
          <button key={k} type="button" aria-current={modo === k ? 'page' : undefined} onClick={() => go(undefined, { ...query, modo: k })}>{l}</button>
        ))}
      </div>
      <Filters data={data} f={f} setF={setF} venc />
      <DataTable rows={rows} columns={columns} csvName={`secoes_${modo === 'limiar' ? `encerradas_${f.lim}` : 'depois_17h30'}.csv`} initialSort={{ key: 'enc', dir: 'desc' }} />
      <Note>{L(
        '“Lula vs. resto do município” compara o voto válido de Lula nessa seção, no 1º turno, com o das outras seções da mesma cidade (a própria seção fica de fora da média).',
        '“Lula vs. rest of municipality” compares Lula’s valid vote in that section, in the 1st round, with the other sections of the same city (the section itself is left out of the average).',
      )}</Note>
    </div>
  );
}
