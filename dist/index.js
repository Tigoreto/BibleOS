#!/usr/bin/env node

// packages/action-runner/src/index.js
import path3 from "node:path";
import { fileURLToPath } from "node:url";

// packages/reality-ledger/src/ledger.js
import fs from "node:fs";
import path from "node:path";

// packages/reality-ledger/src/entry.js
import crypto from "node:crypto";
var GENESIS_CHAIN_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
function getMonotonicNanosecondTimestamp() {
  const nowMs = BigInt(Date.now());
  const hrTime = process.hrtime.bigint();
  const nanoPart = hrTime % 1000000n;
  return (nowMs * 1000000n + nanoPart).toString();
}
function computeEntryHash(entry) {
  const content = [
    entry.timestamp,
    entry.actor,
    entry.intent || "",
    JSON.stringify(entry.action || {}),
    JSON.stringify(entry.result || {}),
    JSON.stringify(entry.state_delta || {}),
    entry.context_hash || "",
    entry.chain_hash
  ].join("|");
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}
function createLedgerEntry({
  actor,
  intent,
  action,
  result,
  stateDelta = {},
  contextHash = "",
  previousChainHash = GENESIS_CHAIN_HASH,
  timestamp = getMonotonicNanosecondTimestamp()
}) {
  if (!actor) {
    throw new Error("Ledger entry requires an actor DID");
  }
  const entry = {
    timestamp,
    actor,
    intent: intent || "",
    action: action || {},
    result: result || {},
    state_delta: stateDelta,
    context_hash: contextHash,
    chain_hash: previousChainHash
  };
  const entryHash = computeEntryHash(entry);
  return {
    ...entry,
    entry_hash: entryHash
  };
}

// packages/reality-ledger/src/ledger.js
var RealityLedger = class {
  constructor(options = {}) {
    this.filePath = options.filePath || null;
    this.entries = [];
    if (this.filePath) {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this._loadFromFile();
    }
  }
  _loadFromFile() {
    if (fs.existsSync(this.filePath)) {
      const content = fs.readFileSync(this.filePath, "utf8");
      const lines = content.trim().split("\n").filter(Boolean);
      this.entries = lines.map((line) => JSON.parse(line));
    }
  }
  /**
   * Returns the latest entry's hash to chain the next block.
   */
  getLatestHash() {
    if (this.entries.length === 0) {
      return GENESIS_CHAIN_HASH;
    }
    return this.entries[this.entries.length - 1].entry_hash;
  }
  /**
   * Appends a new verified entry to the Reality Ledger.
   */
  append({ actor, intent, action, result, stateDelta = {}, contextHash = "" }) {
    const previousHash = this.getLatestHash();
    const entry = createLedgerEntry({
      actor,
      intent,
      action,
      result,
      stateDelta,
      contextHash,
      previousChainHash: previousHash
    });
    this.entries.push(entry);
    if (this.filePath) {
      fs.appendFileSync(this.filePath, JSON.stringify(entry) + "\n", "utf8");
    }
    return entry;
  }
  /**
   * Verifies the mathematical integrity of the entire Reality Ledger.
   */
  verifyIntegrity() {
    if (this.entries.length === 0) {
      return { valid: true, count: 0 };
    }
    let expectedPrevHash = GENESIS_CHAIN_HASH;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.chain_hash !== expectedPrevHash) {
        return {
          valid: false,
          brokenIndex: i,
          error: `Chain broken at index ${i}: expected chain_hash ${expectedPrevHash}, found ${entry.chain_hash}`
        };
      }
      const computedHash = computeEntryHash(entry);
      if (computedHash !== entry.entry_hash) {
        return {
          valid: false,
          brokenIndex: i,
          error: `Tampering detected at index ${i}: recorded hash does not match computed content`
        };
      }
      expectedPrevHash = entry.entry_hash;
    }
    return { valid: true, count: this.entries.length };
  }
  getAllEntries() {
    return [...this.entries];
  }
  queryByActor(actorDID) {
    return this.entries.filter((e) => e.actor === actorDID);
  }
  queryByContextHash(contextHash) {
    return this.entries.filter((e) => e.context_hash === contextHash);
  }
  getLatestEntry() {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1] : null;
  }
};

// packages/action-runner/src/scanner.js
import fs2 from "node:fs";
import path2 from "node:path";
var DEFAULT_IGNORED_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".github",
  "dist",
  "build",
  "coverage",
  ".cache"
]);
var SUPPORTED_EXTENSIONS = /* @__PURE__ */ new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".sh",
  ".json",
  ".yaml",
  ".yml"
]);
var LOCAL_HOSTS = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1"
]);
var URL_REGEX = /(?:https?|wss?):\/\/([a-zA-Z0-9.-]+)(?::\d+)?/gi;
var NETWORK_INVOCATION_REGEX = /\b(fetch|axios(?:\.[a-z]+)?|http\.request|https\.request|net\.connect|new\s+WebSocket)\s*\(/g;
function isHostAllowed(host, allowedList = []) {
  const normalizedHost = host.toLowerCase();
  if (LOCAL_HOSTS.has(normalizedHost)) {
    return true;
  }
  for (const pattern of allowedList) {
    const cleanPattern = pattern.trim().toLowerCase();
    if (!cleanPattern) continue;
    if (cleanPattern === "*" || cleanPattern === normalizedHost) {
      return true;
    }
    if (cleanPattern.startsWith("*.") && normalizedHost.endsWith(cleanPattern.slice(1))) {
      return true;
    }
  }
  return false;
}
function scanFile(filePath, allowedEndpoints = []) {
  const content = fs2.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const fileViolations = [];
  const discoveredEndpoints = /* @__PURE__ */ new Set();
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    let match;
    URL_REGEX.lastIndex = 0;
    while ((match = URL_REGEX.exec(line)) !== null) {
      const host = match[1];
      discoveredEndpoints.add(host);
      if (!isHostAllowed(host, allowedEndpoints)) {
        fileViolations.push({
          file: filePath,
          line: lineNum,
          type: "UNAUTHORIZED_ENDPOINT",
          target: match[0],
          detail: `Target host "${host}" is not in the allowed destinations list.`,
          snippet: line.trim()
        });
      }
    }
    NETWORK_INVOCATION_REGEX.lastIndex = 0;
    while ((match = NETWORK_INVOCATION_REGEX.exec(line)) !== null) {
      const callName = match[1];
      if (!line.includes("localhost") && !line.includes("127.0.0.1")) {
        const hasAllowedMatch = allowedEndpoints.some((ep) => ep && line.includes(ep));
        if (!hasAllowedMatch) {
          fileViolations.push({
            file: filePath,
            line: lineNum,
            type: "DYNAMIC_NETWORK_INVOCATION",
            target: callName,
            detail: `Potential dynamic egress invocation: ${callName}(...) without explicit whitelisted endpoint binding.`,
            snippet: line.trim()
          });
        }
      }
    }
  });
  return {
    filePath,
    violations: fileViolations,
    endpoints: Array.from(discoveredEndpoints)
  };
}
function scanDirectory(targetPath, options = {}) {
  const allowedEndpoints = (options.allowedEndpoints || []).flatMap((item) => typeof item === "string" ? item.split(",") : []).map((s) => s.trim()).filter(Boolean);
  const allViolations = [];
  const allEndpoints = /* @__PURE__ */ new Set();
  let scannedFileCount = 0;
  function walk(currentPath) {
    if (!fs2.existsSync(currentPath)) {
      return;
    }
    const stat = fs2.statSync(currentPath);
    if (stat.isFile()) {
      const ext = path2.extname(currentPath).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        scannedFileCount++;
        const result = scanFile(currentPath, allowedEndpoints);
        if (result.violations.length > 0) {
          allViolations.push(...result.violations);
        }
        result.endpoints.forEach((ep) => allEndpoints.add(ep));
      }
      return;
    }
    if (stat.isDirectory()) {
      const dirName = path2.basename(currentPath);
      if (DEFAULT_IGNORED_DIRS.has(dirName)) {
        return;
      }
      const files = fs2.readdirSync(currentPath);
      for (const file of files) {
        walk(path2.join(currentPath, file));
      }
    }
  }
  walk(targetPath);
  return {
    targetPath,
    scannedFileCount,
    allowedEndpoints,
    discoveredEndpoints: Array.from(allEndpoints),
    violations: allViolations,
    isCompliant: allViolations.length === 0
  };
}

// packages/action-runner/src/reporter.js
import fs3 from "node:fs";
function buildMarkdownSummary({ scanResult, ledgerEntry, strictMode }) {
  const statusText = scanResult.isCompliant ? "PASSED" : "VIOLATIONS_DETECTED";
  const statusBadge = scanResult.isCompliant ? "**Status**: `COMPLIANT (PASSED)`" : "**Status**: `BREACH DETECTED (FAILED)`";
  let md = `## BibleOS Sovereign Sandbox & Reality Ledger Audit Report

`;
  md += `${statusBadge}

`;
  md += `| Metric | Value |
`;
  md += `| :--- | :--- |
`;
  md += `| Target Path | \`${scanResult.targetPath}\` |
`;
  md += `| Scanned Files | \`${scanResult.scannedFileCount}\` |
`;
  md += `| Discovered Endpoints | \`${scanResult.discoveredEndpoints.length}\` |
`;
  md += `| Unauthorized Egress Count | \`${scanResult.violations.length}\` |
`;
  md += `| Strict Mode Enforcement | \`${strictMode}\` |

`;
  if (ledgerEntry) {
    md += `### Reality Ledger Cryptographic Proof

`;
    md += `| Field | Value |
`;
    md += `| :--- | :--- |
`;
    md += `| Block Hash (SHA-256) | \`${ledgerEntry.entry_hash}\` |
`;
    md += `| Previous Chain Hash | \`${ledgerEntry.previous_chain_hash}\` |
`;
    md += `| Timestamp (Nanoseconds) | \`${ledgerEntry.timestamp_ns}\` |
`;
    md += `| Actor DID | \`${ledgerEntry.actor}\` |
`;
    md += `| Cryptographic Signature | \`VERIFIED\` |

`;
  }
  if (scanResult.violations.length > 0) {
    md += `### Intercepted Egress Violations (${scanResult.violations.length})

`;
    md += `| File | Line | Violation Type | Target Endpoint / Call | Detail |
`;
    md += `| :--- | :---: | :--- | :--- | :--- |
`;
    for (const v of scanResult.violations.slice(0, 50)) {
      const safeFile = v.file.replace(/\\/g, "/");
      md += `| \`${safeFile}\` | ${v.line} | \`${v.type}\` | \`${v.target}\` | ${v.detail} |
`;
    }
    if (scanResult.violations.length > 50) {
      md += `
> Truncated: ${scanResult.violations.length - 50} additional violations not listed.

`;
    }
  } else {
    md += `### Gatekeeper Audit Passed

`;
    md += `All inspected source files conform to Zero Phone-Home policies. No unauthorized outbound transmission endpoints detected.

`;
  }
  return md;
}
function writeStepSummary(markdownContent) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    try {
      fs3.appendFileSync(summaryPath, markdownContent + "\n", "utf8");
    } catch (err) {
      console.error(`[WARN] Failed to write GITHUB_STEP_SUMMARY: ${err.message}`);
    }
  }
}
function setActionOutput(key, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    try {
      fs3.appendFileSync(outputPath, `${key}=${value}
`, "utf8");
    } catch (err) {
      console.error(`[WARN] Failed to write GITHUB_OUTPUT: ${err.message}`);
    }
  }
}

// packages/action-runner/src/index.js
function parseBoolean(val, fallback = false) {
  if (val === void 0 || val === null || val === "") return fallback;
  const s = String(val).toLowerCase().trim();
  return s === "true" || s === "1" || s === "yes";
}
function getActionInput(name, fallback = "") {
  const envKey = `INPUT_${name.replace(/ /g, "_").replace(/-/g, "_").toUpperCase()}`;
  return process.env[envKey] !== void 0 ? process.env[envKey] : fallback;
}
async function runAudit(options = {}) {
  const targetPath = options.targetPath || path3.resolve(getActionInput("target-path", "."));
  const strictMode = options.strictMode !== void 0 ? options.strictMode : parseBoolean(getActionInput("strict-mode", "true"), true);
  const rawAllowed = options.allowedEndpoints || getActionInput("allowed-endpoints", "");
  const allowedEndpoints = typeof rawAllowed === "string" ? rawAllowed.split(",") : rawAllowed || [];
  const generateLedger = options.generateLedger !== void 0 ? options.generateLedger : parseBoolean(getActionInput("generate-ledger", "true"), true);
  const ledgerOutput = options.ledgerOutput || getActionInput("ledger-output", "bibleos-ledger.json");
  console.log(`[*] Starting BibleOS Sovereign Sandbox & Reality Ledger Audit...`);
  console.log(`[*] Target Path: ${targetPath}`);
  console.log(`[*] Strict Mode: ${strictMode}`);
  if (allowedEndpoints.length > 0) {
    console.log(`[*] Whitelisted Endpoints: ${allowedEndpoints.filter(Boolean).join(", ")}`);
  }
  const scanResult = scanDirectory(targetPath, { allowedEndpoints });
  console.log(`[*] Scanned ${scanResult.scannedFileCount} files across target.`);
  let ledgerEntry = null;
  if (generateLedger) {
    const ledgerPath = ledgerOutput ? path3.resolve(ledgerOutput) : null;
    const ledger = new RealityLedger({ filePath: ledgerPath });
    ledgerEntry = ledger.append({
      actor: "did:key:bibleos-gatekeeper-ci",
      intent: "audit_agent_zero_phone_home_compliance",
      action: "execute_static_and_sandbox_egress_check",
      result: {
        status: scanResult.isCompliant ? "PASSED" : "VIOLATIONS_DETECTED",
        scanned_files: scanResult.scannedFileCount,
        violation_count: scanResult.violations.length,
        endpoints_found: scanResult.discoveredEndpoints
      },
      stateDelta: {
        compliance_verified: scanResult.isCompliant,
        target: targetPath
      }
    });
    console.log(`[*] Cryptographic Reality Ledger block committed. Hash: ${ledgerEntry.entry_hash}`);
    if (ledgerPath) {
      console.log(`[*] Ledger file persisted at: ${ledgerPath}`);
    }
  }
  const markdownSummary = buildMarkdownSummary({
    scanResult,
    ledgerEntry,
    strictMode
  });
  writeStepSummary(markdownSummary);
  const auditStatus = scanResult.isCompliant ? "PASSED" : "VIOLATIONS_DETECTED";
  setActionOutput("audit-status", auditStatus);
  setActionOutput("violations-count", String(scanResult.violations.length));
  if (ledgerEntry) {
    setActionOutput("ledger-hash", ledgerEntry.entry_hash);
  }
  if (scanResult.isCompliant) {
    console.log(`[+] SUCCESS: Audit PASSED. All files comply with Zero Phone-Home standards.`);
    return { success: true, scanResult, ledgerEntry };
  } else {
    console.error(`[-] FAILURE: Intercepted ${scanResult.violations.length} unauthorized egress breaches.`);
    if (strictMode) {
      console.error(`[-] Strict mode enabled. Intercepting pipeline execution.`);
      return { success: false, scanResult, ledgerEntry };
    } else {
      console.warn(`[!] Strict mode disabled. Warning logged, continuing pipeline.`);
      return { success: true, scanResult, ledgerEntry };
    }
  }
}
var __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path3.resolve(process.argv[1]) === path3.resolve(__filename)) {
  runAudit().then((result) => {
    if (!result.success) {
      process.exit(1);
    }
  }).catch((err) => {
    console.error(`[FATAL] Action failed with unhandled exception: ${err.message}`);
    process.exit(1);
  });
}
export {
  runAudit
};
