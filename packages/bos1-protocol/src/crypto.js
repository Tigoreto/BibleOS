import crypto from 'node:crypto';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function encodeBase58(buffer) {
	if (!buffer || buffer.length === 0) return '';
	const digits = [0];
	for (let i = 0; i < buffer.length; i++) {
		let carry = buffer[i];
		for (let j = 0; j < digits.length; j++) {
			carry += digits[j] << 8;
			digits[j] = carry % 58;
			carry = (carry / 58) | 0;
		}
		while (carry > 0) {
			digits.push(carry % 58);
			carry = (carry / 58) | 0;
		}
	}
	let str = '';
	for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
		str += BASE58_ALPHABET[0];
	}
	for (let i = digits.length - 1; i >= 0; i--) {
		str += BASE58_ALPHABET[digits[i]];
	}
	return str;
}

export function decodeBase58(str) {
	if (!str || str.length === 0) return Buffer.alloc(0);
	const bytes = [0];
	for (let i = 0; i < str.length; i++) {
		const char = str[i];
		const val = BASE58_ALPHABET.indexOf(char);
		if (val === -1) {
			throw new Error(`Invalid Base58 character: ${char}`);
		}
		let carry = val;
		for (let j = 0; j < bytes.length; j++) {
			carry += bytes[j] * 58;
			bytes[j] = carry & 0xff;
			carry >>= 8;
		}
		while (carry > 0) {
			bytes.push(carry & 0xff);
			carry >>= 8;
		}
	}
	let leadingZeros = 0;
	while (leadingZeros < str.length && str[leadingZeros] === BASE58_ALPHABET[0]) {
		leadingZeros++;
	}
	const result = Buffer.alloc(leadingZeros + bytes.length);
	for (let i = 0; i < leadingZeros; i++) {
		result[i] = 0;
	}
	for (let i = 0; i < bytes.length; i++) {
		result[leadingZeros + i] = bytes[bytes.length - 1 - i];
	}
	return result;
}

/**
 * Encodes a 32-byte Ed25519 raw public key into W3C did:key format.
 * Multi-codec prefix for Ed25519 public key is 0xed 0x01.
 */
export function didKeyFromRawPublicKey(rawPublicKey) {
	if (rawPublicKey.length !== 32) {
		throw new Error('Ed25519 raw public key must be 32 bytes');
	}
	const multicodec = Buffer.concat([Buffer.from([0xed, 0x01]), rawPublicKey]);
	return `did:key:z${encodeBase58(multicodec)}`;
}

/**
 * Decodes a W3C did:key string back to a 32-byte Ed25519 raw public key.
 */
export function rawPublicKeyFromDidKey(didKey) {
	if (!didKey.startsWith('did:key:z')) {
		throw new Error('Unsupported DID format. Expected did:key:z...');
	}
	const encoded = didKey.slice(9);
	const decoded = decodeBase58(encoded);
	if (decoded.length < 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
		throw new Error('Invalid Ed25519 multicodec prefix in did:key');
	}
	return decoded.subarray(2, 34);
}

/**
 * Generates an Ed25519 keypair and the corresponding did:key identifier.
 */
export function generateKeyPair() {
	const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
	// Export raw 32 bytes public key
	const jwk = publicKey.export({ format: 'jwk' });
	const rawPublicKey = Buffer.from(jwk.x, 'base64url');
	const did = didKeyFromRawPublicKey(rawPublicKey);

	return {
		did,
		publicKey,
		privateKey,
		rawPublicKey
	};
}

/**
 * Serializes an object into deterministic Canonical JSON (RFC 8785 subset: sorted keys, no whitespace).
 */
export function canonicalJson(obj) {
	if (obj === null || typeof obj !== 'object') {
		return JSON.stringify(obj);
	}
	if (Array.isArray(obj)) {
		return `[${obj.map((item) => canonicalJson(item)).join(',')}]`;
	}
	const sortedKeys = Object.keys(obj).sort();
	const keyValues = sortedKeys.map((k) => `"${k}":${canonicalJson(obj[k])}`);
	return `{${keyValues.join(',')}}`;
}

/**
 * Signs a payload using Ed25519 private key over its Canonical JSON serialization.
 */
export function signPayload(payload, privateKey) {
	const data = Buffer.from(canonicalJson(payload), 'utf8');
	const signature = crypto.sign(null, data, privateKey);
	return signature.toString('hex');
}

/**
 * Verifies an Ed25519 signature over a payload's Canonical JSON serialization.
 */
export function verifyPayload(payload, signatureHex, didOrKey) {
	const data = Buffer.from(canonicalJson(payload), 'utf8');
	const signature = Buffer.from(signatureHex, 'hex');

	let keyToVerify;
	if (typeof didOrKey === 'string' && didOrKey.startsWith('did:key:')) {
		const rawPub = rawPublicKeyFromDidKey(didOrKey);
		keyToVerify = crypto.createPublicKey({
			key: {
				kty: 'OKP',
				crv: 'Ed25519',
				x: rawPub.toString('base64url')
			},
			format: 'jwk'
		});
	} else {
		keyToVerify = didOrKey;
	}

	return crypto.verify(null, data, keyToVerify, signature);
}
