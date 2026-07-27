import React from 'react';
import { normalizeRichTextHtml } from '../utils/richText';

const RichTextContent: React.FC<{ value?: unknown; className?: string }> = ({ value, className = '' }) => {
  const html = normalizeRichTextHtml(value);
  if (!html) return null;
  return <div className={`rich-text-content ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
};

export default RichTextContent;
