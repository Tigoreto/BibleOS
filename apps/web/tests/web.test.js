import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 
  GENESIS_CHAIN_HASH, 
  SAMPLE_LEDGER, 
  RealityLedgerViewer 
} from '../src/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRootDir = path.resolve(__dirname, '..');

describe('BibleOS Web Console', () => {
  it('verifies web application assets structure', () => {
    const indexPath = path.join(webRootDir, 'index.html');
    const cssPath = path.join(webRootDir, 'src', 'styles.css');
    const jsPath = path.join(webRootDir, 'src', 'app.js');

    assert.ok(fs.existsSync(indexPath), 'index.html should exist');
    assert.ok(fs.existsSync(cssPath), 'styles.css should exist');
    assert.ok(fs.existsSync(jsPath), 'app.js should exist');

    const htmlContent = fs.readFileSync(indexPath, 'utf8');
    assert.ok(htmlContent.includes('view-health'), 'Must contain Node Health view');
    assert.ok(htmlContent.includes('view-ledger'), 'Must contain Reality Ledger view');
    assert.ok(htmlContent.includes('view-protocol'), 'Must contain Protocol Specs view');
    assert.ok(htmlContent.includes('view-quickstart'), 'Must contain Quickstart view');
    assert.ok(htmlContent.includes('timelineContainer'), 'Must contain block timeline container');
  });

  it('verifies sample reality ledger chain mathematical continuity', () => {
    assert.ok(Array.isArray(SAMPLE_LEDGER), 'SAMPLE_LEDGER must be an array');
    assert.strictEqual(SAMPLE_LEDGER.length >= 3, true, 'SAMPLE_LEDGER should have at least 3 blocks');

    // Block 0 must point to GENESIS_CHAIN_HASH
    assert.strictEqual(SAMPLE_LEDGER[0].chain_hash, GENESIS_CHAIN_HASH);

    // Each subsequent block's chain_hash must equal the previous block's entry_hash
    for (let i = 1; i < SAMPLE_LEDGER.length; i++) {
      assert.strictEqual(
        SAMPLE_LEDGER[i].chain_hash,
        SAMPLE_LEDGER[i - 1].entry_hash,
        `Block #${i} chain_hash must match Block #${i - 1} entry_hash`
      );
    }
  });

  it('verifies RealityLedgerViewer integrity validation and tamper detection', () => {
    const viewer = new RealityLedgerViewer('non-existent-container-for-testing');
    
    // Test untampered sample ledger
    viewer.setEntries(SAMPLE_LEDGER);
    const validCheck = viewer.verifyIntegrity();
    assert.strictEqual(validCheck.valid, true);
    assert.strictEqual(validCheck.count, SAMPLE_LEDGER.length);

    // Test tampered ledger
    const tampered = JSON.parse(JSON.stringify(SAMPLE_LEDGER));
    tampered[2].chain_hash = '1111111111111111111111111111111111111111111111111111111111111111';
    
    viewer.setEntries(tampered);
    const tamperedCheck = viewer.verifyIntegrity();
    assert.strictEqual(tamperedCheck.valid, false);
    assert.strictEqual(tamperedCheck.brokenIndex, 2);
  });
});
