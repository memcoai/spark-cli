import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getParentOptions,
  output,
  setVersionNotification,
  printVersionNotification,
} from '../src/output.js';

describe('getParentOptions', () => {
  it('returns {} for null command', () => {
    assert.deepStrictEqual(getParentOptions(null), {});
  });

  it('returns {} for undefined command', () => {
    assert.deepStrictEqual(getParentOptions(undefined), {});
  });

  it('returns opts() from command with no parent', () => {
    const command = { parent: null, opts: () => ({ pretty: true }) };
    assert.deepStrictEqual(getParentOptions(command), { pretty: true });
  });

  it('walks to root and returns root opts()', () => {
    const root = { parent: null, opts: () => ({ apiKey: 'key123' }) };
    const child = { parent: root, opts: () => ({ verbose: true }) };
    assert.deepStrictEqual(getParentOptions(child), { apiKey: 'key123' });
  });

  it('handles deeply nested chain', () => {
    const root = { parent: null, opts: () => ({ pretty: true, apiKey: 'k' }) };
    const mid = { parent: root, opts: () => ({}) };
    const leaf = { parent: mid, opts: () => ({}) };
    assert.deepStrictEqual(getParentOptions(leaf), { pretty: true, apiKey: 'k' });
  });
});

describe('output', () => {
  let logMock;

  beforeEach(() => {
    logMock = mock.method(console, 'log');
  });

  afterEach(() => {
    logMock.mock.restore();
  });

  it('outputs compact JSON by default', () => {
    output({ key: 'value' });
    assert.strictEqual(logMock.mock.calls.length, 1);
    assert.strictEqual(logMock.mock.calls[0].arguments[0], '{"key":"value"}');
  });

  it('outputs compact JSON when pretty is false', () => {
    const command = { parent: null, opts: () => ({ pretty: false }) };
    output({ a: 1 }, command);
    assert.strictEqual(logMock.mock.calls[0].arguments[0], '{"a":1}');
  });

  it('outputs human-readable format when pretty is true', () => {
    const command = { parent: null, opts: () => ({ pretty: true }) };
    output({ a: 1 }, command);
    const result = logMock.mock.calls[0].arguments[0];
    // Pretty mode renders human-readable output, not JSON
    assert.ok(result.includes('A:'));
    assert.ok(result.includes('1'));
  });

  it('handles null command', () => {
    output({ test: true }, null);
    assert.strictEqual(logMock.mock.calls[0].arguments[0], '{"test":true}');
  });

  it('serializes arrays', () => {
    output([1, 2, 3]);
    assert.strictEqual(logMock.mock.calls[0].arguments[0], '[1,2,3]');
  });
});

describe('printVersionNotification', () => {
  let stderrMock;

  beforeEach(() => {
    stderrMock = mock.method(process.stderr, 'write');
  });

  afterEach(() => {
    stderrMock.mock.restore();
    // Clear any pending notification
    setVersionNotification(null);
  });

  it('writes to stderr when notification is set', () => {
    setVersionNotification('Update available: v1.0.0 → v1.1.0');
    printVersionNotification();
    assert.strictEqual(stderrMock.mock.calls.length, 1);
    assert.ok(stderrMock.mock.calls[0].arguments[0].includes('Update available'));
  });

  it('does nothing when no notification is set', () => {
    printVersionNotification();
    assert.strictEqual(stderrMock.mock.calls.length, 0);
  });

  it('clears the notification after printing', () => {
    setVersionNotification('Update available');
    printVersionNotification();
    printVersionNotification();
    assert.strictEqual(stderrMock.mock.calls.length, 1);
  });
});
