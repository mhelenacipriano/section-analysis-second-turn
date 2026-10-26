import { useMemo } from 'react';
import DataTable from '../components/DataTable.jsx';
import { Filters } from '../components/Filters.jsx';
import { Note } from '../components/ui.jsx';
import { fmtDec, fmtHM, fmtN, fmtPct, fmtTime } from '../format.js';
import { CAT_LABEL, category, groups, vsMunicipality } from '../stats.js';

const pct = (x, t) => (t ? x / t : null);

export default function Secoes({ data, f, setF, query, go }) {
  const modo = query.modo === 'todas' ? 'todas' : 'limiar';
  const g = useMemo(() => groups(data, f), [data, f]);
  const T = fmtHM(f.lim);
  const rows = useMemo(() => {
    const base = modo === 'limiar' ? g.atRows : g.rows;
    return base.filter((r) => !f.venc || category(r.v) === f.venc).map((r) => ({ ...r, cmp: vsMunicipality(r) }));
  }, [g, modo, f.venc]);

  const val = (r) => r.l + r.f + r.o;
  const columns = [
    { key: 'uf', label: 'UF', get: (r) => r.mun.uf },
    { key: 'mun', label: 'Município', get: (r) => r.mun.nome },
    { key: 'zona', label: 'Zona', num: true, get: (r) => r.zona },
    { key: 'secao', label: 'Seção', num: true, get: (r) => r.secao },
    { key: 'enc', label: 'Encerramento confirmado (Brasília)', num: true, get: (r) => r.enc, render: (r) => (r.enc == null ? <em>sem registro</em> : fmtTime(r.enc)), csv: (r) => (r.enc == null ? '' : fmtTime(r.enc)) },
    { key: 'ini', label: 'Início do encerramento', num: true, get: (r) => r.ini, render: (r) => fmtTime(r.ini), csv: (r) => (r.ini == null ? '' : fmtTime(r.ini)) },
    { key: 'ult', label: 'Último voto', num: true, get: (r) => r.ult, render: (r) => fmtTime(r.ult), csv: (r) => (r.ult == null ? '' : fmtTime(r.ult)) },
    { key: 'va', label: 'Votos depois das 17h', num: true, get: (r) => r.va, render: (r) => fmtN(r.va) },
    { key: 'ap', label: 'Eleitores aptos', num: true, get: (r) => r.ap, render: (r) => fmtN(r.ap) },
    { key: 'l', label: 'Lula (votos 1º turno)', num: true, get: (r) => r.l, render: (r) => fmtN(r.l) },
    { key: 'lp', label: 'Lula, % válidos', num: true, get: (r) => pct(r.l, val(r)), render: (r) => fmtPct(pct(r.l, val(r))), csv: (r) => pct(r.l, val(r))?.toFixed(4) },
    { key: 'f', label: 'Flávio (votos 1º turno)', num: true, get: (r) => r.f, render: (r) => fmtN(r.f) },
    { key: 'fp', label: 'Flávio, % válidos', num: true, get: (r) => pct(r.f, val(r)), render: (r) => fmtPct(pct(r.f, val(r))), csv: (r) => pct(r.f, val(r))?.toFixed(4) },
    { key: 'v', label: 'Venceu no 1º turno', get: (r) => CAT_LABEL[category(r.v)], render: (r) => <span className={`chip-venc ${category(r.v)}`}>{CAT_LABEL[category(r.v)]}</span> },
    { key: 'dl', label: 'Lula vs. resto do município', num: true, title: 'Diferença em pontos percentuais de voto válido, comparando com as demais seções do mesmo município', get: (r) => r.cmp?.l, render: (r) => (r.cmp ? `${r.cmp.l > 0 ? '+' : ''}${fmtDec(r.cmp.l)} p.p.` : '–'), csv: (r) => r.cmp?.l.toFixed(2) },
    { key: 'alt', label: 'Local alterado', get: (r) => (r.alt ? 'sim' : 'não') },
  ];

  return (
    <div className="stack">
      <h1 className="page-title">Seções</h1>
      <p className="sub">{fmtN(rows.length)} seções{modo === 'limiar' ? ` encerradas às ${T} ou depois` : ' encerradas depois das 17h30 (ou sem registro de encerramento)'}.</p>
      <div className="subnav">
        {[['limiar', `Encerradas às ${T}+`], ['todas', 'Todas depois das 17h30']].map(([k, l]) => (
          <button key={k} type="button" aria-current={modo === k ? 'page' : undefined} onClick={() => go(undefined, { ...query, modo: k })}>{l}</button>
        ))}
      </div>
      <Filters data={data} f={f} setF={setF} venc />
      <DataTable rows={rows} columns={columns} csvName={`secoes_${modo === 'limiar' ? `encerradas_${f.lim}` : 'depois_17h30'}.csv`} initialSort={{ key: 'enc', dir: 'desc' }} />
      <Note>“Lula vs. resto do município” compara o voto válido de Lula nessa seção, no 1º turno, com o das outras seções da mesma cidade (a própria seção fica de fora da média).</Note>
    </div>
  );
}
