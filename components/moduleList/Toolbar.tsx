import React from "react";
import { Button, Input, Segmented, Switch, Tooltip } from "antd";
import {
  AppstoreOutlined,
  CalendarOutlined,
  ColumnWidthOutlined,
  EnvironmentOutlined,
  SearchOutlined,
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
  aiModeEnabled?: boolean;
  onAiModeToggle?: (enabled: boolean) => void;
  onAiSubmit?: (question: string) => void;
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
  aiModeEnabled = false,
  onAiModeToggle,
  onAiSubmit,
}) => {
  const [aiQuery, setAiQuery] = React.useState("");
  const inputValue = aiModeEnabled ? aiQuery : searchTerm;
  const inputPlaceholder = aiModeEnabled ? "از هوش مصنوعی درباره این لیست بپرسید..." : "جستجو...";
  const handleInputChange = (value: string) => {
    if (aiModeEnabled) {
      setAiQuery(value);
      return;
    }
    onSearchChange(value);
  };
  const handleInputSubmit = (value: string) => {
    if (aiModeEnabled) onAiSubmit?.(value);
  };
  const aiToggle = onAiModeToggle ? (
    <Tooltip title={aiModeEnabled ? "حالت گفتگو با هوش مصنوعی فعال است" : "فعال کردن گفتگو با هوش مصنوعی"}>
      <span className="module-list-toolbar__ai-toggle inline-flex h-full items-center gap-1 rounded-full px-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-300">
        AI
        <Switch
          size="small"
          checked={aiModeEnabled}
          onChange={onAiModeToggle}
          aria-label="تغییر حالت جستجو و هوش مصنوعی"
        />
      </span>
    </Tooltip>
  ) : null;
  const searchSuffix = (
    <span className="module-list-toolbar__search-suffix">
      <Tooltip title={aiModeEnabled ? "ارسال پرسش به هوش مصنوعی" : "جستجو"}>
        <Button
          type="text"
          size="small"
          icon={<SearchOutlined />}
          aria-label={aiModeEnabled ? "ارسال پرسش به هوش مصنوعی" : "جستجو"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => handleInputSubmit(inputValue)}
        />
      </Tooltip>
      {aiToggle}
    </span>
  );
  const renderSearchInput = (className = "") => (
    <Input
      placeholder={inputPlaceholder}
      value={inputValue}
      onChange={(e) => handleInputChange(e.target.value)}
      onPressEnter={(e) => handleInputSubmit((e.target as HTMLInputElement).value)}
      suffix={searchSuffix}
      className={`module-list-toolbar__search ${className}`.trim()}
      allowClear
    />
  );

  if (renderMode === "mobile-compact") {
    return (
      <div className="module-list-toolbar module-list-toolbar--compact flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {renderSearchInput("module-list-toolbar__compact-search")}
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
        {renderSearchInput("max-w-md")}
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
