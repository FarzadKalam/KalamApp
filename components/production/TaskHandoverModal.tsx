import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, InputNumber, Modal, Select, Table, Tabs } from 'antd';
import { CheckOutlined, CopyOutlined, DeleteOutlined, PlusOutlined, RightOutlined, SaveOutlined, SwapOutlined } from '@ant-design/icons';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persianFa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorianEn from 'react-date-object/locales/gregorian_en';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import QrScanPopover from '../QrScanPopover';
import { HARD_CODED_UNIT_OPTIONS } from '../../utils/unitConversions';

export type StageHandoverPiece = {
  key: string;
  name: string;
  length: number;
  width: number;
  quantity: number;
  totalQuantity: number;
  mainUnit: string;
  subUnit: string;
  subUsage: number;
  sourceQty: number;
  handoverQty?: number;
};

export type StageHandoverDeliveryRow = {
  key: string;
  pieceKey?: string;
  name: string;
  length: number;
  width: number;
  quantity: number;
  mainUnit: string;
  subUnit: string;
  deliveredQty: number;
};

export type StageHandoverGroup = {
  key: string;
  rowIndex: number;
  categoryLabel: string;
  selectedProductId: string | null;
  selectedProductName: string;
  selectedProductCode: string;
  sourceShelfId: string | null;
  targetShelfId: string | null;
  pieces: StageHandoverPiece[];
  orderPieces: StageHandoverPiece[];
  deliveryRows: StageHandoverDeliveryRow[];
  totalSourceQty: number;
  totalOrderQty: number;
  totalHandoverQty: number;
  collapsed: boolean;
  isConfirmed: boolean;
};

export type StageHandoverConfirm = {
  confirmed: boolean;
  userName?: string | null;
  userId?: string | null;
  at?: string | null;
};

interface TaskHandoverModalProps {
  open: boolean;
  loading: boolean;
  locked?: boolean;
  taskName: string;
  sourceStageName: string;
  giverName: string;
  receiverName: string;
  groups: StageHandoverGroup[];
  shelfOptions: { label: string; value: string }[];
  targetShelfId: string | null;
  giverConfirmation: StageHandoverConfirm;
  receiverConfirmation: StageHandoverConfirm;
  onCancel: () => void;
  onSave: () => void;
  onToggleGroup: (groupIndex: number, collapsed: boolean) => void;
  onConfirmGroup: (groupIndex: number) => void;
  onDeliveryRowAdd: (groupIndex: number) => void;
  onDeliveryRowsDelete: (groupIndex: number, rowKeys: string[]) => void;
  onDeliveryRowsTransfer: (
    sourceGroupIndex: number,
    rowKeys: string[],
    targetGroupIndex: number,
    mode: 'copy' | 'move'
  ) => void;
  onDeliveryRowFieldChange: (
    groupIndex: number,
    rowKey: string,
    field: keyof Omit<StageHandoverDeliveryRow, 'key'>,
    value: any
  ) => void;
  onTargetShelfChange: (shelfId: string | null) => void;
  onTargetShelfScan: (shelfId: string) => void;
  onConfirmGiver: () => void;
  onConfirmReceiver: () => void;
}

const toEnglishDigits = (value: any) =>
  String(value ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const normalizeNumberInput = (value: any) =>
  toEnglishDigits(value).replace(/,/g, '').replace(/\u066C/g, '').trim();

const addCommas = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const formatGroupedInput = (value: any) => {
  const raw = normalizeNumberInput(value);
  if (!raw) return '';
  const sign = raw.startsWith('-') ? '-' : '';
  const unsigned = raw.replace(/-/g, '');
  const [intPartRaw, decimalPart] = unsigned.split('.');
  const intPart = (intPartRaw || '0').replace(/^0+(?=\d)/, '');
  const grouped = addCommas(intPart || '0');
  const withDecimal = decimalPart !== undefined ? `${grouped}.${decimalPart}` : grouped;
  return toPersianNumber(`${sign}${withDecimal}`);
};

const parseNumberInput = (value: any) => {
  const normalized = normalizeNumberInput(value);
  if (!normalized) return 0;
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toQty = (value: number) => {
  const rounded = Math.round((value || 0) * 100) / 100;
  return formatGroupedInput(rounded);
};

const calcDeliveredQty = (row?: Partial<StageHandoverDeliveryRow> | null) => {
  const length = parseNumberInput((row as any)?.length);
  const width = parseNumberInput((row as any)?.width);
  const quantity = parseNumberInput((row as any)?.quantity);
  return Math.max(0, length * width * quantity);
};

const toNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getUnitSummaryLabel = (units: Array<string | null | undefined>) => {
  const unique = Array.from(
    new Set(
      units
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
  if (!unique.length) return '';
  if (unique.length === 1) return unique[0];
  return 'واحدهای مختلف';
};

const formatDateTime = (raw: string | null | undefined) => {
  if (!raw) return '-';
  try {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '-';
    return new DateObject({
      date,
      calendar: gregorian,
      locale: gregorianEn,
    })
      .convert(persian, persianFa)
      .format('YYYY/MM/DD HH:mm');
  } catch {
    return '-';
  }
};

const TaskHandoverModal: React.FC<TaskHandoverModalProps> = ({
  open,
  loading,
  locked = false,
  taskName,
  sourceStageName,
  giverName,
  receiverName,
  groups,
  shelfOptions,
  targetShelfId,
  giverConfirmation,
  receiverConfirmation,
  onCancel,
  onSave,
  onToggleGroup,
  onConfirmGroup,
  onDeliveryRowAdd,
  onDeliveryRowsDelete,
  onDeliveryRowsTransfer,
  onDeliveryRowFieldChange,
  onTargetShelfChange,
  onTargetShelfScan,
  onConfirmGiver,
  onConfirmReceiver,
}) => {
  const [selectedRowKeysByGroup, setSelectedRowKeysByGroup] = useState<Record<string, string[]>>({});
  const [sourceTabByGroup, setSourceTabByGroup] = useState<Record<string, 'previous' | 'order' | 'next'>>({});
  const [transferDialog, setTransferDialog] = useState<{
    sourceGroupIndex: number;
    rowKeys: string[];
    mode: 'copy' | 'move';
  } | null>(null);
  const [transferTargetGroupIndex, setTransferTargetGroupIndex] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    setSelectedRowKeysByGroup((prev) => {
      const next: Record<string, string[]> = {};
      groups.forEach((group) => {
        const allowed = new Set((group.deliveryRows || []).map((row) => String(row.key)));
        const current = prev[group.key] || [];
        const filtered = current.filter((key) => allowed.has(String(key)));
        if (filtered.length > 0) next[group.key] = filtered;
      });
      return next;
    });
  }, [groups]);

  useEffect(() => {
    setSourceTabByGroup((prev) => {
      const next: Record<string, 'previous' | 'order' | 'next'> = {};
      groups.forEach((group) => {
        next[group.key] = prev[group.key] || 'previous';
      });
      return next;
    });
  }, [groups]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const transferTargets = useMemo(
    () => groups.map((group, index) => ({
      value: index,
      label: `${group.selectedProductName || '-'}${group.selectedProductCode ? ` (${group.selectedProductCode})` : ''}`,
    })),
    [groups]
  );

  const getSelectedRowKeys = (groupKey: string) => selectedRowKeysByGroup[groupKey] || [];

  const setSelectedRowKeys = (groupKey: string, rowKeys: string[]) => {
    setSelectedRowKeysByGroup((prev) => ({ ...prev, [groupKey]: rowKeys }));
  };

  const openTransferDialog = (sourceGroupIndex: number, rowKeys: string[], mode: 'copy' | 'move') => {
    if (!rowKeys.length || locked) return;
    setTransferDialog({ sourceGroupIndex, rowKeys, mode });
    setTransferTargetGroupIndex(sourceGroupIndex);
  };

  const confirmTransferRows = () => {
    if (!transferDialog) return;
    if (transferTargetGroupIndex === null || transferTargetGroupIndex < 0) return;
    onDeliveryRowsTransfer(
      transferDialog.sourceGroupIndex,
      transferDialog.rowKeys,
      transferTargetGroupIndex,
      transferDialog.mode
    );
    const sourceGroup = groups[transferDialog.sourceGroupIndex];
    if (sourceGroup) {
      setSelectedRowKeys(sourceGroup.key, []);
    }
    setTransferDialog(null);
    setTransferTargetGroupIndex(null);
  };

  return (
    <Modal
      title="فرم تحویل کالا"
      width="min(980px, calc(100vw - 24px))"
      open={open}
      onCancel={onCancel}
      confirmLoading={loading}
      destroyOnClose
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          انصراف
        </Button>,
        <Button key="save" type="primary" loading={loading} onClick={onSave}>
          ثبت فرم
        </Button>,
      ]}
    >
      <div className="space-y-4">
        <div className="text-sm text-gray-700">
          مقادیر تحویل از مرحله "{sourceStageName}" به مرحله "{taskName}" را ثبت کنید.
        </div>

        {groups.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
            موردی برای تحویل ثبت نشده است.
          </div>
        ) : (
          groups.map((group, groupIndex) => {
            const selectedRowKeys = getSelectedRowKeys(group.key);
            const activeSourceTab = sourceTabByGroup[group.key] || 'previous';
            const sourceRows = activeSourceTab === 'order'
              ? ((group.orderPieces && group.orderPieces.length > 0) ? group.orderPieces : group.pieces)
              : activeSourceTab === 'next'
                ? ((group.deliveryRows || []).map((row) => ({
                    key: String(row.key),
                    name: String(row.name || '-'),
                    length: parseNumberInput((row as any)?.length),
                    width: parseNumberInput((row as any)?.width),
                    quantity: parseNumberInput((row as any)?.quantity),
                    totalQuantity: parseNumberInput((row as any)?.quantity),
                    mainUnit: String(row.mainUnit || ''),
                    subUnit: String(row.subUnit || ''),
                    subUsage: 0,
                    sourceQty: calcDeliveredQty(row),
                  })))
                : (group.pieces || []);
            const sourceTotal = sourceRows.reduce((sum, row) => sum + toNumber(row.sourceQty), 0);
            const sourceUnitLabel = getUnitSummaryLabel((sourceRows || []).map((piece) => piece.mainUnit));
            const deliveryUnitLabel = getUnitSummaryLabel((group.deliveryRows || []).map((row) => row.mainUnit)) || sourceUnitLabel;

            return (
              <div key={group.key} className="rounded-xl border border-gray-200">
                <div className="sticky top-0 z-30 bg-[#8b5e3c] px-3 py-2 text-white flex items-center justify-between gap-2 shadow-sm">
                  <div className="min-w-0 text-xs">
                    <div>دسته‌بندی: {group.categoryLabel || '-'}</div>
                    <div className="truncate">
                      محصول: {group.selectedProductName || '-'}
                      {group.selectedProductCode ? ` (${group.selectedProductCode})` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="text"
                      size="small"
                      className="!text-white hover:!text-white/90"
                      icon={<SaveOutlined />}
                      onClick={() => onConfirmGroup(groupIndex)}
                      disabled={locked}
                    />
                    {group.isConfirmed && (
                      <span className="text-[11px] bg-white/20 rounded px-2 py-0.5">ثبت شده</span>
                    )}
                    <Button
                      type="text"
                      size="small"
                      className="!text-white hover:!text-white/90"
                      icon={<RightOutlined className={`transition-transform ${group.collapsed ? '' : 'rotate-90'}`} />}
                      onClick={() => onToggleGroup(groupIndex, !group.collapsed)}
                    />
                  </div>
                </div>

                {!group.collapsed && (
                  <div className="p-3">
                    <Tabs
                      size="small"
                      activeKey={activeSourceTab}
                      onChange={(key) => setSourceTabByGroup((prev) => ({ ...prev, [group.key]: key as 'previous' | 'order' | 'next' }))}
                      items={[
                        {
                          key: 'previous',
                          label: (
                            <span>
                              مقدار تحویل شده از <span className="font-black text-[#8b5e3c]">{sourceStageName}</span>
                            </span>
                          ),
                        },
                        { key: 'order', label: 'مقدار ثبت شده در سفارش تولید' },
                        { key: 'next', label: 'مقدار تحویل شده به مرحله بعدی' },
                      ]}
                    />
                    <Table
                      size="small"
                      pagination={false}
                      dataSource={sourceRows}
                      rowKey="key"
                      scroll={{ x: true }}
                      columns={[
                        {
                          title: 'نام قطعه',
                          dataIndex: 'name',
                          key: 'name',
                          width: 170,
                          render: (value: string) => <span className="font-medium">{value || '-'}</span>,
                        },
                        {
                          title: 'طول',
                          dataIndex: 'length',
                          key: 'length',
                          width: 70,
                          render: (value: number) => toQty(value),
                        },
                        {
                          title: 'عرض',
                          dataIndex: 'width',
                          key: 'width',
                          width: 70,
                          render: (value: number) => toQty(value),
                        },
                        {
                          title: 'تعداد در یک تولید',
                          dataIndex: 'quantity',
                          key: 'quantity',
                          width: 100,
                          render: (value: number) => toQty(value),
                        },
                        {
                          title: 'تعداد کل',
                          dataIndex: 'totalQuantity',
                          key: 'totalQuantity',
                          width: 90,
                          render: (value: number) => toQty(value),
                        },
                        {
                          title: 'واحد اصلی',
                          dataIndex: 'mainUnit',
                          key: 'mainUnit',
                          width: 90,
                          render: (value: string) => value || '-',
                        },
                        {
                          title: 'واحد فرعی',
                          dataIndex: 'subUnit',
                          key: 'subUnit',
                          width: 90,
                          render: (value: string) => value || '-',
                        },
                        {
                          title: 'مقدار واحد فرعی',
                          dataIndex: 'subUsage',
                          key: 'subUsage',
                          width: 120,
                          render: (value: number) => toQty(value),
                        },
                        {
                          title: activeSourceTab === 'order'
                            ? 'مقدار ثبت شده'
                            : (activeSourceTab === 'next' ? 'مقدار تحویلی' : 'مقدار دریافتی'),
                          dataIndex: 'sourceQty',
                          key: 'sourceQty',
                          width: 120,
                          render: (value: number) => toQty(value),
                        },
                      ]}
                    />
                    <div className="mt-2 text-xs text-gray-600 flex flex-wrap gap-4">
                      <span>
                        {activeSourceTab === 'order'
                          ? 'جمع ثبت شده سفارش:'
                          : (activeSourceTab === 'next' ? 'جمع تحویلی به مرحله بعدی:' : `جمع دریافتی از ${sourceStageName}:`)}{' '}
                        <span className="font-medium">{toQty(sourceTotal)}</span>
                        {sourceUnitLabel ? <span className="font-medium mr-1">{sourceUnitLabel}</span> : null}
                      </span>
                    </div>

                    <div className="mt-3 rounded-lg border border-[#c9b29a] bg-[#f7f1ea] p-3 space-y-3">
                      <div className="text-xs font-medium text-[#6f4a2d]">
                        از مرحله "{sourceStageName}" به مرحله "{taskName}" چه مقدار تحویل می‌دهید؟
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Button type="dashed" icon={<PlusOutlined />} onClick={() => onDeliveryRowAdd(groupIndex)} disabled={locked}>
                          افزودن ردیف تحویل
                        </Button>
                        <Button
                          icon={<DeleteOutlined />}
                          danger
                          disabled={locked || selectedRowKeys.length === 0}
                          onClick={() => onDeliveryRowsDelete(groupIndex, selectedRowKeys)}
                        >
                          حذف
                        </Button>
                        <Button
                          icon={<CopyOutlined />}
                          disabled={locked || selectedRowKeys.length === 0}
                          onClick={() => openTransferDialog(groupIndex, selectedRowKeys, 'copy')}
                        >
                          کپی
                        </Button>
                        <Button
                          icon={<SwapOutlined />}
                          disabled={locked || selectedRowKeys.length === 0}
                          onClick={() => openTransferDialog(groupIndex, selectedRowKeys, 'move')}
                        >
                          جابجایی
                        </Button>
                      </div>

                      <Table
                        size={isMobile ? 'middle' : 'small'}
                        pagination={false}
                        dataSource={group.deliveryRows || []}
                        rowKey="key"
                        className="task-handover-delivery-table"
                        scroll={{ x: true }}
                        rowSelection={{
                          selectedRowKeys,
                          onChange: (keys) => setSelectedRowKeys(group.key, keys.map((k) => String(k))),
                        }}
                        columns={[
                          {
                            title: 'نام قطعه',
                            dataIndex: 'name',
                            key: 'name',
                            width: isMobile ? 280 : 180,
                            render: (value: string, record: StageHandoverDeliveryRow) => (
                              <Input
                                value={value}
                                onChange={(e) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'name', e.target.value)}
                                disabled={locked}
                              />
                            ),
                          },
                          {
                            title: 'طول',
                            dataIndex: 'length',
                            key: 'length',
                            width: isMobile ? 160 : 90,
                            render: (value: number, record: StageHandoverDeliveryRow) => (
                              <InputNumber
                                value={value}
                                onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'length', nextValue)}
                                className="w-full persian-number"
                                stringMode
                                formatter={(v) => formatGroupedInput(v)}
                                parser={(v) => parseNumberInput(v)}
                                disabled={locked}
                              />
                            ),
                          },
                          {
                            title: 'عرض',
                            dataIndex: 'width',
                            key: 'width',
                            width: isMobile ? 160 : 90,
                            render: (value: number, record: StageHandoverDeliveryRow) => (
                              <InputNumber
                                value={value}
                                onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'width', nextValue)}
                                className="w-full persian-number"
                                stringMode
                                formatter={(v) => formatGroupedInput(v)}
                                parser={(v) => parseNumberInput(v)}
                                disabled={locked}
                              />
                            ),
                          },
                          {
                            title: 'تعداد',
                            dataIndex: 'quantity',
                            key: 'quantity',
                            width: isMobile ? 160 : 90,
                            render: (value: number, record: StageHandoverDeliveryRow) => (
                              <InputNumber
                                value={value}
                                onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'quantity', nextValue)}
                                className="w-full persian-number"
                                stringMode
                                formatter={(v) => formatGroupedInput(v)}
                                parser={(v) => parseNumberInput(v)}
                                disabled={locked}
                              />
                            ),
                          },
                          {
                            title: 'واحد اصلی',
                            dataIndex: 'mainUnit',
                            key: 'mainUnit',
                            width: isMobile ? 190 : 110,
                            render: (value: string, record: StageHandoverDeliveryRow) => (
                              <Select
                                value={value || null}
                                options={HARD_CODED_UNIT_OPTIONS as any}
                                onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'mainUnit', nextValue)}
                                className="w-full"
                                getPopupContainer={() => document.body}
                                disabled={locked}
                              />
                            ),
                          },
                          {
                            title: 'واحد فرعی',
                            dataIndex: 'subUnit',
                            key: 'subUnit',
                            width: isMobile ? 190 : 110,
                            render: (value: string, record: StageHandoverDeliveryRow) => (
                              <Select
                                value={value || null}
                                options={HARD_CODED_UNIT_OPTIONS as any}
                                onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'subUnit', nextValue)}
                                className="w-full"
                                getPopupContainer={() => document.body}
                                disabled={locked}
                              />
                            ),
                          },
                          {
                            title: `مقدار تحویل شده به ${taskName}`,
                            dataIndex: 'deliveredQty',
                            key: 'deliveredQty',
                            width: isMobile ? 230 : 170,
                            render: (_value: number, record: StageHandoverDeliveryRow) => (
                              <span className="font-semibold text-[#6f4a2d]">
                                {toQty(calcDeliveredQty(record))}
                              </span>
                            ),
                          },
                          {
                            title: '',
                            key: 'actions',
                            width: isMobile ? 150 : 120,
                            render: (_value: any, record: StageHandoverDeliveryRow) => (
                              <div className="flex items-center gap-1">
                                <Button
                                  type="text"
                                  icon={<CopyOutlined />}
                                  onClick={() => onDeliveryRowsTransfer(groupIndex, [String(record.key)], groupIndex, 'copy')}
                                  disabled={locked}
                                />
                                <Button
                                  type="text"
                                  icon={<SwapOutlined />}
                                  onClick={() => openTransferDialog(groupIndex, [String(record.key)], 'move')}
                                  disabled={locked}
                                />
                                <Button
                                  type="text"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() => onDeliveryRowsDelete(groupIndex, [String(record.key)])}
                                  disabled={locked}
                                />
                              </div>
                            ),
                          },
                        ]}
                      />
                      {(() => {
                        const diff = (group.totalHandoverQty || 0) - (group.totalSourceQty || 0);
                        const diffClass =
                          diff > 0 ? 'text-green-700 font-semibold' : diff < 0 ? 'text-red-700 font-semibold' : 'text-gray-700 font-medium';
                        return (
                          <div className="text-xs flex flex-col sm:flex-row gap-4 text-gray-700">
                            <span>
                              جمع مقدار تحویل شده: <span className="font-semibold">{toQty(group.totalHandoverQty)}</span>
                              {deliveryUnitLabel ? <span className="font-semibold mr-1">{deliveryUnitLabel}</span> : null}
                            </span>
                            <span className={diffClass}>
                              اختلاف مقدار تحویل شده با مقدار دریافتی: {toQty(diff)}
                              {deliveryUnitLabel ? <span className="mr-1">{deliveryUnitLabel}</span> : null}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
          <div className="text-xs text-gray-500">
            قفسه مرحله <span className="font-black text-[#8b5e3c]">"{taskName}"</span>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={targetShelfId}
              onChange={(value) => onTargetShelfChange(value || null)}
              options={shelfOptions}
              showSearch
              optionFilterProp="label"
              placeholder="انتخاب قفسه مرحله"
              className="w-full"
              getPopupContainer={() => document.body}
              disabled={locked}
            />
            <QrScanPopover
              label=""
              buttonProps={{ type: 'default', shape: 'circle', disabled: locked }}
              onScan={({ moduleId, recordId }) => {
                if (moduleId === 'shelves' && recordId) onTargetShelfScan(recordId);
              }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-3">
          <div className="text-xs text-gray-700">
            تحویل‌دهنده: <span className="font-medium">{giverName || '-'}</span>
          </div>
          <div className="text-xs text-gray-700">
            تحویل‌گیرنده: <span className="font-medium">{receiverName || '-'}</span>
          </div>
          <div className="flex flex-col md:flex-row gap-2">
            {giverConfirmation.confirmed ? (
              <div className="text-xs rounded border border-green-200 bg-green-50 text-green-700 px-3 py-2">
                {giverConfirmation.userName || 'کاربر'} مقادیر فوق را در {toPersianNumber(formatDateTime(giverConfirmation.at || null))} تحویل داده است.
              </div>
            ) : (
              <Button icon={<CheckOutlined />} onClick={onConfirmGiver} loading={loading}>
                مقادیر فوق را تحویل دادم
              </Button>
            )}
            {receiverConfirmation.confirmed ? (
              <div className="text-xs rounded border border-blue-200 bg-blue-50 text-blue-700 px-3 py-2">
                {receiverConfirmation.userName || 'کاربر'} مقادیر فوق را در {toPersianNumber(formatDateTime(receiverConfirmation.at || null))} تحویل گرفته است.
              </div>
            ) : (
              <Button type="primary" icon={<CheckOutlined />} onClick={onConfirmReceiver} loading={loading}>
                مقادیر فوق را تحویل گرفتم
              </Button>
            )}
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 768px) {
          .task-handover-delivery-table .ant-table-cell {
            padding: 10px 8px !important;
          }
          .task-handover-delivery-table .ant-input,
          .task-handover-delivery-table .ant-input-number,
          .task-handover-delivery-table .ant-select,
          .task-handover-delivery-table .ant-select-selector {
            min-height: 42px !important;
            font-size: 15px !important;
            min-width: 120px !important;
          }
          .task-handover-delivery-table .ant-input-number,
          .task-handover-delivery-table .ant-input-number-input {
            font-size: 15px !important;
            height: 40px !important;
          }
        }
      `}</style>
      <Modal
        title={transferDialog?.mode === 'copy' ? 'کپی ردیف های تحویل' : 'جابجایی ردیف های تحویل'}
        open={!!transferDialog}
        onCancel={() => {
          setTransferDialog(null);
          setTransferTargetGroupIndex(null);
        }}
        onOk={confirmTransferRows}
        okText={transferDialog?.mode === 'copy' ? 'کپی' : 'جابجایی'}
        cancelText="انصراف"
        okButtonProps={{ disabled: transferTargetGroupIndex === null }}
        destroyOnClose
      >
        <div className="space-y-2">
          <div className="text-xs text-gray-600">محصول مقصد را انتخاب کنید:</div>
          <Select
            className="w-full"
            value={transferTargetGroupIndex}
            onChange={(val) => setTransferTargetGroupIndex(val)}
            options={transferTargets}
            getPopupContainer={() => document.body}
          />
        </div>
      </Modal>
    </Modal>
  );
};

export default TaskHandoverModal;
