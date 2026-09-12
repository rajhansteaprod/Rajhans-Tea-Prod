import mongoose from 'mongoose';
import { config } from '../src/config';
import {
  beginPublicationRedeploy,
  claimNextPendingPublication,
  getPublicationById,
  markPublicationFailed,
  markPublicationPublished,
  recordPublicationVerification,
  retryFailedPublication,
} from '../src/modules/seo/services/change-publication.service';
import {
  verifyExecution,
} from '../src/modules/seo/services/change-verification.service';
import { getExecutionById } from '../src/modules/seo/services/change-execution.service';

function value(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

function out(payload: unknown): void {
  // One-line JSON intentionally: host shell safely reads the final line even
  // when dotenv/config emits informational lines before it.
  console.log(JSON.stringify(payload));
}

/**
 * Shared by `claim` and `redeploy-begin`: the shell pipeline needs to know
 * an execution's targetType (to decide whether a prerender-manifest refresh
 * applies at all) and, for blog_create, the exact slug the regenerated
 * manifest must contain — before it spends time on a build that would only
 * repeat a stale-manifest mismatch.
 */
async function deriveTargetTypeAndExpectedBlogSlug(executionId: string): Promise<{ targetType: string; expectedBlogSlug: string | null }> {
  const execution = await getExecutionById(executionId);
  if (!execution) {
    throw new Error(`Execution ${executionId} not found immediately after an eligibility check that required it to exist`);
  }
  const blogCreateTarget = execution.targetType === 'blog_create' ? execution.targets[0] : null;
  return {
    targetType: execution.targetType,
    expectedBlogSlug: blogCreateTarget ? blogCreateTarget.proposed.slug ?? null : null,
  };
}

async function main(): Promise<void> {
  const action = process.argv[2];
  await mongoose.connect(config.mongo.uri);

  if (action === 'claim') {
    const publication = await claimNextPendingPublication();

    if (!publication) {
      out({ ok: true, publication: null });
      return;
    }

    const { targetType, expectedBlogSlug } = await deriveTargetTypeAndExpectedBlogSlug(String(publication.executionId));

    out({
      ok: true,
      publication: {
        id: String(publication._id),
        executionId: String(publication.executionId),
        requestedByUserId: String(publication.requestedByUserId),
        attemptCount: publication.attemptCount,
      },
      targetType,
      // For a blog_create publication, the shell pipeline must refresh and
      // validate the prerender manifest contains exactly this slug before
      // building the frontend (see ops/lib/prerender-manifest-refresh.sh).
      expectedBlogSlug,
    });
    return;
  }

  if (action === 'published') {
    const publicationId = value('--id');
    const image = value('--image');
    const sourceRef = value('--source-ref');

    if (!publicationId || !image || !sourceRef) {
      throw new Error(
        'published requires --id, --image and --source-ref',
      );
    }

    const result = await markPublicationPublished({
      publicationId,
      frontendImage: image,
      frontendSourceRef: sourceRef,
    });

    out(result);
    if (!result.ok) process.exitCode = 2;
    return;
  }

  if (action === 'failed') {
    const publicationId = value('--id');
    const message = value('--message');

    if (!publicationId || !message) {
      throw new Error('failed requires --id and --message');
    }

    const result = await markPublicationFailed({
      publicationId,
      errorMessage: message,
    });

    out(result);
    if (!result.ok) process.exitCode = 2;
    return;
  }

  if (action === 'retry') {
    const publicationId = process.argv[3];
    if (!publicationId) throw new Error('retry requires <publicationId>');

    const result = await retryFailedPublication(publicationId);

    out(result);
    if (!result.ok) process.exitCode = 2;
    return;
  }

  if (action === 'redeploy-begin') {
    const publicationId = value('--id');
    const sourceRevision = value('--source-revision');
    if (!publicationId || !sourceRevision) {
      throw new Error('redeploy-begin requires --id and --source-revision');
    }

    const result = await beginPublicationRedeploy({ publicationId, sourceRevision });

    if (!result.ok) {
      out({ ok: false, error: result.error, message: result.message });
      process.exitCode = 2;
      return;
    }

    const { targetType, expectedBlogSlug } = await deriveTargetTypeAndExpectedBlogSlug(String(result.publication.executionId));

    out({
      ok: true,
      publication: {
        id: String(result.publication._id),
        executionId: String(result.publication.executionId),
        redeployAttemptCount: result.publication.redeployAttemptCount,
      },
      executionId: String(result.publication.executionId),
      targetType,
      expectedBlogSlug,
    });
    return;
  }

  if (action === 'verify') {
    const publicationId = value('--id');
    if (!publicationId) throw new Error('verify requires --id');

    const publication = await getPublicationById(publicationId);
    if (!publication) throw new Error('Publication not found');

    if (publication.status !== 'published') {
      throw new Error(
        `Publication status is "${publication.status}", expected published`,
      );
    }

    const result = await verifyExecution({
      executionId: String(publication.executionId),
      verifierUserId: String(publication.requestedByUserId),
    });

    if (!result.ok) {
      await recordPublicationVerification({
        publicationId,
        verificationId: null,
        verificationStatus: `error:${result.error}`,
      });

      out({
        ok: false,
        error: result.error,
        message: result.message,
      });

      process.exitCode = 2;
      return;
    }

    await recordPublicationVerification({
      publicationId,
      verificationId: String(result.verification._id),
      verificationStatus: result.verification.status,
    });

    out({
      ok: true,
      verification: {
        id: String(result.verification._id),
        status: result.verification.status,
        executionId: String(result.verification.executionId),
        targets: result.verification.targets.map((target) => ({
          targetUrl: target.targetUrl,
          status: target.status,
          expected: target.expected,
          observed: target.observed,
          mismatchFields: target.mismatchFields,
        })),
      },
    });
    return;
  }

  throw new Error(
    'Usage: seo-publication-worker.ts claim|published|failed|retry|redeploy-begin|verify',
  );
}

main()
  .catch((err: unknown) => {
    console.error(
      err instanceof Error ? err.message : String(err),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {}
  });
