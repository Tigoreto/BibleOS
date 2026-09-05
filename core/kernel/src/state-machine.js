export const KernelState = {
	IDLE: 'IDLE',
	SENSE: 'SENSE',
	PLAN: 'PLAN',
	EXECUTE: 'EXECUTE',
	AUDIT: 'AUDIT',
	RECORD: 'RECORD',
	ERROR: 'ERROR'
};

export class AutonomousStateMachine {
	constructor() {
		this.currentState = KernelState.IDLE;
		this.history = [];
	}

	transition(nextState, context = {}) {
		const validTransitions = {
			[KernelState.IDLE]: [KernelState.SENSE],
			[KernelState.SENSE]: [KernelState.PLAN, KernelState.ERROR],
			[KernelState.PLAN]: [KernelState.EXECUTE, KernelState.ERROR],
			[KernelState.EXECUTE]: [KernelState.AUDIT, KernelState.ERROR],
			[KernelState.AUDIT]: [KernelState.RECORD, KernelState.ERROR],
			[KernelState.RECORD]: [KernelState.IDLE, KernelState.ERROR],
			[KernelState.ERROR]: [KernelState.IDLE]
		};

		const allowed = validTransitions[this.currentState] || [];
		if (!allowed.includes(nextState)) {
			throw new Error(`Invalid state transition: ${this.currentState} -> ${nextState}`);
		}

		this.history.push({ from: this.currentState, to: nextState, timestamp: Date.now(), context });
		this.currentState = nextState;
		return this.currentState;
	}

	getState() {
		return this.currentState;
	}
}
