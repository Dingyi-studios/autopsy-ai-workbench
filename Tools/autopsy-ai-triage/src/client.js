// Copyright 2026 Dingyi-studios. Licensed under the Apache License, Version 2.0.
// Added by this fork; talks only to the existing Autopsy loopback MCP endpoint.
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const ALLOWED_TOOLS = new Set([
  'get_case_summary', 'query_data_sources', 'query_files',
  'query_data_artifacts', 'query_analysis_results',
]);

export function configPort(text) {
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^port\s*[=:]\s*(\d+)\s*$/);
    if (match && Number(match[1]) >= 1 && Number(match[1]) <= 65535) {
      return Number(match[1]);
    }
  }
  return 8743;
}

export async function createClient({
  directory = path.join(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'autopsy', 'mcp'),
  timeoutMs = 30_000,
} = {}) {
  let config = '';
  try { config = await readFile(path.join(directory, 'mcp-config.properties'), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const tokenPath = path.join(directory, 'mcp-token');
  let token;
  try { token = (await readFile(tokenPath, 'utf8')).trim(); }
  catch { throw new Error('Autopsy MCP token is missing. Open a case and enable MCP first.'); }
  if (!token || /[\r\n]/.test(token)) throw new Error('Invalid Autopsy MCP token file.');
  const url = `http://127.0.0.1:${configPort(config)}/mcp`;
  let requestId = 0;

  async function assertSession() {
    let current;
    try { current = (await readFile(tokenPath, 'utf8')).trim(); }
    catch { throw new Error('Autopsy session ended during collection. Discard this export and retry.'); }
    if (current !== token) throw new Error('Autopsy session changed during collection. Discard this export and retry.');
  }

  return {
    assertSession,
    async call(name, args = {}) {
      if (!ALLOWED_TOOLS.has(name)) throw new Error(`Tool is not allowed by this read-only exporter: ${name}`);
      await assertSession();
      const id = ++requestId;
      let response;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        response = await fetch(url, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
        });
        if (!response.ok) throw new Error(`Autopsy returned HTTP ${response.status}.`);
        // Bound response bytes before JSON parsing; never log response bodies or credentials.
        const chunks = [];
        let bytes = 0;
        for await (const chunk of response.body) {
          bytes += chunk.byteLength;
          if (bytes > 8 * 1024 * 1024) {
            controller.abort();
            throw new Error('Autopsy response exceeds 8 MiB. Reduce --limit and retry.');
          }
          chunks.push(Buffer.from(chunk));
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (body.jsonrpc !== '2.0' || body.id !== id) throw new Error('Invalid Autopsy JSON-RPC response.');
        if (body.error) throw new Error(`Autopsy tool failed: ${name} (code ${body.error.code ?? 'unknown'}).`);
        if (!body.result || typeof body.result !== 'object') throw new Error('Missing Autopsy tool result.');
        await assertSession();
        return body.result;
      } catch (error) {
        if (controller.signal.aborted) throw new Error('Autopsy request timed out or exceeded the response size limit.');
        throw error;
      } finally { clearTimeout(timer); }
    },
  };
}
