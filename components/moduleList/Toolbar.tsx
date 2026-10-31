import React from 'react';
import { Button, Tooltip } from 'antd';
import { AppstoreOutlined, CalendarOutlined, ColumnWidthOutlined, EnvironmentOutlined, GroupOutlined, TableOutlined } from '@ant-design/icons';
import { ViewMode } from '../../types';
import AdaptiveSelectField from '../AdaptiveSelectField';

interface ToolbarProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  kanbanEnabled?: boolean;
  calendarEnabled?: boolean;
  mapEnabled?: boolean;
  kanbanGroupBy: string | null;
  kanbanGroupOptions: { label: string; value: string }[];
  onKanbanGroupChange: (value: string) => void;
  calendarDateField: string | null;
  calendarDateFieldOptions: { label: string; value: string }[];
  onCalendarDateFieldChange: (value: string) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ viewMode, setViewMode, kanbanEnabled, calendarEnabled, mapEnabled,
  kanbanGroupBy, kanbanGroupOptions, onKanbanGroupChange, calendarDateField, calendarDateFieldOptions, onCalendarDateFieldChange }) => {
  const options = [
    { label: 'جدول', value: ViewMode.LIST, icon: <TableOutlined /> },
    { label: 'گرید', value: ViewMode.GRID, icon: <AppstoreOutlined /> },
    ...(kanbanEnabled ? [{ label: 'کانبان', value: ViewMode.KANBAN, icon: <ColumnWidthOutlined /> }] : []),
    ...(calendarEnabled ? [{ label: 'تقویم', value: ViewMode.CALENDAR, icon: <CalendarOutlined /> }] : []),
    ...(mapEnabled ? [{ label: 'نقشه', value: ViewMode.MAP, icon: <EnvironmentOutlined /> }] : []),
  ];
  const group = viewMode === ViewMode.KANBAN && kanbanEnabled
    ? { label: 'گروه‌بندی کانبان', value: kanbanGroupBy, options: kanbanGroupOptions, onChange: onKanbanGroupChange }
    : viewMode === ViewMode.CALENDAR && calendarEnabled
      ? { label: 'فیلد تاریخ تقویم', value: calendarDateField, options: calendarDateFieldOptions, onChange: onCalendarDateFieldChange }
      : null;
  return (
    <div className="module-list-toolbar">
      {group ? <div className="module-list-group-selector">
        <AdaptiveSelectField value={group.value || group.options[0]?.value} options={group.options}
          onChange={group.onChange} pickerTitle={group.label} aria-label={group.label}
          renderTriggerValue={(selected) => <span className="module-list-group-value"><GroupOutlined /><span>{selected[0]?.label}</span></span>}
          showSearch={group.options.length > 6} allowClear={false} />
      </div> : null}
      <div className="module-list-view-buttons" role="group" aria-label="حالت‌های نمایش">
        {options.map((option) => <Tooltip key={option.value} title={`نمای ${option.label}`}>
          <Button type="text" icon={option.icon} aria-label={`نمای ${option.label}`}
            aria-pressed={viewMode === option.value} data-active={viewMode === option.value}
            className="module-list-icon-button" onClick={() => setViewMode(option.value)} />
        </Tooltip>)}
      </div>
    </div>
  );
};
export default Toolbar;
