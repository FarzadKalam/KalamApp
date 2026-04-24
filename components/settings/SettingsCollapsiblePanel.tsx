import React, { useState } from 'react';
import { Button } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';

interface SettingsCollapsiblePanelProps {
  header: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  className?: string;
  bodyClassName?: string;
}

const SettingsCollapsiblePanel: React.FC<SettingsCollapsiblePanelProps> = ({
  header,
  extra,
  children,
  defaultExpanded = false,
  className = '',
  bodyClassName = '',
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={className}>
      <div
        className="flex cursor-pointer flex-wrap items-center justify-between gap-2"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="text"
            size="small"
            icon={expanded ? <DownOutlined /> : <RightOutlined />}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setExpanded((prev) => !prev);
            }}
          />
          <div className="min-w-0">{header}</div>
        </div>
        {extra ? (
          <div
            className="flex items-center gap-2"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {extra}
          </div>
        ) : null}
      </div>
      {expanded ? <div className={bodyClassName}>{children}</div> : null}
    </div>
  );
};

export default SettingsCollapsiblePanel;
