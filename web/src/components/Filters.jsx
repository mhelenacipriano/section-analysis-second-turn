import { useMemo, useState } from 'react';
import { useLang } from '../i18n.jsx';
import { fmtHM } from '../format.js';
import { DEFAULT_LIM, LIM_MAX, LIM_MIN } from '../stats.js';

const PRESETS = [17 * 60 + 30, 18 * 60, 18 * 60 + 30, 18 * 60 + 50, 19 * 60];

export function Filters({ data, f, setF, venc = false, limiar = true, basico = false }) {
  const { L } = useLang();
  const [copied, setCopied] = useState(false);
  const muns = useMemo(() => (f.uf ? data.mun.filter((m) => m.uf === f.uf).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) : []), [data, f.uf]);
  const dirty = f.uf || f.mun || f.alt || f.venc || f.lim !== DEFAULT_LIM;
  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* no clipboard */ }
  };
  return (
    <section className="filtros" aria-label={L('Filtros', 'Filters')}>
      <label>{L('Estado', 'State')}
        <select value={f.uf} onChange={(e) => setF({ uf: e.target.value, mun: '' })}>
          <option value="">{L('Todos', 'All')}</option>
          {data.ufs.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </label>
      {!basico && (
        <>
      <label>{L('Município', 'Municipality')}
        <select value={f.mun} disabled={!f.uf} onChange={(e) => setF({ mun: e.target.value })}>
          <option value="">{f.uf ? L('Todos', 'All') : L('Escolha um estado', 'Choose a state')}</option>
          {muns.map((m) => <option key={m.cod} value={m.cod}>{m.nome}</option>)}
        </select>
      </label>
      <label>{L('Seções com local alterado', 'Sections with a changed polling place')}
        <select value={f.alt} onChange={(e) => setF({ alt: e.target.value })}>
          <option value="">{L('Todas as seções', 'All sections')}</option>
          <option value="1">{L('Só as 431 alteradas', 'Only the 431 changed')}</option>
        </select>
      </label>
        </>
      )}
      {venc && (
        <label>{L('Venceu no 1º turno', 'Won the 1st round')}
          <select value={f.venc} onChange={(e) => setF({ venc: e.target.value })}>
            <option value="">{L('Qualquer', 'Any')}</option>
            <option value="lula">Lula</option>
            <option value="flavio">Flávio Bolsonaro</option>
            <option value="outros">{L('Outros / empate', 'Others / tie')}</option>
          </select>
        </label>
      )}
      {limiar && (
        <div className="limiar">
          <label htmlFor="lim">{L('Urna encerrada às', 'Urna closed at')} <strong>{fmtHM(f.lim)}</strong> {L('ou depois', 'or later')} <small>({L('Brasília', 'Brasília time')})</small></label>
          <input id="lim" type="range" min={LIM_MIN} max={LIM_MAX} step={5} value={f.lim} onChange={(e) => setF({ lim: Number(e.target.value) })} />
          <div className="chips">
            {PRESETS.map((p) => (
              <button key={p} type="button" className={`chip ${f.lim === p ? 'on' : ''}`} onClick={() => setF({ lim: p })}>{fmtHM(p)}</button>
            ))}
          </div>
        </div>
      )}
      <div className="filtros-acoes">
        <button type="button" className="btn" disabled={!dirty} onClick={() => setF({ uf: '', mun: '', alt: '', venc: '', lim: DEFAULT_LIM })}>{L('Limpar filtros', 'Clear filters')}</button>
        <button type="button" className="btn" onClick={copy}>{copied ? L('Link copiado', 'Link copied') : L('Copiar link', 'Copy link')}</button>
      </div>
    </section>
  );
}
