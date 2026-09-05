import assert from 'node:assert';
import test from 'node:test';
import {
	createHandshakePayload,
	createSovereignPacket,
	generateKeyPair,
	rawPublicKeyFromDidKey,
	verifyHandshakePayload,
	verifySovereignPacket,
	ZeroPhoneHomeGatekeeper
} from '../src/index.js';

test('BOS-1 Crypto: Keypair generation and did:key roundtrip', () => {
	const keypair = generateKeyPair();
	assert.ok(keypair.did.startsWith('did:key:z'));
	assert.strictEqual(keypair.rawPublicKey.length, 32);

	const recoveredRaw = rawPublicKeyFromDidKey(keypair.did);
	assert.deepStrictEqual(recoveredRaw, keypair.rawPublicKey);
});

test('BOS-1 Handshake: Creation and verification', () => {
	const device = generateKeyPair();
	const owner = generateKeyPair();

	const handshake = createHandshakePayload({
		deviceId: device.did,
		ownerId: owner.did,
		allowedDestinations: [owner.did],
		privateKey: device.privateKey
	});

	const res = verifyHandshakePayload(handshake);
	assert.strictEqual(res.valid, true);

	// Tampering detection
	const tampered = { ...handshake, timestamp_utc: handshake.timestamp_utc + 100 };
	const tamperedRes = verifyHandshakePayload(tampered);
	assert.strictEqual(tamperedRes.valid, false);
});

test('BOS-1 Packet: Sovereign packet signature and tampering checks', () => {
	const device = generateKeyPair();

	const packet = createSovereignPacket({
		deviceId: device.did,
		payloadType: 'intent.natural_language',
		payload: { prompt: 'Audit system security status' },
		privateKey: device.privateKey
	});

	const res = verifySovereignPacket(packet);
	assert.strictEqual(res.valid, true);

	// Tampering payload
	const tamperedPacket = {
		...packet,
		payload: { prompt: 'Malicious injection' }
	};
	const tamperedRes = verifySovereignPacket(tamperedPacket);
	assert.strictEqual(tamperedRes.valid, false);
});

test('Zero Phone-Home Gatekeeper: Destination enforcement', () => {
	const ownerDid = 'did:key:z6MkhOwnerNode';
	const gatekeeper = new ZeroPhoneHomeGatekeeper({
		allowed_destinations: [ownerDid],
		blocked_destinations: ['*']
	});

	// Transmit to owner is allowed
	const allowRes = gatekeeper.canTransmit(ownerDid);
	assert.strictEqual(allowRes.allowed, true);

	// Transmit to third-party cloud is blocked
	const blockRes = gatekeeper.canTransmit('https://api.manufacturer-cloud.com/telemetry');
	assert.strictEqual(blockRes.allowed, false);
});
