import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Empty, Table, Tag } from 'antd';
import type { ColumnsType, TableProps } from 'antd/es/table';
import { PrinterOutlined, ShareAltOutlined } from '@ant-design/icons';
import RelatedRecordPopover from '../RelatedRecordPopover';
import PrintSection from '../moduleShow/PrintSection';
import { ACCOUNTING_PERMISSION_KEY, fetchCurrentUserRolePermissions } from '../../utils/permissions';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { supabase } from '../../supabaseClient';
import {
  computeOperationalFinancialTotals,
  buildOperationalFinancialEntityPrintFields,
  buildOperationalFinancialEntityPrintValues,
  fetchOperationalFinancialOverview,
  OPERATIONAL_FINANCIAL_PAYMENT_TYPE_LABEL,
  OPERATIONAL_FINANCIAL_PRINT_FIELDS,
  OPERATIONAL_FINANCIAL_PRINT_SUMMARY_FIELDS,
  OPERATIONAL_FINANCIAL_ROW_TYPE_LABEL,
  OPERATIONAL_FINANCIAL_STATUS_LABEL,
  type OperationalFinancialEntityType,
  type OperationalFinancialEntityPrintField,
  type OperationalFinancialRow,
} from '../../utils/operationalFinancialOverview';
import { createChoiceFilter, createDateRangeFilter, createNumberRangeFilter, createTextFilter } from './tableColumnFilters';
import { useListPrintManager } from '../../utils/printTemplates/useListPrintManager';

type OperationalFinancialOverviewPanelProps = {
  entityType: OperationalFinancialEntityType;
  entityId: string;
  entityPrintFields?: OperationalFinancialEntityPrintField[];
};

const ENTITY_LABELS: Record<OperationalFinancialEntityType, { title: string; denied: string; empty: string; share: string }> = {
  customer: {
    title: 'وضعیت مالی مشتری',
    denied: 'دسترسی مشاهده وضعیت مالی مشتری را ندارید',
    empty: 'گردش عملیاتی برای این مشتری یافت نشد',
    share: 'وضعیت مالی مشتری',
  },
  supplier: {
    title: 'وضعیت مالی تامین‌کننده',
    denied: 'دسترسی مشاهده وضعیت مالی تامین‌کننده را ندارید',
    empty: 'گردش عملیاتی برای این تامین‌کننده یافت نشد',
    share: 'وضعیت مالی تامین‌کننده',
  },
  employee: {
    title: 'وضعیت مالی کارمند',
    denied: 'دسترسی مشاهده وضعیت مالی کارمند را ندارید',
    empty: 'گردش عملیاتی برای این کارمند یافت نشد',
    share: 'وضعیت مالی کارمند',
  },
};

const ENTITY_PRINT_CONTEXT_TITLES: Record<OperationalFinancialEntityType, string> = {
  customer: 'اطلاعات مشتری',
  supplier: 'اطلاعات تامین‌کننده',
  employee: 'اطلاعات کارمند',
};

const statusColor = (status?: string) =>
  ['received', 'cleared', 'final', 'paid', 'closed', 'approved', 'posted', 'settled', 'completed'].includes(String(status))
    ? 'success'
    : ['returned', 'bounced', 'canceled', 'cancelled', 'rejected'].includes(String(status))
      ? 'error'
      : 'processing';

const createVirtualModuleConfig = (entityType: OperationalFinancialEntityType, printFields: any[]) => ({
  id: `operational_financial_overview_${entityType}`,
  titles: { fa: ENTITY_LABELS[entityType].title, en: 'Operational Financial Overview' },
  fields: printFields.map((field) => ({
    key: field.key,
    labels: { fa: field.label, en: field.label },
    type: field.type,
    options: field.options,
    isTableColumn: true,
  })),
  blocks: [],
  table: `operational_financial_overview_${entityType}`,
});

const OperationalFinancialOverviewPanel: React.FC<OperationalFinancialOverviewPanelProps> = ({
  entityType,
  entityId,
  entityPrintFields = [],
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [canView, setCanView] = useState(true);
  const [rows, setRows] = useState<OperationalFinancialRow[]>([]);
  const [filteredRows, setFilteredRows] = useState<OperationalFinancialRow[]>([]);

  const labels = ENTITY_LABELS[entityType];

  const copyShareLink = useCallback(async () => {
    const shareUrl = typeof window !== 'undefined' ? `${window.location.href}#operational-financial-overview` : '';
    try {
      if (navigator.share) {
        await navigator.share({ title: labels.share, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      message.success('لینک بخش وضعیت مالی کپی شد.');
    } catch {
      message.error('اشتراک گذاری این بخش ناموفق بود.');
    }
  }, [labels.share, message]);

  const loadData = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const permissions = await fetchCurrentUserRolePermissions(supabase);
      const accountingPerms = permissions?.[ACCOUNTING_PERMISSION_KEY] || {};
      const canViewEntity =
        entityType === 'customer'
          ? permissions?.customers?.view !== false
          : entityType === 'supplier'
            ? permissions?.suppliers?.view !== false
            : permissions?.employees?.view !== false;
      const canViewOperational =
        entityType === 'customer'
          ? permissions?.invoices?.view !== false || permissions?.cash_bank_operations?.view !== false || permissions?.barters?.view !== false
          : entityType === 'supplier'
            ? permissions?.purchase_invoices?.view !== false || permissions?.cash_bank_operations?.view !== false || permissions?.barters?.view !== false
            : permissions?.employee_advances?.view !== false
              || permissions?.payroll_slips?.view !== false
              || permissions?.cash_bank_operations?.view !== false
              || permissions?.barters?.view !== false;

      const allowView = canViewEntity && accountingPerms.view !== false && canViewOperational;
      setCanView(allowView);
      if (!allowView) {
        setRows([]);
        setFilteredRows([]);
        return;
      }

      const overview = await fetchOperationalFinancialOverview({ entityType, entityId });
      setRows(overview.rows);
      setFilteredRows(overview.rows);
    } catch (err: any) {
      message.error(toFaErrorMessage(err, 'خطا در دریافت وضعیت مالی'));
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, message]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setFilteredRows(rows);
  }, [rows]);

  const visibleTotals = useMemo(() => computeOperationalFinancialTotals(filteredRows), [filteredRows]);

  const completePrintFields = useMemo(
    () => [
      ...OPERATIONAL_FINANCIAL_PRINT_FIELDS,
      ...buildOperationalFinancialEntityPrintFields(entityPrintFields),
    ],
    [entityPrintFields],
  );

  const listPrintRows = useMemo(
    () => filteredRows.map((row) => row.printableFields || {}),
    [filteredRows],
  );

  const printContextValues = useMemo(
    () => buildOperationalFinancialEntityPrintValues(entityPrintFields),
    [entityPrintFields],
  );

  const listPrintManager = useListPrintManager({
    moduleId: `operational_financial_overview_${entityType}`,
    moduleConfig: createVirtualModuleConfig(entityType, completePrintFields),
    rows: listPrintRows,
    printableFields: completePrintFields as any,
    contextTitle: ENTITY_PRINT_CONTEXT_TITLES[entityType],
    contextValues: printContextValues,
    summary: {
      title: 'جمع فیلتر جاری',
      fields: [...OPERATIONAL_FINANCIAL_PRINT_SUMMARY_FIELDS] as any,
      values: {
        totalDebit: visibleTotals.totalDebit,
        totalCredit: visibleTotals.totalCredit,
        finalBalance: visibleTotals.finalBalance,
        finalBalanceAmount: Math.abs(visibleTotals.finalBalance || 0),
        finalBalanceSide: visibleTotals.finalBalance >= 0 ? 'بدهکار' : 'بستانکار',
      },
    },
    relationOptions: {},
    extraSystemValues: {
      total_debit: visibleTotals.totalDebit,
      total_credit: visibleTotals.totalCredit,
      final_balance: visibleTotals.finalBalance,
      final_balance_amount: Math.abs(visibleTotals.finalBalance || 0),
      final_balance_side: visibleTotals.finalBalance >= 0 ? 'بدهکار' : 'بستانکار',
    },
  });

  const rowTypeFilters = useMemo(
    () => Object.entries(OPERATIONAL_FINANCIAL_ROW_TYPE_LABEL).map(([value, label]) => ({ label, value })),
    [],
  );
  const statusFilters = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => String(row.status || '').trim()).filter(Boolean))).map((value) => ({
        label: OPERATIONAL_FINANCIAL_STATUS_LABEL[value] || value,
        value,
      })),
    [rows],
  );
  const paymentTypeFilters = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => String(row.paymentType || '').trim()).filter(Boolean))).map((value) => ({
        label: OPERATIONAL_FINANCIAL_PAYMENT_TYPE_LABEL[value] || value,
        value,
      })),
    [rows],
  );

  const columns: ColumnsType<OperationalFinancialRow> = useMemo(
    () => [
      {
        title: 'نوع',
        dataIndex: 'rowType',
        key: 'rowType',
        width: 120,
        ...createChoiceFilter('نوع', rowTypeFilters, (record) => record.rowType),
        render: (value: OperationalFinancialRow['rowType']) => <Tag color="blue">{OPERATIONAL_FINANCIAL_ROW_TYPE_LABEL[value] || value}</Tag>,
      },
      {
        title: 'منبع',
        dataIndex: 'sourceLabel',
        key: 'sourceLabel',
        width: 180,
        ...createTextFilter('جستجو در منبع', (record) => record.sourceLabel),
      },
      {
        title: 'روش',
        dataIndex: 'paymentType',
        key: 'paymentType',
        width: 130,
        ...createChoiceFilter('روش', paymentTypeFilters, (record) => record.paymentType),
        render: (value: string) => OPERATIONAL_FINANCIAL_PAYMENT_TYPE_LABEL[value] || value || '-',
      },
      {
        title: 'وضعیت',
        dataIndex: 'status',
        key: 'status',
        width: 130,
        ...createChoiceFilter('وضعیت', statusFilters, (record) => record.status),
        render: (value: string) => <Tag color={statusColor(value)}>{OPERATIONAL_FINANCIAL_STATUS_LABEL[value] || value || '-'}</Tag>,
      },
      {
        title: 'تاریخ',
        dataIndex: 'date',
        key: 'date',
        width: 120,
        ...createDateRangeFilter('تاریخ', (record) => record.date),
        render: (value: string | null) => (value ? toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD')) : '-'),
      },
      {
        title: 'بدهکار',
        dataIndex: 'debit',
        key: 'debit',
        align: 'right',
        width: 150,
        ...createNumberRangeFilter('بدهکار', (record) => record.debit),
        render: (value: number) => <span className="persian-number">{formatPersianPrice(value || 0)}</span>,
      },
      {
        title: 'بستانکار',
        dataIndex: 'credit',
        key: 'credit',
        align: 'right',
        width: 150,
        ...createNumberRangeFilter('بستانکار', (record) => record.credit),
        render: (value: number) => <span className="persian-number">{formatPersianPrice(value || 0)}</span>,
      },
      {
        title: 'مانده',
        dataIndex: 'balance',
        key: 'balance',
        align: 'right',
        width: 170,
        ...createNumberRangeFilter('مانده', (record) => Math.abs(record.balance)),
        render: (value: number) => (
          <div className="flex items-center justify-end gap-2">
            <span className="persian-number">{formatPersianPrice(Math.abs(value || 0))}</span>
            <Tag className="!m-0">{value >= 0 ? 'بدهکار' : 'بستانکار'}</Tag>
          </div>
        ),
      },
      {
        title: 'مرجع',
        dataIndex: 'invoiceLabel',
        key: 'invoiceLabel',
        width: 180,
        ...createTextFilter('جستجو در مرجع', (record) => record.invoiceLabel),
        render: (_: string, record) => {
          if (!record.invoiceRelation?.moduleId || !record.invoiceRelation?.recordId) return record.invoiceLabel || '-';
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <RelatedRecordPopover
                moduleId={record.invoiceRelation.moduleId}
                recordId={record.invoiceRelation.recordId}
                label={record.invoiceLabel || '-'}
              />
            </div>
          );
        },
      },
      {
        title: 'بانک / صندوق',
        dataIndex: 'bankLabel',
        key: 'bankLabel',
        width: 190,
        ...createTextFilter('جستجو در بانک', (record) => record.bankLabel),
        render: (_: string, record) => {
          if (!record.bankRelation?.moduleId || !record.bankRelation?.recordId) return record.bankLabel || '-';
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <RelatedRecordPopover
                moduleId={record.bankRelation.moduleId}
                recordId={record.bankRelation.recordId}
                label={record.bankLabel || '-'}
              />
            </div>
          );
        },
      },
      {
        title: 'توضیحات',
        dataIndex: 'description',
        key: 'description',
        width: 240,
        ...createTextFilter('جستجو در توضیحات', (record) => record.description || ''),
        render: (value: string) => value || '-',
      },
    ],
    [paymentTypeFilters, rowTypeFilters, rows, statusFilters],
  );

  const handleTableChange: TableProps<OperationalFinancialRow>['onChange'] = useCallback((
    _pagination: any,
    _filters: any,
    _sorter: any,
    extra: any,
  ) => {
    setFilteredRows((extra.currentDataSource as OperationalFinancialRow[]) || rows);
  }, [rows]);

  if (!entityId) return null;

  return (
    <div id="operational-financial-overview" className="mt-6">
      <Card
        title="وضعیت مالی"
        extra={(
          <div className="flex flex-wrap gap-2">
            <Button size="small" icon={<PrinterOutlined />} onClick={() => listPrintManager.setIsPrintModalOpen(true)}>
              چاپ
            </Button>
            <Button size="small" icon={<ShareAltOutlined />} onClick={() => void copyShareLink()}>
              اشتراک گذاری
            </Button>
          </div>
        )}
      >
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <Tag className="!m-0 px-3 py-1">جمع بدهکار: <span className="persian-number">{formatPersianPrice(visibleTotals.totalDebit)}</span></Tag>
          <Tag className="!m-0 px-3 py-1">جمع بستانکار: <span className="persian-number">{formatPersianPrice(visibleTotals.totalCredit)}</span></Tag>
          <Tag color={visibleTotals.finalBalance >= 0 ? 'blue' : 'green'} className="!m-0 px-3 py-1">
            مانده عملیاتی: <span className="persian-number">{formatPersianPrice(Math.abs(visibleTotals.finalBalance || 0))}</span> {visibleTotals.finalBalance >= 0 ? 'بدهکار' : 'بستانکار'}
          </Tag>
        </div>

        <div className="mb-3 text-xs text-gray-500">
          این بخش بر اساس عملیات مالی ثبت‌شده در سیستم نمایش داده می‌شود و به سند حسابداری وابسته نیست. اگر نقش مرتبطی انتخاب شده باشد، گردش همان مشتری، تامین‌کننده یا کارمند نیز در همین جدول تجمیع می‌شود.
        </div>

        {!canView ? (
          <Empty description={labels.denied} />
        ) : (
          <Table<OperationalFinancialRow>
            className="custom-erp-table"
            rowKey="key"
            loading={loading}
            dataSource={rows}
            columns={columns}
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 1550 }}
            locale={{ emptyText: labels.empty }}
            onChange={handleTableChange}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={5}>
                    <span className="font-bold text-gray-800 dark:text-gray-100">جمع فیلتر جاری</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(visibleTotals.totalDebit)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(visibleTotals.totalCredit)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">
                    <span className="persian-number font-bold">{formatPersianPrice(Math.abs(visibleTotals.finalBalance))}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={8} />
                  <Table.Summary.Cell index={9} />
                  <Table.Summary.Cell index={10} />
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        )}
      </Card>

      <PrintSection
        isPrintModalOpen={listPrintManager.isPrintModalOpen}
        onClose={() => listPrintManager.setIsPrintModalOpen(false)}
        onPreparePrint={listPrintManager.preparePrint}
        onPrint={listPrintManager.handlePrint}
        printTemplates={listPrintManager.printTemplates}
        selectedTemplateId={listPrintManager.selectedTemplateId}
        onSelectTemplate={listPrintManager.setSelectedTemplateId}
        renderPrintCard={listPrintManager.renderPrintCard}
        printMode={listPrintManager.printMode}
        printableFields={listPrintManager.printableFieldsForTemplate}
        selectedPrintFields={listPrintManager.selectedPrintFields}
        onTogglePrintField={listPrintManager.handleTogglePrintField}
        onTogglePrintFieldGroup={listPrintManager.handleTogglePrintFieldGroup}
        onMovePrintField={listPrintManager.handleMovePrintField}
        imageDisplayMode={listPrintManager.imageDisplayMode}
        onChangeImageDisplayMode={listPrintManager.handleChangeImageDisplayMode}
        onSavePrintFields={listPrintManager.handleSavePrintFields}
        savingPrintFields={listPrintManager.savingPrintFields}
        printSignatureRows={listPrintManager.printSignatureStates}
        printSignatureQuickAddOptions={listPrintManager.printSignatureQuickAddOptions}
        signatureOptionsByRow={listPrintManager.signatureOptionsByRow}
        onAddPrintSignatureRow={listPrintManager.handleAddPrintSignatureRow}
        onRemovePrintSignatureRow={listPrintManager.handleRemovePrintSignatureRow}
        onMovePrintSignatureRow={listPrintManager.handleMovePrintSignatureRow}
        onTogglePrintSignatureAutomatic={listPrintManager.handleTogglePrintSignatureAutomatic}
        onChangePrintSignatureName={listPrintManager.handleChangePrintSignatureName}
        onChangePrintSignatureSubtitle={listPrintManager.handleChangePrintSignatureSubtitle}
        onChangePrintSignatureSignerModule={listPrintManager.handleChangePrintSignatureSignerModule}
        onChangePrintSignatureSignerId={listPrintManager.handleChangePrintSignatureSignerId}
        onSearchPrintSignatureOptions={listPrintManager.loadSignatureSignerOptions}
        onRefreshPreview={listPrintManager.refreshTemplates}
        allowFieldSelectionTab={listPrintManager.allowFieldSelectionTab}
        showImageDisplayModeControl={listPrintManager.showImageDisplayModeControl}
        previewMeta={listPrintManager.previewMeta}
      />
    </div>
  );
};

export default OperationalFinancialOverviewPanel;
