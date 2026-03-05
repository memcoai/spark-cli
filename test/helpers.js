import { it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Sets up console.log, process.exit, and process.stdout.write mocks for command tests.
 * Must be called inside a describe() block.
 * Returns an object whose logMock/exitMock/stdoutMock properties update each beforeEach.
 */
export function setupCommandMocks() {
  const mocks = {};

  beforeEach(() => {
    mocks.logMock = mock.method(console, 'log');
    mocks.exitMock = mock.method(process, 'exit', () => {});
    mocks.stdoutMock = mock.method(process.stdout, 'write', () => true);
  });

  afterEach(() => {
    mocks.logMock.mock.restore();
    mocks.exitMock.mock.restore();
    mocks.stdoutMock.mock.restore();
  });

  return mocks;
}

export function getErrorOutput(logMock) {
  return JSON.parse(logMock.mock.calls[0].arguments[0]);
}

/**
 * Sets up fetch mock and SPARK_API_KEY env var for API call tests.
 * Must be called inside a describe() block.
 * Returns an object whose fetchMock property updates each beforeEach.
 */
export function setupFetchMock() {
  const ctx = {};

  beforeEach(() => {
    ctx.originalKey = process.env.SPARK_API_KEY;
    process.env.SPARK_API_KEY = 'test-key';
    ctx.fetchMock = mock.method(globalThis, 'fetch', () =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    );
  });

  afterEach(() => {
    ctx.fetchMock.mock.restore();
    if (ctx.originalKey === undefined) delete process.env.SPARK_API_KEY;
    else process.env.SPARK_API_KEY = ctx.originalKey;
  });

  return ctx;
}

/**
 * Generates standard tag validation tests for a command.
 * Must be called inside a describe() block that uses setupCommandMocks().
 * @param {object} mocks - The mocks object from setupCommandMocks()
 * @param {Function} commandFn - The command function to test
 * @param {Function} buildArgs - Returns [positionalArg, optsWithoutTag] for the command
 */
export function tagValidationTests(mocks, commandFn, buildArgs) {
  it('errors on invalid tag format', async () => {
    const [positional, baseOpts] = buildArgs();
    await commandFn(positional, { ...baseOpts, tag: 'invalid' }, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /Invalid tag/);
  });

  it('errors on invalid version in tag', async () => {
    const [positional, baseOpts] = buildArgs();
    await commandFn(positional, { ...baseOpts, tag: 'language:node:latest' }, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.match(output.message, /Invalid version/);
  });

  it('errors on invalid tag in array format', async () => {
    const [positional, baseOpts] = buildArgs();
    await commandFn(positional, { ...baseOpts, tag: ['language:python:3.11', 'invalid'] }, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.match(output.message, /Invalid tag/);
  });
}

/**
 * Generates standard XML tag validation tests for a command.
 * Must be called inside a describe() block that uses setupCommandMocks().
 */
export function xmlTagValidationTests(mocks, commandFn, buildArgs) {
  it('errors on invalid XML tag format', async () => {
    const [positional, baseOpts] = buildArgs();
    await commandFn(positional, { ...baseOpts, xmlTag: 'not-xml' }, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.strictEqual(output.error, true);
    assert.match(output.message, /Invalid XML tag/);
  });

  it('errors on XML tag missing type attribute', async () => {
    const [positional, baseOpts] = buildArgs();
    await commandFn(positional, { ...baseOpts, xmlTag: '<tag name="foo" />' }, null);

    assert.strictEqual(mocks.exitMock.mock.calls.length, 1);
    const output = getErrorOutput(mocks.logMock);
    assert.match(output.message, /missing required "type"/);
  });
}

export function getLogOutput(m) {
  return m.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
}

export function getStdoutOutput(m) {
  return m.mock.calls.map((c) => c.arguments[0]).join('');
}

/**
 * Shared npm exec error cases for update/uninstall command tests.
 * Each entry has a name, error object, and expected output substring.
 */
export const npmExecErrorCases = [
  {
    name: 'shows npm-not-found message on ENOENT',
    error: Object.assign(new Error('spawn npm ENOENT'), { code: 'ENOENT' }),
    expected: 'npm is not installed or not in PATH',
  },
  {
    name: 'shows permission message on EACCES',
    error: Object.assign(new Error('permission denied'), { code: 'EACCES' }),
    expected: 'Permission denied',
  },
  {
    name: 'prints stderr message on npm failure',
    error: Object.assign(new Error('command failed'), { stderr: '  npm ERR! network error  ' }),
    expected: 'npm ERR! network error',
  },
  {
    name: 'falls back to error message when stderr is empty',
    error: Object.assign(new Error('ETIMEOUT'), { stderr: '' }),
    expected: 'ETIMEOUT',
  },
];
