import React from 'react';
import { Tag, Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import { ModuleDefinition, ModuleField, FieldType } from '../../types';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { getRecordTitle } from '../../utils/recordTitle';

interface RelatedRecordCardProps {
  moduleId: string;
  item: any;
  moduleConfig?: ModuleDefinition;
  profileNameMap?: Record<string, string>;
}

const getPrimaryTitle = (item: any, moduleConfig?: ModuleDefinition) => {
  return getRecordTitle(item, moduleConfig, { fallback: '-' });
};

const getDisplayFields = (moduleConfig?: ModuleDefinition): ModuleField[] => {
  if (!moduleConfig?.fields?.length) return [];
  const keyField = moduleConfig.fields.find(f => f.isKey)?.key;
  return moduleConfig.fields.filter(f => f.isTableColumn && f.key !== keyField && f.key !== 'name' && f.key !== 'title');
};

const resolveOptionLabel = (val: any, field?: ModuleField) => {
  if (!field?.options?.length) return null;
  const match = field.options.find(opt => String(opt.value) === String(val));
  return match?.label || null;
};

const formatValue = (val: any, field?: ModuleField) => {
  if (val === null || val === undefined || val === '') return '-';
  if (field?.type === FieldType.PRICE) return formatPersianPrice(val);
  if (field?.type === FieldType.NUMBER) return toPersianNumber(val);
  if (field?.type === FieldType.DATE) return safeJalaliFormat(val, 'YYYY/MM/DD');
  if (field?.type === FieldType.DATETIME) return safeJalaliFormat(val, 'YYYY/MM/DD HH:mm');
  if (field?.type === FieldType.TIME) return toPersianNumber(String(val));
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'object') {
    try {
      if (val?.label) return val.label;
      if (val?.value) return resolveOptionLabel(val.value, field) || String(val.value);
      return JSON.stringify(val);
    } catch {
      return '[object]';
    }
  }
  return resolveOptionLabel(val, field) || String(val);
};

const RelatedRecordCard: React.FC<RelatedRecordCardProps> = ({ moduleId, item, moduleConfig, profileNameMap }) => {
  const title = getPrimaryTitle(item, moduleConfig);
  const fields = getDisplayFields(moduleConfig);
  const assigneeName = profileNameMap?.[item?.assignee_id] || profileNameMap?.[item?.responsible_id] || null;

  return (
    <Link to={`/${moduleId}/${item.id}`}>
      <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-700 p-3 rounded-xl mb-3 hover:border-leather-500 transition-colors cursor-pointer group">
        <div className="font-bold text-gray-800 dark:text-gray-200 group-hover:text-leather-600 truncate">
          {title}
        </div>

        {assigneeName && (
          <div className="text-[11px] text-gray-500 mt-1">مسئول: {assigneeName}</div>
        )}

        <div className="flex flex-wrap gap-2 mt-2">
          {fields.slice(0, 4).map((field) => {
            const value = item?.[field.key];
            if (value === undefined || value === null || value === '') return null;
            if (field.type === FieldType.STATUS) {
              return (
                <Tag key={field.key} className="text-[10px] m-0" color="blue">
                  {formatValue(value, field)}
                </Tag>
              );
            }
            return (
              <Tooltip key={field.key} title={field.labels?.fa || field.key}>
                <Tag className="text-[10px] m-0">
                  {formatValue(value, field)}
                </Tag>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </Link>
  );
};

export default RelatedRecordCard;
