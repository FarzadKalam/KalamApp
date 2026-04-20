import React, { useMemo } from 'react';
import { Tag } from 'antd';
import { Link } from 'react-router-dom';
import { ModuleDefinition, ModuleField } from '../../types';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { formatRecordFieldValue, RelationValueMap } from '../../utils/recordDisplayFormatter';
import { getRecordCardSummaryFields, resolveCardStatusMeta } from '../../utils/recordCardHelpers';
import { getRecordDisplayLabel } from '../../utils/recordLabel';
import RelatedRecordPopover from '../RelatedRecordPopover';

interface RelatedRecordCardProps {
  moduleId: string;
  item: any;
  moduleConfig?: ModuleDefinition;
  profileNameMap?: Record<string, string>;
  relationValueMap?: RelationValueMap;
}

const getPrimaryTitle = (item: any, moduleConfig?: ModuleDefinition) =>
  getRecordDisplayLabel(item, moduleConfig?.id, { fallback: '-' });

const RelatedRecordCard: React.FC<RelatedRecordCardProps> = ({
  moduleId,
  item,
  moduleConfig,
  profileNameMap,
  relationValueMap = {},
}) => {
  const title = getPrimaryTitle(item, moduleConfig);
  const statusMeta = resolveCardStatusMeta(item, moduleConfig, 'status');
  const assigneeName = profileNameMap?.[item?.assignee_id] || profileNameMap?.[item?.responsible_id] || null;
  const summaryFields = useMemo(() => getRecordCardSummaryFields(item, moduleConfig, ['status', 'full_name'], 4), [item, moduleConfig]);
  const moduleLabel = moduleConfig?.titles?.fa || moduleId;
  const codeLabel = String(item?.system_code || item?.manual_code || '').trim();
  const useQuickPreviewModal = moduleConfig?.listPreviewMode === 'modal' || moduleConfig?.disableDetailView === true;

  const card = (
      <div className="mb-3 rounded-2xl border border-[rgba(var(--brand-200-rgb),0.75)] bg-gradient-to-b from-white to-gray-50 p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[rgba(var(--brand-400-rgb),0.8)] hover:shadow-md dark:border-[rgba(var(--brand-300-rgb),0.2)] dark:from-[#1d1d1d] dark:to-[#171717]">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold text-gray-800 dark:text-gray-100" title={title}>
              {toPersianNumber(title)}
            </div>
            <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-300">
              {moduleLabel}
              {codeLabel ? ` • ${toPersianNumber(codeLabel)}` : ''}
            </div>
          </div>
          {statusMeta ? (
            <Tag
              className="!m-0 !rounded-full !border-0 !px-2 !py-0.5 !text-[11px] !font-semibold"
              color={statusMeta.color}
            >
              {statusMeta.label}
            </Tag>
          ) : null}
        </div>

        {summaryFields.length > 0 ? (
          <div className="space-y-2 text-xs">
            {summaryFields.map((field) => {
              const value = item?.[field.key];
              if (value === undefined || value === null || value === '') return null;
              return (
                <div key={field.key} className="grid grid-cols-[92px_1fr] gap-2 items-start border-b border-gray-100 pb-1.5 last:border-b-0 last:pb-0 dark:border-gray-800">
                  <span className="text-gray-500 dark:text-gray-400">{field.labels?.fa || field.key}</span>
                  <span className="min-w-0 break-words text-gray-700 dark:text-gray-200">
                    {formatRecordFieldValue(item, field as ModuleField, relationValueMap)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {assigneeName ? (
          <div className="mt-3 rounded-xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-50-rgb),0.72)] px-3 py-2 text-[11px] text-gray-600 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-[rgba(var(--brand-700-rgb),0.12)] dark:text-gray-200">
            مسئول: <span className="font-semibold">{toPersianNumber(assigneeName)}</span>
          </div>
        ) : null}
      </div>
  );

  if (useQuickPreviewModal && item?.id) {
    return (
      <RelatedRecordPopover
        moduleId={moduleId}
        recordId={String(item.id)}
        label={title}
        mode="modal"
        hideFullRecordAction={moduleConfig?.hideFullRecordAction === true}
      >
        <button type="button" className="block w-full border-0 bg-transparent p-0 text-right">
          {card}
        </button>
      </RelatedRecordPopover>
    );
  }

  return (
    <Link to={`/${moduleId}/${item.id}`} className="block">
      {card}
    </Link>
  );
};

export default RelatedRecordCard;
