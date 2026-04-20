import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Modal, Spin, Tag } from 'antd';
import { ArrowRightOutlined, EnvironmentOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { FieldLocation, FieldType } from '../../types';
import { getResolvedAssigneeId } from '../../utils/assigneeValue';
import { getAssigneeLabel } from '../../utils/assigneeLabel';
import { getFieldLabelFa } from '../../utils/fieldLabel';
import { buildRelationValueMap, formatRecordFieldValue, type RelationValueMap } from '../../utils/recordDisplayFormatter';
import { getRecordTitle } from '../../utils/recordTitle';
import { fetchAssigneeDirectory } from '../../utils/referenceData';

type MapRecordModalProps = {
  moduleId: string;
  recordId: string | null;
  open: boolean;
  overlayZIndex?: number;
  onClose: () => void;
  onNavigate?: (path: string) => void;
};

const isEmptyValue = (value: any) => (
  value === null
  || value === undefined
  || value === ''
  || (Array.isArray(value) && value.length === 0)
);

const COLOR_MAP: Record<string, string> = {
  green: '#16a34a',
  red: '#dc2626',
  blue: '#2563eb',
  orange: '#ea580c',
  yellow: '#ca8a04',
  purple: '#7c3aed',
  cyan: '#0891b2',
  gray: '#64748b',
  grey: '#64748b',
  default: '#64748b',
};

const resolveStatusColor = (rawColor: any) => {
  const color = String(rawColor || '').trim().toLowerCase();
  if (!color) return '#64748b';
  if (color.startsWith('#') || color.startsWith('rgb') || color.startsWith('hsl')) return color;
  return COLOR_MAP[color] || '#64748b';
};

const sortFields = (fields: any[]) => (
  [...(fields || [])].sort((a: any, b: any) => Number(a?.order || 0) - Number(b?.order || 0))
);

const MapRecordModal: React.FC<MapRecordModalProps> = ({
  moduleId,
  recordId,
  open,
  overlayZIndex = 6200,
  onClose,
  onNavigate,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<any>(null);
  const [relationValueMap, setRelationValueMap] = useState<RelationValueMap>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({});
  const [roleNameMap, setRoleNameMap] = useState<Record<string, string>>({});

  const moduleConfig = MODULES[moduleId];
  const isMobileViewport = typeof window !== 'undefined' ? window.innerWidth < 768 : false;

  const fields = useMemo(
    () => sortFields((moduleConfig?.fields || []).filter((field: any) => field?.type !== FieldType.IMAGE)),
    [moduleConfig],
  );

  useEffect(() => {
    if (!open || !moduleConfig || !recordId) return;
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from(moduleConfig.table || moduleId)
          .select('*')
          .eq('id', recordId)
          .single();
        if (error) throw error;
        if (cancelled) return;

        setRecord(data || null);

        const dynamicCategories = Array.from(
          new Set(
            fields
              .map((field: any) => String(field?.dynamicOptionsCategory || '').trim())
              .filter(Boolean),
          ),
        );

        const [relationMap, dynamicEntries, assigneeDirectory] = await Promise.all([
          buildRelationValueMap(supabase, fields, data ? [data] : []),
          Promise.all(
            dynamicCategories.map(async (category) => {
              const { data: rows } = await supabase
                .from('dynamic_options')
                .select('label, value')
                .eq('category', category)
                .eq('is_active', true)
                .order('display_order', { ascending: true });
              return [
                category,
                (rows || []).map((row: any) => ({
                  label: String(row?.label || ''),
                  value: String(row?.value || ''),
                })),
              ] as const;
            }),
          ),
          fetchAssigneeDirectory(supabase).catch(() => null),
        ]);

        if (cancelled) return;

        setRelationValueMap(relationMap || {});
        setDynamicOptions(Object.fromEntries(dynamicEntries));
        setUserNameMap(
          assigneeDirectory?.users?.reduce<Record<string, string>>((acc, user: any) => {
            acc[String(user.id)] = String(user.display_name || user.full_name || user.id);
            return acc;
          }, {}) || {},
        );
        setRoleNameMap(
          assigneeDirectory?.roles?.reduce<Record<string, string>>((acc, role: any) => {
            acc[String(role.id)] = String(role.title || role.id);
            return acc;
          }, {}) || {},
        );
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setRecord(null);
          setRelationValueMap({});
          setDynamicOptions({});
          setUserNameMap({});
          setRoleNameMap({});
          message.error('خواندن اطلاعات رکورد روی نقشه ناموفق بود.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [fields, message, moduleConfig, moduleId, open, recordId]);

  const resolveFieldForDisplay = (field: any) => {
    if (!field?.dynamicOptionsCategory) return field;
    return {
      ...field,
      options: dynamicOptions[String(field.dynamicOptionsCategory)] || field.options || [],
    };
  };

  const previewTitle = useMemo(() => {
    if (!moduleConfig || !record) return recordId || '-';
    return getRecordTitle(record, moduleConfig, { fallback: recordId || '-' });
  }, [moduleConfig, record, recordId]);

  const previewImageUrl = useMemo(() => {
    if (!record || !moduleConfig) return '';
    const imageField = (moduleConfig.fields || []).find(
      (field: any) => field?.type === FieldType.IMAGE && !isEmptyValue(record?.[field.key]),
    );
    if (imageField) return String(record?.[imageField.key] || '').trim();
    const fallbackKeys = ['image_url', 'avatar_url', 'logo_url'];
    for (const key of fallbackKeys) {
      const value = String(record?.[key] || '').trim();
      if (value) return value;
    }
    return '';
  }, [moduleConfig, record]);

  const statusMeta = useMemo(() => {
    if (!moduleConfig || !record) return null;
    const statusField = (moduleConfig.fields || []).find((field: any) => String(field?.key || '') === 'status');
    if (!statusField) return null;
    const rawStatus = String(record?.status || '').trim();
    if (!rawStatus) return null;
    const option = (statusField.options || []).find((item: any) => String(item?.value || '') === rawStatus);
    return {
      label: String(option?.label || rawStatus),
      color: resolveStatusColor(option?.color),
    };
  }, [moduleConfig, record]);

  const assigneeMeta = useMemo(() => {
    if (!record) return null;
    const assigneeId = String(getResolvedAssigneeId(record) || '').trim();
    if (!assigneeId) return null;
    const assigneeType = String(record?.assignee_type || (record?.assignee_role_id ? 'role' : 'user')).trim();
    return {
      label: assigneeType === 'role' ? (roleNameMap[assigneeId] || assigneeId) : (userNameMap[assigneeId] || assigneeId),
      title: getAssigneeLabel(moduleId),
      type: assigneeType,
    };
  }, [moduleId, record, roleNameMap, userNameMap]);

  const recentFieldKeys = useMemo(
    () => new Set((moduleConfig?.dashboard?.recentListFields || []).map((key) => String(key || '').trim()).filter(Boolean)),
    [moduleConfig],
  );

  const recordTitleFieldKey = useMemo(() => {
    const explicit = (moduleConfig?.fields || []).find((field: any) => field?.isKey);
    if (explicit?.key) return String(explicit.key);
    const fallback = (moduleConfig?.fields || []).find((field: any) => ['name', 'title', 'business_name', 'full_name', 'subject'].includes(String(field?.key || '')));
    return String(fallback?.key || '');
  }, [moduleConfig]);

  const excludedTopKeys = useMemo(
    () => new Set(['id', 'status', 'assignee_id', 'assignee_role_id', 'assignee_type', 'image_url', 'avatar_url', 'logo_url', 'tags', recordTitleFieldKey].filter(Boolean)),
    [recordTitleFieldKey],
  );

  const hasValue = (field: any) => !isEmptyValue(record?.[field?.key]);

  const formatFieldValue = (field: any) => {
    if (!record) return '-';
    return formatRecordFieldValue(record, resolveFieldForDisplay(field), relationValueMap, '-');
  };

  const headerFields = useMemo(() => (
    fields.filter((field: any) => (
      field?.location === FieldLocation.HEADER
      && !excludedTopKeys.has(String(field?.key || ''))
      && hasValue(field)
    ))
  ), [excludedTopKeys, fields, record]);

  const keyFields = useMemo(() => {
    const selected = fields.filter((field: any) => (
      hasValue(field)
      && !excludedTopKeys.has(String(field?.key || ''))
      && (
        recentFieldKeys.has(String(field?.key || ''))
        || field?.isKey
        || (field?.isTableColumn && field?.location !== FieldLocation.HEADER)
      )
    ));
    const seen = new Set<string>();
    return selected.filter((field: any) => {
      const key = String(field?.key || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [excludedTopKeys, fields, recentFieldKeys, record]);

  const blockSections = useMemo(() => (
    (moduleConfig?.blocks || [])
      .map((block: any) => {
        const blockFields = fields.filter((field: any) => (
          String(field?.blockId || '') === String(block?.id || '')
          && hasValue(field)
          && (
            field?.isTableColumn
            || recentFieldKeys.has(String(field?.key || ''))
            || field?.isKey
          )
        ));
        if (blockFields.length === 0) return null;
        return {
          id: String(block.id),
          title: String(block?.titles?.fa || block.id),
          fields: blockFields,
        };
      })
      .filter(Boolean) as Array<{ id: string; title: string; fields: any[] }>
  ), [fields, moduleConfig, recentFieldKeys, record]);

  const fullDetailFields = useMemo(() => (
    fields.filter((field: any) => (
      hasValue(field)
      && !['id', 'assignee_role_id', 'assignee_type'].includes(String(field?.key || ''))
    ))
  ), [fields, record]);

  const locationField = useMemo(
    () => fields.find((field: any) => field?.type === FieldType.LOCATION && hasValue(field)) || null,
    [fields, record],
  );

  const openFullRecord = () => {
    if (!recordId) return;
    const path = `/${moduleId}/${recordId}`;
    if (onNavigate) {
      onNavigate(path);
      onClose();
      return;
    }
    window.open(path, '_blank');
    onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      centered
      destroyOnHidden
      width={isMobileViewport ? 'calc(100vw - 1rem)' : 920}
      zIndex={overlayZIndex}
      className="quick-preview-modal"
      wrapClassName="quick-preview-modal-root"
      style={{ maxWidth: 'calc(100vw - 1rem)' }}
      styles={{
        body: { padding: 0, overflow: 'hidden' },
        content: { overflow: 'hidden', padding: 0, borderRadius: isMobileViewport ? 0 : 28 },
      }}
    >
      <div className="max-h-[calc(100vh-1rem)] overflow-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.96))] dark:bg-[linear-gradient(180deg,rgba(17,24,39,0.98),rgba(3,7,18,0.98))]">
        {loading ? (
          <div className="flex min-h-[20rem] items-center justify-center">
            <Spin />
          </div>
        ) : !record || !moduleConfig ? (
          <div className="flex min-h-[20rem] items-center justify-center">
            <Empty description="رکوردی برای نمایش پیدا نشد" />
          </div>
        ) : (
          <div className="p-3 sm:p-5">
            <div className="overflow-hidden rounded-[1.75rem] border border-gray-200/80 bg-white/95 shadow-sm dark:border-gray-800 dark:bg-[#111827]/95">
              <div className="h-1.5 bg-gradient-to-r from-[rgba(var(--brand-500-rgb),1)] to-[rgba(var(--brand-700-rgb),1)]" />

              <div className="grid gap-5 p-4 sm:grid-cols-[18rem_minmax(0,1fr)] sm:p-5">
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-[1.25rem] border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900">
                    {previewImageUrl ? (
                      <img src={previewImageUrl} alt={previewTitle} className="h-56 w-full object-cover sm:h-[18rem]" />
                    ) : (
                      <div className="flex h-56 items-center justify-center text-gray-400 dark:text-gray-600 sm:h-[18rem]">
                        <EnvironmentOutlined className="text-4xl" />
                      </div>
                    )}
                  </div>

                  <div className="rounded-[1.25rem] border border-gray-200 bg-gray-50/90 p-3 dark:border-gray-800 dark:bg-white/5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {statusMeta ? (
                        <Tag
                          className="!m-0 !rounded-full !border-0 !px-3 !py-1 !text-xs !font-bold"
                          style={{ backgroundColor: `${statusMeta.color}22`, color: statusMeta.color }}
                        >
                          {statusMeta.label}
                        </Tag>
                      ) : null}
                      {assigneeMeta ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm dark:bg-white/10 dark:text-gray-200">
                          {assigneeMeta.type === 'role' ? <TeamOutlined /> : <UserOutlined />}
                          {assigneeMeta.title}: {assigneeMeta.label}
                        </span>
                      ) : null}
                    </div>

                    {locationField ? (
                      <div className="text-xs text-gray-600 dark:text-gray-300">
                        <div className="mb-1 font-semibold text-gray-500 dark:text-gray-400">{getFieldLabelFa(locationField, { moduleId, fallback: 'location' })}</div>
                        <div className="break-words leading-6">{formatFieldValue(locationField)}</div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="min-w-0 space-y-4">
                  <div className="rounded-[1.5rem] border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#0f172a]">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-2xl font-black text-gray-800 dark:text-white">{previewTitle}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{moduleConfig?.titles?.fa || moduleId}</div>
                      </div>
                      <Button type="link" icon={<ArrowRightOutlined />} onClick={openFullRecord}>
                        جزئیات کامل
                      </Button>
                    </div>

                    {headerFields.length > 0 ? (
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {headerFields.map((field: any) => (
                          <div key={field.key} className="rounded-2xl border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-white/5">
                            <div className="mb-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                              {getFieldLabelFa(field, { moduleId, fallback: field.key })}
                            </div>
                            <div className="break-words text-sm font-bold text-gray-800 dark:text-gray-100">
                              {formatFieldValue(field)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {keyFields.length > 0 ? (
                    <section className="rounded-[1.5rem] border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#0f172a]">
                      <div className="mb-3 text-sm font-black text-gray-800 dark:text-gray-100">فیلدهای کلیدی</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {keyFields.map((field: any) => (
                          <div key={field.key} className="rounded-2xl border border-[rgba(var(--brand-200-rgb),0.45)] bg-[rgba(var(--brand-50-rgb),0.55)] p-3 dark:border-[rgba(var(--brand-300-rgb),0.18)] dark:bg-[#111827]">
                            <div className="mb-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                              {getFieldLabelFa(field, { moduleId, fallback: field.key })}
                            </div>
                            <div className="break-words text-sm font-bold text-gray-800 dark:text-gray-100">
                              {formatFieldValue(field)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {blockSections.map((section) => (
                    <section key={section.id} className="rounded-[1.5rem] border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#0f172a]">
                      <div className="mb-3 text-sm font-black text-gray-800 dark:text-gray-100">{section.title}</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {section.fields.map((field: any) => (
                          <div key={`${section.id}-${field.key}`} className="rounded-2xl border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-white/5">
                            <div className="mb-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                              {getFieldLabelFa(field, { moduleId, fallback: field.key })}
                            </div>
                            <div className="break-words text-sm font-bold text-gray-800 dark:text-gray-100">
                              {formatFieldValue(field)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}

                  <section className="rounded-[1.5rem] border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#0f172a]">
                    <div className="mb-3 text-sm font-black text-gray-800 dark:text-gray-100">جزئیات کامل</div>
                    <div className="space-y-2">
                      {fullDetailFields.map((field: any) => (
                        <div
                          key={`full-${field.key}`}
                          className="grid gap-2 rounded-2xl border border-gray-100 bg-gray-50/70 px-3 py-2 text-sm dark:border-gray-800 dark:bg-white/5 sm:grid-cols-[11rem_minmax(0,1fr)]"
                        >
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                            {getFieldLabelFa(field, { moduleId, fallback: field.key })}
                          </div>
                          <div className="break-words font-medium text-gray-800 dark:text-gray-100">
                            {formatFieldValue(field)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default MapRecordModal;
