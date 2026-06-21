import React from 'react';
import { Alert, Input, Modal, Radio, Space, Tag } from 'antd';
import type { PhoneBindTargetModuleId } from '../../utils/phoneIdentityBindings';
import AdaptiveSelectField from '../AdaptiveSelectField';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';

type TargetOption = {
  value: string;
  label: string;
  meta?: string | null;
};

type Props = {
  open: boolean;
  loading?: boolean;
  saving?: boolean;
  phone: string;
  existingBindingLabel?: string | null;
  phoneMatchStatus?: string | null;
  targetModuleId: PhoneBindTargetModuleId;
  onChangeTargetModuleId: (value: PhoneBindTargetModuleId) => void;
  targetRecordId: string | null;
  onChangeTargetRecordId: (value: string | null) => void;
  targetOptions: TargetOption[];
  searchValue: string;
  onChangeSearchValue: (value: string) => void;
  onClose: () => void;
  onSave: () => void | Promise<void>;
};

const MODULE_OPTIONS: Array<{ label: string; value: PhoneBindTargetModuleId }> = [
  { label: 'مشتری', value: 'customers' },
  { label: 'تأمین‌کننده', value: 'suppliers' },
  { label: 'کارمند', value: 'employees' },
];
const PHONE_BIND_MODAL_Z_INDEX = 15220;
const PHONE_BIND_SELECT_Z_INDEX = 15320;

const resolveStatusLabel = (value: string | null | undefined) => {
  const normalized = String(value || '').trim();
  if (normalized === 'ambiguous') return 'این شماره هنوز به مخاطب اصلی وصل نشده است.';
  if (normalized === 'unknown' || normalized === 'unknown_delivery') return 'این شماره در مخاطبین سیستم شناخته نشده است.';
  if (normalized === 'manual') return 'این شماره قبلا به صورت دستی متصل شده است.';
  if (normalized === 'matched' || normalized === 'bound' || normalized === 'connected') return 'این شماره به مخاطب وصل است.';
  return '';
};

const PhoneMatchPickerModal: React.FC<Props> = ({
  open,
  loading = false,
  saving = false,
  phone,
  existingBindingLabel,
  phoneMatchStatus,
  targetModuleId,
  onChangeTargetModuleId,
  targetRecordId,
  onChangeTargetRecordId,
  targetOptions,
  searchValue,
  onChangeSearchValue,
  onClose,
  onSave,
}) => {
  const normalizedTargetOptions = React.useMemo(
    () => targetOptions.map((option) => ({
      value: option.value,
      label: option.label,
      meta: option.meta || '',
      searchText: `${option.label} ${option.meta || ''}`.toLowerCase(),
    })),
    [targetOptions],
  );
  const resolveModalPopupContainer = React.useCallback((trigger?: HTMLElement | null) => {
    const modalBodyHost = trigger?.closest?.('.ant-modal-body, .ant-modal-content, .ant-modal') as HTMLElement | null;
    return modalBodyHost || resolveOverlayPopupContainer(trigger);
  }, []);

  return (
    <Modal
      open={open}
      title="اتصال شماره به مخاطب"
      onCancel={onClose}
      onOk={() => void onSave()}
      okText="ذخیره اتصال"
      cancelText="بستن"
      confirmLoading={saving}
      destroyOnHidden
      width={620}
      zIndex={PHONE_BIND_MODAL_Z_INDEX}
    >
      <div className="space-y-4">
        {existingBindingLabel ? (
          <Alert
            type="info"
            showIcon
            message={`این شماره در حال حاضر به ${existingBindingLabel} وصل است.`}
          />
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-white/10 dark:bg-white/5">
          <div>شماره</div>
          <div dir="ltr" className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">
            {phone || '-'}
          </div>
          {resolveStatusLabel(phoneMatchStatus) ? (
            <Space size={[6, 6]} wrap className="mt-2">
              <Tag color="gold" className="!m-0">
                {resolveStatusLabel(phoneMatchStatus)}
              </Tag>
            </Space>
          ) : null}
        </div>

        <div>
          <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">نوع مخاطب</div>
          <Radio.Group
            value={targetModuleId}
            onChange={(event) => onChangeTargetModuleId(event.target.value)}
            optionType="button"
            buttonStyle="solid"
            options={MODULE_OPTIONS}
          />
        </div>

        <div>
          <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">جستجو</div>
          <Input
            value={searchValue}
            onChange={(event) => onChangeSearchValue(event.target.value)}
            placeholder="نام، کد یا مشخصه مخاطب را جستجو کنید"
            allowClear
          />
        </div>

        <div>
          <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">رکورد مقصد</div>
          <AdaptiveSelectField
            showSearch
            value={targetRecordId || undefined}
            onChange={(value: any) => onChangeTargetRecordId(String(value || '').trim() || null)}
            placeholder="یک مخاطب موجود را انتخاب کنید"
            loading={loading}
            allowClear
            filterOption={false}
            options={normalizedTargetOptions}
            optionFilterProp="searchText"
            optionDisplayFallback={(option: any) => String(option?.label || option?.value || '').trim()}
            renderMobileOption={(option: any) => (
              <div className="min-w-0">
                <div className="truncate">{option?.label}</div>
                {option?.meta ? <div className="truncate text-[11px] text-gray-400">{option.meta}</div> : null}
              </div>
            )}
            optionRender={(option: any) => {
              const data = option?.data || option;
              return (
                <div className="min-w-0">
                  <div className="truncate">{data?.label}</div>
                  {data?.meta ? <div className="truncate text-[11px] text-gray-400">{data.meta}</div> : null}
                </div>
              );
            }}
            getPopupContainer={(trigger: HTMLElement) => resolveModalPopupContainer(trigger)}
            modalContainer={resolveModalPopupContainer}
            preferLocalPopupContainer
            overlayZIndexBase={PHONE_BIND_SELECT_Z_INDEX}
            styles={{ popup: { root: { zIndex: 19000 } } }}
            className="w-full"
          />
        </div>
      </div>
    </Modal>
  );
};

export default React.memo(PhoneMatchPickerModal);
