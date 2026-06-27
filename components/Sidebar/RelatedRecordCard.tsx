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
      <div className="mb-3 rounded-2xl border border-white/70 bg-[linear-gradient(145deg,#ffffff,#f3f6fb)] p-3 shadow-[0_16px_34px_rgba(15,23,42,0.10),inset_0_2px_5px_rgba(255,255,255,0.86),inset_0_-10px_22px_rgba(148,163,184,0.14)] transition-all hover:-translate-y-0.5 hover:border-[rgba(var(--brand-200-rgb),0.78)] hover:shadow-[0_20px_42px_rgba(15,23,42,0.14),inset_0_2px_6px_rgba(255,255,255,0.92),inset_0_-10px_24px_rgba(148,163,184,0.16)] dark:border-white/[0.09] dark:bg-[linear-gradient(145deg,rgba(38,38,38,0.98),rgba(24,24,24,0.98))] dark:shadow-[0_16px_36px_rgba(0,0,0,0.38),inset_0_1px_3px_rgba(255,255,255,0.06),inset_0_-12px_24px_rgba(0,0,0,0.20)] dark:hover:border-[rgba(var(--brand-300-rgb),0.24)] dark:hover:shadow-[0_20px_44px_rgba(0,0,0,0.48),inset_0_1px_4px_rgba(255,255,255,0.08),inset_0_-12px_24px_rgba(0,0,0,0.24)]">
        <div className="mb-3 min-w-0">
          <div className="min-w-0">
            <div className="line-clamp-2 break-words text-sm font-extrabold leading-5 text-gray-800 dark:text-gray-100" title={title}>
              {toPersianNumber(title)}
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 text-[11px] text-gray-500 dark:text-gray-300">
                {moduleLabel}
                {codeLabel ? ` • ${toPersianNumber(codeLabel)}` : ''}
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
          </div>
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
          <div className="mt-3 rounded-xl bg-gray-50/80 px-3 py-2 text-[11px] text-gray-600 dark:bg-white/[0.04] dark:text-gray-200">
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
