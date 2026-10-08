import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_IGNORED_DIRS = new Set([
	'node_modules',
	'.git',
	'.github',
	'dist',
	'build',
	'coverage',
	'.cache'
]);

const SUPPORTED_EXTENSIONS = new Set([
	'.js',
	'.mjs',
	'.cjs',
	'.ts',
	'.tsx',
	'.jsx',
	'.py',
	'.sh',
	'.json',
	'.yaml',
	'.yml'
]);

const LOCAL_HOSTS = new Set([
	'localhost',
	'127.0.0.1',
	'0.0.0.0',
	'::1'
]);

const URL_REGEX = /(?:https?|wss?):\/\/([a-zA-Z0-9.-]+)(?::\d+)?/gi;
const NETWORK_INVOCATION_REGEX = /\b(fetch|axios(?:\.[a-z]+)?|http\.request|https\.request|net\.connect|new\s+WebSocket)\s*\(/g;

/**
 * Checks whether a given host matches the allowed endpoints list.
 */
function isHostAllowed(host, allowedList = []) {
	const normalizedHost = host.toLowerCase();
	if (LOCAL_HOSTS.has(normalizedHost)) {
		return true;
	}

	for (const pattern of allowedList) {
		const cleanPattern = pattern.trim().toLowerCase();
		if (!cleanPattern) continue;

		if (cleanPattern === '*' || cleanPattern === normalizedHost) {
			return true;
		}

		if (cleanPattern.startsWith('*.') && normalizedHost.endsWith(cleanPattern.slice(1))) {
			return true;
		}
	}

	return false;
}

/**
 * Scans a file for potential unauthorized network egress and endpoints.
 */
export function scanFile(filePath, allowedEndpoints = []) {
	const content = fs.readFileSync(filePath, 'utf8');
	const lines = content.split('\n');
	const fileViolations = [];
	const discoveredEndpoints = new Set();

	lines.forEach((line, index) => {
		const lineNum = index + 1;
		let match;

		// 1. Detect explicit URLs
		URL_REGEX.lastIndex = 0;
		while ((match = URL_REGEX.exec(line)) !== null) {
			const host = match[1];
			discoveredEndpoints.add(host);

			if (!isHostAllowed(host, allowedEndpoints)) {
				fileViolations.push({
					file: filePath,
					line: lineNum,
					type: 'UNAUTHORIZED_ENDPOINT',
					target: match[0],
					detail: `Target host "${host}" is not in the allowed destinations list.`,
					snippet: line.trim()
				});
			}
		}

		// 2. Detect unparameterized or dynamic network client invocations
		NETWORK_INVOCATION_REGEX.lastIndex = 0;
		while ((match = NETWORK_INVOCATION_REGEX.exec(line)) !== null) {
			const callName = match[1];
			// If the line contains fetch/axios but no explicit local/whitelisted URL on the same line, flag for scrutiny
			if (!line.includes('localhost') && !line.includes('127.0.0.1')) {
				const hasAllowedMatch = allowedEndpoints.some((ep) => ep && line.includes(ep));
				if (!hasAllowedMatch) {
					fileViolations.push({
						file: filePath,
						line: lineNum,
						type: 'DYNAMIC_NETWORK_INVOCATION',
						target: callName,
						detail: `Potential dynamic egress invocation: ${callName}(...) without explicit whitelisted endpoint binding.`,
						snippet: line.trim()
					});
				}
			}
		}
	});

	return {
		filePath,
		violations: fileViolations,
		endpoints: Array.from(discoveredEndpoints)
	};
}

/**
 * Recursively scans a target directory for unauthorized egress breaches.
 */
export function scanDirectory(targetPath, options = {}) {
	const allowedEndpoints = (options.allowedEndpoints || [])
		.flatMap((item) => (typeof item === 'string' ? item.split(',') : []))
		.map((s) => s.trim())
		.filter(Boolean);

	const allViolations = [];
	const allEndpoints = new Set();
	let scannedFileCount = 0;

	function walk(currentPath) {
		if (!fs.existsSync(currentPath)) {
			return;
		}

		const stat = fs.statSync(currentPath);
		if (stat.isFile()) {
			const ext = path.extname(currentPath).toLowerCase();
			if (SUPPORTED_EXTENSIONS.has(ext)) {
				scannedFileCount++;
				const result = scanFile(currentPath, allowedEndpoints);
				if (result.violations.length > 0) {
					allViolations.push(...result.violations);
				}
				result.endpoints.forEach((ep) => allEndpoints.add(ep));
			}
			return;
		}

		if (stat.isDirectory()) {
			const dirName = path.basename(currentPath);
			if (DEFAULT_IGNORED_DIRS.has(dirName)) {
				return;
			}

			const files = fs.readdirSync(currentPath);
			for (const file of files) {
				walk(path.join(currentPath, file));
			}
		}
	}

	walk(targetPath);

	return {
		targetPath,
		scannedFileCount,
		allowedEndpoints,
		discoveredEndpoints: Array.from(allEndpoints),
		violations: allViolations,
		isCompliant: allViolations.length === 0
	};
}
