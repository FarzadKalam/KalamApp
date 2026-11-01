import React, { useEffect, useState } from 'react';
import type { NoteAttachment } from '../../utils/noteContent';
import { getMessageAttachmentPreviewUrl } from '../../utils/messageAttachmentPreview';
import FileExtensionTile from '../files/FileExtensionTile';

const MessageAttachmentImage: React.FC<{ attachment: NoteAttachment; expanded?: boolean; className?: string }> = ({ attachment, expanded = false, className }) => {
  const url = getMessageAttachmentPreviewUrl(attachment, expanded);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [url]);
  return url && failedUrl !== url ? (
    <img src={url} alt={attachment.name} loading="lazy" decoding="async" className={className} onError={() => setFailedUrl(url)} />
  ) : <div className="flex h-full min-h-12 w-full items-center justify-center"><FileExtensionTile fileName={attachment.name} url={attachment.url} mimeType={attachment.mimeType} compact={!expanded} /></div>;
};

export default MessageAttachmentImage;
