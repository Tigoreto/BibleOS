import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RealityLedger } from '../../reality-ledger/src/index.js';
import { formatStepSummary, writeGitHubOutputs, writeStepSummary } from './reporter.js';
import { scanDirectory } from './scanner.js';

export async function runAudit(customOptions = {}) {
	const targetPath =
		customOptions.targetPath ||
		process.env.INPUT_TARGET_PATH ||
		process.env['INPUT_TARGET-PATH'] ||
		'.';

	const rawStrictMode =
		customOptions.strictMode !== undefined
			? customOptions.strictMode
			: process.env.INPUT_STRICT_MODE || process.env['INPUT_STRICT-MODE'] || 'true';
	const strictMode = String(rawStrictMode).toLowerCase() === 'true';

	let allowedEndpoints = customOptions.allowedEndpoints;
	if (!allowedEndpoints) {
		const rawEndpoints =
			process.env.INPUT_ALLOWED_ENDPOINTS ||
			process.env['INPUT_ALLOWED-ENDPOINTS'] ||
			'';
		allowedEndpoints = rawEndpoints
			.split(',')
			.map((e) => e.trim())
			.filter(Boolean);
	} else if (typeof allowedEndpoints === 'string') {
		allowedEndpoints = allowedEndpoints
			.split(',')
			.map((e) => e.trim())
			.filter(Boolean);
	}

	const rawGenerateLedger =
		customOptions.generateLedger !== undefined
			? customOptions.generateLedger
			: process.env.INPUT_GENERATE_LEDGER || process.env['INPUT_GENERATE-LEDGER'] || 'true';
	const generateLedger = String(rawGenerateLedger).toLowerCase() === 'true';

	const ledgerOutput =
		customOptions.ledgerOutput ||
		process.env.INPUT_LEDGER_OUTPUT ||
		process.env['INPUT_LEDGER-OUTPUT'] ||
		'bibleos-ledger.json';

	// 1. Run static egress scanning
	const scanResult = scanDirectory(targetPath, { allowedEndpoints });
	const { scannedFilesCount, detections, violations } = scanResult;

	// 2. Cryptographic Reality Ledger recording
	const ledger = new RealityLedger({
		filePath: generateLedger ? ledgerOutput : null
	});

	const auditStatus = violations.length === 0 ? 'PASSED' : 'VIOLATIONS_DETECTED';

	const ledgerEntry = ledger.append({
		actor: customOptions.actor || 'did:key:bibleos-verify-action',
		intent: 'audit.egress_compliance',
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

	// 3. Format and output summary
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
		process.stdout.write(summaryMarkdown + '\n');
	}

	writeStepSummary(summaryMarkdown);
	writeGitHubOutputs({
		'audit-status': auditStatus,
		'ledger-hash': ledgerEntry.entry_hash,
		'violations-count': violations.length
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

// Direct invocation check
const isDirectCli =
	process.argv[1] &&
	(process.argv[1] === fileURLToPath(import.meta.url) ||
		path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));

if (isDirectCli) {
	runAudit().then((res) => {
		if (!res.success) {
			process.exit(1);
		}
	}).catch((err) => {
		process.stderr.write(`Audit execution failure: ${err.message}\n`);
		process.exit(1);
	});
}
