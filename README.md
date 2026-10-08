# BibleOS Sovereign Agent Sandbox & Ledger Verifier

[![CI](https://github.com/Leopard/BibleOS/actions/workflows/test.yml/badge.svg)](https://github.com/Leopard/BibleOS/actions/workflows/test.yml)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-BibleOS--Verify--Action-blue)](https://github.com/marketplace/actions/bibleos-sovereign-agent-sandbox-ledger-verifier)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20-brightgreen.svg)](https://nodejs.org/)

Zero phone-home compliance gatekeeper and cryptographic reality ledger auditor for autonomous AI agents.

---

## 1. Overview

As autonomous AI agents and execution runtimes become widely integrated into enterprise CI/CD systems, preventing unexpected external egress, credential exfiltration, and unverified telemetry is critical.

`bibleos-verify-action` enforces:
1. **Zero Phone-Home Gatekeeper**: Statically audits source code and execution manifests for unauthorized external HTTP/WebSocket network connections, raw socket calls, and untrusted endpoints.
2. **Cryptographic Reality Ledger**: Generates a tamper-evident audit record using nanosecond monotonic timestamps and SHA-256 hash chaining.
3. **GitHub Step Summary**: Automatically produces a concise, readable security compliance audit summary directly in your GitHub Actions run view.

---

## 2. Quick Start

Add the following workflow step to your `.github/workflows/audit.yml`:

```yaml
name: Agent Security Audit

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  verify-agent:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Verify Agent Egress & Ledger
        uses: Leopard/BibleOS@v1
        with:
          target-path: "./src"
          strict-mode: "true"
          allowed-endpoints: "api.openai.com, api.anthropic.com"
          generate-ledger: "true"
          ledger-output: "bibleos-ledger.json"
```

---

## 3. Configuration Reference

### 3.1 Inputs

| Name | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `target-path` | string | `.` | Path to agent code directory or file to audit. |
| `strict-mode` | boolean | `true` | When `true`, fails the workflow execution if any unauthorized endpoint is detected. |
| `allowed-endpoints` | string | `""` | Comma-separated list of whitelisted external domains (e.g. `api.openai.com, api.anthropic.com`). |
| `generate-ledger` | boolean | `true` | Whether to persist a cryptographically chained reality ledger JSON record. |
| `ledger-output` | string | `bibleos-ledger.json` | Destination file path for the persisted reality ledger block. |

### 3.2 Outputs

| Name | Description | Example |
| :--- | :--- | :--- |
| `audit-status` | Compliance evaluation result (`PASSED` or `VIOLATIONS_DETECTED`). | `PASSED` |
| `ledger-hash` | Deterministic SHA-256 hash sealing the audit block. | `ebd575327dceb3fdec175fc0f1b82...` |
| `violations-count` | Number of detected unauthorized egress attempts or hardcoded endpoints. | `0` |

---

## 4. Cryptographic Proof Architecture

```text
Target Codebase (AST & Literal Scan)
              │
              ▼
Zero Phone-Home Gatekeeper Check
              │
    ┌─────────┴─────────┐
    ▼                   ▼
Allowed              Blocked
    │                   │
    └─────────┬─────────┘
              │
              ▼
Reality Ledger Appender
- Actor DID: did:key:bibleos-verify-action
- Monotonic Timestamp
- SHA-256 Chained Block
              │
              ▼
GitHub Actions Step Summary + Outputs
```

Every verification generates a verifiable ledger block structured as follows:

```json
{
  "timestamp": "1791443947775833400",
  "actor": "did:key:bibleos-verify-action",
  "intent": "audit.egress_compliance",
  "action": {
    "target_path": "./src",
    "strict_mode": true,
    "allowed_endpoints": ["api.openai.com"]
  },
  "result": {
    "status": "PASSED",
    "violations_count": 0,
    "scanned_files_count": 12
  },
  "chain_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "entry_hash": "ebd575327dceb3fdec175fc0f1b8276af312a930f2e958fe95ea8f42bc33d361"
}
```

---

## 5. Local Development & Testing

```bash
# Run entire test suite (BOS-1 protocol, kernel, ledger, and action runner)
npm test

# Build single-file production bundle for distribution
npm run build
```

---

## 6. License

This project is licensed under the [MIT License](LICENSE).
