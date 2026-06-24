import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateArgs } from '../src/mcp-client.js';

describe('mcp-client', () => {
  describe('validateArgs', () => {
    const schema = {
      type: 'object',
      properties: { q: { type: 'string' } },
      required: ['q'],
    };

    it('returns { valid: true, errors: [] } for valid args', () => {
      const result = validateArgs(schema, { q: 'hello' });
      assert.deepStrictEqual(result, { valid: true, errors: [] });
    });

    it('returns a friendly error for invalid args', () => {
      const result = validateArgs(schema, {});
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.errors.length, 1);
      assert.match(result.errors[0], /required property 'q'/);
    });

    it('reports a type mismatch', () => {
      const result = validateArgs(schema, { q: 42 });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors[0].length > 0);
    });

    it('fails OPEN (valid) when the schema is missing', () => {
      assert.deepStrictEqual(validateArgs(undefined, { anything: true }), {
        valid: true,
        errors: [],
      });
      assert.deepStrictEqual(validateArgs(null, {}), { valid: true, errors: [] });
    });

    it('fails OPEN (valid) when the schema is not an object', () => {
      assert.deepStrictEqual(validateArgs('not-a-schema', {}), { valid: true, errors: [] });
    });

    it('fails OPEN (valid) when the schema cannot be compiled', () => {
      // An invalid JSON Schema (bad `type`) makes ajv throw at compile time; the
      // client must not block the call — the server stays authoritative.
      const bad = { type: 'not-a-real-type' };
      assert.deepStrictEqual(validateArgs(bad, { q: 'x' }), { valid: true, errors: [] });
    });

    it('validates against an empty {} args object when args is omitted', () => {
      const result = validateArgs(schema, undefined);
      assert.strictEqual(result.valid, false);
      assert.match(result.errors[0], /required property 'q'/);
    });
  });
});
