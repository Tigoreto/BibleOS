import crypto from 'node:crypto';
import { signPayload, verifyPayload } from './crypto.js';

/**
 * Creates a cryptographically signed Sovereign Data Packet.
 */
export function createSovereignPacket({
	deviceId,
	payloadType,
	payload,
	privateKey,
	timestamp = Math.floor(Date.now() / 1000),
	packetId = crypto.randomUUID()
}) {
	if (!deviceId || !payloadType || !payload || !privateKey) {
		throw new Error('deviceId, payloadType, payload, and privateKey are required');
	}

	const basePacket = {
		packet_id: packetId,
		device_id: deviceId,
		timestamp,
		payload_type: payloadType,
		payload
	};

	const signature = signPayload(basePacket, privateKey);

	return {
		...basePacket,
		signature
	};
}

/**
 * Verifies a Sovereign Data Packet's cryptographic signature and structure.
 */
export function verifySovereignPacket(packet) {
	if (!packet || typeof packet !== 'object') {
		return { valid: false, error: 'Invalid packet structure' };
	}

	const { signature, ...basePacket } = packet;
	if (!signature) {
		return { valid: false, error: 'Packet signature missing' };
	}

	try {
		const isVerified = verifyPayload(basePacket, signature, packet.device_id);
		if (!isVerified) {
			return { valid: false, error: 'Packet signature invalid' };
		}
		return { valid: true, packet };
	} catch (err) {
		return { valid: false, error: `Packet verification error: ${err.message}` };
	}
}

/**
 * Gatekeeper enforcing Zero Phone-Home and sovereign routing policies.
 */
export class ZeroPhoneHomeGatekeeper {
	constructor(routingDeclaration = {}) {
		this.allowedDestinations = new Set(routingDeclaration.allowed_destinations || []);
		this.blockedDestinations = new Set(routingDeclaration.blocked_destinations || ['*']);
	}

	/**
	 * Assesses whether data transmission to target is permitted under sovereign policy.
	 */
	canTransmit(targetDestination) {
		if (this.allowedDestinations.has(targetDestination)) {
			return { allowed: true };
		}
		if (this.blockedDestinations.has('*') || this.blockedDestinations.has(targetDestination)) {
			return {
				allowed: false,
				reason: `Zero Phone-Home violation: Destination '${targetDestination}' is blocked by default policy.`
			};
		}
		return { allowed: false, reason: 'Target not explicitly permitted in sovereign declaration.' };
	}
}
