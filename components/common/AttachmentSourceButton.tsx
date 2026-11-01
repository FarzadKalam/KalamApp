import React, { useRef, useState } from 'react';
import { Button, Popover } from 'antd';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import { FolderOpenOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons';

const AttachmentSourceButton: React.FC<{ onFilesSelected: (files: File[]) => void; onChooseExisting: () => void; active?: boolean; className?: string; round?: boolean }> = ({ onFilesSelected, onChooseExisting, active, className, round }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  return <>
    <input ref={inputRef} type="file" multiple hidden aria-label="انتخاب فایل از دستگاه" onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ''; onFilesSelected(files); }} />
    <Popover open={open} onOpenChange={setOpen} trigger="click" placement="topRight" getPopupContainer={resolveOverlayPopupContainer} content={<div className="flex min-w-44 flex-col gap-1" dir="rtl">
      <Button type="text" aria-label="آپلود از دستگاه" icon={<UploadOutlined />} onClick={() => { setOpen(false); inputRef.current?.click(); }}>آپلود از دستگاه</Button>
      <Button type="text" aria-label="انتخاب از نرم‌افزار" icon={<FolderOpenOutlined />} onClick={() => { setOpen(false); onChooseExisting(); }}>انتخاب از نرم‌افزار</Button>
    </div>}>
      <Button type={active ? 'primary' : 'text'} size="small" shape={round ? 'circle' : undefined} icon={<PaperClipOutlined />} aria-label="افزودن پیوست" title="افزودن پیوست" className={className} />
    </Popover>
  </>;
};
export default AttachmentSourceButton;
