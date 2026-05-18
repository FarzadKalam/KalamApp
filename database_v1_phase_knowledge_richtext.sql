-- Phase: Knowledge Rich Text Editor
-- افزودن فیلدهای ویرایشگر غنی و کنترل استفاده هوش مصنوعی به جدول org_documents

ALTER TABLE org_documents
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS use_for_ai boolean NOT NULL DEFAULT true;

-- توضیح: DEFAULT true برای backward compatibility
-- اسناد قدیمی با status='active' همچنان برای هوش مصنوعی در دسترس هستند

COMMENT ON COLUMN org_documents.body_html IS 'HTML content from TipTap rich editor. body column remains plain text for AI chunking.';
COMMENT ON COLUMN org_documents.use_for_ai IS 'If true and status=active, document is included in AI context chunks.';

CREATE INDEX IF NOT EXISTS idx_org_documents_use_for_ai
  ON org_documents (org_id, use_for_ai)
  WHERE use_for_ai = true AND status = 'active';
