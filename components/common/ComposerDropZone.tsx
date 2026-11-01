import React, { useRef, useState } from 'react';
import { UploadOutlined } from '@ant-design/icons';

const ComposerDropZone: React.FC<React.PropsWithChildren<{ disabled?: boolean; onFiles: (files: File[]) => void; className?: string }>> = ({ disabled, onFiles, className, children }) => {
  const depth = useRef(0);
  const [active, setActive] = useState(false);
  const hasFiles = (event: React.DragEvent) => !disabled && Array.from(event.dataTransfer.types || []).includes('Files');
  const reset = () => { depth.current = 0; setActive(false); };
  return <div className={`relative ${className || ''}`} onDragEnter={(event) => {
    if (!hasFiles(event)) return;
    event.preventDefault(); depth.current += 1; setActive(true);
  }} onDragOver={(event) => {
    if (!hasFiles(event)) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setActive(true);
  }} onDragLeave={(event) => {
    if (!hasFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1); if (!depth.current) setActive(false);
  }} onDrop={(event) => {
    if (!hasFiles(event)) return;
    event.preventDefault(); event.stopPropagation(); reset(); onFiles(Array.from(event.dataTransfer.files || []));
  }}>
    {children}
    <div aria-live="polite" className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-xl border border-dashed border-[rgb(var(--brand-500-rgb))] bg-[rgba(var(--brand-50-rgb),0.96)] text-sm font-semibold text-[rgb(var(--brand-700-rgb))] transition duration-150 motion-reduce:transition-none dark:bg-slate-900/95 dark:text-slate-100 ${active ? 'scale-100 opacity-100' : 'scale-[0.98] opacity-0'}`}>
      {active ? <><UploadOutlined />فایل‌ها را اینجا رها کنید</> : null}
    </div>
  </div>;
};
export default ComposerDropZone;
