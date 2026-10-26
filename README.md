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
