import { useState } from 'react';
import { useLang } from '../i18n.jsx';
import { fmtHM, fmtN } from '../format.js';

const W = 720, H = 300, M = { t: 14, r: 12, b: 38, l: 46 };

/** Stacked by 1st-turn winner. Flávio uses a stripe pattern so colour is never the only cue. */
export default function Histogram({ bins, lim, onPick, log: logInit = false }) {
  const { L } = useLang();
  const [log, setLog] = useState(logInit);
  const [hover, setHover] = useState(null);
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const max = Math.max(1, ...bins.map((b) => b.n));
  const y = (v) => (log ? Math.log10(1 + v) / Math.log10(1 + max) : v / max) * ih;
  const bw = iw / bins.length;
  const ticks = log ? [0, 1, 10, 100, 1000, 10000].filter((t) => t <= max * 1.2) : [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * max));
  const xTicks = bins.filter((_, i) => i % 6 === 0);
  const limIdx = (lim - bins[0].x0) / (bins[0].x1 - bins[0].x0);

  return (
    <div className="chart">
      <div className="chart-ctl">
        <span className="note">{L('Escala do eixo vertical:', 'Vertical axis scale:')}</span>
        <button type="button" className={`chip ${log ? 'on' : ''}`} onClick={() => setLog(true)}>{L('logarítmica', 'logarithmic')}</button>
        <button type="button" className={`chip ${!log ? 'on' : ''}`} onClick={() => setLog(false)}>{L('linear', 'linear')}</button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={L('Número de seções por horário de encerramento da urna, empilhado por vencedor do 1º turno', 'Number of sections by urna closing time, stacked by 1st-round winner')}>
        <defs>
          <pattern id="hflavio" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--flavio)" /><rect width="2.4" height="6" fill="#000" opacity=".35" />
          </pattern>
        </defs>
        <g transform={`translate(${M.l},${M.t})`}>
          {ticks.map((t) => (
            <g key={t}><line x1="0" x2={iw} y1={ih - y(t)} y2={ih - y(t)} className="grid" /><text x="-8" y={ih - y(t) + 4} textAnchor="end">{fmtN(t)}</text></g>
          ))}
          {bins.map((b, i) => {
            let base = ih;
            const segs = [['outros', b.outros, 'var(--outros)'], ['flavio', b.flavio, 'url(#hflavio)'], ['lula', b.lula, 'var(--lula)']];
            const tot = b.n ? y(b.n) : 0;
            return (
              <g key={b.x0} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(b.x0)} className={onPick ? 'clicavel' : ''}>
                <rect x={i * bw} y={0} width={bw} height={ih} fill="transparent" />
                {segs.map(([k, v, fill]) => {
                  if (!v) return null;
                  const h = (v / b.n) * tot;
                  base -= h;
                  return <rect key={k} x={i * bw + 1} y={base} width={Math.max(1, bw - 2)} height={h} fill={fill} />;
                })}
              </g>
            );
          })}
          <line x1={limIdx * bw} x2={limIdx * bw} y1="-4" y2={ih} className="limite" />
          <text x={limIdx * bw + 4} y="8" className="strong">≥ {fmtHM(lim)}</text>
          {xTicks.map((b) => <text key={b.x0} x={((b.x0 - bins[0].x0) / (bins[0].x1 - bins[0].x0)) * bw} y={ih + 16} textAnchor="middle">{fmtHM(b.x0)}</text>)}
          <text x={iw / 2} y={ih + 32} textAnchor="middle">{L('horário em que a urna confirmou o encerramento (Brasília)', 'time the urna confirmed closing (Brasília time)')}</text>
        </g>
      </svg>
      <div className="chart-tip" aria-live="polite">
        {hover != null
          ? <>{fmtHM(bins[hover].x0)}–{fmtHM(bins[hover].x1)}: <strong>{fmtN(bins[hover].n)}</strong> {L('seções', 'sections')} · Lula {fmtN(bins[hover].lula)} · Flávio {fmtN(bins[hover].flavio)} · {L('outros', 'others')} {fmtN(bins[hover].outros)}{onPick ? L(' · clique para usar como limiar', ' · click to use as the threshold') : ''}</>
          : <span className="note">{L('Passe o mouse (ou toque) numa barra.', 'Hover (or tap) a bar.')} {onPick ? L('Clique para usar o horário como limiar.', 'Click to use that time as the threshold.') : ''}</span>}
      </div>
    </div>
  );
}
