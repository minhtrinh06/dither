import type { ModerationStatus } from './store/types';

/**
 * Moderation integration point.
 *
 * The contract: every image headed for the public gallery passes through
 * `screenImage` first, and anything that is not 'approved' never renders
 * publicly (the stores also filter on moderation_status).
 *
 * Production options, in rough order of effort — see README "Moderation":
 *  1. Sightengine / Hive / AWS Rekognition called from a server (Supabase
 *     Edge Function) on upload; flips moderation_status pending → approved.
 *  2. Client-side pre-filter with nsfwjs to reject obvious cases before
 *     upload (advisory only — never the sole gate).
 *  3. Manual approval queue: rows stay 'pending' until a human approves.
 *
 * This local build has no server, so the mock approves after a short
 * simulated screening delay. Replace the body, keep the signature.
 */
export async function screenImage(blob: Blob): Promise<ModerationStatus> {
  void blob; // the mock ignores it; real implementations send it to a moderation API
  await new Promise((r) => setTimeout(r, 400));
  return 'approved';
}
