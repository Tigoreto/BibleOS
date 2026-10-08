import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_IGNORED_DIRS = new Set([
	'.git',
	'node_modules',
	'dist',
	'coverage',
	'artifacts',
	'brain',
	'.system_generated',
	'.agent',
	'.idea',
	'.vscode'
]);

const SUPPORTED_EXTENSIONS = new Set([
	'.js',
	'.mjs',
	'.cjs',
	'.ts',
	'.tsx',
	'.jsx',
	'.py',
	'.go',
	'.sh',
	'.json',
	'.yaml',
	'.yml'
]);

const EXEMPT_HOSTNAMES = new Set([
	'localhost',
	'127.0.0.1',
	'0.0.0.0',
	'::1',
	'schema.org',
	'json-schema.org',
	'w3.org',
	'www.w3.org'
]);

const CALL_PATTERNS = [
	{
		name: 'fetch_call',
		regex: /\bfetch\s*\(\s*(['"`])([^'"`]+)\1/g
	},
	{
		name: 'axios_call',
		regex: /\baxios(?:\.[a-zA-Z0-9_$]+)?\s*\(\s*(['"`])([^'"`]+)\1/g
	},
	{
		name: 'http_request_call',
		regex: /\bhttps?\.(?:request|get|post|put)\s*\(\s*(['"`])([^'"`]+)\1/g
	},
	{
		name: 'websocket_call',
		regex: /\bnew\s+WebSocket\s*\(\s*(['"`])([^'"`]+)\1/g
	},
	{
		name: 'python_requests_call',
		regex: /\brequests\.(?:get|post|put|delete|head|options)\s*\(\s*(['"`])([^'"`]+)\1/g
	}
];

const URL_LITERAL_PATTERN = /https?:\/\/([a-zA-Z0-9.\-_]+(?::\d+)?)(?:\/[^\s"'`]*)?/g;

function normalizeEndpoint(rawUrl) {
	try {
		const parsed = new URL(rawUrl);
		return {
			host: parsed.hostname.toLowerCase(),
			port: parsed.port || (parsed.protocol === 'https:' ? '443' : '80'),
			origin: parsed.origin.toLowerCase(),
			raw: rawUrl
		};
	} catch {
		return {
			host: rawUrl.toLowerCase().trim(),
			port: '',
			origin: rawUrl.toLowerCase().trim(),
			raw: rawUrl
		};
	}
}

function isHostExempt(host) {
	if (EXEMPT_HOSTNAMES.has(host)) {
		return true;
	}
	for (const exempt of EXEMPT_HOSTNAMES) {
		if (host.endsWith('.' + exempt)) {
			return true;
		}
	}
	return false;
}

function isEndpointAllowed(endpointInfo, allowedSet) {
	if (allowedSet.has('*')) {
		return true;
	}
	if (allowedSet.has(endpointInfo.host)) {
		return true;
	}
	if (allowedSet.has(endpointInfo.origin)) {
		return true;
	}
	for (const allowed of allowedSet) {
		if (allowed.startsWith('*.') && endpointInfo.host.endsWith(allowed.slice(2))) {
			return true;
		}
		if (endpointInfo.raw.startsWith(allowed)) {
			return true;
		}
	}
	return false;
}

function getLineAndColumn(content, index) {
	const slice = content.slice(0, index);
	const lines = slice.split('\n');
	const line = lines.length;
	const column = lines[lines.length - 1].length + 1;
	return { line, column };
}

export function scanFileContent(filePath, content, allowedEndpoints = []) {
	const allowedSet = new Set(
		allowedEndpoints
			.map((ep) => ep.trim().toLowerCase())
			.filter(Boolean)
	);

	const detections = [];
	const violations = [];

	// 1. Scan explicit client calls
	for (const pattern of CALL_PATTERNS) {
		let match;
		const regex = new RegExp(pattern.regex);
		while ((match = regex.exec(content)) !== null) {
			const targetRaw = match[2];
			const { line, column } = getLineAndColumn(content, match.index);
			const endpointInfo = normalizeEndpoint(targetRaw);

			const detection = {
				file: filePath,
				line,
				column,
				callType: pattern.name,
				target: targetRaw,
				host: endpointInfo.host
			};
			detections.push(detection);

			if (isHostExempt(endpointInfo.host)) {
				continue;
			}

			if (!isEndpointAllowed(endpointInfo, allowedSet)) {
				violations.push({
					...detection,
					reason: `Unauthorized external network call to '${targetRaw}' violates Zero Phone-Home policy.`
				});
			}
		}
	}

	// 2. Scan external URL literals
	let urlMatch;
	const urlRegex = new RegExp(URL_LITERAL_PATTERN);
	while ((urlMatch = urlRegex.exec(content)) !== null) {
		const fullUrl = urlMatch[0];
		const host = urlMatch[1].split(':')[0].toLowerCase();
		const { line, column } = getLineAndColumn(content, urlMatch.index);
		const endpointInfo = normalizeEndpoint(fullUrl);

		const detection = {
			file: filePath,
			line,
			column,
			callType: 'url_literal',
			target: fullUrl,
			host
		};
		detections.push(detection);

		if (isHostExempt(host)) {
			continue;
		}

		if (!isEndpointAllowed(endpointInfo, allowedSet)) {
			// Avoid duplicate violation on same line if already detected by client call
			const exists = violations.some(
				(v) => v.file === filePath && v.line === line && v.host === host
			);
			if (!exists) {
				violations.push({
					...detection,
					reason: `Hardcoded unauthorized external endpoint '${fullUrl}' detected.`
				});
			}
		}
	}

	return { detections, violations };
}

export function scanDirectory(targetPath, options = {}) {
	const {
		allowedEndpoints = [],
		ignoredDirs = DEFAULT_IGNORED_DIRS,
		supportedExtensions = SUPPORTED_EXTENSIONS
	} = options;

	const resolvedPath = path.resolve(targetPath);
	if (!fs.existsSync(resolvedPath)) {
		throw new Error(`Target path does not exist: ${resolvedPath}`);
	}

	const filesToScan = [];

	function walk(currentDir) {
		const entries = fs.readdirSync(currentDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (ignoredDirs.has(entry.name)) {
					continue;
				}
				walk(path.join(currentDir, entry.name));
			} else if (entry.isFile()) {
				const ext = path.extname(entry.name).toLowerCase();
				if (supportedExtensions.has(ext)) {
					filesToScan.push(path.join(currentDir, entry.name));
				}
			}
		}
	}

	const stat = fs.statSync(resolvedPath);
	if (stat.isFile()) {
		filesToScan.push(resolvedPath);
	} else {
		walk(resolvedPath);
	}

	const allDetections = [];
	const allViolations = [];

	for (const file of filesToScan) {
		const relativeFile = path.relative(resolvedPath, file) || path.basename(file);
		const content = fs.readFileSync(file, 'utf8');
		const { detections, violations } = scanFileContent(relativeFile, content, allowedEndpoints);
		allDetections.push(...detections);
		allViolations.push(...violations);
	}

	return {
		scannedFilesCount: filesToScan.length,
		scannedFiles: filesToScan.map((f) => path.relative(resolvedPath, f) || path.basename(f)),
		detections: allDetections,
		violations: allViolations
	};
}
