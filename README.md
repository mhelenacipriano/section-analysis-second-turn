# Seções com votos após as 17h — 2º turno 2026

Finds the electoral sections whose urna recorded votes **at or after 17:00 Brasília time**
on 25/10/2026 (2º turno, pleito `3221`, ciclo `ele2026`). The cutoff is converted per state to
the urna's local clock (AC −2h; AM, RR, RO, MT, MS −1h).

For every section the script downloads the urna log (`…-log.jez`) from
<https://resultados.tse.jus.br>, counts the "O voto do eleitor foi computado" events, and
**deletes the log right away** (the raw logs are ~75 GB and are never committed or stored).
Only small text files are kept in the repo.

## Running it on GitHub Actions

1. Merge this to the **default branch** (scheduled workflows only run from there).
2. Repo → **Settings → Actions → General → Workflow permissions**: make sure Actions are
   allowed; the commit job asks for `contents: write` itself.
3. **Actions tab → `tse-logs` → Run workflow.** After that it also runs on its own every two
   hours (minute 17) until every state is done.

How a run works:

- One job per UF (the 27 states + `ZZ`, exterior), **two at a time**, 12 concurrent downloads
  each. The TSE server answers HTTP 429 when pushed; the script backs off and, if more than
  50% of the requests in the last 200 sections were 429s, stops early instead of hammering.
- Each job works for at most 300 minutes, then saves its progress and exits cleanly. The next
  run picks up where it stopped (a job can't exceed 6 hours).
- A final job collects every state's files, rebuilds `results/secoes_apos_17h_BR.csv`, and
  makes **one** commit. Runs never overlap (`concurrency: tse-logs`).
- The results are committed to the branch the run was started from, so use
  **Use workflow from: `main`** when starting it.
- If the commit job ever fails, the state files are still in the run's artifacts for 7 days:
  **Actions → `tse-logs-collect` → Run workflow** with that run's id commits them.
- A state with `state/complete_<UF>` is skipped. When all 28 exist the workflow does nothing.

## Reading progress

| File | Meaning |
|---|---|
| `state/done_<UF>.txt` | one line `municipio,zona,secao` per section already checked (merged sections, whose votes are in another section's urna, count as done) |
| `state/complete_<UF>` | nothing left to check in that UF |
| `results/secoes_apos_17h_<UF>.csv` | sections with votes at/after the cutoff in that UF |
| `results/secoes_apos_17h_BR.csv` | all of the above, merged, sorted by `votos_apos_corte` |
| `results/problemas_<UF>.csv` | sections that failed; retried on the next run, removed when they succeed |

Sections checked so far: `wc -l state/done_*.txt` (one line each; the last line is the total).
Sections still to do in a UF: its total, which the job log prints as `N sections in UF`, minus
the line count of `state/done_<UF>.txt`. States finished: `ls state/complete_*`.

A section that fails with a real error (no `aux` file, no log listed, unreadable log) is retried
on the next 2 runs and then given up (`--max-tentativas 3`); it stays in `problemas_<UF>.csv`
and the state is still marked complete. Rate limiting and network errors never count against a
section.

### CSV columns

`secoes_apos_17h_<UF>.csv` and `…_BR.csv`:

| Column | |
|---|---|
| `uf` | state (`ZZ` = exterior) |
| `municipio`, `nome_municipio` | TSE municipality code (5 digits) and name |
| `zona`, `secao` | zone and section numbers (4 digits) |
| `hora_corte_local` | the cutoff on that urna's clock (e.g. `15:00` in AC) |
| `votos_no_dia` | votes the urna recorded on the election day |
| `votos_apos_corte` | of those, votes at or after the cutoff |
| `primeiro_voto_apos_corte` | time of the first such vote (`HH:MM:SS`, urna clock) |
| `ultimo_voto` | time of the last vote of the day |

`problemas_<UF>.csv`: `municipio, zona, secao, problema, tentativas, indice`
(`tentativas` = failed runs counted so far; `indice` = the section's entry in the TSE index).

## Running locally

```
pip install requests py7zr
python baixar_logs_resultados.py --uf AP --listar-municipios
python baixar_logs_resultados.py --uf AP --municipio 06106 --no-keep-logs   # small test
python baixar_logs_resultados.py --uf AP --pleito 3221 --workers 12 --no-keep-logs --max-minutes 60
python merge_resultados.py                                                  # rebuild the BR csv
```

`--no-keep-logs` parses each log in memory; without it logs are cached in `logs_urna/<UF>/`
(git-ignored). `--max-minutes N` stops taking new sections after N minutes, finishes the ones in
flight, saves, and exits 0. State is also saved every 500 sections and on Ctrl-C / SIGTERM.

`votos_apos_17h.py` is the log parser (also usable on a folder of already-downloaded logs).

## Closing-time scan (`tse-encerramento`)

The first scan (`tse-logs`) lists sections with **votes** after 17h. A section can also be **closed** late
without a late vote, so a second scan reads the closing sequence of each urna log: the last
`Procedimento de encerramento confirmado` of 25/10/2026 (plus `Operador selecionou: Encerrar votação`,
`Inicio do Encerramento`, and the last vote).

- Actions tab → **`tse-encerramento` → Run workflow** (use workflow from `main`). Same design as `tse-logs`
  (one job per UF, two at a time, 12 downloads each, resumable); it has no schedule: if a state does not finish
  in one run (6 h limit, rate limiting), run it again.
- `state_enc/done_<UF>.txt`: one line per section read, `municipio,zona,secao,HHMMSS` = confirmed closing time on
  the urna clock (`-` if the log has none). `state_enc/complete_<UF>` when a state is finished.
- `results_enc/encerramentos_<UF>.csv` (+ `encerramentos_BR.csv`): sections that closed at/after 17:30 Brasília or
  have no closing record, with `encerrar_selecionado`, `encerramento_confirmado`, `inicio_encerramento`,
  `ultimo_voto`, `votos_apos_corte` (urna clock, `HH:MM:SS`).
- Locally: `python baixar_logs_resultados.py --uf AP --pleito 3221 --workers 12 --no-keep-logs --encerramento`.

## Dashboard (`web/`)

React + Vite single-page site (hash routes, filters kept in the URL): overview, map (state → municipality),
"Fecharam às 17h" (states ranked by share of sections closed on time, with the first-turn winner of each state; map coloured red/blue by winner and labelled with the percentage), explore (states/municipalities), sections table, reports (threshold sweep, closing-time histogram,
expected × observed within each municipality, changed polling places) and methodology. Everything is
filterable by state, municipality, closing-time threshold (default 19:00 Brasília), first-turn winner and
"polling place changed"; tables export CSV.

Data pipeline (Python, `pip install pandas`):

```
# 1. first-turn results by section, as the TSE zips (parts of one state, e.g. SP_parte_01..09, in the SAME call)
python scripts/ingest_t1.py AC.zip AL.zip AM.zip AP.zip BA.zip        # -> data/t1/secoes_t1_<UF>.csv.gz
# 2. municipality codes TSE <-> IBGE (only needed when a new state is added)
python scripts/build_crosswalk.py                                      # -> data/tse_ibge.csv
# 3. municipality boundaries (once)
python scripts/fetch_geo.py                                            # -> web/public/geo/
# 4. everything the site reads
python scripts/build_site_data.py                                      # -> web/public/data/*.json (git-ignored)
```

Run the site: `cd web && npm install && npm run dev` (or `npm run build` and serve `web/dist`).

Only sections that have **both** a first-turn result and a closing time are analysed; the rest are listed per
state on the Methodology page and never counted as "closed on time". Adding states = ingest the new zips,
commit `data/t1/` and `data/tse_ibge.csv`; the `site` workflow rebuilds and publishes
(Settings → Pages → Source: GitHub Actions). It also republishes when a `tse-encerramento` run finishes.

Known limits: the urna clock is converted by state (AC −2h, AM/RO/RR/MT/MS −1h); Fernando de Noronha is
fixed by hand and Amazonas municipalities on Acre time are detected from their closing times. The closing
time is when the operator confirmed closing, not proof that voting happened until then.

## The list: sections closed around 19h

```
python scripts/secoes_encerradas_19h.py              # closed at/after 18:50 Brasília (default)
python scripts/secoes_encerradas_19h.py --desde 19:00
```

Writes `results_enc/secoes_encerradas_19h.csv`: one row per section with the confirmed closing time **in
Brasília time**, the last vote, votes after 17h, and the first-turn result (Lula / Flávio votes and %, winner).
The raw `results_enc/encerramentos_<UF>.csv` files are in the urna's local time (16:30 on an MT/MS/AM/RO/RR
urna is 17:30 Brasília) and keep every section that closed from 17:30 Brasília on, so the site's slider can
move; only the sections in the window above are "closed around 19h". Clock rules live in `scripts/clocks.py`.
