import React, { useCallback, useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Input, Space, Spin, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined, RollbackOutlined, SearchOutlined } from "@ant-design/icons";
import BulkActionsBar from "../components/moduleList/BulkActionsBar";
import { supabase } from "../supabaseClient";
import {
  fetchCurrentUserRolePermissions,
  resolveFilesAccessPermissions,
  type PermissionMap,
} from "../utils/permissions";
import { safeJalaliFormat, toPersianNumber } from "../utils/persianNumberFormatter";
import { toFaErrorMessage } from "../utils/errorMessageFa";
import {
  RECYCLE_BIN_RETENTION_DAYS,
  RECYCLE_BIN_TABLE,
  type RecycleBinRecord,
  getRecycleBinModuleTitle,
  purgeExpiredRecycleBinRecords,
  restoreRecycleBinRecords,
} from "../utils/recycleBin";

const RecycleBinPage: React.FC = () => {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [rows, setRows] = useState<RecycleBinRecord[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [permissions, setPermissions] = useState<PermissionMap | null>(null);
  const [canViewPage, setCanViewPage] = useState(true);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("erp:breadcrumb", {
        detail: { moduleTitle: "ابزارها", recordName: "سطل بازیافت" },
      })
    );
    return () => {
      window.dispatchEvent(new CustomEvent("erp:breadcrumb", { detail: null }));
    };
  }, []);

  const loadRecycleBin = useCallback(async () => {
    setLoading(true);
    try {
      await purgeExpiredRecycleBinRecords().catch(() => undefined);
      const [rolePermissions, rowsResult] = await Promise.all([
        fetchCurrentUserRolePermissions(supabase),
        supabase
          .from(RECYCLE_BIN_TABLE)
          .select(
            "id, org_id, module_id, source_table, source_record_id, record_title, snapshot, deleted_at, expires_at, deleted_by, deleted_by_name"
          )
          .order("deleted_at", { ascending: false }),
      ]);
      if (rowsResult.error) throw rowsResult.error;
      const filesAccess = resolveFilesAccessPermissions(rolePermissions);
      setCanViewPage(filesAccess.canViewRecycleBin);
      setPermissions(rolePermissions);
      setRows(filesAccess.canViewRecycleBin ? ((rowsResult.data || []) as RecycleBinRecord[]) : []);
    } catch (error) {
      message.error(toFaErrorMessage(error as any, "خواندن سطل بازیافت ناموفق بود."));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void loadRecycleBin();
  }, [loadRecycleBin]);

  const visibleRows = useMemo(() => {
    if (!canViewPage) return [];
    const normalizedSearch = String(searchTerm || "").trim().toLocaleLowerCase("fa");
    return rows.filter((row) => {
      if (permissions?.[row.module_id]?.view === false) return false;
      if (!normalizedSearch) return true;
      const title = String(row.record_title || "").toLocaleLowerCase("fa");
      const moduleTitle = getRecycleBinModuleTitle(row.module_id).toLocaleLowerCase("fa");
      const deletedByName = String(row.deleted_by_name || "").toLocaleLowerCase("fa");
      return (
        title.includes(normalizedSearch)
        || moduleTitle.includes(normalizedSearch)
        || deletedByName.includes(normalizedSearch)
        || String(row.source_record_id || "").toLocaleLowerCase("fa").includes(normalizedSearch)
      );
    });
  }, [canViewPage, permissions, rows, searchTerm]);

  const selectedRows = useMemo(() => {
    const selectedIdSet = new Set(selectedRowKeys.map((key) => String(key)));
    return visibleRows.filter((row) => selectedIdSet.has(String(row.id)));
  }, [selectedRowKeys, visibleRows]);

  const canRestoreRow = useCallback(
    (row: RecycleBinRecord) => permissions?.[row.module_id]?.edit !== false,
    [permissions]
  );

  const canRestoreSelection = selectedRows.length > 0 && selectedRows.every(canRestoreRow);

  if (!loading && !canViewPage) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Empty description="دسترسی به سطل بازیافت ندارید" />
      </div>
    );
  }

  const performRestore = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      try {
        setRestoring(true);
        const restoredCount = await restoreRecycleBinRecords(ids);
        message.success(
          restoredCount > 1
            ? `${toPersianNumber(restoredCount)} رکورد بازگردانی شد.`
            : "رکورد بازگردانی شد."
        );
        setSelectedRowKeys((prev) => prev.filter((key) => !ids.includes(String(key))));
        await loadRecycleBin();
      } catch (error) {
        message.error(toFaErrorMessage(error as any, "بازگردانی رکورد ناموفق بود."));
      } finally {
        setRestoring(false);
      }
    },
    [loadRecycleBin, message]
  );

  const handleBulkRestore = useCallback(() => {
    const ids = selectedRows.map((row) => String(row.id));
    if (!ids.length) return;
    modal.confirm({
      title: ids.length > 1 ? `بازگردانی ${toPersianNumber(ids.length)} رکورد` : "بازگردانی رکورد",
      content: "رکوردهای انتخاب‌شده دوباره به ماژول اصلی خود برگردانده شوند؟",
      okText: "بازگردانی",
      cancelText: "انصراف",
      onOk: () => performRestore(ids),
    });
  }, [modal, performRestore, selectedRows]);

  const columns = useMemo<ColumnsType<RecycleBinRecord>>(
    () => [
      {
        title: "ماژول",
        dataIndex: "module_id",
        key: "module_id",
        width: 180,
        render: (value: string) => <Tag className="!m-0">{getRecycleBinModuleTitle(value)}</Tag>,
      },
      {
        title: "عنوان رکورد",
        dataIndex: "record_title",
        key: "record_title",
        render: (value: string | null, row) => (
          <div className="min-w-0">
            <div className="truncate font-bold text-gray-800 dark:text-gray-100">
              {String(value || row.source_record_id || "-")}
            </div>
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
              شناسه: {String(row.source_record_id || "-")}
            </div>
          </div>
        ),
      },
      {
        title: "حذف شده در",
        dataIndex: "deleted_at",
        key: "deleted_at",
        width: 180,
        render: (value: string) => safeJalaliFormat(value, "YYYY/MM/DD HH:mm") || "-",
      },
      {
        title: "مهلت بازگردانی",
        dataIndex: "expires_at",
        key: "expires_at",
        width: 180,
        render: (value: string) => (
          <span className="text-amber-700 dark:text-amber-300">
            {safeJalaliFormat(value, "YYYY/MM/DD HH:mm") || "-"}
          </span>
        ),
      },
      {
        title: "حذف‌کننده",
        dataIndex: "deleted_by_name",
        key: "deleted_by_name",
        width: 160,
        render: (value: string | null) => value || "-",
      },
      {
        title: "عملیات",
        key: "actions",
        width: 110,
        align: "center",
        render: (_, row) => {
          const disabled = restoring || !canRestoreRow(row);
          const title = disabled ? "برای بازگردانی این رکورد، دسترسی ویرایش همان ماژول لازم است." : "بازگردانی";
          return (
            <Tooltip title={title}>
              <Button
                type="text"
                icon={<RollbackOutlined />}
                disabled={disabled}
                onClick={() => void performRestore([String(row.id)])}
              />
            </Tooltip>
          );
        },
      },
    ],
    [canRestoreRow, performRestore, restoring]
  );

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1720px] animate-fadeIn p-4 md:p-8">
      <div className="min-h-[70vh] rounded-[2rem] border border-gray-200 bg-white p-4 shadow-sm transition-colors dark:border-gray-800 dark:bg-[#1a1a1a] md:p-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-2xl font-black text-gray-800 dark:text-white">سطل بازیافت</div>
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              رکوردهای حذف‌شده تا {toPersianNumber(RECYCLE_BIN_RETENTION_DAYS)} روز در این بخش می‌مانند و از همین‌جا قابل بازگردانی‌اند.
            </div>
          </div>
          <Space wrap>
            <Input
              allowClear
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              prefix={<SearchOutlined />}
              placeholder="جستجو در عنوان، ماژول یا حذف‌کننده"
              className="w-full md:w-[320px]"
            />
            <Button icon={<ReloadOutlined />} onClick={() => void loadRecycleBin()} loading={loading || restoring}>
              بروزرسانی
            </Button>
          </Space>
        </div>

        <BulkActionsBar
          selectedCount={selectedRowKeys.length}
          onClear={() => setSelectedRowKeys([])}
          primaryActionLabel="بازگردانی"
          onPrimaryAction={handleBulkRestore}
          primaryActionDisabled={!canRestoreSelection || restoring}
          primaryActionTooltip={
            selectedRowKeys.length > 0 && !canRestoreSelection
              ? "برای بازگردانی همه موارد انتخاب‌شده، باید به ماژول‌های مربوطه دسترسی ویرایش داشته باشید."
              : undefined
          }
        />

        {visibleRows.length === 0 ? (
          <div className="flex min-h-[420px] items-center justify-center">
            <Empty
              description={rows.length ? "رکوردی با این جستجو پیدا نشد." : "سطل بازیافت فعلا خالی است."}
            />
          </div>
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={visibleRows}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
              getCheckboxProps: (row) => ({
                disabled: !canRestoreRow(row) || restoring,
              }),
            }}
            scroll={{ x: 960 }}
          />
        )}
      </div>
    </div>
  );
};

export default RecycleBinPage;
