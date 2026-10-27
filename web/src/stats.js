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
    cedo: q.cedo === '1' ? '1' : '',                  // only the urnas that closed before 17:30
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

// who has more 1st-round votes, Lula or Flávio (the red/blue of the maps); 'outros' only for an exact tie
export const leader = (vl, vf) => (vl > vf ? 'lula' : vf > vl ? 'flavio' : 'outros');

/**
 * Weight of the votes cast after 17:00 (Brasília) against the official 2nd-round result
 * (data.t2: TSE totals per state and national). The urnas are split by closing time:
 *   early  closed before 17:30 (no detail row)      mid/late  closed at/after 17:30 (or without a record)
 * and `lim` picks the late group (closed at/after lim); `cedo` picks the early group instead.
 * scope '' = Brazil, 'RJ' = one state. Votes counted in the urna log (va) include blank and null votes,
 * like the turnout (comparecimento) they are compared with.
 * Returns { scope, states, all, early }: the selected group for the scope, for every state, and the two
 * groups that add up to every urna of the scope.
 */
export function pesoTardio(data, lim, scope = '', cedo = false) {
  const T = lim * 60;
  const by = new Map();
  const blank = (uf) => ({ uf, sections: 0, va0: 0, nDet: 0, vaDet: 0, n: 0, va: 0 });
  const get = (uf) => by.get(uf) || by.set(uf, blank(uf)).get(uf);
  for (const m of data.mun) { const u = get(m.uf); u.sections += m.n; u.va0 += m.va0 || 0; }
  for (const d of data.det) {
    const u = get(d.mun.uf);
    u.nDet++; u.vaDet += d.va;
    if (d.enc != null && d.enc >= T) { u.n++; u.va += d.va; }
  }
  const pick = (u) => (cedo ? { ...u, n: u.sections - u.nDet, va: u.va0 } : u);
  const make = (acc, t2) => {
    const margin = t2.lula - t2.flavio;
    return { ...acc, votes: t2.comparecimento, margin, winner: margin >= 0 ? 'lula' : 'flavio', gap: Math.abs(margin),
      pctSections: acc.sections ? acc.n / acc.sections : 0, pctVotes: acc.va / t2.comparecimento, pctGap: acc.va / Math.abs(margin) };
  };
  const sum = (list) => list.reduce((a, u) => ({ uf: '', sections: a.sections + u.sections, va0: a.va0 + u.va0, nDet: a.nDet + u.nDet, vaDet: a.vaDet + u.vaDet, n: a.n + u.n, va: a.va + u.va }), blank(''));
  const of = (u) => u || blank(scope);
  const base = scope ? of(by.get(scope)) : sum([...by.values()]);
  const t2 = data.t2[scope || 'BR'];
  return {
    states: [...by.values()].filter((u) => data.t2[u.uf]).map((u) => make(pick(u), data.t2[u.uf])),
    scope: make(pick(base), t2),
    early: make({ ...base, n: base.sections - base.nDet, va: base.va0 }, t2),
    all: make({ ...base, n: base.sections, va: base.va0 + base.vaDet }, t2),
  };
}
