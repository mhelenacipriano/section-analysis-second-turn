const nf = new Intl.NumberFormat('pt-BR');
export const fmtN = (n) => (n == null || Number.isNaN(n) ? '–' : nf.format(Math.round(n)));
export const fmtDec = (n, d = 1) => (n == null || !Number.isFinite(n) ? '–' : n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fmtPct = (x, d = 1) => (x == null || !Number.isFinite(x) ? '–' : `${fmtDec(x * 100, d)}%`);
export const fmtPP = (x, d = 1) => (x == null || !Number.isFinite(x) ? '–' : `${x > 0 ? '+' : ''}${fmtDec(x, d)} p.p.`);
const p2 = (n) => String(n).padStart(2, '0');
export const fmtTime = (sec) => (sec == null ? '–' : `${p2(Math.floor(sec / 3600))}:${p2(Math.floor((sec % 3600) / 60))}:${p2(sec % 60)}`);
export const fmtHM = (min) => `${p2(Math.floor(min / 60))}:${p2(min % 60)}`;

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
// ';' separated with a BOM so Excel (pt-BR) opens accents and columns correctly
export function toCsv(rows, columns) {
  const head = columns.map((c) => csvCell(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => csvCell(c.csv ? c.csv(r) : c.get(r))).join(';'));
  return '﻿' + [head, ...body].join('\n');
}
export function downloadCsv(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
