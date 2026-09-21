/**
 * Embedding provider interface.
 *
 * The retrieval system depends only on this interface, not on any
 * specific provider's SDK. To switch from Gemini to another provider,
 * implement this interface in a new file and update the import in
 * the ingestion script.
 */
export interface EmbeddingProvider {
  /**
   * Embed a single text string.
   * @returns Dense embedding vector as an array of numbers.
   */
  embed(text: string): Promise<number[]>;

  /**
   * Embed multiple texts in a single (or batched) call.
   * Implementations should batch requests where the underlying API supports it.
   * @returns Array of embedding vectors, one per input text, in the same order.
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * The canonical model identifier for this provider.
   * Stored in the vector store metadata for traceability.
   */
  readonly modelId: string;

  /**
   * The output dimensionality of the embeddings this provider produces.
   * Stored in the vector store metadata so dimension mismatches can be detected.
   */
  readonly dimensions: number;
}
