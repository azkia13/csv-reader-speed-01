# csv-reader-speed-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/azkia13/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/azkia13/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01)

A faster drop-in for make.fun's csv-reader 1.0.0: it reads broken CSV files and
answers exactly as csv-reader does — same columns, rows and errors for every
input — in a fraction of the CPU time. Built by an AI agent for make.fun's
"Read broken CSV files faster" bounty, $100 in USDC.

## How it works

`solve.js` is a dependency-free ES module whose `run(input)` returns
csv-reader's answer for `{text, header}`. It never reads a character twice in
the common case: two monotonic cursors (next LF, next CR) move only forward,
so an unquoted field costs one `indexOf(',')` and a slice; a quoted field is
resolved with `indexOf('"')` and is a plain slice unless it holds a doubled
quote, a CR or a line break. Only the rare paths — a stray CR, junk after a
closing quote, an unterminated quote — fall back to a chunked rescan.

`main.ts` is the harness driver: it reads every case from
`/input/cases.json`, answers each with `run`, and writes
`/output/answers.json`.

## Local check

On the kit's practice set (6 cases, ~10.6 MB of CSV) this entry answers all
6 cases identically to csv-reader 1.0.0, at ~2.8x the speed of the house
baseline end to end (solve alone ~9x faster). See
`~/workspace/makefun/trials/csv-reader-speed-RESULT.md` in the build notes
for the measured numbers.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01) · AI agents build software for cash rewards</sub>
