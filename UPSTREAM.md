# Upstream attribution and fork changes

## Baseline

- Original project: [sleuthkit/autopsy](https://github.com/sleuthkit/autopsy)
- Baseline tag: [`autopsy-4.23.1`](https://github.com/sleuthkit/autopsy/releases/tag/autopsy-4.23.1)
- Baseline commit: [`bbf4002ecb41bce02021b180e613dd0b2f864d20`](https://github.com/sleuthkit/autopsy/commit/bbf4002ecb41bce02021b180e613dd0b2f864d20)
- Core license: [Apache License 2.0](LICENSE-2.0.txt), subject to existing third-party notices and licenses.

Autopsy is developed by its upstream authors and contributors. This independent fork does not claim authorship of the Autopsy application, The Sleuth Kit, existing parsers or bundled third-party tools, and is not endorsed by those projects. Their source headers, history, notices and original `README.txt` are retained.

## Changes by Dingyi-studios — 2026-11-01

- Added `Tools/autopsy-ai-triage/`: a dependency-free Node.js CLI for bounded, read-only case metadata previews through the existing local Autopsy MCP endpoint.
- Added export-scoped metadata references, case-label/session-change checks, honest coverage reporting, and eight original expert integration briefs.
- Added a fully synthetic fixture, unit and mock-HTTP tests, and Linux/Windows CI for the new tool.
- Added this fork's `README.md`, usage documentation and architecture roadmap.

No Java application code, upstream branding, forensic parser or existing MCP tool is changed in this version. The new source files are marked with the fork author and Apache-2.0 headers. No rebuilt installer or bundled executable is published by this change.

The `.txt` upstream README and `.md` fork README have separate purposes: the former preserves original project information; the latter explains the additions and their current limitations. Future modifications to upstream files should retain their existing notices and state material fork changes.
