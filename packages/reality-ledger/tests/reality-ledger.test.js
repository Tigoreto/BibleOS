import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { GENESIS_CHAIN_HASH, RealityLedger } from '../src/index.js';

test('Reality Ledger: In-memory chaining and verification', () => {
	const ledger = new RealityLedger();

	const entry1 = ledger.append({
		actor: 'did:key:z6MkActor1',
		intent: 'Initialize sovereign node',
		action: { type: 'node.bootstrap' },
		result: { status: 'healthy' }
	});

	assert.strictEqual(entry1.chain_hash, GENESIS_CHAIN_HASH);

	const entry2 = ledger.append({
		actor: 'did:key:z6MkActor1',
		intent: 'Connect local sensor',
		action: { type: 'device.attach', bus: 'CAN' },
		result: { attached: true }
	});

	assert.strictEqual(entry2.chain_hash, entry1.entry_hash);

	// Verify intact ledger
	const audit = ledger.verifyIntegrity();
	assert.strictEqual(audit.valid, true);
	assert.strictEqual(audit.count, 2);
});

test('Reality Ledger: Tamper detection', () => {
	const ledger = new RealityLedger();

	ledger.append({
		actor: 'did:key:z6MkUser',
		intent: 'Action A',
		action: { step: 1 }
	});

	ledger.append({
		actor: 'did:key:z6MkUser',
		intent: 'Action B',
		action: { step: 2 }
	});

	// Tamper with first entry intent
	ledger.entries[0].intent = 'Malicious modified intent';

	const audit = ledger.verifyIntegrity();
	assert.strictEqual(audit.valid, false);
});

test('Reality Ledger: File persistence and reload', () => {
	const tmpFile = path.join(process.cwd(), 'temp_test_ledger.jsonl');

	try {
		if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);

		const ledger1 = new RealityLedger({ filePath: tmpFile });
		ledger1.append({
			actor: 'did:key:z6MkPersist',
			intent: 'Store key state',
			action: { state: 'active' }
		});

		// Reload from disk into new instance
		const ledger2 = new RealityLedger({ filePath: tmpFile });
		assert.strictEqual(ledger2.getAllEntries().length, 1);
		assert.strictEqual(ledger2.verifyIntegrity().valid, true);
	} finally {
		if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
	}
});
