import { useLang } from '../i18n.jsx';
import { fmtN } from '../format.js';

export default function Metodologia({ data }) {
  const { L } = useLang();
  const { meta } = data;
  const rows = Object.entries(meta.ufs);
  const sign = (h) => `${h >= 0 ? '+' : ''}${h}h`;
  const clocks = meta.relogios.length
    ? `: ${meta.relogios.map((r) => `${r.nome} (${sign(r.estado)} → ${sign(r.detectado)})`).join(', ')}`
    : L(' (nenhum detectado nesta versão)', ' (none detected in this version)');
  return (
    <div className="stack metodo">
      <h1 className="page-title">{L('Metodologia e fontes', 'Methodology and sources')}</h1>

      <section className="story">
        <h2>{L('O que é medido', 'What is measured')}</h2>
        <p>
          {L(
            <><strong>Encerramento.</strong> Cada urna eletrônica grava um log com a hora de cada evento. Para cada seção do 2º turno (25/10/2026) lemos o log e guardamos a hora da <em>última</em> ocorrência de “Procedimento de encerramento confirmado”, o momento em que o operador confirma o fim da votação. Também guardamos “Operador selecionou: Encerrar votação”, “Inicio do Encerramento” e o último voto registrado. O encerramento <em>não</em> é um voto: uma seção pode ser encerrada às 19h sem ninguém ter votado nos minutos anteriores.</>,
            <><strong>Closing.</strong> Each electronic urna writes a log with the time of every event. For each runoff section (25/10/2026) we read the log and keep the time of the <em>last</em> “Procedimento de encerramento confirmado” entry, the moment the operator confirms the end of voting. We also keep “Operador selecionou: Encerrar votação”, “Inicio do Encerramento” and the last recorded vote. Closing is <em>not</em> a vote: a section can be closed at 7 pm with nobody having voted in the minutes before.</>,
          )}
        </p>
        <p>
          {L(
            <><strong>Horário de Brasília.</strong> A urna registra a hora do relógio local. Convertemos pelo fuso do estado (AC −2h; AM, RO, RR, MT, MS −1h; demais 0). Fernando de Noronha (+1h) é corrigido à mão. Municípios do Amazonas que usam o fuso do Acre são detectados pela hora típica de encerramento das suas seções{clocks}. O relógio de uma urna pode estar errado; o site não corrige isso.</>,
            <><strong>Brasília time.</strong> The urna records the local clock time. We convert using the state’s time zone (AC −2h; AM, RO, RR, MT, MS −1h; others 0). Fernando de Noronha (+1h) is fixed by hand. Amazonas municipalities that use Acre time are detected from the typical closing time of their sections{clocks}. An urna’s clock can be wrong; the site does not correct that.</>,
          )}
        </p>
        <p>
          {L(
            <><strong>1º turno.</strong> Votos por seção (votação presidencial, TSE). “Venceu” é o candidato com mais votos na seção; empate e outros candidatos ficam em “Outros / empate”. “Votos válidos” somam Lula, Flávio e demais candidatos (sem brancos e nulos). Seções que só existem no 2º turno, ou que foram agregadas, não têm resultado do 1º turno e ficam fora.</>,
            <><strong>1st round.</strong> Votes by section (presidential race, TSE). “Won” is the candidate with the most votes in the section; ties and other candidates go under “Others / tie”. “Valid votes” add up Lula, Flávio and the other candidates (no blank or null votes). Sections that exist only in the runoff, or that were merged, have no 1st-round result and are left out.</>,
          )}
        </p>
      </section>

      <section className="story">
        <h2>{L('Como ler os números', 'How to read the numbers')}</h2>
        <ul>
          <li>{L(<><strong>Limiar.</strong> O filtro “urna encerrada às HH:MM ou depois” é ajustável; o padrão é 18h50 (Brasília), a faixa em que o encerramento se concentra perto das 19h. Com 19h em ponto a contagem é um pouco menor.</>, <><strong>Threshold.</strong> The “urna closed at HH:MM or later” filter is adjustable; the default is 18:50 (Brasília time), the range where closing clusters around 7 pm. With 19:00 sharp the count is slightly smaller.</>)}</li>
          <li>{L(<><strong>Grupos.</strong> “Encerradas no limiar ou depois”, “entre 17h30 e o limiar”, “antes das 17h30 (o normal)” e “sem registro de encerramento” somam todas as seções analisadas. Nenhuma seção fechou antes das 17h.</>, <><strong>Groups.</strong> “Closed at the threshold or later”, “between 17:30 and the threshold”, “before 17:30 (the normal case)” and “no closing record” add up to all sections analysed. No section closed before 17:00.</>)}</li>
          <li>{L(<><strong>Intervalo de confiança.</strong> Mostrado como intervalo de Wilson de 95% para proporções de seções. Com poucas seções ele é largo.</>, <><strong>Confidence interval.</strong> Shown as a 95% Wilson interval for proportions of sections. With few sections it is wide.</>)}</li>
          <li>{L(<><strong>Esperado × observado.</strong> Compara cada seção com as outras do mesmo município (cidades grandes votam diferente da média do país). O desvio-padrão trata as seções como independentes, o que é uma simplificação e torna a faixa estreita demais.</>, <><strong>Expected × observed.</strong> Compares each section with the others in the same municipality (big cities vote differently from the national average). The standard deviation treats sections as independent, which is a simplification and makes the range too narrow.</>)}</li>
          <li>{L(<><strong>“E se faltassem votos?”.</strong> É um cenário hipotético, não uma constatação: supõe que uma fração dos eleitores que compareceram nas seções encerradas antes do horário escolhido não conseguiu votar e que votariam como os demais da mesma seção no 1º turno. Nessa suposição cada candidato perde a mesma fração dos votos que teve ali; em números absolutos perde mais quem tinha mais votos naquelas seções.</>, <><strong>“What if votes were missing?”.</strong> It is a hypothetical scenario, not a finding: it assumes a fraction of the voters who turned out in sections that closed before the chosen time could not vote and would have voted like the others in the same section in the 1st round. Under that assumption each candidate loses the same fraction of the votes they had there; in absolute numbers the one with more votes in those sections loses more.</>)}</li>
          <li>{L(<><strong>Correlação não é causa.</strong> O site mostra quando e onde as urnas encerraram e como essas seções votaram antes. Não explica por que encerraram naquele horário e não afirma irregularidade.</>, <><strong>Correlation is not causation.</strong> The site shows when and where urnas closed and how those sections voted before. It does not explain why they closed at that time and does not claim any irregularity.</>)}</li>
        </ul>
      </section>

      <section className="story">
        <h2>{L('Cobertura', 'Coverage')}</h2>
        <p className="note">{L(`Dados gerados em ${meta.gerado_em}. Seções analisadas: ${fmtN(meta.totais.secoes)}; sem registro de encerramento no log: ${fmtN(meta.totais.sem_registro)}.`, `Data generated at ${meta.gerado_em}. Sections analysed: ${fmtN(meta.totais.secoes)}; with no closing record in the log: ${fmtN(meta.totais.sem_registro)}.`)}</p>
        <div className="tabela-scroll">
          <table>
            <thead><tr><th>{L('UF', 'State')}</th><th className="num">{L('Seções (1º turno)', 'Sections (1st round)')}</th><th className="num">{L('Logs lidos', 'Logs read')}</th><th className="num">{L('Analisadas', 'Analysed')}</th><th className="num">{L('Encerradas depois das 17h30*', 'Closed after 17:30*')}</th><th>{L('Situação', 'Status')}</th></tr></thead>
            <tbody>
              {rows.map(([uf, c]) => (
                <tr key={uf}>
                  <td>{uf}</td><td className="num">{fmtN(c.t1)}</td><td className="num">{fmtN(c.scanned)}</td><td className="num">{fmtN(c.universe)}</td><td className="num">{fmtN(c.registradas)}</td>
                  <td>{!c.t1 ? L('sem dados do 1º turno', 'no 1st-round data') : c.scanned < c.t1 ? L(`faltam ${fmtN(c.t1 - c.scanned)} logs`, `${fmtN(c.t1 - c.scanned)} logs missing`) : L('completo', 'complete')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">{L('* inclui as seções sem registro de encerramento. Seções cujo log ainda não foi lido ficam fora das contas; nunca são tratadas como “encerradas no horário”.', '* includes sections with no closing record. Sections whose log has not been read are left out of the counts; they are never treated as “closed on time”.')}</p>
      </section>

      <section className="story">
        <h2>{L('Fontes e reprodução', 'Sources and reproduction')}</h2>
        <ul>
          <li>{L(<>Logs das urnas, 2º turno: Portal de Resultados do TSE (arquivo-urna, pleito 3221). Coleta: <code>baixar_logs_resultados.py --encerramento</code>, via GitHub Actions (<code>tse-encerramento.yml</code>); os logs são lidos e descartados.</>, <>Urna logs, runoff: TSE Results Portal (arquivo-urna, election 3221). Collection: <code>baixar_logs_resultados.py --encerramento</code>, through GitHub Actions (<code>tse-encerramento.yml</code>); logs are read and discarded.</>)}</li>
          <li>{L(<>Votação por seção, 1º turno: TSE. Preparo: <code>scripts/ingest_t1.py</code>. Seções com local alterado: lista do TSE (2º turno).</>, <>Votes by section, 1st round: TSE. Preparation: <code>scripts/ingest_t1.py</code>. Sections with a changed polling place: TSE list (runoff).</>)}</li>
          <li>{L(<>Contornos: IBGE, via tbrugz/geodata-br (<code>scripts/fetch_geo.py</code>); códigos TSE↔IBGE por nome do município (<code>scripts/build_crosswalk.py</code>).</>, <>Boundaries: IBGE, via tbrugz/geodata-br (<code>scripts/fetch_geo.py</code>); TSE↔IBGE codes matched by municipality name (<code>scripts/build_crosswalk.py</code>).</>)}</li>
          <li>{L(<>Dados do site: <code>scripts/build_site_data.py</code>. Lista das seções encerradas por volta das 19h: <code>scripts/secoes_encerradas_19h.py</code>.</>, <>Site data: <code>scripts/build_site_data.py</code>. List of sections closed around 7 pm: <code>scripts/secoes_encerradas_19h.py</code>.</>)}</li>
        </ul>
      </section>
    </div>
  );
}
