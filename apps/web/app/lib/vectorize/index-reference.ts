import { chunkText } from './chunk-text';
import { embedTexts } from './embed-text';

/**
 * Index a skill reference in Vectorize (titles + first paragraph only).
 * Returns number of vectors upserted.
 */
export async function indexReference(
  vectorize: VectorizeIndex,
  ai: Ai,
  ref: {
    skill_id: string;
    filename: string;
    content: string;
    category: string;
    is_paid: boolean;
    avg_rating: number;
  }
): Promise<number> {
  // Index title + first paragraph only (~80% search value, ~20% vector cost)
  const firstParagraph = ref.content.split('\n\n').slice(0, 2).join('\n\n');
  const fullText = `${ref.filename}\n\n${firstParagraph}`;
  const chunks = chunkText(fullText, 512, 0.1);
  const embeddings = await embedTexts(ai, chunks.map(c => c.text));

  const safeName = ref.filename.replace(/\.md$/, '').replace(/[^a-z0-9_-]/gi, '_');

  const vectors = embeddings.map((emb, idx) => ({
    id: `ref_${ref.skill_id}_${safeName}_chunk_${chunks[idx].index}`,
    values: emb,
    metadata: {
      skill_id: ref.skill_id,
      category: ref.category,
      is_paid: ref.is_paid ? 1 : 0,
      avg_rating: ref.avg_rating,
      chunk_index: chunks[idx].index,
      type: 'reference',
      ref_filename: ref.filename,
    } satisfies Record<string, string | number>,
  }));

  for (let i = 0; i < vectors.length; i += 1000) {
    await vectorize.upsert(vectors.slice(i, i + 1000));
  }
  return vectors.length;
}
