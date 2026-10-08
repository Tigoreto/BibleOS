// packages/action-runner/src/index.js
import path3 from "node:path";
import { fileURLToPath } from "node:url";

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
import fs from "node:fs";
import path from "node:path";
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

// packages/action-runner/src/reporter.js
import fs2 from "node:fs";
function formatStepSummary({
  targetPath,
  strictMode,
  scannedFilesCount,
  detectionsCount,
  violations,
  ledgerEntry,
  ledgerIntegrity
}) {
  const status = violations.length === 0 ? "PASSED" : "VIOLATIONS_DETECTED";
  const lines = [
    "# BibleOS Sandbox & Reality Ledger Audit Report",
    "",
    "## 1. Audit Execution Overview",
    "",
    "| Parameter | Value |",
    "| :--- | :--- |",
    `| **Audit Status** | \`${status}\` |`,
    `| **Target Path** | \`${targetPath}\` |`,
    `| **Strict Mode** | \`${strictMode}\` |`,
    `| **Files Scanned** | ${scannedFilesCount} |`,
    `| **Network Detections** | ${detectionsCount} |`,
    `| **Policy Violations** | ${violations.length} |`,
    ""
  ];
  if (ledgerEntry) {
    lines.push("## 2. Reality Ledger Cryptographic Proof");
    lines.push("");
    lines.push("| Field | Value |");
    lines.push("| :--- | :--- |");
    lines.push(`| **Actor DID** | \`${ledgerEntry.actor}\` |`);
    lines.push(`| **Entry Hash** | \`${ledgerEntry.entry_hash}\` |`);
    lines.push(`| **Chain Hash** | \`${ledgerEntry.chain_hash}\` |`);
    lines.push(`| **Timestamp (Monotonic)** | \`${ledgerEntry.timestamp}\` |`);
    lines.push(`| **Chain Integrity** | \`${ledgerIntegrity && ledgerIntegrity.valid ? "VALID" : "INVALID"}\` |`);
    lines.push("");
  }
  if (violations.length > 0) {
    lines.push("## 3. Detected Policy Violations");
    lines.push("");
    lines.push("| File | Line:Col | Type | Target | Details |");
    lines.push("| :--- | :--- | :--- | :--- | :--- |");
    for (const v of violations) {
      const sanitizedFile = v.file.replace(/\|/g, "\\|");
      const sanitizedTarget = v.target.replace(/\|/g, "\\|");
      const sanitizedReason = v.reason.replace(/\|/g, "\\|");
      lines.push(
        `| \`${sanitizedFile}\` | ${v.line}:${v.column} | \`${v.callType}\` | \`${sanitizedTarget}\` | ${sanitizedReason} |`
      );
    }
    lines.push("");
  } else {
    lines.push("## 3. Compliance Status");
    lines.push("");
    lines.push("No unauthorized external phone-home or egress attempts were detected.");
    lines.push("");
  }
  return lines.join("\n");
}
function writeGitHubOutputs(outputs = {}) {
  const githubOutputFile = process.env.GITHUB_OUTPUT;
  if (!githubOutputFile) {
    return;
  }
  const outputEntries = Object.entries(outputs).map(
    ([key, value]) => `${key}=${String(value)}`
  );
  fs2.appendFileSync(githubOutputFile, outputEntries.join("\n") + "\n", "utf8");
}
function writeStepSummary(summaryMarkdown) {
  const githubSummaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!githubSummaryFile) {
    return;
  }
  fs2.appendFileSync(githubSummaryFile, summaryMarkdown + "\n", "utf8");
}

// packages/action-runner/src/scanner.js
import fs3 from "node:fs";
import path2 from "node:path";
var DEFAULT_IGNORED_DIRS = /* @__PURE__ */ new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "artifacts",
  "brain",
  ".system_generated",
  ".agent",
  ".idea",
  ".vscode"
]);
var SUPPORTED_EXTENSIONS = /* @__PURE__ */ new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".go",
  ".sh",
  ".json",
  ".yaml",
  ".yml"
]);
var EXEMPT_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "schema.org",
  "json-schema.org",
  "w3.org",
  "www.w3.org"
]);
var CALL_PATTERNS = [
  {
    name: "fetch_call",
    regex: /\bfetch\s*\(\s*(['"`])([^'"`]+)\1/g
  },
  {
    name: "axios_call",
    regex: /\baxios(?:\.[a-zA-Z0-9_$]+)?\s*\(\s*(['"`])([^'"`]+)\1/g
  },
  {
    name: "http_request_call",
    regex: /\bhttps?\.(?:request|get|post|put)\s*\(\s*(['"`])([^'"`]+)\1/g
  },
  {
    name: "websocket_call",
    regex: /\bnew\s+WebSocket\s*\(\s*(['"`])([^'"`]+)\1/g
  },
  {
    name: "python_requests_call",
    regex: /\brequests\.(?:get|post|put|delete|head|options)\s*\(\s*(['"`])([^'"`]+)\1/g
  }
];
var URL_LITERAL_PATTERN = /https?:\/\/([a-zA-Z0-9.\-_]+(?::\d+)?)(?:\/[^\s"'`]*)?/g;
function normalizeEndpoint(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return {
      host: parsed.hostname.toLowerCase(),
      port: parsed.port || (parsed.protocol === "https:" ? "443" : "80"),
      origin: parsed.origin.toLowerCase(),
      raw: rawUrl
    };
  } catch {
    return {
      host: rawUrl.toLowerCase().trim(),
      port: "",
      origin: rawUrl.toLowerCase().trim(),
      raw: rawUrl
    };
  }
}
function isHostExempt(host) {
  if (EXEMPT_HOSTNAMES.has(host)) {
    return true;
  }
  for (const exempt of EXEMPT_HOSTNAMES) {
    if (host.endsWith("." + exempt)) {
      return true;
    }
  }
  return false;
}
function isEndpointAllowed(endpointInfo, allowedSet) {
  if (allowedSet.has("*")) {
    return true;
  }
  if (allowedSet.has(endpointInfo.host)) {
    return true;
  }
  if (allowedSet.has(endpointInfo.origin)) {
    return true;
  }
  for (const allowed of allowedSet) {
    if (allowed.startsWith("*.") && endpointInfo.host.endsWith(allowed.slice(2))) {
      return true;
    }
    if (endpointInfo.raw.startsWith(allowed)) {
      return true;
    }
  }
  return false;
}
function getLineAndColumn(content, index) {
  const slice = content.slice(0, index);
  const lines = slice.split("\n");
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}
function scanFileContent(filePath, content, allowedEndpoints = []) {
  const allowedSet = new Set(
    allowedEndpoints.map((ep) => ep.trim().toLowerCase()).filter(Boolean)
  );
  const detections = [];
  const violations = [];
  for (const pattern of CALL_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.regex);
    while ((match = regex.exec(content)) !== null) {
      const targetRaw = match[2];
      const { line, column } = getLineAndColumn(content, match.index);
      const endpointInfo = normalizeEndpoint(targetRaw);
      const detection = {
        file: filePath,
        line,
        column,
        callType: pattern.name,
        target: targetRaw,
        host: endpointInfo.host
      };
      detections.push(detection);
      if (isHostExempt(endpointInfo.host)) {
        continue;
      }
      if (!isEndpointAllowed(endpointInfo, allowedSet)) {
        violations.push({
          ...detection,
          reason: `Unauthorized external network call to '${targetRaw}' violates Zero Phone-Home policy.`
        });
      }
    }
  }
  let urlMatch;
  const urlRegex = new RegExp(URL_LITERAL_PATTERN);
  while ((urlMatch = urlRegex.exec(content)) !== null) {
    const fullUrl = urlMatch[0];
    const host = urlMatch[1].split(":")[0].toLowerCase();
    const { line, column } = getLineAndColumn(content, urlMatch.index);
    const endpointInfo = normalizeEndpoint(fullUrl);
    const detection = {
      file: filePath,
      line,
      column,
      callType: "url_literal",
      target: fullUrl,
      host
    };
    detections.push(detection);
    if (isHostExempt(host)) {
      continue;
    }
    if (!isEndpointAllowed(endpointInfo, allowedSet)) {
      const exists = violations.some(
        (v) => v.file === filePath && v.line === line && v.host === host
      );
      if (!exists) {
        violations.push({
          ...detection,
          reason: `Hardcoded unauthorized external endpoint '${fullUrl}' detected.`
        });
      }
    }
  }
  return { detections, violations };
}
function scanDirectory(targetPath, options = {}) {
  const {
    allowedEndpoints = [],
    ignoredDirs = DEFAULT_IGNORED_DIRS,
    supportedExtensions = SUPPORTED_EXTENSIONS
  } = options;
  const resolvedPath = path2.resolve(targetPath);
  if (!fs3.existsSync(resolvedPath)) {
    throw new Error(`Target path does not exist: ${resolvedPath}`);
  }
  const filesToScan = [];
  function walk(currentDir) {
    const entries = fs3.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) {
          continue;
        }
        walk(path2.join(currentDir, entry.name));
      } else if (entry.isFile()) {
        const ext = path2.extname(entry.name).toLowerCase();
        if (supportedExtensions.has(ext)) {
          filesToScan.push(path2.join(currentDir, entry.name));
        }
      }
    }
  }
  const stat = fs3.statSync(resolvedPath);
  if (stat.isFile()) {
    filesToScan.push(resolvedPath);
  } else {
    walk(resolvedPath);
  }
  const allDetections = [];
  const allViolations = [];
  for (const file of filesToScan) {
    const relativeFile = path2.relative(resolvedPath, file) || path2.basename(file);
    const content = fs3.readFileSync(file, "utf8");
    const { detections, violations } = scanFileContent(relativeFile, content, allowedEndpoints);
    allDetections.push(...detections);
    allViolations.push(...violations);
  }
  return {
    scannedFilesCount: filesToScan.length,
    scannedFiles: filesToScan.map((f) => path2.relative(resolvedPath, f) || path2.basename(f)),
    detections: allDetections,
    violations: allViolations
  };
}

// packages/action-runner/src/index.js
async function runAudit(customOptions = {}) {
  const targetPath = customOptions.targetPath || process.env.INPUT_TARGET_PATH || process.env["INPUT_TARGET-PATH"] || ".";
  const rawStrictMode = customOptions.strictMode !== void 0 ? customOptions.strictMode : process.env.INPUT_STRICT_MODE || process.env["INPUT_STRICT-MODE"] || "true";
  const strictMode = String(rawStrictMode).toLowerCase() === "true";
  let allowedEndpoints = customOptions.allowedEndpoints;
  if (!allowedEndpoints) {
    const rawEndpoints = process.env.INPUT_ALLOWED_ENDPOINTS || process.env["INPUT_ALLOWED-ENDPOINTS"] || "";
    allowedEndpoints = rawEndpoints.split(",").map((e) => e.trim()).filter(Boolean);
  } else if (typeof allowedEndpoints === "string") {
    allowedEndpoints = allowedEndpoints.split(",").map((e) => e.trim()).filter(Boolean);
  }
  const rawGenerateLedger = customOptions.generateLedger !== void 0 ? customOptions.generateLedger : process.env.INPUT_GENERATE_LEDGER || process.env["INPUT_GENERATE-LEDGER"] || "true";
  const generateLedger = String(rawGenerateLedger).toLowerCase() === "true";
  const ledgerOutput = customOptions.ledgerOutput || process.env.INPUT_LEDGER_OUTPUT || process.env["INPUT_LEDGER-OUTPUT"] || "bibleos-ledger.json";
  const scanResult = scanDirectory(targetPath, { allowedEndpoints });
  const { scannedFilesCount, detections, violations } = scanResult;
  const ledger = new RealityLedger({
    filePath: generateLedger ? ledgerOutput : null
  });
  const auditStatus = violations.length === 0 ? "PASSED" : "VIOLATIONS_DETECTED";
  const ledgerEntry = ledger.append({
    actor: customOptions.actor || "did:key:bibleos-verify-action",
    intent: "audit.egress_compliance",
    action: {
      target_path: targetPath,
      strict_mode: strictMode,
      allowed_endpoints: allowedEndpoints
    },
    result: {
      status: auditStatus,
      violations_count: violations.length,
      scanned_files_count: scannedFilesCount
    },
    stateDelta: {
      violations: violations.map((v) => ({
        file: v.file,
        line: v.line,
        target: v.target,
        callType: v.callType
      }))
    }
  });
  const ledgerIntegrity = ledger.verifyIntegrity();
  const summaryMarkdown = formatStepSummary({
    targetPath,
    strictMode,
    scannedFilesCount,
    detectionsCount: detections.length,
    violations,
    ledgerEntry,
    ledgerIntegrity
  });
  if (!customOptions.quiet) {
    process.stdout.write(summaryMarkdown + "\n");
  }
  writeStepSummary(summaryMarkdown);
  writeGitHubOutputs({
    "audit-status": auditStatus,
    "ledger-hash": ledgerEntry.entry_hash,
    "violations-count": violations.length
  });
  const success = !(strictMode && violations.length > 0);
  return {
    success,
    auditStatus,
    scannedFilesCount,
    detections,
    violations,
    ledgerEntry,
    ledgerIntegrity,
    summaryMarkdown
  };
}
var isDirectCli = process.argv[1] && (process.argv[1] === fileURLToPath(import.meta.url) || path3.resolve(process.argv[1]) === fileURLToPath(import.meta.url));
if (isDirectCli) {
  runAudit().then((res) => {
    if (!res.success) {
      process.exit(1);
    }
  }).catch((err) => {
    process.stderr.write(`Audit execution failure: ${err.message}
`);
    process.exit(1);
  });
}
export {
  runAudit
};
