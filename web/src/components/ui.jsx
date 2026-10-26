import { useLang } from '../i18n.jsx';
import { fmtN, fmtPct } from '../format.js';

export function Legend({ outros = true }) {
  const { L } = useLang();
  return (
    <div className="legend" aria-label={L('Legenda', 'Legend')}>
      <span><i className="sw lula" />Lula (13)</span>
      <span><i className="sw flavio" />Flávio Bolsonaro (22)</span>
      {outros && <span><i className="sw outros" />{L('Outros / empate', 'Others / tie')}</span>}
    </div>
  );
}

// Share of sections won in the 1st turn: colour + pattern (Flávio) + text label, never colour alone
export function StackBar({ l, f, o, compact }) {
  const { L } = useLang();
  const n = l + f + o;
  if (!n) return <div className={`bar ${compact ? 'compacta' : ''} bar-vazia`}>{L('sem seções', 'no sections')}</div>;
  // text inside a segment only when there is room for it; the full numbers are always in the tooltip
  const seg = (k, v, label) => {
    if (v <= 0) return null;
    const p = v / n;
    const text = p < 0.07 ? '' : compact ? <><b>{label}</b>{fmtPct(p, 0)}</> : <><b>{label}</b>{fmtN(v)} · {fmtPct(p, 0)}</>;
    return <div key={k} className={`seg ${k}`} style={{ width: `${p * 100}%` }} title={`${label}: ${fmtN(v)} / ${fmtN(n)} (${fmtPct(p)})`}>{text}</div>;
  };
  return (
    <div className={`bar ${compact ? 'compacta' : ''}`} role="img"
      aria-label={L(`Lula ${fmtN(l)}, Flávio ${fmtN(f)}, outros ${fmtN(o)} de ${fmtN(n)} seções`, `Lula ${fmtN(l)}, Flávio ${fmtN(f)}, others ${fmtN(o)} of ${fmtN(n)} sections`)}>
      {seg('lula', l, 'Lula')}{seg('flavio', f, 'Flávio')}{seg('outros', o, L('Outros', 'Others'))}
    </div>
  );
}

export const Stat = ({ k, v, sub }) => (
  <div className="stat"><div className="stat-k">{k}</div><div className="stat-v">{v}</div>{sub && <div className="stat-s">{sub}</div>}</div>
);

export const Note = ({ children }) => <p className="note">{children}</p>;
export const Empty = ({ children }) => <p className="empty">{children}</p>;
