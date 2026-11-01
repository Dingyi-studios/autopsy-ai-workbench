# Autopsy AI triage context exporter

Version 0.1.0. Original addition in the Autopsy AI Workbench fork. Node.js >=22; zero package dependencies.

## Usage

```bash
npm run demo
npm run demo -- --question "梳理合同与通信线索" --limit 2 --out output/custom-demo
npm run collect -- --question "你的案件问题" --out C:/ForensicLocal/triage-preview --limit 50
npm run check
npm test
```

Use a local, non-synchronized directory appropriate for the case when collecting real data. The default `output/` directory is ignored by Git. Each run creates a new folder and writes:

- `context.json`: question, case label, beginning/end summaries, bounded metadata records, source references, explicit coverage limitations, and eight unexecuted expert briefs.
- `review.md`: a human-readable preview, coverage table and object/reference index. This is not a forensic finding report.

`demo` uses only [`fixtures/synthetic-case.json`](fixtures/synthetic-case.json); no Autopsy process, token or external account is needed. `collect` requires an open case and the MCP feature enabled in Windows Autopsy 4.23.1. The live integration has not yet been validated against a running Windows installation.

## Protocol and checks

This client uses Autopsy's existing raw JSON-RPC HTTP endpoint, not the standard STDIO SDK envelope. It reads `mcp-config.properties` and `mcp-token` from `%LOCALAPPDATA%/autopsy/mcp/`, uses default port **8743** when no valid port is set, and sends only these read operations to `127.0.0.1`:

1. `get_case_summary`
2. `query_data_sources`
3. `query_files` with `limit`
4. `query_data_artifacts` with `limit`
5. `query_analysis_results` with `limit`
6. `get_case_summary` again, followed by a final session-token check

Requests are sequential. A per-request 30-second timeout and 8-MiB response limit apply. Redirects are rejected; the bearer token is not printed, persisted in exports, or forwarded to external hosts. Export fails if a detected session or case-label change occurs, any required query fails, returned object identifiers are unsafe JavaScript integers, or expected response shapes are invalid. Do not change cases while collecting.

The existing `caseId` is a display name. Token and label checks **do not establish a stable case identity or immutable snapshot**, and may miss same-name switches or data changes with unchanged counts. Stable identities and snapshot-bound export belong in a future Java Bridge implementation.

## Source references and coverage

A reference identifies an actual metadata row collected in this run. The JSON keeps the tool, arguments, response index, Autopsy object ID, and available source-file/data-source IDs. Artifact object IDs and source-file IDs have different meanings and are retained separately.

No raw file contents are read. A metadata reference is not a page-, line- or byte-level content citation. Returned rows are not ranked by relevance to the supplied question. The question is recorded for a future expert workflow; it does not change the upstream queries.

File and artifact queries accept `--limit` from 1 to 500. Hitting the limit is marked explicitly. There is no cursor, and a result below the limit still does not demonstrate that all evidence was ingested, parsed or considered. All section coverage remains `unknown`; the export is always `partial-preview`.

The eight briefs are original task descriptions. No model, parser, sandbox or commercial expert connector is supplied or executed. Evidence content is untrusted input; do not turn text in exported records into instructions or execute files during review.

## Verification

`npm test` exercises reference resolution, query caps, changing case labels/session tokens, changing case counts, malformed results, unsafe IDs, Markdown escaping, real loopback HTTP authentication, redirect rejection and stalled-body timeouts. CI runs the same tests and synthetic demo on Linux and Windows with Node.js 22. Those tests do not replace live Autopsy interoperability testing.
