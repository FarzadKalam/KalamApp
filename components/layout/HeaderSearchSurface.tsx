import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button } from 'antd';
import type { InputRef } from 'antd';
import ActionIcon from '../common/ActionIcon';
import './HeaderSearchSurface.css';

interface HeaderSearchSurfaceProps {
  isMobile: boolean;
  resetKey: string;
  inputRef: React.RefObject<InputRef>;
  containerRef: React.RefObject<HTMLDivElement>;
  onDismiss: () => void;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

/** One search field: inline on desktop, a header-sized surface on phones. */
const HeaderSearchSurface: React.FC<HeaderSearchSurfaceProps> = ({
  isMobile, resetKey, inputRef, containerRef, onDismiss, onOpenChange, children,
}) => {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const expanded = isMobile && open;

  const dismiss = useCallback((restoreFocus = true) => {
    flushSync(() => {
      setOpen(false);
      onDismiss();
    });
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, [onDismiss]);

  useLayoutEffect(() => {
    if (panelRef.current) panelRef.current.inert = isMobile && !open;
    onOpenChange(expanded);
  }, [expanded, isMobile, onOpenChange, open]);

  useEffect(() => { setOpen(false); }, [isMobile, resetKey]);
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) dismiss(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      dismiss();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [containerRef, dismiss, expanded]);

  return (
    <div
      ref={containerRef}
      className={`app-header-search${isMobile ? ' app-header-search--mobile' : ''}`}
      data-open={expanded}
      onBlur={(event) => {
        if (expanded && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) dismiss(false);
      }}
    >
      {isMobile && (
        <Button
          ref={triggerRef}
          className="app-header-search-trigger"
          icon={<ActionIcon name="search" />}
          aria-label="باز کردن جستجو"
          title="جستجو در همه بخش‌ها"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => {
            // Keep focus inside the tap event so iOS opens the software keyboard.
            flushSync(() => setOpen(true));
            inputRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
      <div
        ref={panelRef}
        id={panelId}
        role="search"
        aria-label="جستجوی سراسری"
        aria-hidden={isMobile && !open ? true : undefined}
        className="app-header-search-panel"
      >
        {isMobile && (
          <Button
            className="app-header-search-close"
            type="text"
            icon={<ActionIcon name="close" />}
            aria-label="بستن جستجو"
            title="بستن جستجو"
            onClick={() => dismiss()}
          />
        )}
        {children}
      </div>
    </div>
  );
};

export default HeaderSearchSurface;
