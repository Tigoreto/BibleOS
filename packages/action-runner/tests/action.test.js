import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runAudit } from '../src/index.js';
import { scanDirectory } from '../src/scanner.js';

test('BibleOS Action: Fully compliant directory passes audit with Reality Ledger chain', async () => {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bibleos-action-clean-'));
	const sampleFile = path.join(tempDir, 'agent.js');
	fs.writeFileSync(sampleFile, `
		export function runLocalAgent(input) {
			const res = { processed: true, value: input * 2 };
			return res;
		}
	`);

	const ledgerFile = path.join(tempDir, 'test-ledger.json');
	const audit = await runAudit({
		targetPath: tempDir,
		strictMode: true,
		generateLedger: true,
		ledgerOutput: ledgerFile
	});

	assert.equal(audit.success, true);
	assert.equal(audit.scanResult.violations.length, 0);
	assert.ok(audit.ledgerEntry);
	assert.ok(audit.ledgerEntry.entry_hash);
	assert.equal(audit.ledgerEntry.result.status, 'PASSED');

	// Verify ledger file was created and is valid JSON
	assert.ok(fs.existsSync(ledgerFile));
	const content = fs.readFileSync(ledgerFile, 'utf8').trim();
	const parsed = JSON.parse(content);
	assert.equal(parsed.entry_hash, audit.ledgerEntry.entry_hash);

	// Cleanup
	fs.rmSync(tempDir, { recursive: true, force: true });
});

test('BibleOS Action: Detects unauthorized external endpoint and fails under strict mode', async () => {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bibleos-action-breach-'));
	const breachFile = path.join(tempDir, 'telemetry.js');
	fs.writeFileSync(breachFile, `
		export async function sendTelemetry(data) {
			const url = "https://unauthorized-phone-home-server.org/collect";
			return fetch(url, { method: "POST", body: JSON.stringify(data) });
		}
	`);

	const audit = await runAudit({
		targetPath: tempDir,
		strictMode: true,
		generateLedger: false
	});

	assert.equal(audit.success, false);
	assert.ok(audit.scanResult.violations.length >= 1);
	assert.equal(audit.scanResult.isCompliant, false);

	const violation = audit.scanResult.violations.find((v) => v.target.includes('unauthorized-phone-home-server.org'));
	assert.ok(violation);
	assert.equal(violation.type, 'UNAUTHORIZED_ENDPOINT');

	// Cleanup
	fs.rmSync(tempDir, { recursive: true, force: true });
});

test('BibleOS Action: Allows whitelisted domains and wildcards', async () => {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bibleos-action-whitelist-'));
	const agentFile = path.join(tempDir, 'task.js');
	fs.writeFileSync(agentFile, `
		export async function queryAllowed(query) {
			const endpoint = "https://api.agentuniver.com/v1/jobs";
			return endpoint;
		}
	`);

	const audit = await runAudit({
		targetPath: tempDir,
		strictMode: true,
		allowedEndpoints: ['*.agentuniver.com'],
		generateLedger: false
	});

	assert.equal(audit.success, true);
	assert.equal(audit.scanResult.violations.length, 0);

	// Cleanup
	fs.rmSync(tempDir, { recursive: true, force: true });
});
