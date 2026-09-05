import { generateKeyPair } from '../../../packages/bos1-protocol/src/crypto.js';
import { ZeroPhoneHomeGatekeeper } from '../../../packages/bos1-protocol/src/packet.js';
import { RealityLedger } from '../../../packages/reality-ledger/src/ledger.js';
import { AutonomousStateMachine, KernelState } from './state-machine.js';

export class BibleOSKernel {
	constructor(options = {}) {
		this.keypair = options.keypair || generateKeyPair();
		this.nodeDID = this.keypair.did;
		this.ownerDID = options.ownerDID || this.nodeDID;

		this.ledger = new RealityLedger({ filePath: options.ledgerFilePath });
		this.gatekeeper = new ZeroPhoneHomeGatekeeper(
			options.routingDeclaration || {
				allowed_destinations: [this.ownerDID],
				blocked_destinations: ['*']
			}
		);

		this.stateMachine = new AutonomousStateMachine();
	}

	/**
	 * Executes a complete sovereign autonomous cycle:
	 * SENSE -> PLAN -> EXECUTE -> AUDIT -> RECORD -> IDLE
	 */
	async runAutonomousCycle({ intent, inputData = {}, actionHandler, targetDestination = null }) {
		try {
			// 1. SENSE
			this.stateMachine.transition(KernelState.SENSE, { intent });
			const sensedContext = { ...inputData, sensedAt: Date.now() };

			// 2. PLAN
			this.stateMachine.transition(KernelState.PLAN);
			const plan = {
				steps: ['execute_action', 'audit_compliance', 'commit_ledger'],
				intent
			};

			// 3. EXECUTE
			this.stateMachine.transition(KernelState.EXECUTE);
			let executionResult = {};
			let stateDelta = {};
			if (typeof actionHandler === 'function') {
				const res = await actionHandler(sensedContext);
				executionResult = res.result || res;
				stateDelta = res.stateDelta || {};
			} else {
				executionResult = { status: 'completed', payload: sensedContext };
			}

			// 4. AUDIT (Zero Phone-Home and compliance check)
			this.stateMachine.transition(KernelState.AUDIT);
			if (targetDestination) {
				const check = this.gatekeeper.canTransmit(targetDestination);
				if (!check.allowed) {
					throw new Error(`Data sovereignty breach intercepted: ${check.reason}`);
				}
			}

			// 5. RECORD (Reality Ledger Immutable Append)
			this.stateMachine.transition(KernelState.RECORD);
			const ledgerEntry = this.ledger.append({
				actor: this.nodeDID,
				intent,
				action: plan,
				result: executionResult,
				stateDelta
			});

			// 6. RETURN TO IDLE
			this.stateMachine.transition(KernelState.IDLE);

			return {
				success: true,
				ledgerEntry,
				result: executionResult
			};
		} catch (err) {
			this.stateMachine.transition(KernelState.ERROR, { error: err.message });
			this.stateMachine.transition(KernelState.IDLE);
			throw err;
		}
	}

	getLedger() {
		return this.ledger;
	}

	getNodeDID() {
		return this.nodeDID;
	}
}
