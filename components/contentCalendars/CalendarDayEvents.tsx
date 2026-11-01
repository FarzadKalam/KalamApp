import { useId, useState, type ReactNode } from 'react';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

export default function CalendarDayEvents<T>({ items, renderItem, limit = 3, className = 'space-y-1' }: {
  items: T[]; renderItem: (item: T) => ReactNode; limit?: number; className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <div className={className}>
    <div id={id} className={className}>{(expanded ? items : items.slice(0, limit)).map(renderItem)}</div>
    {items.length > limit ? <button type="button" aria-expanded={expanded} aria-controls={id}
      className="min-h-8 w-full rounded-lg px-1 py-1 text-start text-[11px] font-bold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300 dark:hover:bg-blue-950/40"
      onClick={(event) => { event.stopPropagation(); setExpanded((value) => !value); }}>
      {expanded ? 'نمایش کمتر' : `+${toPersianNumber(items.length - limit)} مورد دیگر`}
    </button> : null}
  </div>;
}
