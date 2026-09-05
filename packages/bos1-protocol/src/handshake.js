import { canonicalJson, signPayload, verifyPayload } from './crypto.js';

export const BOS_PROTOCOL_VERSION = '1.0';

/**
 * Creates a signed BOS-1 Handshake Payload.
 */
export function createHandshakePayload({
	deviceId,
	ownerId,
	allowedDestinations = [],
	blockedDestinations = ['*'],
	privateKey,
	timestampUtc = Math.floor(Date.now() / 1000)
}) {
	if (!deviceId || !ownerId || !privateKey) {
		throw new Error('deviceId, ownerId, and privateKey are required for handshake');
	}

	const basePayload = {
		bos_version: BOS_PROTOCOL_VERSION,
		device_id: deviceId,
		owner_id: ownerId,
		routing_declaration: {
			allowed_destinations: allowedDestinations.length > 0 ? allowedDestinations : [ownerId],
			blocked_destinations: blockedDestinations
		},
		timestamp_utc: timestampUtc
	};

	const signature = signPayload(basePayload, privateKey);

	return {
		...basePayload,
		signature
	};
}

/**
 * Verifies a BOS-1 Handshake Payload.
 * Ensures protocol version, payload integrity, and cryptographic signature by device_id.
 */
export function verifyHandshakePayload(payload) {
	if (!payload || typeof payload !== 'object') {
		return { valid: false, error: 'Malformed handshake payload' };
	}

	if (payload.bos_version !== BOS_PROTOCOL_VERSION) {
		return { valid: false, error: `Unsupported protocol version: ${payload.bos_version}` };
	}

	const { signature, ...basePayload } = payload;
	if (!signature) {
		return { valid: false, error: 'Missing handshake signature' };
	}

	try {
		const isVerified = verifyPayload(basePayload, signature, payload.device_id);
		if (!isVerified) {
			return { valid: false, error: 'Cryptographic signature verification failed' };
		}
		return { valid: true, payload };
	} catch (err) {
		return { valid: false, error: `Verification exception: ${err.message}` };
	}
}
