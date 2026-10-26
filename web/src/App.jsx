import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadAll } from './data.js';
import { fmtHM } from './format.js';
import { useRoute } from './router.js';
import { DEFAULT_LIM, readFilters } from './stats.js';
import Explorar from './pages/Explorar.jsx';
import Mapa from './pages/Mapa.jsx';
import Metodologia from './pages/Metodologia.jsx';
import Overview from './pages/Overview.jsx';
import Relatorios from './pages/Relatorios.jsx';
import Secoes from './pages/Secoes.jsx';

const NAV = [['/', 'Visão geral'], ['/mapa', 'Mapa'], ['/explorar', 'Explorar'], ['/secoes', 'Seções'], ['/relatorios', 'Relatórios'], ['/metodologia', 'Metodologia']];
const FILTER_KEYS = ['uf', 'mun', 'lim', 'alt', 'venc'];
const PAGES = { '/': Overview, '/mapa': Mapa, '/explorar': Explorar, '/secoes': Secoes, '/relatorios': Relatorios, '/metodologia': Metodologia };

// filters live in the URL (#/secoes?uf=SP&lim=1140) so any view can be shared
const toQuery = (f, keep) => ({ ...keep, uf: f.uf, mun: f.mun, lim: f.lim === DEFAULT_LIM ? '' : String(f.lim), alt: f.alt, venc: f.venc });

export default function App() {
  const { path, query, go } = useRoute();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');
  const [themeKey, setThemeKey] = useState(0);
  const [menu, setMenu] = useState(false);

  useEffect(() => { loadAll().then(setData).catch(setErr); }, []);
  useEffect(() => { window.scrollTo(0, 0); setMenu(false); }, [path]);

  const qk = JSON.stringify(query);
  const f = useMemo(() => readFilters(query), [qk]); // eslint-disable-line react-hooks/exhaustive-deps
  const setF = useCallback((patch) => {
    const next = { ...f, ...patch };
    if ('uf' in patch && patch.uf !== f.uf && !('mun' in patch)) next.mun = '';
    go(undefined, toQuery(next, query));
  }, [f, query, go]);

  const nav = (to) => go(to, Object.fromEntries(FILTER_KEYS.filter((k) => query[k]).map((k) => [k, query[k]])));
  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('tema', t); } catch { /* private mode */ }
    setTheme(t); setThemeKey((k) => k + 1);
  };

  const Page = PAGES[path] || Overview;
  return (
    <div className="app">
      <a className="skip" href="#conteudo">Pular para o conteúdo</a>
      <header className="topbar">
        <button type="button" className="brand" onClick={() => nav('/')}>Seções das {fmtHM(f.lim)} · 2º turno 2026</button>
        <button type="button" className="menu-btn" aria-expanded={menu} onClick={() => setMenu(!menu)}>Menu</button>
        <nav className={`nav ${menu ? 'open' : ''}`} aria-label="Principal">
          {NAV.map(([to, label]) => <button key={to} type="button" aria-current={path === to ? 'page' : undefined} onClick={() => nav(to)}>{label}</button>)}
          <button type="button" className="tema" onClick={toggleTheme} aria-label={`Mudar para tema ${theme === 'dark' ? 'claro' : 'escuro'}`}>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</button>
        </nav>
      </header>
      <main id="conteudo">
        {err && <p className="aviso">Não foi possível carregar os dados: {String(err.message || err)}. Rode <code>python scripts/build_site_data.py</code>.</p>}
        {!data && !err && <p className="empty">Carregando dados…</p>}
        {data && <Page data={data} f={f} setF={setF} query={query} go={go} themeKey={themeKey} />}
      </main>
      <footer className="rodape">
        {data && <p className="note">Dados gerados em {data.meta.gerado_em}. Fonte: TSE (logs das urnas do 2º turno e votação do 1º turno). Análise descritiva; não afirma irregularidade.</p>}
      </footer>
    </div>
  );
}
