import fs from 'node:fs';
import path from 'node:path';
import { computeEntryHash, createLedgerEntry, GENESIS_CHAIN_HASH } from './entry.js';

export class RealityLedger {
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
			const content = fs.readFileSync(this.filePath, 'utf8');
			const lines = content.trim().split('\n').filter(Boolean);
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
	append({ actor, intent, action, result, stateDelta = {}, contextHash = '' }) {
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
			fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n', 'utf8');
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

			// 1. Verify previous chain pointer
			if (entry.chain_hash !== expectedPrevHash) {
				return {
					valid: false,
					brokenIndex: i,
					error: `Chain broken at index ${i}: expected chain_hash ${expectedPrevHash}, found ${entry.chain_hash}`
				};
			}

			// 2. Verify entry content hash
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
}
