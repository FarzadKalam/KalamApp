import { htmlToPlainText } from './htmlToPlainText';
import { normalizeKnowledgeVisibilityIds } from './knowledgeVisibility';

export type OrgKnowledgeDocumentLike = {
  id: string;
  title: string;
  body: string;
  body_html?: string | null;
  document_type?: string | null;
  status: 'active' | 'draft' | 'archived';
  use_for_ai?: boolean;
  metadata?: Record<string, any> | null;
  allowed_user_ids?: string[] | null;
  allowed_role_ids?: string[] | null;
};

const splitIntoChunks = (body: string) => {
  const paragraphs = String(body || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  const maxLength = 1200;

  paragraphs.forEach((paragraph) => {
    if (!current) {
      current = paragraph;
      return;
    }
    if (`${current}\n\n${paragraph}`.length <= maxLength) {
      current = `${current}\n\n${paragraph}`;
      return;
    }
    chunks.push(current);
    current = paragraph;
  });

  if (current) chunks.push(current);
  if (chunks.length === 0 && body.trim()) chunks.push(body.trim().slice(0, maxLength));
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxLength) return [chunk];
    const pieces: string[] = [];
    for (let index = 0; index < chunk.length; index += maxLength) {
      pieces.push(chunk.slice(index, index + maxLength));
    }
    return pieces;
  });
};

const hashText = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(index);
    hash &= 0xffffffff;
  }
  return Math.abs(hash).toString(16);
};

export const rebuildKnowledgeDocumentChunks = async (
  supabaseClient: any,
  doc: OrgKnowledgeDocumentLike,
) => {
  const { error: deleteError } = await supabaseClient
    .from('document_chunks')
    .delete()
    .eq('document_id', doc.id);
  if (deleteError) throw deleteError;

  if (doc.status !== 'active' || doc.use_for_ai === false) return;

  const plainBody = doc.body_html ? htmlToPlainText(doc.body_html) : (doc.body || '');
  const chunks = splitIntoChunks(plainBody);
  if (chunks.length === 0) return;

  const rows = chunks.map((content, index) => ({
    document_id: doc.id,
    chunk_index: index,
    content,
    content_hash: hashText(content),
    token_estimate: Math.ceil(content.length / 4),
    status: 'active',
    allowed_user_ids: normalizeKnowledgeVisibilityIds(doc.allowed_user_ids),
    allowed_role_ids: normalizeKnowledgeVisibilityIds(doc.allowed_role_ids),
    metadata: {
      document_title: doc.title,
      document_type: doc.document_type || 'general',
      system_key: doc?.metadata?.system_key || null,
    },
  }));

  const { error: insertError } = await supabaseClient.from('document_chunks').insert(rows);
  if (insertError) throw insertError;
};

export const embedKnowledgeDocumentChunks = async (
  supabaseClient: any,
  doc: OrgKnowledgeDocumentLike,
) => {
  const { data, error } = await supabaseClient.functions.invoke('ai-assistant', {
    body: { action: 'embed_document_chunks', documentId: doc.id },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error(String((data as any).error));
  return data;
};
