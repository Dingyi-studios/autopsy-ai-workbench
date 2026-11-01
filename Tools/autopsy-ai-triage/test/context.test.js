// Copyright 2026 Dingyi-studios. Licensed under the Apache License, Version 2.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectContext, renderMarkdown } from '../src/context.js';

const fixture = JSON.parse(await readFile(new URL('../fixtures/synthetic-case.json', import.meta.url), 'utf8'));
function client(override = () => {}) {
  return async (tool, args) => {
    let result = fixture.responses[tool];
    if (Array.isArray(result) && args.limit) result = result.slice(0, args.limit);
    const response = structuredClone({ caseId: fixture.caseLabel, result });
    override(response, tool, args);
    return response;
  };
}
function collect(call = client(), rest = {}) {
  return collectContext({ call, question: '核对合同线索', mode: 'synthetic', ...rest });
}

test('every metadata reference resolves to the exact collected record', async () => {
  const context = await collect();
  assert.equal(context.sourceRefs.length, 7);
  for (const ref of context.sourceRefs) {
    const record = context.sections[ref.section].records[ref.responseIndex];
    assert.equal(record.refId, ref.refId);
    assert.equal(record.metadata.objectId, ref.objectId);
    assert.equal(ref.exportId, context.exportId);
  }
  assert.equal(context.coverage.allEvidenceProcessed, false);
  assert.equal(context.coverage.fileContentsRead, false);
  assert.equal(context.identity.immutableSnapshot, false);
  assert.deepEqual(context.findings, []);
  assert.equal(context.expertBriefs.length, 8);
  assert.ok(context.expertBriefs.every(role => role.state === 'not_run' && role.connector === null));
});

test('reaching a query cap is explicit and no section claims complete coverage', async () => {
  const context = await collect(client(), { limit: 1 });
  assert.equal(context.sections.files.returned, 1);
  assert.equal(context.sections.files.limitReached, true);
  assert.ok(Object.values(context.sections).every(section => section.coverage === 'unknown'));
  assert.match(renderMarkdown(context), /可能存在遗漏/);
});

test('same-case repeated exports cannot collide in reference identity', async () => {
  const first = await collect();
  const second = await collect();
  assert.notEqual(first.exportId, second.exportId);
  assert.notEqual(first.sourceRefs[0].refId, second.sourceRefs[0].refId);
});

test('case-label change in a query or the final check aborts collection', async () => {
  await assert.rejects(collect(client((response, tool) => {
    if (tool === 'query_files') response.caseId = 'different-case';
  })), /Case changed/);
  let summaries = 0;
  await assert.rejects(collect(client((response, tool) => {
    if (tool === 'get_case_summary' && ++summaries === 2) response.caseId = 'different-case';
  })), /Case changed/);
});

test('session verification failure prevents returning an export', async () => {
  await assert.rejects(collect(client(), { assertSession: async () => { throw new Error('session changed'); } }), /session changed/);
});

test('changing counts are recorded without claiming a snapshot', async () => {
  let count = 0;
  const context = await collect(client((response, tool) => {
    if (tool === 'get_case_summary' && ++count === 2) response.result.totalFiles += 1;
  }));
  assert.equal(context.collectionChanged, true);
});

test('closed cases, malformed results, missing IDs, and unsafe IDs fail closed', async () => {
  await assert.rejects(collect(async () => ({ caseId: null, result: { message: 'closed' } })), /No open case/);
  await assert.rejects(collect(client((response, tool) => {
    if (tool === 'query_files') response.result = {};
  })), /Unexpected result/);
  await assert.rejects(collect(client((response, tool) => {
    if (tool === 'query_files') delete response.result[0].objectId;
  })), /valid objectId/);
  await assert.rejects(collect(client((response, tool) => {
    if (tool === 'query_files') response.result[0].objectId = Number.MAX_SAFE_INTEGER + 1;
  })), /Unsafe or invalid/);
});

test('invalid limits and missing questions never issue a tool call', async () => {
  const call = () => assert.fail('must not call Autopsy');
  for (const limit of [0, -1, 501, 1.5, NaN]) await assert.rejects(collect(call, { limit }), /limit/);
  await assert.rejects(collect(call, { question: ' ' }), /question/);
});

test('evidence text remains data and cannot become active Markdown markup', async () => {
  const malicious = '<script>alert(1)</script>|[click](https://example.invalid)\n# forged';
  const context = await collect(client((response, tool) => {
    if (tool === 'query_files') response.result[0].name = malicious;
  }));
  assert.equal(context.sections.files.records[0].metadata.name, malicious);
  const markdown = renderMarkdown(context);
  assert.ok(!markdown.includes('<script>'));
  assert.ok(!markdown.includes('[click]'));
  assert.ok(!markdown.includes('\n# forged'));
  assert.match(markdown, /没有生成案件结论/);
});
