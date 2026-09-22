/**
 * Generate embeddings for text using Workers AI.
 *
 * @param ai - Cloudflare AI binding
 * @param texts - Array of text strings to embed
 * @returns Array of embedding vectors (each vector is an array of numbers)
 */
export async function embedTexts(ai: Ai, texts: string[]): Promise<number[][]> {
  const result = await ai.run('@cf/baai/bge-base-en-v1.5', { text: texts });

  // Handle async response (shouldn't happen in practice, but type-safe)
  if ('request_id' in result) {
    throw new Error('Async embedding not supported');
  }

  const data = 'data' in result ? result.data : undefined;

  if (!Array.isArray(data)) {
    throw new Error('Failed to generate embeddings: No data returned from AI model');
  }

  return data;
}
