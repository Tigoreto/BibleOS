/**
 * BibleOS Web Console — Client Application Engine
 * Sovereign Node Health, Reality Ledger Block Viewer & Protocol Explorer
 */

// Genesis chain constant defined by BibleOS Reality Ledger specification
export const GENESIS_CHAIN_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

// Canonical sample ledger reflecting real cryptographic blocks
export const SAMPLE_LEDGER = [
  {
    timestamp: "1710582000000000000",
    actor: "did:key:z6MkhaXgBZDvotDkL5257faiztiuC2ZXuE9vM5Z1f8q7yL9a",
    intent: "Genesis sovereign node initialization and Reality Ledger genesis anchor",
    action: {
      type: "node.init",
      node_id: "genesis-01",
      bos_version: "1.0",
      sovereignty: "uncompromising"
    },
    result: {
      status: "initialized",
      memory_engine: "reality-ledger-v1",
      zero_phone_home: true
    },
    state_delta: {
      node_state: "active",
      enrolled_devices: 1
    },
    context_hash: "",
    chain_hash: GENESIS_CHAIN_HASH,
    entry_hash: "09fa7fb173edd6266b15227c2253fb6aac9efd97c305ea2fcc9a8e3d6c575a34"
  },
  {
    timestamp: "1710582005000000000",
    actor: "did:key:z6MkjT8wNv13Y4P8K97LmV2QxR5Z91uAf3T7yBn4C6e1vX2q",
    intent: "Handshake pairing request from local Android lightweight node",
    action: {
      type: "bos1.handshake",
      protocol_version: "1.0",
      routing_declaration: {
        allowed_destinations: ["did:key:z6MkhaXgBZDvotDkL5257faiztiuC2ZXuE9vM5Z1f8q7yL9a"],
        blocked_destinations: ["*"]
      }
    },
    result: {
      status: "authenticated",
      zero_phone_home_enforced: true,
      channel: "local-mesh"
    },
    state_delta: {
      enrolled_devices: 2
    },
    context_hash: "09fa7fb173edd6266b15227c2253fb6aac9efd97c305ea2fcc9a8e3d6c575a34",
    chain_hash: "09fa7fb173edd6266b15227c2253fb6aac9efd97c305ea2fcc9a8e3d6c575a34",
    entry_hash: "3b8a1ec54c2d7908b9911e2f3d54877bb84c4e2098d5e16738f72922ef65cb18"
  },
  {
    timestamp: "1710582012000000000",
    actor: "did:key:bibleos-verify-action:github-marketplace-v1",
    intent: "Static security compliance scan for unauthorized egress and hardcoded endpoints",
    action: {
      type: "action.verify",
      target_path: "./src",
      strict_mode: true,
      scanned_files_count: 14
    },
    result: {
      compliance: "PASSED",
      intercepted_egress_attempts: 0,
      violations: []
    },
    state_delta: {
      last_audit_status: "COMPLIANT"
    },
    context_hash: "3b8a1ec54c2d7908b9911e2f3d54877bb84c4e2098d5e16738f72922ef65cb18",
    chain_hash: "3b8a1ec54c2d7908b9911e2f3d54877bb84c4e2098d5e16738f72922ef65cb18",
    entry_hash: "7d4f9b8821a48c909623e1b71239c0fa9112db4892cfa71236ea89104fae1019"
  },
  {
    timestamp: "1710582020000000000",
    actor: "did:key:z6MkhaXgBZDvotDkL5257faiztiuC2ZXuE9vM5Z1f8q7yL9a",
    intent: "Execute autonomous cognitive sense-plan-execute-audit cycle",
    action: {
      type: "kernel.autonomous_cycle",
      loop: "SENSE -> PLAN -> EXECUTE -> AUDIT -> RECORD -> IDLE",
      plan_steps: ["execute_action", "audit_compliance", "commit_ledger"]
    },
    result: {
      cycle_status: "completed",
      audit_pass: true,
      egress_detected: false
    },
    state_delta: {
      cycles_completed: 1
    },
    context_hash: "7d4f9b8821a48c909623e1b71239c0fa9112db4892cfa71236ea89104fae1019",
    chain_hash: "7d4f9b8821a48c909623e1b71239c0fa9112db4892cfa71236ea89104fae1019",
    entry_hash: "ebd575327dceb3fdec175fc0f1b8244901cf69728cb11ba30e01476d08129a02"
  }
];

export class RealityLedgerViewer {
  constructor(containerId = 'timelineContainer') {
    this.container = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
    this.entries = [...SAMPLE_LEDGER];
  }

  setEntries(entries) {
    this.entries = entries;
    if (typeof document !== 'undefined') {
      this.render();
    }
  }

  getEntries() {
    return this.entries;
  }

  verifyIntegrity() {
    if (!this.entries || this.entries.length === 0) {
      return { valid: true, count: 0 };
    }
    let expectedPrevHash = GENESIS_CHAIN_HASH;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.chain_hash !== expectedPrevHash) {
        return {
          valid: false,
          brokenIndex: i,
          reason: `Chain broken at block #${i}: expected previous hash ${expectedPrevHash.slice(0, 16)}..., got ${entry.chain_hash.slice(0, 16)}...`
        };
      }
      expectedPrevHash = entry.entry_hash;
    }
    return { valid: true, count: this.entries.length };
  }

  render(filterQuery = '') {
    if (!this.container) return;
    this.container.innerHTML = '';

    const query = filterQuery.trim().toLowerCase();
    const filtered = this.entries.filter(entry => {
      if (!query) return true;
      return (
        (entry.actor && entry.actor.toLowerCase().includes(query)) ||
        (entry.intent && entry.intent.toLowerCase().includes(query)) ||
        (entry.entry_hash && entry.entry_hash.toLowerCase().includes(query)) ||
        (entry.chain_hash && entry.chain_hash.toLowerCase().includes(query))
      );
    });

    // Update Overview Stats
    const totalBlocksEl = document.getElementById('statTotalBlocks');
    if (totalBlocksEl) totalBlocksEl.textContent = this.entries.length;

    const latestHashEl = document.getElementById('statLatestHash');
    if (latestHashEl && this.entries.length > 0) {
      const latest = this.entries[this.entries.length - 1].entry_hash;
      latestHashEl.textContent = latest.slice(0, 16) + '...';
      latestHashEl.title = latest;
    }

    const integrity = this.verifyIntegrity();
    const badgeEl = document.getElementById('ledgerIntegrityBadge');
    if (badgeEl) {
      if (integrity.valid) {
        badgeEl.className = 'integrity-badge valid';
        badgeEl.textContent = 'Chain Verified (Valid)';
      } else {
        badgeEl.className = 'integrity-badge tampered';
        badgeEl.textContent = 'Integrity Broken';
      }
    }

    if (filtered.length === 0) {
      this.container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--ink-soft); font-size: 0.9rem;">No blocks match your search query.</div>`;
      return;
    }

    filtered.forEach((entry, idx) => {
      const card = document.createElement('div');
      card.className = 'block-card';

      const isGenesis = entry.chain_hash === GENESIS_CHAIN_HASH;
      const formattedTime = entry.timestamp.length >= 19 
        ? new Date(Number(BigInt(entry.timestamp) / 1000000n)).toUTCString()
        : new Date(Number(entry.timestamp)).toUTCString();

      card.innerHTML = `
        <div class="block-header">
          <div class="block-index">Block #${idx} ${isGenesis ? '· Genesis Anchor' : ''}</div>
          <div class="block-time">${formattedTime} (${entry.timestamp} ns)</div>
        </div>
        <div class="block-chain-pointer">
          <div class="pointer-label">Chain Pointer</div>
          <div class="pointer-hash">← Previous: ${entry.chain_hash}</div>
        </div>
        <div class="block-chain-pointer">
          <div class="pointer-label">Block Hash</div>
          <div class="pointer-hash">✓ Current:  ${entry.entry_hash}</div>
        </div>
        <div class="block-body">
          <div class="field-label">Actor DID</div>
          <div class="field-content mono-display">${entry.actor}</div>
          
          <div class="field-label">Intent</div>
          <div class="field-content intent-text">${entry.intent}</div>
          
          <div class="field-label">Action Type</div>
          <div class="field-content">${entry.action?.type || 'kernel.event'}</div>
        </div>
        <div class="json-drawer">
          <button class="json-toggle" type="button" data-index="${idx}">View Raw Sealed Block</button>
          <pre class="json-pre" style="display: none;" id="json-block-${idx}">${JSON.stringify(entry, null, 2)}</pre>
        </div>
      `;

      this.container.appendChild(card);
    });

    // Wire JSON toggles
    this.container.querySelectorAll('.json-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = e.target.getAttribute('data-index');
        const pre = document.getElementById(`json-block-${index}`);
        if (pre) {
          const isHidden = pre.style.display === 'none';
          pre.style.display = isHidden ? 'block' : 'none';
          e.target.textContent = isHidden ? 'Hide Raw Block' : 'View Raw Sealed Block';
        }
      });
    });
  }
}

// Client Initialization
export function initWebConsole() {
  const viewer = new RealityLedgerViewer('timelineContainer');
  viewer.render();

  // 1. Tab Switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  const viewPanels = document.querySelectorAll('.view-panel');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      viewPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-target');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });

  // 2. Search filtering
  const searchInput = document.getElementById('ledgerSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      viewer.render(e.target.value);
    });
  }

  // 3. Reset to sample ledger
  const resetBtn = document.getElementById('resetLedgerBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      viewer.setEntries(SAMPLE_LEDGER);
      if (searchInput) searchInput.value = '';
    });
  }

  // 4. File Upload (JSON or JSONL)
  const fileInput = document.getElementById('ledgerFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const content = evt.target.result.trim();
          let parsed = [];
          if (content.startsWith('[')) {
            parsed = JSON.parse(content);
          } else {
            // JSON Lines
            parsed = content.split('\n').filter(Boolean).map(l => JSON.parse(l));
          }
          if (Array.isArray(parsed) && parsed.length > 0) {
            viewer.setEntries(parsed);
          } else {
            alert('Uploaded file contains no valid ledger entries.');
          }
        } catch (err) {
          alert('Failed to parse ledger file: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  // 5. Code Copy Buttons
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetSelector = btn.getAttribute('data-clipboard-target');
      const targetEl = document.querySelector(targetSelector);
      if (targetEl) {
        navigator.clipboard.writeText(targetEl.textContent.trim()).then(() => {
          const originalText = btn.textContent;
          btn.textContent = 'Copied';
          setTimeout(() => { btn.textContent = originalText; }, 1500);
        });
      }
    });
  });

  // 6. Loop Visualizer Simulation
  const simulateLoopBtn = document.getElementById('simulateLoopBtn');
  if (simulateLoopBtn) {
    simulateLoopBtn.addEventListener('click', () => {
      const steps = ['fsm-sense', 'fsm-plan', 'fsm-execute', 'fsm-audit', 'fsm-record'];
      let currentIdx = 0;
      simulateLoopBtn.disabled = true;

      const interval = setInterval(() => {
        steps.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.classList.remove('active');
        });

        if (currentIdx < steps.length) {
          const activeEl = document.getElementById(steps[currentIdx]);
          if (activeEl) activeEl.classList.add('active');
          currentIdx++;
        } else {
          clearInterval(interval);
          simulateLoopBtn.disabled = false;
        }
      }, 500);
    });
  }

  return viewer;
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initWebConsole();
  });
}
