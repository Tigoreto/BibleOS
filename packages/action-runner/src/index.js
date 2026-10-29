#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RealityLedger } from '../../reality-ledger/src/ledger.js';
import { scanDirectory } from './scanner.js';
import { buildMarkdownSummary, writeStepSummary, setActionOutput } from './reporter.js';

function parseBoolean(val, fallback = false) {
	if (val === undefined || val === null || val === '') return fallback;
	const s = String(val).toLowerCase().trim();
	return s === 'true' || s === '1' || s === 'yes';
}

function getActionInput(name, fallback = '') {
	const keyWithDash = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
	const keyWithUnderscore = `INPUT_${name.replace(/ /g, '_').replace(/-/g, '_').toUpperCase()}`;
	if (process.env[keyWithDash] !== undefined && process.env[keyWithDash] !== '') {
		return process.env[keyWithDash];
	}
	if (process.env[keyWithUnderscore] !== undefined && process.env[keyWithUnderscore] !== '') {
		return process.env[keyWithUnderscore];
	}
	return fallback;
}

/**
 * Runs the full BibleOS Zero Phone-Home Gatekeeper audit and chains the proof to Reality Ledger.
 */
export async function runAudit(options = {}) {
	const targetPath = options.targetPath || path.resolve(getActionInput('target-path', '.'));
	const strictMode = options.strictMode !== undefined ? options.strictMode : parseBoolean(getActionInput('strict-mode', 'true'), true);
	const rawAllowed = options.allowedEndpoints || getActionInput('allowed-endpoints', '');
	const allowedEndpoints = typeof rawAllowed === 'string' ? rawAllowed.split(',') : (rawAllowed || []);
	const generateLedger = options.generateLedger !== undefined ? options.generateLedger : parseBoolean(getActionInput('generate-ledger', 'true'), true);
	const ledgerOutput = options.ledgerOutput || getActionInput('ledger-output', 'bibleos-ledger.json');

	console.log(`[*] Starting BibleOS Sovereign Sandbox & Reality Ledger Audit...`);
	console.log(`[*] Target Path: ${targetPath}`);
	console.log(`[*] Strict Mode: ${strictMode}`);
	if (allowedEndpoints.length > 0) {
		console.log(`[*] Whitelisted Endpoints: ${allowedEndpoints.filter(Boolean).join(', ')}`);
	}

	// 1. Run static egress scanning
	const scanResult = scanDirectory(targetPath, { allowedEndpoints });
	console.log(`[*] Scanned ${scanResult.scannedFileCount} files across target.`);

	// 2. Commit proof to Reality Ledger
	let ledgerEntry = null;
	if (generateLedger) {
		const ledgerPath = ledgerOutput ? path.resolve(ledgerOutput) : null;
		const ledger = new RealityLedger({ filePath: ledgerPath });

		ledgerEntry = ledger.append({
			actor: 'did:key:bibleos-gatekeeper-ci',
			intent: 'audit_agent_zero_phone_home_compliance',
			action: 'execute_static_and_sandbox_egress_check',
			result: {
				status: scanResult.isCompliant ? 'PASSED' : 'VIOLATIONS_DETECTED',
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

	// 3. Render and write Step Summary
	const markdownSummary = buildMarkdownSummary({
		scanResult,
		ledgerEntry,
		strictMode
	});
	writeStepSummary(markdownSummary);

	// 4. Set action outputs
	const auditStatus = scanResult.isCompliant ? 'PASSED' : 'VIOLATIONS_DETECTED';
	setActionOutput('audit-status', auditStatus);
	setActionOutput('violations-count', String(scanResult.violations.length));
	if (ledgerEntry) {
		setActionOutput('ledger-hash', ledgerEntry.entry_hash);
	}

	// 5. Console summary
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

// Auto-run if executed directly as script
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
	runAudit()
		.then((result) => {
			if (!result.success) {
				process.exit(1);
			}
		})
		.catch((err) => {
			console.error(`[FATAL] Action failed with unhandled exception: ${err.message}`);
			process.exit(1);
		});
}
