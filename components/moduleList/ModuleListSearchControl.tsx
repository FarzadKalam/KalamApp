import React from 'react';
import { Button, Input, Tooltip } from 'antd';
import type { InputRef } from 'antd';
import { ArrowUpOutlined, CloseOutlined } from '@ant-design/icons';
import ActionIcon from '../common/ActionIcon';

type Mode = 'search' | 'ai';
type Props = {
  moduleTitle: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onAiSubmit?: (question: string) => void;
  children: React.ReactNode;
};

const ModuleListSearchControl: React.FC<Props> = ({ moduleTitle, searchTerm, onSearchChange, onAiSubmit, children }) => {
  const [mode, setMode] = React.useState<Mode | null>(null);
  const [aiQuery, setAiQuery] = React.useState('');
  const [origin, setOrigin] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<InputRef>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const placeholder = mode === 'ai'
    ? `راجع به ${moduleTitle} با هوش مصنوعی حرف بزنید...`
    : `جستجو در ${moduleTitle}...`;
  React.useEffect(() => {
    if (mode) inputRef.current?.focus({ cursor: 'end', preventScroll: true });
  }, [mode]);
  const show = (next: Mode, event: React.MouseEvent<HTMLElement>) => {
    const rootRect = rootRef.current?.getBoundingClientRect();
    const triggerRect = event.currentTarget.getBoundingClientRect();
    setOrigin(triggerRect.left - (rootRect?.left || 0) + triggerRect.width / 2);
    triggerRef.current = event.currentTarget;
    setMode(next);
  };
  const close = () => {
    setMode(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const submit = () => {
    if (mode === 'ai' && aiQuery.trim()) onAiSubmit?.(aiQuery.trim());
  };
  return (
    <div ref={rootRef} className="module-list-search-slot" data-open={!!mode}
      style={{ '--search-origin': `${origin}px` } as React.CSSProperties}>
      <div className="module-list-search-heading" aria-hidden={!!mode}>
        {children}
        <div className="module-list-search-launchers">
          <Tooltip title={`جستجو در ${moduleTitle}`}>
            <Button type="text" icon={<ActionIcon name="search" />} onClick={(event) => show('search', event)}
              className="module-list-icon-button" data-active={!!searchTerm} tabIndex={mode ? -1 : 0}
              aria-label={`جستجو در ${moduleTitle}`} aria-expanded={mode === 'search'} />
          </Tooltip>
          {onAiSubmit ? <Tooltip title={`گفتگو با هوش مصنوعی درباره ${moduleTitle}`}>
            <Button type="text" icon={<ActionIcon name="ai" />} onClick={(event) => show('ai', event)} className="module-list-icon-button"
              tabIndex={mode ? -1 : 0} aria-label={`گفتگو با هوش مصنوعی درباره ${moduleTitle}`} aria-expanded={mode === 'ai'} />
          </Tooltip> : null}
        </div>
      </div>
      <div className="module-list-search-reveal" aria-hidden={!mode}>
        {mode ? <>
          <span className="module-list-search-mode" aria-hidden="true"><ActionIcon name={mode === 'ai' ? 'ai' : 'search'} /></span>
          <Input ref={inputRef} variant="borderless" value={mode === 'ai' ? aiQuery : searchTerm}
            placeholder={placeholder} aria-label={placeholder} allowClear
            onChange={(event) => mode === 'ai' ? setAiQuery(event.target.value) : onSearchChange(event.target.value)}
            onPressEnter={(event) => { if (!event.nativeEvent.isComposing) submit(); }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
                event.preventDefault(); event.stopPropagation(); close();
              }
            }} />
          {mode === 'ai' ? <Button type="text" icon={<ArrowUpOutlined />} onClick={submit}
            disabled={!aiQuery.trim()} aria-label="ارسال پرسش به هوش مصنوعی" className="module-list-icon-button" /> : null}
          <Button type="text" icon={<CloseOutlined />} onClick={close}
            aria-label="بستن جستجو" className="module-list-icon-button" />
        </> : null}
      </div>
    </div>
  );
};
export default ModuleListSearchControl;
