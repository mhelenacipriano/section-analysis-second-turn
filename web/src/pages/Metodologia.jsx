import { fmtN } from '../format.js';

export default function Metodologia({ data }) {
  const { meta } = data;
  const rows = Object.entries(meta.ufs);
  return (
    <div className="stack metodo">
      <h1 className="page-title">Metodologia e fontes</h1>

      <section className="story">
        <h2>O que é medido</h2>
        <p>
          <strong>Encerramento.</strong> Cada urna eletrônica grava um log com hora de cada evento. Para cada seção do 2º turno (25/10/2026) lemos o log e guardamos a hora
          da <em>última</em> ocorrência de “Procedimento de encerramento confirmado”, o momento em que o operador confirma o fim da votação. Também guardamos “Operador selecionou:
          Encerrar votação”, “Inicio do Encerramento” e o último voto registrado. O encerramento <em>não</em> é um voto: uma seção pode ser encerrada às 19h sem ninguém ter votado nos
          minutos anteriores.
        </p>
        <p>
          <strong>Horário de Brasília.</strong> A urna registra a hora do relógio local. Convertemos pelo fuso do estado (AC −2h; AM, RO, RR, MT, MS −1h; demais 0).
          Fernando de Noronha (+1h) é corrigido à mão. Municípios do Amazonas que usam o fuso do Acre são detectados pela hora típica de encerramento das suas seções
          {meta.relogios.length ? `: ${meta.relogios.map((r) => `${r.nome} (${r.estado >= 0 ? '+' : ''}${r.estado}h → ${r.detectado >= 0 ? '+' : ''}${r.detectado}h)`).join(', ')}` : ' (nenhum detectado nesta versão)'}.
          O relógio de uma urna pode estar errado; o site não corrige isso.
        </p>
        <p>
          <strong>1º turno.</strong> Votos por seção (votação presidencial, TSE). “Venceu” é o candidato com mais votos na seção; empate e outros candidatos ficam em “Outros / empate”.
          “Votos válidos” somam Lula, Flávio e demais candidatos (sem brancos e nulos). Seções que só existem no 2º turno, ou que foram agregadas, não têm resultado do 1º turno e ficam fora.
        </p>
      </section>

      <section className="story">
        <h2>Como ler os números</h2>
        <ul>
          <li><strong>Limiar.</strong> O filtro “urna encerrada às HH:MM ou depois” é ajustável; o padrão é 19h (Brasília). O gráfico de horários mostra que o encerramento se concentra em torno de 19h.</li>
          <li><strong>Grupos.</strong> “Encerradas no limiar ou depois”, “entre 17h30 e o limiar”, “antes das 17h30 (o normal)” e “sem registro de encerramento” somam todas as seções analisadas.</li>
          <li><strong>Intervalo de confiança.</strong> Mostrado como intervalo de Wilson de 95% para proporções de seções. Com poucas seções ele é largo.</li>
          <li><strong>Esperado × observado.</strong> Compara cada seção com as outras do mesmo município (cidades grandes votam diferente da média do país). O desvio-padrão trata as seções como independentes, o que é uma simplificação.</li>
          <li><strong>Correlação não é causa.</strong> O site mostra quando e onde as urnas encerraram e como essas seções votaram antes. Não explica por que encerraram naquele horário e não afirma irregularidade.</li>
        </ul>
      </section>

      <section className="story">
        <h2>Cobertura</h2>
        <p className="note">Dados gerados em {meta.gerado_em}. Seções analisadas: {fmtN(meta.totais.secoes)}; sem registro de encerramento no log: {fmtN(meta.totais.sem_registro)}.</p>
        <div className="tabela-scroll">
          <table>
            <thead><tr><th>UF</th><th className="num">Seções (1º turno)</th><th className="num">Logs lidos</th><th className="num">Analisadas</th><th className="num">Encerradas depois das 17h30*</th><th>Situação</th></tr></thead>
            <tbody>
              {rows.map(([uf, c]) => (
                <tr key={uf}>
                  <td>{uf}</td><td className="num">{fmtN(c.t1)}</td><td className="num">{fmtN(c.scanned)}</td><td className="num">{fmtN(c.universe)}</td><td className="num">{fmtN(c.registradas)}</td>
                  <td>{!c.t1 ? 'sem dados do 1º turno' : c.scanned < c.t1 ? `faltam ${fmtN(c.t1 - c.scanned)} logs` : 'completo'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">* inclui as seções sem registro de encerramento. Seções cujo log ainda não foi lido ficam fora das contas; nunca são tratadas como “encerradas no horário”.</p>
      </section>

      <section className="story">
        <h2>Fontes e reprodução</h2>
        <ul>
          <li>Logs das urnas, 2º turno: Portal de Resultados do TSE (arquivo-urna, pleito 3221). Coleta: <code>baixar_logs_resultados.py --encerramento</code>, via GitHub Actions (<code>tse-encerramento.yml</code>); os logs são lidos e descartados.</li>
          <li>Votação por seção, 1º turno: TSE. Preparo: <code>scripts/ingest_t1.py</code>. Seções com local alterado: lista do TSE (2º turno).</li>
          <li>Contornos: IBGE, via tbrugz/geodata-br (<code>scripts/fetch_geo.py</code>); códigos TSE↔IBGE por nome do município (<code>scripts/build_crosswalk.py</code>).</li>
          <li>Dados do site: <code>scripts/build_site_data.py</code>. Adicionar estados: rode o ingest, o build e publique de novo.</li>
        </ul>
      </section>
    </div>
  );
}
