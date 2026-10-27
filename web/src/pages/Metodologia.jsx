import { useLang } from '../i18n.jsx';
import { fmtN } from '../format.js';

export default function Metodologia({ data }) {
  const { L } = useLang();
  const { meta } = data;
  return (
    <div className="stack metodo">
      <h1 className="page-title">{L('Como os números foram feitos', 'How the numbers were made')}</h1>

      <section className="story">
        <ul>
          <li>{L(<><strong>Encerramento.</strong> Cada urna grava um log. Usamos a hora da última linha “Procedimento de encerramento confirmado” do dia 25/10/2026, convertida para o horário de Brasília. Não é a hora do último voto.</>,
            <><strong>Closing.</strong> Each urna writes a log. We use the time of the last “Procedimento de encerramento confirmado” line on 25/10/2026, converted to Brasília time. It is not the time of the last vote.</>)}</li>
          <li>{L(<><strong>Votos depois das 17h.</strong> Linhas “O voto do eleitor foi computado” a partir das 17h de Brasília, nas urnas que fecharam no horário escolhido. Inclui quem já estava na fila às 17h.</>,
            <><strong>Votes after 5 pm.</strong> “O voto do eleitor foi computado” lines from 5 pm Brasília time, in the urnas that closed at the chosen time. It includes people already in line at 5 pm.</>)}</li>
          <li>{L(<><strong>1º turno.</strong> Votos por seção do TSE. “Venceu” é quem teve mais votos na seção.</>,
            <><strong>1st round.</strong> TSE votes by section. “Won” is whoever had the most votes in the section.</>)}</li>
          <li>{L(<><strong>2º turno.</strong> Totais oficiais do TSE por estado e do país (incluem o exterior). A “vantagem” é Lula menos Flávio.</>,
            <><strong>2nd round.</strong> Official TSE totals per state and for the country (including overseas). The “margin” is Lula minus Flávio.</>)}</li>
          <li>{L(<><strong>Limite.</strong> O site mostra quando e onde as urnas fecharam. Não explica por quê e não afirma irregularidade.</>,
            <><strong>Limit.</strong> The site shows when and where urnas closed. It does not explain why and does not claim any irregularity.</>)}</li>
        </ul>
      </section>

      <section className="story">
        <h2>{L('Fontes', 'Sources')}</h2>
        <p>{L('Logs das urnas e votação do 1º e 2º turnos: Portal de Resultados do TSE (resultados.tse.jus.br). Contornos dos mapas: IBGE. Código e dados: repositório do projeto no GitHub.',
          'Urna logs and 1st/2nd-round votes: TSE Results Portal (resultados.tse.jus.br). Map outlines: IBGE. Code and data: the project’s GitHub repository.')}</p>
        <p className="note">{L(`Dados gerados em ${meta.gerado_em}. ${fmtN(meta.totais.secoes)} seções analisadas; ${fmtN(meta.totais.sem_registro)} sem registro de encerramento no log.`,
          `Data generated at ${meta.gerado_em}. ${fmtN(meta.totais.secoes)} sections analysed; ${fmtN(meta.totais.sem_registro)} with no closing record in the log.`)}</p>
      </section>
    </div>
  );
}
