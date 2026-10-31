import React from 'react';
import AiSparkleIcon from '../ai/AiSparkleIcon';

type ActionIconName = 'search' | 'ai' | 'refresh' | 'moon' | 'sun' | 'book' | 'message' | 'bell';
type Props = React.SVGProps<SVGSVGElement> & { name: ActionIconName };

/** Shared optical size and rounded stroke for workspace actions. */
const ActionIcon: React.FC<Props> = ({ name, ...props }) => {
  if (name === 'ai') return <AiSparkleIcon outline {...props} />;
  const shapes: Record<Exclude<ActionIconName, 'ai'>, React.ReactNode> = {
    search: <><circle cx="10.75" cy="10.75" r="6.75" /><path d="m16 16 4.5 4.5" /></>,
    refresh: <><path d="M20 10a8 8 0 1 0-1.6 7M20 4v6h-6" /></>,
    moon: <path d="M20.2 14.4A8.6 8.6 0 0 1 9.6 3.8a8.6 8.6 0 1 0 10.6 10.6Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2m0 15v2m9.5-9.5h-2m-15 0h-2m16.2-6.7-1.4 1.4M6.7 17.3l-1.4 1.4m13.4 0-1.4-1.4M6.7 6.7 5.3 5.3" /></>,
    book: <><path d="M12 6c-2.7-1.8-5.5-2-9-1v15c3.5-1 6.3-.8 9 1 2.7-1.8 5.5-2 9-1V5c-3.5-1-6.3-.8-9 1Zm0 0v15M6 9h3m-3 4h3m6-4h3m-3 4h3" /></>,
    message: <><path d="M20.5 11.5c0 4.7-3.8 8.5-8.5 8.5-1.5 0-2.9-.4-4.2-1L3.5 20l1-4.3a8.5 8.5 0 1 1 16-4.2Z" /><path d="M8 11.5h.01M12 11.5h.01m3.99 0h.01" strokeWidth="2.6" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9ZM10 21h4M12 2V1" /></>,
  };
  return <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{shapes[name]}</svg>;
};

export default ActionIcon;
