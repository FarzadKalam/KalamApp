import React from 'react';
import { Popover } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

interface HelpHintProps {
  title?: React.ReactNode;
  content: React.ReactNode;
  className?: string;
}

const HelpHint: React.FC<HelpHintProps> = ({
  title = 'راهنما',
  content,
  className = '',
}) => {
  return (
    <Popover
      trigger="hover"
      placement="bottomRight"
      title={<div className="text-xs font-semibold text-[rgba(var(--brand-800-rgb),1)]">{title}</div>}
      content={<div className="max-w-[320px]">{content}</div>}
      overlayStyle={{ zIndex: 10600 }}
    >
      <button
        type="button"
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border border-[rgba(var(--brand-200-rgb),0.8)] bg-white/90 text-[rgba(var(--brand-600-rgb),1)] shadow-sm transition hover:border-[rgba(var(--brand-400-rgb),0.9)] hover:bg-[rgba(var(--brand-50-rgb),0.9)] ${className}`}
        aria-label="راهنما"
      >
        <QuestionCircleOutlined className="text-[11px]" />
      </button>
    </Popover>
  );
};

export default HelpHint;
