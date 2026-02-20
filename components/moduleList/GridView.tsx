import React from "react";
import { Empty } from "antd";
import RenderCardItem from "./RenderCardItem";

interface GridViewProps {
  data: any[];
  moduleId: string;
  moduleConfig: any;
  imageField?: string;
  tagsField?: string;
  statusField?: string;
  categoryField?: string;
  allUsers?: any[];
  allRoles?: any[];
  selectedRowKeys: React.Key[];
  setSelectedRowKeys: (keys: React.Key[]) => void;
  navigate: (path: string) => void;
  canViewField?: (fieldKey: string) => boolean;
  relationOptions?: Record<string, any[]>;
}

const GridView: React.FC<GridViewProps> = ({
  data,
  moduleId,
  moduleConfig,
  imageField,
  tagsField,
  statusField,
  categoryField,
  allUsers,
  allRoles,
  selectedRowKeys,
  setSelectedRowKeys,
  navigate,
  canViewField,
  relationOptions,
}) => {
  if (!data?.length) {
    return <Empty description="داده‌ای یافت نشد" className="py-10" />;
  }

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
      {data.map((item) => (
        <RenderCardItem
          key={item.id}
          item={item}
          moduleId={moduleId}
          moduleConfig={moduleConfig}
          imageField={imageField}
          tagsField={tagsField}
          statusField={statusField}
          categoryField={categoryField}
          allUsers={allUsers}
          allRoles={allRoles}
          selectedRowKeys={selectedRowKeys}
          setSelectedRowKeys={setSelectedRowKeys}
          navigate={navigate}
          canViewField={canViewField}
          relationOptions={relationOptions}
        />
      ))}
    </div>
  );
};

export default GridView;
