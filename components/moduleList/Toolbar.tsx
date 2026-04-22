import React from "react";
import { Button, Input, Segmented } from "antd";
import {
  AppstoreOutlined,
  CalendarOutlined,
  ColumnWidthOutlined,
  EnvironmentOutlined,
  TableOutlined,
} from "@ant-design/icons";
import { ViewMode } from "../../types";

type ToolbarRenderMode = "desktop" | "mobile-compact";

interface ToolbarProps {
  renderMode?: ToolbarRenderMode;
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
  onViewModeLauncherClick?: () => void;
  viewModeLauncherLabel?: string;
  mobileTrailingContent?: React.ReactNode;
}

const Toolbar: React.FC<ToolbarProps> = ({
  renderMode = "desktop",
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
  onViewModeLauncherClick,
  viewModeLauncherLabel = "حالت‌های نمایش",
  mobileTrailingContent,
}) => {
  if (renderMode === "mobile-compact") {
    return (
      <div className="module-list-toolbar module-list-toolbar--compact flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input.Search
            placeholder="جستجو..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="module-list-toolbar__search module-list-toolbar__compact-search"
            allowClear
          />
        </div>
        <Button
          type="text"
          icon={<AppstoreOutlined />}
          className="module-list-toolbar__compact-icon !h-9 !w-9 !min-w-9 !rounded-full !border-0 !bg-transparent !p-0 !shadow-none !text-gray-500 hover:!bg-black/5 hover:!text-leather-600 dark:!text-gray-300 dark:hover:!bg-white/10"
          aria-label={viewModeLauncherLabel}
          title={viewModeLauncherLabel}
          onClick={onViewModeLauncherClick}
        />
        {mobileTrailingContent}
      </div>
    );
  }

  return (
    <div className="module-list-toolbar flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2 flex-1">
        <Input.Search
          placeholder="جستجو..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="module-list-toolbar__search max-w-md"
          allowClear
        />
      </div>

      <div className="flex w-full md:w-auto flex-col md:flex-row md:items-center gap-2">
        <div className="flex items-center gap-2">
          <Segmented
            className="module-list-view-segmented"
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
              className="module-list-view-segmented min-w-max"
              options={kanbanGroupOptions}
              value={kanbanGroupBy || kanbanGroupOptions?.[0]?.value}
              onChange={(val) => onKanbanGroupChange(val as string)}
            />
          </div>
        )}

        {viewMode === ViewMode.CALENDAR && calendarEnabled && (
          <div className="max-w-full overflow-x-auto no-scrollbar">
            <Segmented
              className="module-list-view-segmented min-w-max"
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
