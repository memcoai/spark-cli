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
 * Creates a mock fetch that returns responses in sequence.
 * Each response is { status, ok, json?, text? }.
 */
export function mockFetchSequence(responses) {
  if (!responses?.length) throw new Error('mockFetchSequence requires at least one response');
  let callIdx = 0;
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url, options });
    const r = responses[Math.min(callIdx++, responses.length - 1)];
    return {
      status: r.status,
      ok: r.ok ?? (r.status >= 200 && r.status < 300),
      json: () => Promise.resolve(r.json ?? {}),
      text: () => Promise.resolve(r.text ?? ''),
    };
  };
  fn.calls = calls;
  return fn;
}

/**
 * Builds common mock dependencies shared by setup-related command tests (init, enable, variant).
 * Pass overrides to customize or add command-specific deps.
 */
export function buildSetupDeps(overrides = {}) {
  return {
    exec: mock.fn(async () => ({ stdout: '', stderr: '' })),
    spawnInteractive: mock.fn(async () => {}),
    fetchVersion: mock.fn(async () => ({ version: '1.0.0' })),
    writeKey: mock.fn(),
    readKey: mock.fn(() => []),
    ...overrides,
  };
}

/**
 * Table-driven schema validation tests.
 * Generates it() blocks for each case in the array.
 * Each case: { name, input, valid: true, expected? } or { name, input, valid: false, errorMatch }
 * Must be called inside a describe() block.
 */
export function schemaValidationTests(schema, cases) {
  for (const c of cases) {
    if (c.valid) {
      it(c.name, () => {
        const result = schema.safeParse(c.input);
        assert.strictEqual(result.success, true, `Expected success for: ${c.input}`);
        if (Object.hasOwn(c, 'expected')) {
          assert.strictEqual(result.data, c.expected);
        }
      });
    } else {
      it(c.name, () => {
        const result = schema.safeParse(c.input);
        assert.strictEqual(result.success, false, `Expected failure for: ${c.input}`);
        if (c.errorMatch) {
          assert.match(result.error.issues[0].message, c.errorMatch);
        }
      });
    }
  }
}

/**
 * Generates "rejects missing <attr>" test cases for XML-based schemas.
 * @param {string} element - The XML element name (e.g. 'tag', 'feedback')
 * @param {Record<string, string>} sampleAttrs - All required attrs with sample values
 * @param {object} opts - Options: quoteChar (default "'"), selfClosing (default false)
 */
export function missingAttrCases(
  element,
  sampleAttrs,
  { quoteChar = "'", selfClosing = false } = {},
) {
  return Object.keys(sampleAttrs).map((attr) => {
    const remaining = Object.entries(sampleAttrs)
      .filter(([k]) => k !== attr)
      .map(([k, v]) => `${k}=${quoteChar}${v}${quoteChar}`)
      .join(' ');
    const closing = selfClosing ? ' />' : `></${element}>`;
    return {
      name: `rejects missing ${attr}`,
      input: `<${element} ${remaining}${closing}`,
      valid: false,
      errorMatch: new RegExp(`missing required "${attr}"`),
    };
  });
}

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
