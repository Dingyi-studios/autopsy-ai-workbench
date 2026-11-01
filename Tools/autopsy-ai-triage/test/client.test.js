// Copyright 2026 Dingyi-studios. Licensed under the Apache License, Version 2.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createClient, configPort } from '../src/client.js';

async function mock(t, handler) {
  const directory = await mkdtemp(path.join(tmpdir(), 'autopsy-triage-test-'));
  const server = http.createServer(async (request, response) => {
    try {
      let text = '';
      for await (const chunk of request) text += chunk;
      await handler(request, response, JSON.parse(text), directory);
    } catch (error) { response.destroy(error); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  await writeFile(path.join(directory, 'mcp-config.properties'), `port=${server.address().port}\n`);
  await writeFile(path.join(directory, 'mcp-token'), 'synthetic-test-token');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test('uses loopback, config port, bearer token, and raw Autopsy response envelope', async t => {
  const directory = await mock(t, (request, response, body) => {
    assert.equal(request.url, '/mcp');
    assert.equal(request.headers.authorization, 'Bearer synthetic-test-token');
    assert.equal(body.method, 'tools/call');
    assert.equal(body.params.name, 'get_case_summary');
    response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { caseId: 'demo', result: { totalFiles: 1 } } }));
  });
  const client = await createClient({ directory });
  assert.deepEqual(await client.call('get_case_summary'), { caseId: 'demo', result: { totalFiles: 1 } });
  await assert.rejects(client.call('arbitrary_write_tool'), /not allowed/);
});

test('token rotation while a response is in flight aborts collection', async t => {
  const directory = await mock(t, async (_request, response, body, dir) => {
    await writeFile(path.join(dir, 'mcp-token'), 'different-test-session');
    response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { caseId: 'demo', result: [] } }));
  });
  const client = await createClient({ directory });
  await assert.rejects(client.call('query_files'), /session changed/);
});

test('JSON-RPC errors and wrong response IDs fail without leaking server error text', async t => {
  let calls = 0;
  const directory = await mock(t, (_request, response, body) => {
    response.end(JSON.stringify(++calls === 1
      ? { jsonrpc: '2.0', id: body.id, error: { code: -32603, message: 'private-case-details' } }
      : { jsonrpc: '2.0', id: 'wrong', result: { caseId: 'demo', result: [] } }));
  });
  const client = await createClient({ directory });
  await assert.rejects(client.call('query_files'), error => /tool failed/.test(error.message) && !error.message.includes('private-case-details'));
  await assert.rejects(client.call('query_files'), /Invalid Autopsy JSON-RPC/);
});

test('redirects are rejected instead of forwarding credentials elsewhere', async t => {
  const directory = await mock(t, (_request, response) => {
    response.writeHead(302, { Location: 'https://example.invalid/' });
    response.end();
  });
  const client = await createClient({ directory });
  await assert.rejects(client.call('query_files'));
});

test('timeout covers the whole request, including a stalled body', async t => {
  const directory = await mock(t, (_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{');
  });
  const client = await createClient({ directory, timeoutMs: 80 });
  await assert.rejects(client.call('query_files'), /timed out/);
});

test('config parser handles Windows properties and rejects invalid ports', () => {
  assert.equal(configPort('# port=123\r\nport : 9123\r\n'), 9123);
  assert.equal(configPort('port=0\n'), 8743);
  assert.equal(configPort('port=99999\n'), 8743);
  assert.equal(configPort('port=https://example.invalid\n'), 8743);
});
