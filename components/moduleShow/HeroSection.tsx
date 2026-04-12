import React, { useMemo } from 'react';
import { Select, Space, Tag } from 'antd';
import {
  AppstoreOutlined,
  ClockCircleOutlined,
  EditOutlined,
  HistoryOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import { FieldLocation, FieldType } from '../../types';
import RecordImageBox from '../RecordImageBox';
import TagInput from '../TagInput';
import { getAssigneeLabel } from '../../utils/assigneeLabel';
import { buildResolvedAssigneeCombo } from '../../utils/assigneeValue';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

interface HeroSectionProps {
  data: any;
  recordTitle?: string;
  moduleId: string;
  moduleConfig: any;
  currentTags: any[];
  onTagsChange: () => void;
  renderSmartField: (field: any, isHeader?: boolean) => React.ReactNode;
  getOptionLabel: (field: any, value: any) => string;
  getUserName: (uid: string) => string;
  handleAssigneeChange: (value: string) => void;
  getAssigneeOptions: () => any[];
  assigneeIcon: React.ReactNode;
  onImageUpdate: (file: File) => Promise<boolean> | boolean;
  onMainImageChange?: (url: string | null) => void;
  canViewField?: (fieldKey: string) => boolean;
  canManageAssignee?: boolean;
  canEditModule?: boolean;
  checkVisibility?: (logic: any) => boolean;
  canViewFilesManager?: boolean;
  canEditFilesManager?: boolean;
  canDeleteFilesManager?: boolean;
}

const HeroSection: React.FC<HeroSectionProps> = ({
  data,
  recordTitle,
  moduleId,
  moduleConfig,
  currentTags,
  onTagsChange,
  renderSmartField,
  getOptionLabel,
  getUserName,
  handleAssigneeChange,
  getAssigneeOptions,
  assigneeIcon,
  onImageUpdate,
  onMainImageChange,
  canViewField,
  canManageAssignee = true,
  canEditModule = true,
  checkVisibility,
  canViewFilesManager = true,
  canEditFilesManager = true,
  canDeleteFilesManager = true,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const imageField = moduleConfig?.fields?.find((f: any) => f.type === FieldType.IMAGE);
  const canShowImage = !!imageField && (canViewField ? canViewField(imageField.key) !== false : true);
  const assigneeLabel = getAssigneeLabel(moduleId);

  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const shouldOpenGalleryFromQuery = queryParams.get('gallery') === '1';
  const highlightFileId = queryParams.get('fileId');
  const displayRecordTitle = useMemo(
    () => toPersianNumber(String(recordTitle || data.name || data.system_code || '-')),
    [data.name, data.system_code, recordTitle]
  );
  const displaySystemCode = useMemo(() => {
    const raw = data.system_code || data.custom_code;
    if (!raw) return null;
    return String(raw);
  }, [data.custom_code, data.system_code]);

  const handleCloseFilesManager = () => {
    if (!shouldOpenGalleryFromQuery && !highlightFileId) return;

    const nextParams = new URLSearchParams(location.search);
    nextParams.delete('gallery');
    nextParams.delete('fileId');
    const search = nextParams.toString();
    navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : '',
      },
      { replace: true },
    );
  };

  const renderDate = (dateVal: any) => {
    if (!dateVal) return '-';
    try {
      const jsDate = new Date(dateVal);
      if (Number.isNaN(jsDate.getTime())) return '-';
      const dateObj = new DateObject({
        date: jsDate,
        calendar: gregorian,
        locale: gregorian_en,
      }).convert(persian, persian_fa);
      return dateObj.format('YYYY/MM/DD - HH:mm');
    } catch {
      return '-';
    }
  };

  const resolveActorLabel = (rawName: any, userId: any) => {
    const normalizedRaw = String(rawName || '').trim();
    const placeholderValues = new Set(['Ø³ÛŒØ³ØªÙ…/Ù†Ø§Ù…Ø´Ø®Øµ', 'Ù†Ø§Ù…Ø´Ø®Øµ', '-', 'system/unknown']);
    if (normalizedRaw && !placeholderValues.has(normalizedRaw.toLowerCase()) && !placeholderValues.has(normalizedRaw)) {
      return normalizedRaw;
    }
    return getUserName(String(userId || ''));
  };

  return (
    <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 mb-6 relative overflow-hidden animate-fadeIn">
      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-leather-500 to-leather-800 opacity-80"></div>

      <div className="flex flex-col lg:flex-row gap-8 items-stretch">
        {canShowImage && (
          <div className="w-full lg:w-56 h-48 lg:h-56 shrink-0 self-center lg:self-start">
            <RecordImageBox
              moduleId={moduleId}
              recordId={String(data?.id || '')}
              imageUrl={data?.image_url || null}
              canEdit={!!canEditModule}
              canViewFilesManager={!!canViewFilesManager}
              canEditFilesManager={!!canEditFilesManager && !!canEditModule}
              canDeleteFilesManager={!!canDeleteFilesManager}
              onImageUpdate={onImageUpdate}
              onMainImageChange={onMainImageChange}
              openFilesManagerByDefault={shouldOpenGalleryFromQuery}
              highlightFileId={highlightFileId}
              onFilesManagerClose={handleCloseFilesManager}
              filesButtonLabel="فایل ها"
            />
          </div>
        )}

        <div className="flex-1 w-full flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4 mt-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-black m-0 text-gray-800 dark:text-white">{displayRecordTitle}</h1>
                {displaySystemCode && (
                  <Tag className="font-mono dir-ltr bg-gray-100 dark:bg-white/10 border-none text-gray-500 px-2 py-1">
                    {displaySystemCode}
                  </Tag>
                )}
              </div>

              {canManageAssignee && (canViewField ? canViewField('assignee_id') !== false : true) && (
                <div className="flex items-center justify-between sm:justify-start bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-700 rounded-lg sm:rounded-full pl-2 sm:pl-1 pr-3 py-1 gap-1 sm:gap-2 mb-4">
                  <span className="text-xs text-gray-400 shrink-0">{assigneeLabel}:</span>
                  <Select
                    variant="borderless"
                    value={buildResolvedAssigneeCombo(data)}
                    onChange={handleAssigneeChange}
                    placeholder="Ø¬Ø³ØªØ¬Ùˆ ÛŒØ§ Ø§Ù†ØªØ®Ø§Ø¨ Ù…Ø³Ø¦ÙˆÙ„ / Ù†Ù‚Ø´"
                    className="min-w-[140px] font-bold text-gray-700 dark:text-gray-300"
                    styles={{ popup: { root: { minWidth: 200 } } }}
                    options={getAssigneeOptions()}
                    showSearch
                    optionFilterProp="label"
                    filterOption={(input, option) =>
                      String(option?.label || '')
                        .toLowerCase()
                        .includes(String(input || '').trim().toLowerCase())
                    }
                    optionRender={(option) => (
                      <Space>
                        <span role="img" aria-label={option.data.label}>{(option.data as any).emoji}</span>
                        {option.data.label}
                      </Space>
                    )}
                    disabled={!canEditModule}
                  />
                  <div className="w-6 h-6 flex items-center justify-center">{assigneeIcon}</div>
                </div>
              )}
            </div>

            {(canViewField ? canViewField('tags') !== false : true) && (
              <div className="mb-6">
                <TagInput
                  recordId={data.id}
                  moduleId={moduleId}
                  initialTags={currentTags}
                  onChange={onTagsChange}
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mt-6">
              {moduleConfig.fields
                .filter((f: any) => f.location === FieldLocation.HEADER && !['name', 'image_url', 'system_code', 'tags'].includes(f.key))
                .filter((f: any) => (canViewField ? canViewField(f.key) !== false : true))
                .filter((f: any) => (!f.logic || (checkVisibility ? checkVisibility(f.logic) : true)))
                .map((f: any) => (
                  <div
                    key={f.key}
                    className={f.type === FieldType.SUPER_LONG_TEXT
                      ? 'flex flex-col gap-1 border-r last:border-0 border-gray-100 dark:border-gray-700 px-4 sm:col-span-2 xl:col-span-4'
                      : 'flex flex-col gap-1 border-r last:border-0 border-gray-100 dark:border-gray-700 px-4'}
                  >
                    <span className="text-xs text-gray-400 uppercase tracking-wider">{f.labels.fa}</span>
                    {renderSmartField(f, true)}
                  </div>
                ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            <div className="flex gap-2 overflow-x-auto pb-2 border-t border-gray-100 dark:border-gray-800 pt-4">
              {data.category && (
                <Tag
                  icon={<AppstoreOutlined />}
                  className="rounded-full px-3 py-1 bg-gray-50 dark:bg-white/5 border-none text-gray-600 dark:text-gray-300"
                >
                  {getOptionLabel(moduleConfig.fields.find((f: any) => f.key === 'category'), data.category)}
                </Tag>
              )}
              {data.product_type && (
                <Tag className="rounded-full px-3 py-1 bg-leather-50 text-leather-600 border-none">
                  {getOptionLabel(moduleConfig.fields.find((f: any) => f.key === 'product_type'), data.product_type)}
                </Tag>
              )}
            </div>

            <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-white/5">
              <div className="flex items-center gap-2">
                <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                  <SafetyCertificateOutlined className="text-green-600" />
                </div>
                <div className="flex flex-col">
                  <span className="opacity-70">Ø§ÛŒØ¬Ø§Ø¯ Ú©Ù†Ù†Ø¯Ù‡</span>
                  <span className="font-bold text-gray-700 dark:text-gray-300">{resolveActorLabel(data?.created_by_name, data?.created_by)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                  <ClockCircleOutlined className="text-blue-500" />
                </div>
                <div className="flex flex-col">
                  <span className="opacity-70">Ø²Ù…Ø§Ù† Ø§ÛŒØ¬Ø§Ø¯</span>
                  <span className="font-bold text-gray-700 dark:text-gray-300 dir-ltr">
                    {renderDate(data.created_at)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                  <EditOutlined className="text-orange-500" />
                </div>
                <div className="flex flex-col">
                  <span className="opacity-70">Ø¢Ø®Ø±ÛŒÙ† ÙˆÛŒØ±Ø§ÛŒØ´Ú¯Ø±</span>
                  <span className="font-bold text-gray-700 dark:text-gray-300">{resolveActorLabel(data?.updated_by_name, data?.updated_by)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                  <HistoryOutlined className="text-purple-500" />
                </div>
                <div className="flex flex-col">
                  <span className="opacity-70">Ø²Ù…Ø§Ù† ÙˆÛŒØ±Ø§ÛŒØ´</span>
                  <span className="font-bold text-gray-700 dark:text-gray-300 dir-ltr">
                    {renderDate(data.updated_at)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default HeroSection;


