/**
 * Cosine similarity implementation.
 *
 * Used during retrieval to compare the query embedding against stored chunk
 * embeddings. Lives in its own file so it can be tested independently.
 *
 * Cosine similarity measures the angle between two vectors:
 *   sim(A, B) = (A · B) / (|A| × |B|)
 *
 * Returns a value in [-1, 1] where:
 *   1.0  = identical direction (most similar)
 *   0.0  = orthogonal (unrelated)
 *  -1.0  = opposite direction (least similar)
 *
 * For well-behaved embedding models, scores for unrelated text typically
 * fall in the 0.0–0.4 range, while related text scores 0.6–1.0.
 * The exact distribution depends on the embedding model and corpus,
 * which is why RETRIEVAL_MIN_SCORE must be calibrated against the
 * evaluation set rather than taken as a universal constant.
 */

/**
 * Computes the cosine similarity between two equal-length vectors.
 *
 * @throws If vectors are not the same length or have zero magnitude.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Cannot compute cosine similarity: vector lengths differ (${a.length} vs ${b.length}). ` +
        `This likely means the query was embedded with a different model than the stored chunks. ` +
        `Re-run "npm run ingest" to rebuild the vector store.`
    );
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    // Zero-magnitude vectors can't be compared meaningfully
    return 0;
  }

  // Clamp to [-1, 1] to guard against floating-point rounding errors
  return Math.max(-1, Math.min(1, dotProduct / (magnitudeA * magnitudeB)));
}
