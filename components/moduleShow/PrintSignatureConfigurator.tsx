import React from 'react';
import { Button, Checkbox, Empty, Input, Segmented, Tag } from 'antd';
import { DeleteOutlined, DownOutlined, PlusOutlined, UpOutlined } from '@ant-design/icons';
import AdaptiveSelectField from '../AdaptiveSelectField';
import type {
  PrintSignatureDerivedState,
  PrintSignatureKind,
  PrintSignatureQuickAddOption,
  PrintSignatureSignerModule,
} from '../../utils/printTemplates/signatures';

type PrintSignatureConfiguratorProps = {
  rows: PrintSignatureDerivedState[];
  quickAddOptions: PrintSignatureQuickAddOption[];
  signatureOptionsByRow: Record<string, any[]>;
  onAddRow: (kind: PrintSignatureKind) => void;
  onRemoveRow: (rowId: string) => void;
  onMoveRow: (rowId: string, direction: 'up' | 'down') => void;
  onToggleAutomatic: (rowId: string, automatic: boolean) => void;
  onChangeName: (rowId: string, value: string) => void;
  onChangeSubtitle: (rowId: string, value: string) => void;
  onChangeSignerModule: (rowId: string, signerModule: PrintSignatureSignerModule) => void;
  onChangeSignerId: (rowId: string, signerId: string | null) => void;
  onSearchSignerOptions: (
    rowId: string,
    signerModule: PrintSignatureSignerModule,
    search?: string,
    exactId?: string | null
  ) => Promise<void> | void;
};

const SIGNER_MODULE_OPTIONS = [
  { label: 'کارمند', value: 'employees' },
  { label: 'مشتری', value: 'customers' },
  { label: 'تامین‌کننده', value: 'suppliers' },
] as const;

const getSourceTag = (kind: PrintSignatureKind) => {
  switch (kind) {
    case 'ceo':
      return 'مدیرعامل';
    case 'current_user':
      return 'کاربر جاری';
    case 'record_assignee':
      return 'مسئول';
    case 'record_relation':
      return 'رابطه رکورد';
    case 'selected_signer':
      return 'انتخاب مستقیم';
    default:
      return 'دستی';
  }
};

const PrintSignatureConfigurator: React.FC<PrintSignatureConfiguratorProps> = ({
  rows,
  quickAddOptions,
  signatureOptionsByRow,
  onAddRow,
  onRemoveRow,
  onMoveRow,
  onToggleAutomatic,
  onChangeName,
  onChangeSubtitle,
  onChangeSignerModule,
  onChangeSignerId,
  onSearchSignerOptions,
}) => {
  return (
    <div className="print-signature-pane">
      <div className="print-signature-toolbar">
        <div className="print-signature-toolbar-copy">چیدمان پیش‌نمایش و چاپ نهایی از همین ترتیب تبعیت می‌کند.</div>
        <div className="print-signature-toolbar-actions">
          {quickAddOptions.map((option) => (
            <Button
              key={option.key}
              size="small"
              icon={<PlusOutlined />}
              disabled={option.disabled}
              onClick={() => onAddRow(option.key)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="print-signature-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="هنوز ردیفی برای مهر و امضا تعریف نشده است." />
        </div>
      ) : (
        <div className="print-signature-list">
          {rows.map((row, index) => (
            <div key={row.id} className="print-signature-card">
              <div className="print-signature-card-header">
                <div className="print-signature-card-meta">
                  <span className="print-signature-card-index">{index + 1}</span>
                  <Tag color={row.automatic ? 'blue' : 'default'}>{getSourceTag(row.kind)}</Tag>
                  {row.sourceDescription ? <span className="print-signature-card-source">{row.sourceDescription}</span> : null}
                  {row.unresolved ? <Tag color="orange">بدون مقدار</Tag> : null}
                </div>
                <div className="print-signature-card-actions">
                  <Button size="small" icon={<UpOutlined />} disabled={index === 0} onClick={() => onMoveRow(row.id, 'up')} />
                  <Button size="small" icon={<DownOutlined />} disabled={index === rows.length - 1} onClick={() => onMoveRow(row.id, 'down')} />
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onRemoveRow(row.id)} />
                </div>
              </div>

              <div className="print-signature-card-body">
                <div className="print-signature-auto-row">
                  <Checkbox checked={row.automatic} onChange={(event) => onToggleAutomatic(row.id, event.target.checked)}>
                    خودکار
                  </Checkbox>
                </div>

                {row.automatic && row.kind === 'selected_signer' ? (
                  <div className="print-signature-grid">
                    <div>
                      <div className="print-signature-label">نوع امضاکننده</div>
                      <Segmented
                        block
                        size="middle"
                        value={row.signerModule || 'customers'}
                        onChange={(value) => onChangeSignerModule(row.id, value as PrintSignatureSignerModule)}
                        options={SIGNER_MODULE_OPTIONS as any}
                      />
                    </div>
                    <div>
                      <div className="print-signature-label">رکورد امضاکننده</div>
                      <AdaptiveSelectField
                        value={row.signerId || undefined}
                        onChange={(value) => onChangeSignerId(row.id, value || null)}
                        options={signatureOptionsByRow[row.id] || []}
                        showSearch
                        allowClear
                        placeholder="انتخاب کنید"
                        optionFilterProp="label"
                        onSearch={(value) => {
                          const signerModule = (row.signerModule || 'customers') as PrintSignatureSignerModule;
                          void onSearchSignerOptions(row.id, signerModule, value);
                        }}
                        onFocus={() => {
                          const signerModule = (row.signerModule || 'customers') as PrintSignatureSignerModule;
                          void onSearchSignerOptions(row.id, signerModule, '', row.signerId || null);
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="print-signature-grid">
                  <div>
                    <div className="print-signature-label">زیرنویس نام امضا کننده</div>
                    <Input
                      value={row.subtitleValue}
                      onChange={(event) => onChangeSubtitle(row.id, event.target.value)}
                      placeholder="مثلاً: امضای مدیرعامل"
                    />
                  </div>
                  <div>
                    <div className="print-signature-label">نام امضا کننده</div>
                    <Input
                      value={row.nameValue}
                      onChange={(event) => onChangeName(row.id, event.target.value)}
                      placeholder="نام و نام خانوادگی"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PrintSignatureConfigurator;
