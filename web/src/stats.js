// All numbers on the site come from here. Sections are described by
//   v = winner of the 1st turn (13 Lula, 22 Flávio, 0 tie, anything else = another candidate)
//   l, f, o, b, n = votes for Lula, Flávio, other candidates, blank, null; ap = eligible, cp = turnout
//   enc = time the urna CONFIRMED the closing of voting, seconds since midnight, Brasília time
//         (null = the log has no closing record); ult = last vote; va = votes after 17h
export const LULA = 13;
export const FLAVIO = 22;
export const DEFAULT_LIM = 18 * 60 + 50;     // "closed around 19h": from 18:50 Brasília, in minutes since midnight
export const RECORD_FROM = 17 * 3600 + 30 * 60;   // detail rows exist for closings at/after this
export const LIM_MIN = 17 * 60 + 30;
export const LIM_MAX = 20 * 60;

export function readFilters(q) {
  const lim = Number(q.lim);
  return {
    uf: q.uf || '',
    mun: q.uf ? q.mun || '' : '',
    lim: Number.isFinite(lim) && lim >= LIM_MIN && lim <= LIM_MAX ? Math.round(lim) : DEFAULT_LIM,
    alt: q.alt === '1' ? '1' : '',
    venc: ['lula', 'flavio', 'outros'].includes(q.venc) ? q.venc : '',
  };
}

export const category = (v) => (v === LULA ? 'lula' : v === FLAVIO ? 'flavio' : 'outros');
export const catLabel = (cat, L) => ({ lula: 'Lula', flavio: 'Flávio Bolsonaro', outros: L('Outros / empate', 'Others / tie') }[cat]);

const KEYS = ['n', 'wl', 'wf', 'wo', 'vl', 'vf', 'vo', 'vb', 'vn', 'ap', 'cp'];
export const zero = () => Object.fromEntries(KEYS.map((k) => [k, 0]));
export function addSec(c, s) {
  c.n++;
  if (s.v === LULA) c.wl++; else if (s.v === FLAVIO) c.wf++; else c.wo++;
  c.vl += s.l; c.vf += s.f; c.vo += s.o; c.vb += s.b; c.vn += s.n; c.ap += s.ap; c.cp += s.cp;
  return c;
}
const addMun = (c, m) => { for (const k of KEYS) c[k] += m[k]; };
const sub = (a, b) => Object.fromEntries(KEYS.map((k) => [k, a[k] - b[k]]));

export const matches = (f) => (m) => !!m && (!f.uf || m.uf === f.uf) && (!f.mun || m.cod === f.mun);

/**
 * Splits the sections of the current selection (state / municipality / "changed polling place")
 * by when the urna confirmed closing:
 *   atT    closed at or after the threshold      long   closed between 17:30 and the threshold
 *   noRec  the log has no closing record         onTime closed before 17:30 (the normal case)
 *   rest   everything that is not atT
 */
export function groups(data, f) {
  const inSel = matches(f);
  const total = zero();
  const rows = [];                                   // sections with detail rows
  if (f.alt) {
    for (const r of data.alt) {
      if (!r.s || !inSel(r.mun)) continue;
      addSec(total, r);
      if (r.enc == null || r.enc >= RECORD_FROM) rows.push(r);
    }
  } else {
    for (const m of data.mun) if (inSel(m)) addMun(total, m);
    for (const d of data.det) if (inSel(d.mun)) rows.push(d);
  }
  const T = f.lim * 60;
  const atT = zero(), long = zero(), noRec = zero();
  const atRows = [];
  for (const r of rows) {
    if (r.enc == null) addSec(noRec, r);
    else if (r.enc >= T) { addSec(atT, r); atRows.push(r); }
    else addSec(long, r);
  }
  const onTime = sub(sub(sub(total, atT), long), noRec);
  return { total, atT, long, noRec, onTime, rest: sub(total, atT), rows, atRows };
}

export const share = (c, k) => (c.n ? c[k] / c.n : null);
export function voteShare(c) {
  const t = c.vl + c.vf + c.vo;
  return t ? { l: c.vl / t, f: c.vf / t, o: c.vo / t, valid: t } : null;
}

// Wilson 95% interval for a proportion k/n
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n);
  const a = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - a) / d, (c + a) / d];
}

/**
 * What would we expect for the atT sections if they voted like the rest of their own
 * municipality? Expected wins = sections * (share of the municipality's other sections won by the
 * candidate). Sd comes from the sum of binomial variances (sections treated as independent).
 * Not available for the "changed polling place" universe (no municipality totals for it).
 */
export function expectedVsObserved(g, f, data) {
  if (f.alt) return null;
  const by = new Map();
  for (const r of g.atRows) {
    const A = by.get(r.mi) || { n: 0, wl: 0, wf: 0, vl: 0, vf: 0, vo: 0 };
    A.n++; A.wl += r.v === LULA; A.wf += r.v === FLAVIO; A.vl += r.l; A.vf += r.f; A.vo += r.o;
    by.set(r.mi, A);
  }
  const out = { n: 0, skipped: 0, obsL: 0, expL: 0, varL: 0, obsF: 0, expF: 0, varF: 0, per: [] };
  let valid = 0, oVL = 0, eVL = 0, oVF = 0, eVF = 0;
  for (const [mi, A] of by) {
    const m = data.mun[mi];
    const restN = m.n - A.n;
    const restV = (m.vl - A.vl) + (m.vf - A.vf) + (m.vo - A.vo);
    if (restN <= 0 || restV <= 0) { out.skipped += A.n; continue; }
    const pL = (m.wl - A.wl) / restN, pF = (m.wf - A.wf) / restN;
    const aV = A.vl + A.vf + A.vo;
    out.n += A.n;
    out.obsL += A.wl; out.expL += A.n * pL; out.varL += A.n * pL * (1 - pL);
    out.obsF += A.wf; out.expF += A.n * pF; out.varF += A.n * pF * (1 - pF);
    valid += aV; oVL += A.vl; oVF += A.vf;
    eVL += aV * ((m.vl - A.vl) / restV); eVF += aV * ((m.vf - A.vf) / restV);
    out.per.push({ mun: m, n: A.n, obsL: A.wl, expL: A.n * pL, obsF: A.wf, expF: A.n * pF,
      ppL: ((A.vl / aV) - (m.vl - A.vl) / restV) * 100, ppF: ((A.vf / aV) - (m.vf - A.vf) / restV) * 100 });
  }
  out.sdL = Math.sqrt(out.varL); out.sdF = Math.sqrt(out.varF);
  out.ppL = valid ? ((oVL - eVL) / valid) * 100 : null;
  out.ppF = valid ? ((oVF - eVF) / valid) * 100 : null;
  return out;
}

// Same section against the rest of its municipality (leave-one-out), in percentage points
export function vsMunicipality(r) {
  const m = r.mun;
  const t = r.l + r.f + r.o;
  const restV = m.vl + m.vf + m.vo - t;
  if (!t || restV <= 0) return null;
  return { l: (r.l / t - (m.vl - r.l) / restV) * 100, f: (r.f / t - (m.vf - r.f) / restV) * 100,
    restL: (m.vl - r.l) / restV, restF: (m.vf - r.f) / restV };
}

// Closing-time histogram in `step`-minute bins, stacked by 1st-turn winner
export function histogram(rows, step = 5, from = 17 * 60 + 30, to = 20 * 60) {
  const bins = [];
  for (let x = from; x < to; x += step) bins.push({ x0: x, x1: x + step, lula: 0, flavio: 0, outros: 0, n: 0 });
  for (const r of rows) {
    if (r.enc == null) continue;
    const i = Math.min(bins.length - 1, Math.max(0, Math.floor((r.enc / 60 - from) / step)));
    bins[i][category(r.v)]++; bins[i].n++;
  }
  return bins;
}

// One row per threshold: how many sections were still open until then, and who won them
export function sweep(rows, thresholds) {
  return thresholds.map((t) => {
    const c = zero();
    for (const r of rows) if (r.enc != null && r.enc >= t * 60) addSec(c, r);
    return { t, c };
  });
}

// Per-state or per-municipality counts used by the map and the tables
export function byUnit(data, lim, key, alt = false) {
  const out = new Map();
  const get = (k, m) => out.get(k) || out.set(k, { key: k, uf: m.uf, mun: m, n: 0, late: 0, atT: 0, atTl: 0, atTf: 0, atVl: 0, atVf: 0, atVo: 0, wl: 0, wf: 0, wo: 0, vl: 0, vf: 0, vo: 0, vb: 0, vn: 0, ap: 0, cp: 0 }).get(k);
  const units = key === 'uf' ? (m) => m.uf : (m) => `${m.uf}:${m.cod}`;
  const T = lim * 60;
  const late = (u, d) => {
    if (d.enc == null) return;
    u.late++;
    if (d.enc >= T) { u.atT++; u.atVl += d.l; u.atVf += d.f; u.atVo += d.o; if (d.v === LULA) u.atTl++; else if (d.v === FLAVIO) u.atTf++; }
  };
  if (alt) {                                         // "changed polling place" filter: only those sections
    for (const r of data.alt) {
      if (!r.s || !r.mun) continue;
      const u = get(units(r.mun), r.mun);
      if (key !== 'uf') u.mun = r.mun;
      addSec(u, r);
      late(u, r);
    }
    return out;
  }
  for (const m of data.mun) {
    const u = get(units(m), m);
    if (key !== 'uf') u.mun = m;
    u.n += m.n; u.wl += m.wl; u.wf += m.wf; u.wo += m.wo;
    u.vl += m.vl; u.vf += m.vf; u.vo += m.vo;
  }
  for (const d of data.det) late(out.get(units(d.mun)), d);
  return out;
}

/**
 * Per state: how many sections closed on time (before 17:30 Brasília: no detail row exists for them),
 * and who won the state in the 1st turn (most valid votes). Sections without a closing record are
 * neither on time nor late: they are left out of "on time" but stay in the denominator.
 */
export function onTimeByState(data) {
  const st = new Map();
  const get = (uf) => st.get(uf) || st.set(uf, { uf, total: zero(), rows: zero() }).get(uf);
  for (const m of data.mun) addMun(get(m.uf).total, m);
  for (const d of data.det) addSec(get(d.mun.uf).rows, d);     // closed at/after 17:30, or no record
  return [...st.values()].filter((x) => x.total.n).map(({ uf, total: t, rows }) => {
    const on = sub(t, rows);
    const valid = t.vl + t.vf + t.vo;
    const winner = leader(t.vl, t.vf);
    return { uf, n: t.n, on, late: rows.n, pct: on.n / t.n, winner, lulaShare: valid ? t.vl / valid : null,
      flavioShare: valid ? t.vf / valid : null, valid };
  });
}

/**
 * Sections that closed BEFORE the cut (minutes since midnight, Brasília), per state: every analysed
 * section except those that closed at/after the cut or have no closing record.
 */
export function earlyByState(data, cutMin) {
  const T = cutMin * 60;
  const st = new Map();
  const get = (uf) => st.get(uf) || st.set(uf, { uf, total: zero(), notEarly: zero() }).get(uf);
  for (const m of data.mun) addMun(get(m.uf).total, m);
  for (const d of data.det) if (d.enc == null || d.enc >= T) addSec(get(d.mun.uf).notEarly, d);
  return [...st.values()].filter((x) => x.total.n).map(({ uf, total, notEarly }) => ({ uf, n: total.n, early: sub(total, notEarly) }));
}

/**
 * Hypothetical what-if: a fraction p of the voters who turned out in those sections could not vote and
 * would have voted like the others of the same section (we use the 1st-turn vote). Then each candidate loses
 * p x its votes there, so in absolute numbers the candidate with more votes in those sections is the more
 * affected one, and the margin between the two shrinks by p x (difference of their votes).
 */
export function missingScenario(early, p) {
  const lossL = early.vl * p, lossF = early.vf * p;
  return {
    lossL, lossF, margin: early.vl - early.vf, marginEffect: lossL - lossF,
    more: lossL === lossF ? 'empate' : lossL > lossF ? 'lula' : 'flavio',
  };
}

// who leads (most votes among Lula, Flávio and all others together): 'lula' | 'flavio' | 'outros'
// who has more 1st-round votes, Lula or Flávio (the red/blue of the maps); 'outros' only for an exact tie
export const leader = (vl, vf) => (vl > vf ? 'lula' : vf > vl ? 'flavio' : 'outros');

/**
 * Weight of the votes cast after 17:00 (Brasília) in the urnas that closed at/after the threshold,
 * against the official 2nd-round result (data.t2: TSE totals per state and national).
 *   scope '' = Brazil, 'RJ' = one state.  Votes counted in the urna log (va) include blank and null votes,
 * like the turnout (comparecimento) they are compared with.
 */
export function pesoTardio(data, lim, scope = '') {
  const T = lim * 60;
  const by = new Map();
  const get = (uf) => by.get(uf) || by.set(uf, { uf, sections: 0, n: 0, va: 0, l: 0, f: 0, o: 0 }).get(uf);
  for (const m of data.mun) get(m.uf).sections += m.n;
  for (const d of data.det) {
    if (d.enc == null || d.enc < T) continue;
    const u = get(d.mun.uf);
    u.n++; u.va += d.va; u.l += d.l; u.f += d.f; u.o += d.o;
  }
  const make = (acc, t2) => {
    const margin = t2.lula - t2.flavio;
    const valid1 = acc.l + acc.f + acc.o;
    const net = valid1 ? acc.va * ((acc.l - acc.f) / valid1) : 0;       // estimate: late votes split like the section's 1st round
    return { ...acc, votes: t2.comparecimento, margin, winner: margin >= 0 ? 'lula' : 'flavio', gap: Math.abs(margin),
      pctSections: acc.sections ? acc.n / acc.sections : 0, pctVotes: acc.va / t2.comparecimento, pctGap: acc.va / Math.abs(margin),
      net, netPctGap: net / Math.abs(margin), shareL: valid1 ? acc.l / valid1 : 0, shareF: valid1 ? acc.f / valid1 : 0 };
  };
  const states = [...by.values()].filter((u) => data.t2[u.uf]).map((u) => make(u, data.t2[u.uf]));
  const total = [...by.values()].reduce((a, u) => ({ uf: '', sections: a.sections + u.sections, n: a.n + u.n, va: a.va + u.va, l: a.l + u.l, f: a.f + u.f, o: a.o + u.o }),
    { uf: '', sections: 0, n: 0, va: 0, l: 0, f: 0, o: 0 });
  return { states, scope: scope ? make(by.get(scope) || { uf: scope, sections: 0, n: 0, va: 0, l: 0, f: 0, o: 0 }, data.t2[scope]) : make(total, data.t2.BR) };
}
