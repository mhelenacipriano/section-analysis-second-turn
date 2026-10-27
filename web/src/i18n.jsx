import { createContext, useContext } from 'react';

// Portuguese is the site's original language; English is a full translation. Strings are written
// inline as L(portuguese, english) so a change to one is next to the other.
export const LangContext = createContext({ lang: 'pt', L: (pt) => pt });
export const useLang = () => useContext(LangContext);

export function detectLang() {
  try {
    const saved = localStorage.getItem('lang2');       // only an explicit choice of the visitor
    if (saved === 'pt' || saved === 'en') return saved;
  } catch { /* private mode */ }
  return 'pt';
}
export const makeL = (lang) => (pt, en) => (lang === 'en' ? en : pt);
