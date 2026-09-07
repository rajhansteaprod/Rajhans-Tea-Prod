import mongoose from 'mongoose';

/**
 * Phase 6.3A contract tests.
 *
 * These deliberately test the persisted structures/capability boundaries that
 * make product-content execution safe. The existing execution/preflight/
 * verification suites continue testing all legacy metadata behaviour.
 */

import {
  ContentProposedChange,
} from '../../../src/modules/seo/models/seo-change-draft.model';

import {
  ExecutionTargetType,
  ExecutedFieldSnapshot,
} from '../../../src/modules/seo/models/seo-change-execution.model';

import {
  VerificationExpected,
  VerificationObserved,
  VerificationMatches,
} from '../../../src/modules/seo/models/seo-change-verification.model';

describe('Phase 6.3A product-content contract', () => {
  it('represents Product.description with an exact stale/current snapshot', () => {
    const change: ContentProposedChange = {
      kind: 'content',
      targetUrl:
        'https://rajhanstea.com/product/rajhans-rajdoot-dooars/',
      field: {
        name: 'description',
        current: 'Old product description',
        proposed: 'Expanded factual product description',
      },
      blocks: [],
    };

    expect(change.kind).toBe('content');
    expect(change.field?.name).toBe('description');
    expect(change.field?.current).toBe(
      'Old product description',
    );
    expect(change.field?.proposed).toBe(
      'Expanded factual product description',
    );
  });

  it('keeps historical outline-only content drafts representable', () => {
    const historical: ContentProposedChange = {
      kind: 'content',
      targetUrl:
        'https://rajhanstea.com/product/rajhans-royal-darjeeling/',
      blocks: [
        {
          heading: 'Overview',
          body: '',
        },
      ],
    };

    expect(historical.field).toBeUndefined();
  });

  it('allows product as a forensic execution target type', () => {
    const targetType: ExecutionTargetType = 'product';
    expect(targetType).toBe('product');
  });

  it('stores description in before/proposed/after execution snapshots', () => {
    const before: ExecutedFieldSnapshot = {
      description: 'Before',
    };

    const proposed: ExecutedFieldSnapshot = {
      description: 'Proposed',
    };

    const after: ExecutedFieldSnapshot = {
      description: 'Proposed',
    };

    expect(before.description).toBe('Before');
    expect(proposed.description).toBe('Proposed');
    expect(after.description).toBe('Proposed');
  });

  it('supports description verification evidence', () => {
    const expected: VerificationExpected = {
      description: 'Expected product copy',
    };

    const observed: VerificationObserved = {
      description: 'Expected product copy',
    };

    const matches: VerificationMatches = {
      description: true,
    };

    expect(expected.description).toBe(
      observed.description,
    );
    expect(matches.description).toBe(true);
  });

  it('preserves ObjectId compatibility for product target identities', () => {
    const id = new mongoose.Types.ObjectId();
    expect(mongoose.isValidObjectId(id)).toBe(true);
  });
});
