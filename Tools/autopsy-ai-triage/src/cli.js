#!/usr/bin/env node
// Copyright 2026 Dingyi-studios. Licensed under the Apache License, Version 2.0.
// Added by this fork. No model API calls, shell execution or original-evidence writes.
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from './client.js';
import { collectContext, renderMarkdown } from './context.js';

const HELP = `Autopsy AI Workbench v0.1 — read-only metadata context exporter

  npm run demo -- [--question "问题"] [--out output/demo] [--limit 50]
  npm run collect -- --question "问题" [--out output/live] [--limit 50]

Demo uses synthetic fixtures and works without Autopsy. Live collection requires
Autopsy 4.23.1 on Windows with an open case and the local MCP server enabled.
Output stays on your computer; no model API is called. Each run gets a new folder.
Do not store real case exports in this repository or a cloud-synced directory.
`;

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || args.includes('--help')) {
    process.stdout.write(HELP);
    return;
  }
  if (!['demo', 'collect'].includes(command)) throw new Error('Expected demo or collect. Use --help.');
  const options = new Map();
  for (let index = 0; index < args.length; index += 2) {
    if (!['--question', '--out', '--limit'].includes(args[index]) || !args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error('Invalid option. Use --help.');
    }
    if (options.has(args[index])) throw new Error(`Duplicate option: ${args[index]}`);
    options.set(args[index], args[index + 1]);
  }
  const question = options.get('--question') ?? (command === 'demo' ? '梳理演示材料中合同、通信与浏览记录的核查线索。' : '');
  const limit = Number(options.get('--limit') ?? 50);
  let client;
  if (command === 'demo') {
    const fixture = JSON.parse(await readFile(new URL('../fixtures/synthetic-case.json', import.meta.url), 'utf8'));
    client = {
      call: async (tool, args) => {
        if (!(tool in fixture.responses)) throw new Error(`Missing synthetic tool: ${tool}`);
        let result = fixture.responses[tool];
        if (Array.isArray(result) && args.limit) result = result.slice(0, args.limit);
        return structuredClone({ caseId: fixture.caseLabel, result });
      },
    };
  } else { client = await createClient(); }
  const context = await collectContext({ ...client, question, limit, mode: command === 'demo' ? 'synthetic' : 'live' });
  const base = path.resolve(options.get('--out') ?? `output/${command === 'demo' ? 'demo' : 'live'}`);
  await mkdir(base, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(path.join(base, 'run-'));
  await writeFile(path.join(directory, 'context.json'), `${JSON.stringify(context, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await writeFile(path.join(directory, 'review.md'), renderMarkdown(context), { mode: 0o600, flag: 'wx' });
  process.stdout.write(`Created local metadata preview (${context.mode}):\n${directory}\nNo AI analysis has been run.\n`);
}

main().catch(error => {
  process.stderr.write(`Export failed: ${error.message}\n`);
  process.exitCode = 1;
});
