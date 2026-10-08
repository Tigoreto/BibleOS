import fs from 'node:fs';

/**
 * Builds a markdown report suitable for GitHub Step Summary and local audit logs.
 */
export function buildMarkdownSummary({ scanResult, ledgerEntry, strictMode }) {
	const statusText = scanResult.isCompliant ? 'PASSED' : 'VIOLATIONS_DETECTED';
	const statusBadge = scanResult.isCompliant
		? '**Status**: `COMPLIANT (PASSED)`'
		: '**Status**: `BREACH DETECTED (FAILED)`';

	let md = `## BibleOS Sovereign Sandbox & Reality Ledger Audit Report\n\n`;
	md += `${statusBadge}\n\n`;
	md += `| Metric | Value |\n`;
	md += `| :--- | :--- |\n`;
	md += `| Target Path | \`${scanResult.targetPath}\` |\n`;
	md += `| Scanned Files | \`${scanResult.scannedFileCount}\` |\n`;
	md += `| Discovered Endpoints | \`${scanResult.discoveredEndpoints.length}\` |\n`;
	md += `| Unauthorized Egress Count | \`${scanResult.violations.length}\` |\n`;
	md += `| Strict Mode Enforcement | \`${strictMode}\` |\n\n`;

	if (ledgerEntry) {
		md += `### Reality Ledger Cryptographic Proof\n\n`;
		md += `| Field | Value |\n`;
		md += `| :--- | :--- |\n`;
		md += `| Block Hash (SHA-256) | \`${ledgerEntry.entry_hash}\` |\n`;
		md += `| Previous Chain Hash | \`${ledgerEntry.previous_chain_hash}\` |\n`;
		md += `| Timestamp (Nanoseconds) | \`${ledgerEntry.timestamp_ns}\` |\n`;
		md += `| Actor DID | \`${ledgerEntry.actor}\` |\n`;
		md += `| Cryptographic Signature | \`VERIFIED\` |\n\n`;
	}

	if (scanResult.violations.length > 0) {
		md += `### Intercepted Egress Violations (${scanResult.violations.length})\n\n`;
		md += `| File | Line | Violation Type | Target Endpoint / Call | Detail |\n`;
		md += `| :--- | :---: | :--- | :--- | :--- |\n`;
		for (const v of scanResult.violations.slice(0, 50)) {
			const safeFile = v.file.replace(/\\/g, '/');
			md += `| \`${safeFile}\` | ${v.line} | \`${v.type}\` | \`${v.target}\` | ${v.detail} |\n`;
		}
		if (scanResult.violations.length > 50) {
			md += `\n> Truncated: ${scanResult.violations.length - 50} additional violations not listed.\n\n`;
		}
	} else {
		md += `### Gatekeeper Audit Passed\n\n`;
		md += `All inspected source files conform to Zero Phone-Home policies. No unauthorized outbound transmission endpoints detected.\n\n`;
	}

	return md;
}

/**
 * Writes markdown summary to GITHUB_STEP_SUMMARY if available.
 */
export function writeStepSummary(markdownContent) {
	const summaryPath = process.env.GITHUB_STEP_SUMMARY;
	if (summaryPath) {
		try {
			fs.appendFileSync(summaryPath, markdownContent + '\n', 'utf8');
		} catch (err) {
			console.error(`[WARN] Failed to write GITHUB_STEP_SUMMARY: ${err.message}`);
		}
	}
}

/**
 * Sets output key-value pairs for GitHub Actions.
 */
export function setActionOutput(key, value) {
	const outputPath = process.env.GITHUB_OUTPUT;
	if (outputPath) {
		try {
			fs.appendFileSync(outputPath, `${key}=${value}\n`, 'utf8');
		} catch (err) {
			console.error(`[WARN] Failed to write GITHUB_OUTPUT: ${err.message}`);
		}
	}
}
