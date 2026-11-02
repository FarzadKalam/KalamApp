import React from 'react';
import { TAZE_SYSTEM_BRAND_ASSETS } from '../../utils/tazeSystemBrandAssets';

type Props = {
  variant?: 'sidebar' | 'account';
  collapsed?: boolean;
};

// Product attribution is shared by all organizations, independent of tenant identity.
const TazeSystemAttribution: React.FC<Props> = ({ variant = 'sidebar', collapsed = false }) => {
  const account = variant === 'account';
  const iconOnly = !account && collapsed;
  return (
    <a
      href="https://tazesystem.ir"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="تازه سیستم، نرم‌افزار یکپارچه سازمانی — باز شدن در برگهٔ جدید"
      title={iconOnly ? 'با فناوری تازه سیستم' : undefined}
      className={`inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg text-gray-500 transition-colors hover:text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current dark:text-gray-400 dark:hover:text-gray-200 ${iconOnly ? 'w-11 justify-center' : 'px-1'}`}
    >
      <img
        src={TAZE_SYSTEM_BRAND_ASSETS.logo}
        alt=""
        aria-hidden="true"
        width={account ? 32 : 24}
        height={account ? 32 : 24}
        className="shrink-0 object-contain"
        draggable={false}
      />
      {!iconOnly && (account ? (
        <span className="min-w-0 text-right">
          <span className="block text-sm font-semibold leading-5 text-gray-700 dark:text-gray-200">تازه سیستم</span>
          <span className="block text-xs leading-5">نرم‌افزار یکپارچه سازمانی</span>
        </span>
      ) : (
        <span className="whitespace-nowrap text-xs leading-5">
          با فناوری <span className="font-semibold">تازه سیستم</span>
        </span>
      ))}
    </a>
  );
};

export default TazeSystemAttribution;
