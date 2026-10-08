import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runAudit } from '../src/index.js';
import { scanFileContent } from '../src/scanner.js';

test('Action Scanner: Detects unauthorized egress calls and literal endpoints', () => {
	const snippet = `
		import axios from 'axios';
		const localUrl = 'http://localhost:3000/api';
		const externalApi = 'https://unauthorized-phone-home.org/track';

		export async function send() {
			await fetch('https://unauthorized-phone-home.org/track');
			await axios.get('https://telemetry-sink.net/event');
		}
	`;

	const { detections, violations } = scanFileContent('agent.js', snippet, []);
	assert.ok(detections.length >= 3, 'Should detect external endpoints');
	assert.strictEqual(violations.length, 3, 'Should flag 3 unauthorized violations');

	const hosts = violations.map((v) => v.host);
	assert.ok(hosts.includes('unauthorized-phone-home.org'));
	assert.ok(hosts.includes('telemetry-sink.net'));
});

test('Action Scanner: Allows whitelisted endpoints and exempts localhost', () => {
	const snippet = `
		const schema = 'https://schema.org/Person';
		const local = 'http://127.0.0.1:8080/health';
		const permitted = 'https://api.openai.com/v1/chat/completions';
		fetch('https://api.openai.com/v1/chat/completions');
	`;

	const { violations } = scanFileContent('safe.js', snippet, ['api.openai.com']);
	assert.strictEqual(violations.length, 0, 'Whitelisted and exempt hosts must produce zero violations');
});

test('Action Runner: End-to-end audit with Reality Ledger cryptographic proof', async () => {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bibleos-action-test-'));
	const sampleFile = path.join(tempDir, 'sample-agent.js');
	const ledgerFile = path.join(tempDir, 'test-ledger.json');

	fs.writeFileSync(
		sampleFile,
		`console.log("Safe agent without network access");`,
		'utf8'
	);

	try {
		const res = await runAudit({
			targetPath: tempDir,
			strictMode: true,
			allowedEndpoints: [],
			generateLedger: true,
			ledgerOutput: ledgerFile,
			quiet: true
		});

		assert.strictEqual(res.success, true);
		assert.strictEqual(res.auditStatus, 'PASSED');
		assert.strictEqual(res.violations.length, 0);
		assert.ok(res.ledgerEntry.entry_hash);
		assert.strictEqual(res.ledgerIntegrity.valid, true);

		assert.ok(fs.existsSync(ledgerFile), 'Ledger file should be created');
		const persisted = JSON.parse(fs.readFileSync(ledgerFile, 'utf8').trim());
		assert.strictEqual(persisted.entry_hash, res.ledgerEntry.entry_hash);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});

test('Action Runner: Strict mode failure when egress violation detected', async () => {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bibleos-violation-test-'));
	const sampleFile = path.join(tempDir, 'leaky-agent.js');

	fs.writeFileSync(
		sampleFile,
		`fetch('https://leaked-credentials-sink.com/exfiltrate');`,
		'utf8'
	);

	try {
		const resStrict = await runAudit({
			targetPath: tempDir,
			strictMode: true,
			allowedEndpoints: [],
			generateLedger: false,
			quiet: true
		});
		assert.strictEqual(resStrict.success, false);
		assert.strictEqual(resStrict.auditStatus, 'VIOLATIONS_DETECTED');
		assert.strictEqual(resStrict.violations.length, 1);

		const resPermissive = await runAudit({
			targetPath: tempDir,
			strictMode: false,
			allowedEndpoints: [],
			generateLedger: false,
			quiet: true
		});
		assert.strictEqual(resPermissive.success, true);
		assert.strictEqual(resPermissive.auditStatus, 'VIOLATIONS_DETECTED');
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});
