import React from 'react';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';

type EditorChromeToggleProps = {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
};

/** A shared, compact handle for temporarily freeing editor workspace. */
const EditorChromeToggle: React.FC<EditorChromeToggleProps> = ({
  collapsed,
  onToggle,
  className = '',
}) => (
  <Tooltip title={collapsed ? 'نمایش نوار ویرایش' : 'جمع‌کردن نوار ویرایش'}>
    <Button
      type="default"
      shape="circle"
      size="small"
      icon={collapsed ? <DownOutlined /> : <UpOutlined />}
      onClick={onToggle}
      aria-label={collapsed ? 'نمایش نوار ویرایش' : 'جمع‌کردن نوار ویرایش'}
      className={`pointer-events-auto shadow-md ${className}`.trim()}
    />
  </Tooltip>
);

export default EditorChromeToggle;
