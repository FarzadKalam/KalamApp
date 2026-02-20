import React from "react";
import { Button, Input, Segmented, Tooltip } from "antd";
import {
  AppstoreOutlined,
  ColumnWidthOutlined,
  CompressOutlined,
  ExpandOutlined,
  ReloadOutlined,
  TableOutlined,
} from "@ant-design/icons";
import { ViewMode } from "../../types";

interface ToolbarProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  kanbanEnabled?: boolean;
  kanbanGroupBy: string | null;
  kanbanGroupOptions: { label: string; value: string }[];
  onKanbanGroupChange: (value: string) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  viewMode,
  setViewMode,
  searchTerm,
  onSearchChange,
  onRefresh,
  isFullscreen,
  toggleFullscreen,
  kanbanEnabled = false,
  kanbanGroupBy,
  kanbanGroupOptions,
  onKanbanGroupChange,
}) => {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
      <div className="flex items-center gap-2 flex-1">
        <Input.Search
          placeholder="جستجو..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="max-w-md"
          allowClear
        />
        <Tooltip title="تازه سازی">
          <Button icon={<ReloadOutlined />} onClick={onRefresh} />
        </Tooltip>
      </div>

      <div className="flex w-full md:w-auto flex-col md:flex-row md:items-center gap-2">
        <div className="flex items-center gap-2">
          <Segmented
            options={[
              { label: "جدول", value: ViewMode.LIST, icon: <TableOutlined /> },
              { label: "گرید", value: ViewMode.GRID, icon: <AppstoreOutlined /> },
              ...(kanbanEnabled ? [{ label: "کانبان", value: ViewMode.KANBAN, icon: <ColumnWidthOutlined /> }] : []),
            ]}
            value={viewMode}
            onChange={(val) => setViewMode(val as ViewMode)}
          />

          <Tooltip title={isFullscreen ? "خروج از تمام صفحه" : "تمام صفحه"}>
            <Button
              icon={isFullscreen ? <CompressOutlined /> : <ExpandOutlined />}
              onClick={toggleFullscreen}
            />
          </Tooltip>
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
      </div>
    </div>
  );
};

export default Toolbar;
