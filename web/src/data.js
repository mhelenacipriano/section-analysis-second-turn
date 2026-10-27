const base = import.meta.env.BASE_URL;
const getJson = async (name, optional = false) => {
  const r = await fetch(`${base}data/${name}`);
  if (!r.ok) { if (optional) return null; throw new Error(`${name}: HTTP ${r.status}`); }
  return r.json();
};

export async function loadAll() {
  const [meta, mrows, drows, arows, t2] = await Promise.all([
    getJson('meta.json'), getJson('municipios.json'), getJson('encerramentos.json'), getJson('alteradas.json', true), getJson('t2.json', true)]);

  const mun = mrows.map((r, id) => {
    const o = { id };
    meta.mcols.forEach((c, i) => { o[c] = r[i]; });
    return o;
  });
  const det = drows.map((r) => {
    const o = {};
    meta.dcols.forEach((c, i) => { o[c] = r[i]; });
    o.mun = mun[o.mi];
    return o;
  });
  const alt = (arows || []).map((r) => {
    const o = { ...r, mun: r.mi != null ? mun[r.mi] : null };
    if (r.s) {
      const [ap, cp, l, f, oth, b, n, v, enc, ult, va, sr] = r.s;
      Object.assign(o, { ap, cp, l, f, o: oth, b, n, v, enc, ult, va, sr });
    }
    return o;
  });
  const ufs = [...new Set(mun.map((m) => m.uf))].sort();
  const codeByIbge = new Map(mun.filter((m) => m.ibge).map((m) => [m.ibge, m.cod]));
  return { meta, mun, det, alt, ufs, codeByIbge, t2 };
}

const geoCache = new Map();
export function loadGeo(name) {
  if (!geoCache.has(name)) {
    geoCache.set(name, fetch(`${base}geo/${name}`).then((r) => {
      if (!r.ok) throw new Error(`geo/${name}: HTTP ${r.status}`);
      return r.json();
    }));
  }
  return geoCache.get(name);
}
