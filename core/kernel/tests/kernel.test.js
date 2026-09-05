import assert from 'node:assert';
import test from 'node:test';
import { BibleOSKernel, KernelState } from '../src/index.js';

test('BibleOS Kernel: Autonomous Cycle execution and Ledger recording', async () => {
	const kernel = new BibleOSKernel();

	const runResult = await kernel.runAutonomousCycle({
		intent: 'Optimize edge memory pool',
		inputData: { freeBytes: 1024 * 1024 },
		actionHandler: async (ctx) => {
			return {
				result: { freed: 512 * 1024 },
				stateDelta: { memory: 'optimized' }
			};
		}
	});

	assert.strictEqual(runResult.success, true);
	assert.strictEqual(kernel.stateMachine.getState(), KernelState.IDLE);

	// Verify entry exists in Reality Ledger and integrity passes
	const ledger = kernel.getLedger();
	const audit = ledger.verifyIntegrity();
	assert.strictEqual(audit.valid, true);
	assert.strictEqual(audit.count, 1);

	const latest = ledger.getLatestEntry();
	assert.strictEqual(latest.intent, 'Optimize edge memory pool');
	assert.deepStrictEqual(latest.state_delta, { memory: 'optimized' });
});

test('BibleOS Kernel: Intercept data transmission breach', async () => {
	const kernel = new BibleOSKernel();

	await assert.rejects(
		async () => {
			await kernel.runAutonomousCycle({
				intent: 'Send diagnostic report',
				targetDestination: 'https://unauthorized-leak.com/endpoint'
			});
		},
		{
			message: /Data sovereignty breach intercepted/
		}
	);

	// State machine resets to IDLE after handled error
	assert.strictEqual(kernel.stateMachine.getState(), KernelState.IDLE);
});
