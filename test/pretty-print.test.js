import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prettyPrint } from '../src/pretty-print.js';

describe('prettyPrint', () => {
  it('formats simple string value', () => {
    const result = prettyPrint('hello world');
    assert.strictEqual(result, 'hello world');
  });

  it('formats number value', () => {
    const result = prettyPrint(42);
    assert.strictEqual(result, '42');
  });

  it('formats null value', () => {
    const result = prettyPrint(null);
    assert.ok(result.includes('none'));
  });

  it('formats simple object with string values', () => {
    const result = prettyPrint({ name: 'test', status: 'ok' });
    assert.ok(result.includes('Name:'));
    assert.ok(result.includes('test'));
    assert.ok(result.includes('Status:'));
    assert.ok(result.includes('ok'));
  });

  it('converts snake_case keys to Title Case labels', () => {
    const result = prettyPrint({ session_id: 'abc123' });
    assert.ok(result.includes('Session Id:'));
    assert.ok(result.includes('abc123'));
  });

  it('converts camelCase keys to Title Case labels', () => {
    const result = prettyPrint({ sessionId: 'abc123' });
    assert.ok(result.includes('Session Id:'));
  });

  it('formats boolean values', () => {
    const result = prettyPrint({ active: true, deleted: false });
    assert.ok(result.includes('yes'));
    assert.ok(result.includes('no'));
  });

  it('formats null values in objects', () => {
    const result = prettyPrint({ value: null });
    assert.ok(result.includes('none'));
  });

  it('formats empty arrays', () => {
    const result = prettyPrint({ items: [] });
    assert.ok(result.includes('(empty)'));
  });

  it('formats arrays of strings as bulleted list', () => {
    const result = prettyPrint({ tags: ['one', 'two', 'three'] });
    assert.ok(result.includes('•'));
    assert.ok(result.includes('one'));
    assert.ok(result.includes('two'));
    assert.ok(result.includes('three'));
  });

  it('formats arrays of objects with numbered items', () => {
    const result = prettyPrint({
      items: [{ name: 'first' }, { name: 'second' }],
    });
    assert.ok(result.includes('[1]'));
    assert.ok(result.includes('[2]'));
    assert.ok(result.includes('first'));
    assert.ok(result.includes('second'));
  });

  it('formats nested objects', () => {
    const result = prettyPrint({
      user: { name: 'alice', role: 'admin' },
    });
    assert.ok(result.includes('User:'));
    assert.ok(result.includes('Name:'));
    assert.ok(result.includes('alice'));
    assert.ok(result.includes('Role:'));
    assert.ok(result.includes('admin'));
  });

  it('renders multiline strings below the label', () => {
    const result = prettyPrint({ description: 'line one\nline two' });
    assert.ok(result.includes('Description:'));
    assert.ok(result.includes('line one'));
    assert.ok(result.includes('line two'));
  });

  it('renders markdown in string values', () => {
    const result = prettyPrint({ content: '**bold text**' });
    assert.ok(result.includes('\x1b[1m'));
    assert.ok(result.includes('bold text'));
    assert.ok(!result.includes('**'));
  });

  it('applies bold styling to labels', () => {
    const result = prettyPrint({ key: 'value' });
    assert.ok(result.includes('\x1b[1m'));
  });
});
