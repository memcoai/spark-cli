import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTS, SPARK_ORG_ID, getVariant } from '../src/constants.js';
import { detectVariant } from '../src/variant.js';

describe('getVariant', () => {
  it('returns public variant when user is null', () => {
    assert.strictEqual(getVariant(null), VARIANTS.public);
  });

  it('returns public variant when user is undefined', () => {
    assert.strictEqual(getVariant(undefined), VARIANTS.public);
  });

  it('returns public variant when user has no organization_id', () => {
    assert.strictEqual(getVariant({ email: 'test@example.com' }), VARIANTS.public);
  });

  it('returns public variant when user belongs to Spark org', () => {
    assert.strictEqual(getVariant({ organization_id: SPARK_ORG_ID }), VARIANTS.public);
  });

  it('returns teams variant when user belongs to a different org', () => {
    assert.strictEqual(
      getVariant({ organization_id: 'a904dd51-9fe7-4047-83fd-272fb4c6c65e' }),
      VARIANTS.teams,
    );
  });
});

describe('detectVariant', () => {
  it('returns public variant when user belongs to Spark org', async () => {
    const result = await detectVariant({
      getUser: mock.fn(async () => ({ user: { organization_id: SPARK_ORG_ID } })),
    });
    assert.strictEqual(result, VARIANTS.public);
  });

  it('returns teams variant when user belongs to a different org', async () => {
    const result = await detectVariant({
      getUser: mock.fn(async () => ({
        user: { organization_id: 'a904dd51-9fe7-4047-83fd-272fb4c6c65e' },
      })),
    });
    assert.strictEqual(result, VARIANTS.teams);
  });

  it('returns public variant when getUser throws (unauthenticated)', async () => {
    const result = await detectVariant({
      getUser: mock.fn(async () => {
        throw new Error('401 Unauthorized');
      }),
    });
    assert.strictEqual(result, VARIANTS.public);
  });

  it('handles response without user wrapper', async () => {
    const result = await detectVariant({
      getUser: mock.fn(async () => ({
        organization_id: 'a904dd51-9fe7-4047-83fd-272fb4c6c65e',
      })),
    });
    assert.strictEqual(result, VARIANTS.teams);
  });
});
