import React from 'react';

type AiSparkleIconProps = React.SVGProps<SVGSVGElement>;

const AiSparkleIcon: React.FC<AiSparkleIconProps> = ({ className, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    width="1em"
    height="1em"
    preserveAspectRatio="xMidYMid meet"
    className={className}
    {...props}
  >
    <path
      d="M12 2.75l1.43 4.34a4.7 4.7 0 0 0 2.98 2.98L20.75 11.5l-4.34 1.43a4.7 4.7 0 0 0-2.98 2.98L12 20.25l-1.43-4.34a4.7 4.7 0 0 0-2.98-2.98L3.25 11.5l4.34-1.43a4.7 4.7 0 0 0 2.98-2.98L12 2.75Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <path
      d="M19 2.75l.52 1.55c.14.43.48.77.91.91L22 5.75l-1.57.54c-.43.14-.77.48-.91.91L19 8.75l-.52-1.55a1.45 1.45 0 0 0-.91-.91L16 5.75l1.57-.54c.43-.14.77-.48.91-.91L19 2.75ZM5.5 16l.45 1.34c.12.37.42.67.79.79l1.34.45-1.34.45c-.37.12-.67.42-.79.79L5.5 21.15l-.45-1.34a1.26 1.26 0 0 0-.79-.79l-1.34-.45 1.34-.45c.37-.12.67-.42.79-.79L5.5 16Z"
      fill="currentColor"
    />
  </svg>
);

export default AiSparkleIcon;
