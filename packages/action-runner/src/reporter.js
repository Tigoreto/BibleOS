import fs from 'node:fs';

export function formatStepSummary({
	targetPath,
	strictMode,
	scannedFilesCount,
	detectionsCount,
	violations,
	ledgerEntry,
	ledgerIntegrity
}) {
	const status = violations.length === 0 ? 'PASSED' : 'VIOLATIONS_DETECTED';

	const lines = [
		'# BibleOS Sandbox & Reality Ledger Audit Report',
		'',
		'## 1. Audit Execution Overview',
		'',
		'| Parameter | Value |',
		'| :--- | :--- |',
		`| **Audit Status** | \`${status}\` |`,
		`| **Target Path** | \`${targetPath}\` |`,
		`| **Strict Mode** | \`${strictMode}\` |`,
		`| **Files Scanned** | ${scannedFilesCount} |`,
		`| **Network Detections** | ${detectionsCount} |`,
		`| **Policy Violations** | ${violations.length} |`,
		''
	];

	// Ledger Proof Section
	if (ledgerEntry) {
		lines.push('## 2. Reality Ledger Cryptographic Proof');
		lines.push('');
		lines.push('| Field | Value |');
		lines.push('| :--- | :--- |');
		lines.push(`| **Actor DID** | \`${ledgerEntry.actor}\` |`);
		lines.push(`| **Entry Hash** | \`${ledgerEntry.entry_hash}\` |`);
		lines.push(`| **Chain Hash** | \`${ledgerEntry.chain_hash}\` |`);
		lines.push(`| **Timestamp (Monotonic)** | \`${ledgerEntry.timestamp}\` |`);
		lines.push(`| **Chain Integrity** | \`${ledgerIntegrity && ledgerIntegrity.valid ? 'VALID' : 'INVALID'}\` |`);
		lines.push('');
	}

	// Violations Table
	if (violations.length > 0) {
		lines.push('## 3. Detected Policy Violations');
		lines.push('');
		lines.push('| File | Line:Col | Type | Target | Details |');
		lines.push('| :--- | :--- | :--- | :--- | :--- |');
		for (const v of violations) {
			const sanitizedFile = v.file.replace(/\|/g, '\\|');
			const sanitizedTarget = v.target.replace(/\|/g, '\\|');
			const sanitizedReason = v.reason.replace(/\|/g, '\\|');
			lines.push(
				`| \`${sanitizedFile}\` | ${v.line}:${v.column} | \`${v.callType}\` | \`${sanitizedTarget}\` | ${sanitizedReason} |`
			);
		}
		lines.push('');
	} else {
		lines.push('## 3. Compliance Status');
		lines.push('');
		lines.push('No unauthorized external phone-home or egress attempts were detected.');
		lines.push('');
	}

	return lines.join('\n');
}

export function writeGitHubOutputs(outputs = {}) {
	const githubOutputFile = process.env.GITHUB_OUTPUT;
	if (!githubOutputFile) {
		return;
	}

	const outputEntries = Object.entries(outputs).map(
		([key, value]) => `${key}=${String(value)}`
	);

	fs.appendFileSync(githubOutputFile, outputEntries.join('\n') + '\n', 'utf8');
}

export function writeStepSummary(summaryMarkdown) {
	const githubSummaryFile = process.env.GITHUB_STEP_SUMMARY;
	if (!githubSummaryFile) {
		return;
	}

	fs.appendFileSync(githubSummaryFile, summaryMarkdown + '\n', 'utf8');
}
