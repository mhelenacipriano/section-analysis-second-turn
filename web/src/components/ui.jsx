import { fmtN, fmtPct } from '../format.js';

export function Legend({ outros = true }) {
  return (
    <div className="legend" aria-label="Legenda">
      <span><i className="sw lula" />Lula (13)</span>
      <span><i className="sw flavio" />Flávio Bolsonaro (22)</span>
      {outros && <span><i className="sw outros" />Outros / empate</span>}
    </div>
  );
}

// Share of sections won in the 1st turn: colour + pattern (Flávio) + text label, never colour alone
export function StackBar({ l, f, o, compact }) {
  const n = l + f + o;
  if (!n) return <div className={`bar ${compact ? 'compacta' : ''} bar-vazia`}>sem seções</div>;
  // text inside a segment only when there is room for it; the full numbers are always in the tooltip
  const seg = (k, v, label) => {
    if (v <= 0) return null;
    const p = v / n;
    const text = p < 0.07 ? '' : compact ? <><b>{label}</b>{fmtPct(p, 0)}</> : <><b>{label}</b>{fmtN(v)} · {fmtPct(p, 0)}</>;
    return <div key={k} className={`seg ${k}`} style={{ width: `${p * 100}%` }} title={`${label}: ${fmtN(v)} de ${fmtN(n)} (${fmtPct(p)})`}>{text}</div>;
  };
  return (
    <div className={`bar ${compact ? 'compacta' : ''}`} role="img"
      aria-label={`Lula ${fmtN(l)}, Flávio ${fmtN(f)}, outros ${fmtN(o)} de ${fmtN(n)} seções`}>
      {seg('lula', l, 'Lula')}{seg('flavio', f, 'Flávio')}{seg('outros', o, 'Outros')}
    </div>
  );
}

export const Stat = ({ k, v, sub }) => (
  <div className="stat"><div className="stat-k">{k}</div><div className="stat-v">{v}</div>{sub && <div className="stat-s">{sub}</div>}</div>
);

export const Note = ({ children }) => <p className="note">{children}</p>;
export const Empty = ({ children }) => <p className="empty">{children}</p>;
