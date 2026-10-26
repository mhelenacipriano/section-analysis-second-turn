import { useMemo, useState } from 'react';
import { fmtHM } from '../format.js';
import { DEFAULT_LIM, LIM_MAX, LIM_MIN } from '../stats.js';

const PRESETS = [17 * 60 + 30, 18 * 60, 18 * 60 + 30, 18 * 60 + 50, 19 * 60];

export function Filters({ data, f, setF, venc = false, limiar = true }) {
  const [copied, setCopied] = useState(false);
  const muns = useMemo(() => (f.uf ? data.mun.filter((m) => m.uf === f.uf).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) : []), [data, f.uf]);
  const dirty = f.uf || f.mun || f.alt || f.venc || f.lim !== DEFAULT_LIM;
  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* no clipboard */ }
  };
  return (
    <section className="filtros" aria-label="Filtros">
      <label>Estado
        <select value={f.uf} onChange={(e) => setF({ uf: e.target.value, mun: '' })}>
          <option value="">Todos</option>
          {data.ufs.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </label>
      <label>Município
        <select value={f.mun} disabled={!f.uf} onChange={(e) => setF({ mun: e.target.value })}>
          <option value="">{f.uf ? 'Todos' : 'Escolha um estado'}</option>
          {muns.map((m) => <option key={m.cod} value={m.cod}>{m.nome}</option>)}
        </select>
      </label>
      <label>Seções com local alterado
        <select value={f.alt} onChange={(e) => setF({ alt: e.target.value })}>
          <option value="">Todas as seções</option>
          <option value="1">Só as 431 alteradas</option>
        </select>
      </label>
      {venc && (
        <label>Venceu no 1º turno
          <select value={f.venc} onChange={(e) => setF({ venc: e.target.value })}>
            <option value="">Qualquer</option>
            <option value="lula">Lula</option>
            <option value="flavio">Flávio Bolsonaro</option>
            <option value="outros">Outros / empate</option>
          </select>
        </label>
      )}
      {limiar && (
        <div className="limiar">
          <label htmlFor="lim">Urna encerrada às <strong>{fmtHM(f.lim)}</strong> ou depois <small>(Brasília)</small></label>
          <input id="lim" type="range" min={LIM_MIN} max={LIM_MAX} step={5} value={f.lim} onChange={(e) => setF({ lim: Number(e.target.value) })} />
          <div className="chips">
            {PRESETS.map((p) => (
              <button key={p} type="button" className={`chip ${f.lim === p ? 'on' : ''}`} onClick={() => setF({ lim: p })}>{fmtHM(p)}</button>
            ))}
          </div>
        </div>
      )}
      <div className="filtros-acoes">
        <button type="button" className="btn" disabled={!dirty} onClick={() => setF({ uf: '', mun: '', alt: '', venc: '', lim: DEFAULT_LIM })}>Limpar filtros</button>
        <button type="button" className="btn" onClick={copy}>{copied ? 'Link copiado' : 'Copiar link'}</button>
      </div>
    </section>
  );
}
