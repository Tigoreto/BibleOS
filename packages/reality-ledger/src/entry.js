import crypto from 'node:crypto';

export const GENESIS_CHAIN_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Returns a monotonic nanosecond string timestamp.
 */
export function getMonotonicNanosecondTimestamp() {
	const nowMs = BigInt(Date.now());
	const hrTime = process.hrtime.bigint();
	const nanoPart = hrTime % 1000000n;
	return (nowMs * 1000000n + nanoPart).toString();
}

/**
 * Computes deterministic SHA-256 hash of a ledger entry content.
 */
export function computeEntryHash(entry) {
	const content = [
		entry.timestamp,
		entry.actor,
		entry.intent || '',
		JSON.stringify(entry.action || {}),
		JSON.stringify(entry.result || {}),
		JSON.stringify(entry.state_delta || {}),
		entry.context_hash || '',
		entry.chain_hash
	].join('|');

	return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Constructs a new cryptographically chained Reality Ledger entry.
 */
export function createLedgerEntry({
	actor,
	intent,
	action,
	result,
	stateDelta = {},
	contextHash = '',
	previousChainHash = GENESIS_CHAIN_HASH,
	timestamp = getMonotonicNanosecondTimestamp()
}) {
	if (!actor) {
		throw new Error('Ledger entry requires an actor DID');
	}

	const entry = {
		timestamp,
		actor,
		intent: intent || '',
		action: action || {},
		result: result || {},
		state_delta: stateDelta,
		context_hash: contextHash,
		chain_hash: previousChainHash
	};

	// The block entry hash seals this entry and becomes the next entry's chain_hash
	const entryHash = computeEntryHash(entry);

	return {
		...entry,
		entry_hash: entryHash
	};
}
