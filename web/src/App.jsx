import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadAll } from './data.js';
import { setLocale } from './format.js';
import { LangContext, detectLang, makeL } from './i18n.jsx';
import { useRoute } from './router.js';
import { DEFAULT_LIM, readFilters } from './stats.js';
import Mapa from './pages/Mapa.jsx';
import Metodologia from './pages/Metodologia.jsx';
import Overview from './pages/Overview.jsx';
import Peso from './pages/Peso.jsx';
import Secoes from './pages/Secoes.jsx';

const FILTER_KEYS = ['uf', 'mun', 'lim', 'alt', 'venc'];
const PAGES = { '/': Overview, '/mapa': Mapa, '/peso': Peso, '/secoes': Secoes, '/metodologia': Metodologia };

// filters live in the URL (#/secoes?uf=SP&lim=1140) so any view can be shared
const toQuery = (f, keep) => ({ ...keep, uf: f.uf, mun: f.mun, lim: f.lim === DEFAULT_LIM ? '' : String(f.lim), alt: f.alt, venc: f.venc });

export default function App() {
  const { path, query, go } = useRoute();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  const [themeKey, setThemeKey] = useState(0);
  const [lang, setLangState] = useState(detectLang);
  const [menu, setMenu] = useState(false);

  setLocale(lang);                         // numbers follow the page language (read while rendering)
  const L = useMemo(() => makeL(lang), [lang]);
  const ctx = useMemo(() => ({ lang, L }), [lang, L]);
  const setLang = (l) => { setLangState(l); try { localStorage.setItem('lang2', l); } catch { /* private mode */ } };

  useEffect(() => { loadAll().then(setData).catch(setErr); }, []);
  useEffect(() => { window.scrollTo(0, 0); setMenu(false); }, [path]);
  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
    document.title = L('Seções que fecharam às 19h · 2º turno 2026', 'Sections closed around 7 pm · 2026 runoff');
  }, [lang, L]);

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
    try { localStorage.setItem('tema2', t); } catch { /* private mode */ }
    setTheme(t); setThemeKey((k) => k + 1);
  };

  const NAV = [['/', L('Resumo', 'Summary')], ['/mapa', L('Mapa', 'Map')], ['/peso', L('Peso dos votos', 'Vote weight')], ['/secoes', L('Seções', 'Sections')], ['/metodologia', L('Metodologia', 'Methodology')]];
  const Page = PAGES[path] || Overview;
  const light = theme === 'light';
  return (
    <LangContext.Provider value={ctx}>
      <div className="app">
        <a className="skip" href="#conteudo">{L('Pular para o conteúdo', 'Skip to content')}</a>
        <header className="topbar">
          <button type="button" className="brand" onClick={() => nav('/')}>{L('Seções das 19h · 2º turno 2026', 'Sections around 7 pm · 2026 runoff')}</button>
          <div className="ctrls">
            <div className="lang" role="group" aria-label="Idioma / Language">
              {[['pt', 'PT'], ['en', 'EN']].map(([k, label]) => (
                <button key={k} type="button" aria-pressed={lang === k} className={lang === k ? 'on' : ''} lang={k} onClick={() => setLang(k)}
                  title={k === 'pt' ? 'Português' : 'English'}>{label}</button>
              ))}
            </div>
            <button type="button" className="icon-btn tema" onClick={toggleTheme} aria-label={light ? L('Mudar para o tema escuro', 'Switch to the dark theme') : L('Mudar para o tema claro', 'Switch to the light theme')}
              title={light ? L('Tema escuro', 'Dark theme') : L('Tema claro', 'Light theme')}>
              <span aria-hidden="true">{light ? '☾' : '☀'}</span><span className="tema-txt">{light ? L('Escuro', 'Dark') : L('Claro', 'Light')}</span>
            </button>
            <button type="button" className="menu-btn" aria-expanded={menu} onClick={() => setMenu(!menu)}>{L('Menu', 'Menu')}</button>
          </div>
          <nav className={`nav ${menu ? 'open' : ''}`} aria-label={L('Principal', 'Main')}>
            {NAV.map(([to, label]) => <button key={to} type="button" aria-current={path === to ? 'page' : undefined} onClick={() => nav(to)}>{label}</button>)}
          </nav>
        </header>
        <main id="conteudo">
          {err && <p className="aviso">{L('Não foi possível carregar os dados', 'Could not load the data')}: {String(err.message || err)}.</p>}
          {!data && !err && <p className="empty">{L('Carregando dados…', 'Loading data…')}</p>}
          {data && <Page data={data} f={f} setF={setF} query={query} go={go} themeKey={themeKey} />}
        </main>
        <footer className="rodape">
          {data && <p className="note">{L(`Dados gerados em ${data.meta.gerado_em}. Fonte: TSE (logs das urnas do 2º turno e votação do 1º turno). Análise descritiva; não afirma irregularidade.`, `Data generated at ${data.meta.gerado_em}. Source: TSE (runoff urna logs and 1st-round votes). Descriptive analysis; it does not claim any irregularity.`)}</p>}
        </footer>
      </div>
    </LangContext.Provider>
  );
}
