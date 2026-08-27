import React from 'react';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

export type WizardStepCardItem = {
  key: string;
  title: string;
};

type WizardStepCardsProps = {
  items: WizardStepCardItem[];
  currentIndex: number;
  onChange: (index: number, item: WizardStepCardItem) => void;
  canChange?: (index: number, item: WizardStepCardItem) => boolean;
  className?: string;
};

const WizardStepCards: React.FC<WizardStepCardsProps> = ({
  items,
  currentIndex,
  onChange,
  canChange,
  className = '',
}) => (
  <div
    className={`grid gap-1.5 md:gap-3 ${className}`}
    style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }}
  >
    {items.map((item, index) => {
      const active = currentIndex === index;
      const done = currentIndex > index;
      const enabled = canChange?.(index, item) !== false;
      return (
        <button
          key={item.key}
          type="button"
          onClick={() => { if (enabled) onChange(index, item); }}
          aria-current={active ? 'step' : undefined}
          aria-label={`مرحله ${toPersianNumber(index + 1)}: ${item.title}`}
          aria-disabled={!enabled}
          className={`min-w-0 rounded-xl border px-1.5 py-2 text-center transition-colors md:rounded-2xl md:px-4 md:py-4 md:text-right ${
            active
              ? 'border-leather-500 bg-leather-600 text-white'
              : done
                ? 'border-leather-300 bg-leather-50 text-leather-800 dark:border-leather-700 dark:bg-leather-900/30 dark:text-leather-200'
                : 'border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-[#1c1c1c] dark:text-gray-200'
          } ${enabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
        >
          <div className="hidden text-xs opacity-80 md:block">مرحله {toPersianNumber(index + 1)}</div>
          <div className="truncate text-[10px] font-black leading-4 sm:text-xs md:mt-1 md:text-base md:leading-normal">{item.title}</div>
          <div className="mx-auto mt-0.5 h-1 w-4 rounded-full bg-current opacity-40 md:hidden" />
        </button>
      );
    })}
  </div>
);

export default WizardStepCards;
