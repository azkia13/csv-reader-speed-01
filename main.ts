// csv-reader-speed-01: the harness entrypoint. Node runs `node /bot/main.ts`.
// It reads every case from /input/cases.json (or $MAKEFUN_INPUT_DIR), answers
// each one alone with run() from solve.js, and writes /output/answers.json
// (or $MAKEFUN_OUTPUT_DIR): a JSON array of the answers, one per case and in
// the cases' order. V8's incremental marking is switched off before solve.js
// is imported, so all of its work runs under that flag, as the house
// baseline's driver does.
//
// SPDX-License-Identifier: MIT

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');

const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as {
  id: string;
  input: unknown;
}[];
const answers: unknown[] = [];
for (const c of cases) answers.push(run(c.input));
writeFileSync(join(OUTPUT_DIR, 'answers.json'), JSON.stringify(answers));
