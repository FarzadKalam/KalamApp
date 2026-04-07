import React from "react";
import { Input, Segmented } from "antd";
import {
  AppstoreOutlined,
  CalendarOutlined,
  ColumnWidthOutlined,
  EnvironmentOutlined,
  TableOutlined,
} from "@ant-design/icons";
import { ViewMode } from "../../types";

interface ToolbarProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
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

const Toolbar: React.FC<ToolbarProps> = ({
  viewMode,
  setViewMode,
  searchTerm,
  onSearchChange,
  onRefresh: _onRefresh,
  kanbanEnabled = false,
  calendarEnabled = false,
  mapEnabled = false,
  kanbanGroupBy,
  kanbanGroupOptions,
  onKanbanGroupChange,
  calendarDateField,
  calendarDateFieldOptions,
  onCalendarDateFieldChange,
}) => {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2 flex-1">
        <Input.Search
          placeholder="جستجو..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="max-w-md"
          allowClear
        />
      </div>

      <div className="flex w-full md:w-auto flex-col md:flex-row md:items-center gap-2">
        <div className="flex items-center gap-2">
          <Segmented
            options={[
              { label: "جدول", value: ViewMode.LIST, icon: <TableOutlined /> },
              { label: "گرید", value: ViewMode.GRID, icon: <AppstoreOutlined /> },
              ...(mapEnabled ? [{ label: "نقشه", value: ViewMode.MAP, icon: <EnvironmentOutlined /> }] : []),
              ...(calendarEnabled ? [{ label: "تقویم", value: ViewMode.CALENDAR, icon: <CalendarOutlined /> }] : []),
              ...(kanbanEnabled ? [{ label: "کانبان", value: ViewMode.KANBAN, icon: <ColumnWidthOutlined /> }] : []),
            ]}
            value={viewMode}
            onChange={(val) => setViewMode(val as ViewMode)}
          />
        </div>

        {viewMode === ViewMode.KANBAN && kanbanEnabled && (
          <div className="max-w-full overflow-x-auto no-scrollbar">
            <Segmented
              className="min-w-max"
              options={kanbanGroupOptions}
              value={kanbanGroupBy || kanbanGroupOptions?.[0]?.value}
              onChange={(val) => onKanbanGroupChange(val as string)}
            />
          </div>
        )}

        {viewMode === ViewMode.CALENDAR && calendarEnabled && (
          <div className="max-w-full overflow-x-auto no-scrollbar">
            <Segmented
              className="min-w-max"
              options={calendarDateFieldOptions}
              value={calendarDateField || calendarDateFieldOptions?.[0]?.value}
              onChange={(val) => onCalendarDateFieldChange(val as string)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Toolbar;
