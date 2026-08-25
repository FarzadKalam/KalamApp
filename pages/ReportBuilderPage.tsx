import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Empty,
  Input,
  InputNumber,
  Select,
  Spin,
  Switch,
  Typography,
} from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import WorkflowConditionsGroup from '../components/workflows/WorkflowConditionsGroup';
import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import { fetchCurrentUserRoleContext, resolveReportsAccessPermissions } from '../utils/permissions';
import AdaptiveIdentityPicker from '../components/AdaptiveIdentityPicker';
import PersianDatePicker from '../components/PersianDatePicker';
import {
  clampReportRowLimit,
  createDefaultReportConfig,
  getGroupableReportFields,
  getReportConditionFields,
  getReportModuleOptions,
  getReportableFields,
  getSecondaryModuleOptions,
  getSummableReportFields,
  isReportTableFieldKey,
  isReportTableRelationFieldKey,
  normalizeReportConfig,
  type ReportDefinitionRecord,
  type ReportCalculationMode,
  type ReportOutputMode,
  type ReportReferenceMetric,
  type ReportGroupingDefinition,
  type ReportScheduleChannel,
  type ReportScheduleUnit,
} from '../utils/reporting';
import { getSurveyTemplateScopedIdFromConditions, loadSurveyTemplateDefinition, normalizeSurveyTemplateSnapshot } from '../utils/surveyTemplates';
import { loadWorkflowConditionEditorOptions } from '../utils/workflowConditionOptions';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import type { PermissionMap } from '../utils/permissions';
import { resolveOverlayPopupContainer } from '../utils/popupContainer';
import { loadTaskReportProcessRuntimeCatalog } from '../utils/reportTaskProcessFields';
import { FieldType } from '../types';
import { parseIdentityToken } from '../utils/identityDirectory';

const { Title, Text } = Typography;

type WizardStep = 0 | 1 | 2 | 3;
type UserOption = { label: string; value: string };

const STEPS = ['اطلاعات اولیه', 'ستون‌ها', 'فیلترها', 'تحلیل و خروجی'];

const isMissingReportsTableError = (error: any) => {
  const text = String(error?.message || error?.details || error || '').toLowerCase();
  return text.includes('report_definitions') && (text.includes('does not exist') || text.includes('could not find'));
};

const parseReferenceMetricValue = (value: unknown): ReportReferenceMetric | null => {
  const raw = String(value || '');
  const separator = raw.indexOf('::');
  if (separator <= 0 || separator >= raw.length - 2) return null;
  return { report_id: raw.slice(0, separator), metric_key: raw.slice(separator + 2) };
};

const uniqueReferenceMetrics = (metrics: ReportReferenceMetric[]) => {
  const seen = new Set<string>();
  return metrics.filter((metric) => {
    const key = `${String(metric?.report_id || '')}::${String(metric?.metric_key || '')}`;
    if (!metric?.report_id || !metric?.metric_key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const ReportBuilderPage: React.FC = () => {
  const { reportId } = useParams();
  const isEditMode = !!reportId;
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setupMissing, setSetupMissing] = useState(false);
  const [canUseBuilder, setCanUseBuilder] = useState(true);
  const [step, setStep] = useState<WizardStep>(0);
  const [permissions, setPermissions] = useState<PermissionMap | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mainModuleId, setMainModuleId] = useState('');
  const [calculationMode, setCalculationMode] = useState<ReportCalculationMode>('normal');
  const [referenceReportIds, setReferenceReportIds] = useState<string[]>([]);
  const [increaseMetrics, setIncreaseMetrics] = useState<ReportReferenceMetric[]>([]);
  const [decreaseMetrics, setDecreaseMetrics] = useState<ReportReferenceMetric[]>([]);
  const [percentageTargetMetric, setPercentageTargetMetric] = useState<ReportReferenceMetric | null>(null);
  const [percentageTotalMetric, setPercentageTotalMetric] = useState<ReportReferenceMetric | null>(null);
  const [referenceReports, setReferenceReports] = useState<ReportDefinitionRecord[]>([]);
  const [viewerUserIds, setViewerUserIds] = useState<string[]>([]);
  const [viewerRoleIds, setViewerRoleIds] = useState<string[]>([]);
  const [showInMembersDashboard, setShowInMembersDashboard] = useState(false);
  const [secondaryModuleIds, setSecondaryModuleIds] = useState<string[]>([]);
  const [rowLimit, setRowLimit] = useState(200);
  const [columns, setColumns] = useState<string[]>([]);
  const [conditionsAll, setConditionsAll] = useState<any[]>([]);
  const [conditionsAny, setConditionsAny] = useState<any[]>([]);
  const [groupBys, setGroupBys] = useState<ReportGroupingDefinition[]>([]);
  const [metricType, setMetricType] = useState<'count' | 'sum' | 'avg'>('count');
  const [metricFields, setMetricFields] = useState<string[]>([]);
  const [chartDimensionField, setChartDimensionField] = useState<string | null>(null);
  const [outputModes, setOutputModes] = useState<ReportOutputMode[]>(['table', 'bar']);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleIntervalValue, setScheduleIntervalValue] = useState(1);
  const [scheduleIntervalUnit, setScheduleIntervalUnit] = useState<ReportScheduleUnit>('day');
  const [scheduleIntervalAt, setScheduleIntervalAt] = useState('');
  const [scheduleFirstRunAt, setScheduleFirstRunAt] = useState<string | null>(null);
  const [scheduleRecipientIds, setScheduleRecipientIds] = useState<string[]>([]);
  const [scheduleChannels, setScheduleChannels] = useState<ReportScheduleChannel[]>(['note']);
  const [scheduleBotGroupIds, setScheduleBotGroupIds] = useState<string[]>([]);
  const [surveyTemplateSnapshot, setSurveyTemplateSnapshot] = useState(() => normalizeSurveyTemplateSnapshot({}));
  const [taskProcessFields, setTaskProcessFields] = useState<any[]>([]);
  const [taskProcessStatusOptions, setTaskProcessStatusOptions] = useState<any[]>([]);

  const [dynamicOptions, setDynamicOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});
  const [botGroupOptions, setBotGroupOptions] = useState<UserOption[]>([]);
  const popupContainer = useCallback((triggerNode?: HTMLElement | null) => resolveOverlayPopupContainer(triggerNode), []);

  const moduleOptions = useMemo(() => getReportModuleOptions(permissions), [permissions]);
  const secondaryModuleOptions = useMemo(() => getSecondaryModuleOptions(mainModuleId, permissions), [mainModuleId, permissions]);
  const scopedSurveyTemplateId = useMemo(
    () => (
      mainModuleId === 'surveys'
        ? getSurveyTemplateScopedIdFromConditions(conditionsAll, conditionsAny)
        : null
    ),
    [conditionsAll, conditionsAny, mainModuleId]
  );
  const reportableFields = useMemo(
    () => getReportableFields(mainModuleId, secondaryModuleIds, surveyTemplateSnapshot, taskProcessFields).map((field) => (
      (field as any).__reportTaskRuntimeStatus === true
        ? { ...field, options: [...(field.options || []), ...taskProcessStatusOptions] }
        : field
    )),
    [mainModuleId, secondaryModuleIds, surveyTemplateSnapshot, taskProcessFields, taskProcessStatusOptions]
  );
  const conditionFields = useMemo(
    () => getReportConditionFields(mainModuleId, secondaryModuleIds, surveyTemplateSnapshot, taskProcessFields).map((field) => (
      (field as any).__reportTaskRuntimeStatus === true
        ? { ...field, options: [...(field.options || []), ...taskProcessStatusOptions] }
        : field
    )),
    [mainModuleId, secondaryModuleIds, surveyTemplateSnapshot, taskProcessFields, taskProcessStatusOptions]
  );
  const groupableFields = useMemo(
    () => getGroupableReportFields(mainModuleId, secondaryModuleIds, surveyTemplateSnapshot, taskProcessFields),
    [mainModuleId, secondaryModuleIds, surveyTemplateSnapshot, taskProcessFields]
  );
  const summableFields = useMemo(
    () => getSummableReportFields(mainModuleId, secondaryModuleIds, surveyTemplateSnapshot, taskProcessFields),
    [mainModuleId, secondaryModuleIds, surveyTemplateSnapshot, taskProcessFields]
  );
  const selectedReferenceReports = useMemo(
    () => referenceReports.filter((report) => referenceReportIds.includes(String(report.id))),
    [referenceReportIds, referenceReports]
  );
  const referenceMetricOptions = useMemo(() => selectedReferenceReports.flatMap((report) => {
    const config = normalizeReportConfig(report.config);
    const moduleFields = getReportableFields(String(report.module_id || ''), config.secondary_module_ids);
    const fieldMap = new Map(moduleFields.map((field) => [field.key, field]));
    const metrics = config.metric_type === 'sum'
      ? config.metric_fields.map((fieldKey) => ({
          key: fieldKey,
          label: `${config.metric_type === 'avg' ? 'میانگین' : 'جمع'} ${fieldMap.get(fieldKey)?.labels?.fa || fieldKey}`,
        }))
      : config.metric_type === 'count' ? [{ key: '__count', label: 'تعداد رکوردها' }] : [];
    return metrics.map((metric) => ({
      value: `${report.id}::${metric.key}`,
      label: `${report.name} — ${metric.label}`,
      reportId: String(report.id),
      metricKey: metric.key,
    }));
  }), [selectedReferenceReports]);
  const compositeGroupOptions = useMemo(() => {
    if (selectedReferenceReports.length === 0) return [];
    const fieldLists = selectedReferenceReports.map((report) => {
      const config = normalizeReportConfig(report.config);
      return getGroupableReportFields(String(report.module_id || ''), config.secondary_module_ids);
    });
    const firstFields = fieldLists[0] || [];
    const shared = firstFields.filter((field) => fieldLists.every((list) => list.some((candidate) => candidate.key === field.key && candidate.type === field.type)));
    return [
      { label: 'زمان گزارش‌ها', value: '__report_date__' },
      ...shared.map((field) => ({ label: field.labels?.fa || field.key, value: field.key })),
    ];
  }, [selectedReferenceReports]);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from('report_definitions')
      .select('id,name,description,module_id,report_type,config,is_active,updated_at')
      .eq('is_active', true)
      .order('name')
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setReferenceReports((data || []).filter((item: any) => normalizeReportConfig(item.config).calculation_mode === 'normal') as ReportDefinitionRecord[]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (mainModuleId !== 'tasks') {
      setTaskProcessFields([]);
      setTaskProcessStatusOptions([]);
      return () => { cancelled = true; };
    }
    void loadTaskReportProcessRuntimeCatalog(supabase)
      .then((catalog) => {
        if (cancelled) return;
        setTaskProcessFields([...catalog.fields, ...catalog.linkedFields]);
        setTaskProcessStatusOptions(catalog.statusOptions);
      })
      .catch(() => {
        if (cancelled) return;
        setTaskProcessFields([]);
        setTaskProcessStatusOptions([]);
      });
    return () => { cancelled = true; };
  }, [mainModuleId]);

  useEffect(() => {
    let cancelled = false;
    if (mainModuleId !== 'surveys' || !scopedSurveyTemplateId) {
      setSurveyTemplateSnapshot(normalizeSurveyTemplateSnapshot({}));
      return () => {
        cancelled = true;
      };
    }
    const run = async () => {
      try {
        const definition = await loadSurveyTemplateDefinition(supabase, scopedSurveyTemplateId);
        if (cancelled) return;
        setSurveyTemplateSnapshot(normalizeSurveyTemplateSnapshot(definition?.snapshot || {}));
      } catch {
        if (!cancelled) {
          setSurveyTemplateSnapshot(normalizeSurveyTemplateSnapshot({}));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [mainModuleId, scopedSurveyTemplateId]);

  const resetSecondarySelections = useCallback(() => {
    setSecondaryModuleIds([]);
    setColumns((current) => current.filter((key) => !String(key || '').includes('__related__') && !isReportTableFieldKey(key) && !isReportTableRelationFieldKey(key)));
    setConditionsAll((current) => current.filter((item) => !String(item?.field || '').includes('__related__') && !isReportTableFieldKey(item?.field) && !isReportTableRelationFieldKey(item?.field)));
    setConditionsAny((current) => current.filter((item) => !String(item?.field || '').includes('__related__') && !isReportTableFieldKey(item?.field) && !isReportTableRelationFieldKey(item?.field)));
    setGroupBys((current) => current.filter((item) => !String(item?.field || '').includes('__related__') && !isReportTableFieldKey(item?.field) && !isReportTableRelationFieldKey(item?.field)));
    setMetricFields((current) => current.filter((key) => !String(key || '').includes('__related__') && !isReportTableFieldKey(key) && !isReportTableRelationFieldKey(key)));
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('erp:breadcrumb', {
        detail: { moduleTitle: 'ابزارها', moduleId: 'reports', recordName: isEditMode ? 'ویرایش گزارش' : 'گزارش جدید' },
      })
    );
    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, [isEditMode]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const botGroupsResult = await supabase
          .from('counterparty_bot_groups')
          .select('id, group_title, channel_type, status')
          .eq('status', 'active')
          .order('group_title');
        if (cancelled) return;
        setBotGroupOptions(
          (botGroupsResult.data || []).map((group: any) => ({
            label: `${String(group?.group_title || 'گروه بات').trim()} (${String(group?.channel_type || '').trim() || 'بات'})`,
            value: String(group?.id || '').trim(),
          })).filter((item) => item.value)
        );
      } catch {
        if (!cancelled) {
          setBotGroupOptions([]);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mainModuleId) {
      setDynamicOptions({});
      setRelationOptions({});
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const loaded = await loadWorkflowConditionEditorOptions(mainModuleId, conditionFields);
        if (cancelled) return;
        setDynamicOptions(loaded.dynamicOptions);
        setRelationOptions(loaded.relationOptions);
      } catch {
        if (!cancelled) {
          setDynamicOptions({});
          setRelationOptions({});
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [conditionFields, mainModuleId]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const roleContext = await fetchCurrentUserRoleContext(supabase);
      const access = resolveReportsAccessPermissions(roleContext.permissions);
      setCanUseBuilder(access.canUseBuilder);
      setPermissions(roleContext.permissions);
      if (!access.canUseBuilder) {
        setLoading(false);
        return;
      }

      if (!isEditMode || !reportId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('report_definitions')
        .select('id, name, description, module_id, config')
        .eq('id', reportId)
        .maybeSingle();
      if (error) throw error;

      const report = (data || null) as ReportDefinitionRecord | null;
      if (!report) {
        message.error('گزارش موردنظر پیدا نشد.');
        navigate('/reports');
        return;
      }

      const config = normalizeReportConfig(report.config);
      setName(String(report.name || ''));
      setDescription(String(report.description || ''));
      setCalculationMode(config.calculation_mode);
      setReferenceReportIds(config.reference_report_ids);
      setIncreaseMetrics(config.increase_metrics);
      setDecreaseMetrics(config.decrease_metrics);
      setPercentageTargetMetric(config.percentage_target_metric);
      setPercentageTotalMetric(config.percentage_total_metric);
      setViewerUserIds(config.viewer_user_ids);
      setViewerRoleIds(config.viewer_role_ids);
      setShowInMembersDashboard(config.show_in_members_dashboard);
      setMainModuleId(String(report.module_id || ''));
      setSecondaryModuleIds(config.secondary_module_ids);
      setRowLimit(config.row_limit);
      setColumns(config.columns);
      setConditionsAll(config.conditions_all);
      setConditionsAny(config.conditions_any);
      setGroupBys(config.group_bys);
      setMetricType(config.metric_type === 'sum' || config.metric_type === 'avg' ? config.metric_type : 'count');
      setMetricFields(config.metric_fields);
      setChartDimensionField(config.chart_dimension_field);
      setOutputModes(config.output_modes);
      setScheduleEnabled(config.schedule.enabled);
      setScheduleIntervalValue(config.schedule.interval_value);
      setScheduleIntervalUnit(config.schedule.interval_unit);
      setScheduleIntervalAt(config.schedule.interval_at);
      setScheduleFirstRunAt(config.schedule.first_run_at);
      setScheduleRecipientIds(config.schedule.recipient_user_ids);
      setScheduleChannels(config.schedule.delivery_channels);
      setScheduleBotGroupIds(config.schedule.bot_group_ids);
      setSetupMissing(false);
    } catch (error) {
      if (isMissingReportsTableError(error)) {
        setSetupMissing(true);
      } else {
        message.error('خواندن گزارش ناموفق بود.');
      }
    } finally {
      setLoading(false);
    }
  }, [isEditMode, message, navigate, reportId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const validateStep = useCallback(
    (targetStep: WizardStep) => {
      if (targetStep === 0) {
        if (!name.trim()) {
          message.error('نام گزارش الزامی است.');
          return false;
        }
        if (calculationMode === 'normal' && !mainModuleId) {
          message.error('ماژول اصلی را انتخاب کنید.');
          return false;
        }
        if (calculationMode !== 'normal' && referenceReportIds.length === 0) {
          message.error('حداقل یک گزارش مرجع انتخاب کنید.');
          return false;
        }
        if (scheduleEnabled) {
          if (scheduleRecipientIds.length === 0 && scheduleBotGroupIds.length === 0) {
            message.error('حداقل یک دریافت‌کننده برای ارسال دوره‌ای انتخاب کنید.');
            return false;
          }
          if (scheduleChannels.length === 0) {
            message.error('حداقل یک روش ارسال انتخاب کنید.');
            return false;
          }
          if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduleIntervalAt)) {
            message.error('ساعت ارسال دوره‌ای را مشخص کنید.');
            return false;
          }
          if (scheduleFirstRunAt) {
            const firstRun = new Date(scheduleFirstRunAt);
            if (Number.isNaN(firstRun.getTime())) {
              message.error('زمان اولین ارسال معتبر نیست.');
              return false;
            }
          }
        }
      }
      if (targetStep === 1 && calculationMode === 'normal' && columns.length === 0) {
        message.error('حداقل یک ستون برای گزارش انتخاب کنید.');
        return false;
      }
      if (targetStep === 3) {
        if (outputModes.length === 0) {
          message.error('حداقل یک خروجی برای نمایش گزارش انتخاب کنید.');
          return false;
        }
        if (outputModes.some((mode) => mode !== 'table') && groupBys.length === 0) {
          message.error('برای نمودار، حداقل یک گروه‌بندی انتخاب کنید.');
          return false;
        }
        if (groupBys.some((item) => !item.field)) {
          message.error('همه‌ی گروه‌بندی‌ها باید فیلد معتبر داشته باشند.');
          return false;
        }
        if (calculationMode === 'difference' && (increaseMetrics.length === 0 || decreaseMetrics.length === 0)) {
          message.error('حداقل یک مقدار افزاینده و یک مقدار کاهنده انتخاب کنید.');
          return false;
        }
        if (calculationMode === 'percentage' && (!percentageTargetMetric || !percentageTotalMetric)) {
          message.error('مقدار هدف و مقدار کل را انتخاب کنید.');
          return false;
        }
        if (calculationMode === 'normal' && (metricType === 'sum' || metricType === 'avg') && metricFields.length === 0) {
          message.error('برای معیار آماری انتخاب‌شده، حداقل یک فیلد عددی انتخاب کنید.');
          return false;
        }
        if (calculationMode !== 'normal' && groupBys.some((group) => !group.field || selectedReferenceReports.some((report) => !group.source_fields?.[String(report.id)]))) {
          message.error('برای هر گروه‌بندی، فیلد متناظر همه گزارش‌های مرجع را انتخاب کنید.');
          return false;
        }
      }
      return true;
    },
    [calculationMode, columns.length, decreaseMetrics.length, groupBys, increaseMetrics.length, mainModuleId, message, metricFields.length, name, outputModes.length, percentageTargetMetric, percentageTotalMetric, referenceReportIds.length, scheduleBotGroupIds.length, scheduleChannels.length, scheduleEnabled, scheduleFirstRunAt, scheduleIntervalAt, scheduleRecipientIds.length, selectedReferenceReports]
  );

  const handleSave = async () => {
    if (![0, 1, 3].every((item) => validateStep(item as WizardStep))) return;
    try {
      setSaving(true);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;
      const config = {
        ...createDefaultReportConfig(),
        calculation_mode: calculationMode,
        viewer_user_ids: viewerUserIds,
        viewer_role_ids: viewerRoleIds,
        show_in_members_dashboard: showInMembersDashboard,
        reference_report_ids: calculationMode === 'normal' ? [] : referenceReportIds,
        increase_metrics: calculationMode === 'difference' ? uniqueReferenceMetrics(increaseMetrics) : [],
        decrease_metrics: calculationMode === 'difference' ? uniqueReferenceMetrics(decreaseMetrics) : [],
        percentage_target_metric: calculationMode === 'percentage' ? percentageTargetMetric : null,
        percentage_total_metric: calculationMode === 'percentage' ? percentageTotalMetric : null,
        secondary_module_id: secondaryModuleIds[0] || null,
        secondary_module_ids: secondaryModuleIds,
        columns,
        conditions_all: conditionsAll,
        conditions_any: conditionsAny,
        row_limit: clampReportRowLimit(rowLimit),
        group_bys: groupBys.slice(0, 3),
        metric_type: calculationMode === 'normal' ? metricType : 'count',
        metric_fields: calculationMode === 'normal' && (metricType === 'sum' || metricType === 'avg') ? metricFields.slice(0, 4) : [],
        metric_subtract_fields: [],
        show_group_summaries: true,
        chart_dimension_field: chartDimensionField || groupBys[0]?.field || null,
        output_modes: outputModes,
        // نگه‌داشتن سازگاری برای کارت‌های گزارش و تنظیمات نسخه‌های پیشین.
        default_view: outputModes.length === 1 && outputModes[0] === 'table' ? 'table' : 'table_and_chart',
        schedule: {
          enabled: scheduleEnabled,
          interval_value: Math.max(1, Number(scheduleIntervalValue || 1)),
          interval_unit: scheduleIntervalUnit,
          interval_at: scheduleIntervalAt,
          first_run_at: scheduleFirstRunAt,
          module_label: calculationMode === 'normal' ? (MODULES[mainModuleId]?.titles?.fa || mainModuleId) : 'گزارش ترکیبی',
          recipient_user_ids: scheduleRecipientIds,
          bot_group_ids: scheduleBotGroupIds,
          delivery_channels: scheduleChannels,
        },
      };

      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        module_id: calculationMode === 'normal' ? mainModuleId : '__composite_report__',
        report_type: 'module_report',
        config,
        updated_by: userId,
      };

      if (isEditMode && reportId) {
        const { error } = await supabase.from('report_definitions').update(payload).eq('id', reportId);
        if (error) throw error;
        message.success('گزارش به‌روزرسانی شد.');
        navigate(`/reports/${reportId}`);
        return;
      }

      const { data, error } = await supabase
        .from('report_definitions')
        .insert([{ ...payload, created_by: userId }])
        .select('id')
        .single();
      if (error) throw error;
      message.success('گزارش جدید ثبت شد.');
      navigate(`/reports/${data.id}`);
    } catch {
      message.error('ذخیره گزارش ناموفق بود.');
    } finally {
      setSaving(false);
    }
  };

  const addGrouping = () => {
    const availableFields = calculationMode === 'normal'
      ? groupableFields.map((field) => ({ key: field.key }))
      : compositeGroupOptions.map((field) => ({ key: field.value }));
    if (groupBys.length >= 3 || availableFields.length === 0) return;
    const nextField = availableFields.find((field) => !groupBys.some((item) => item.field === field.key));
    setGroupBys((current) => [...current, { field: nextField?.key || '', direction: 'asc' }]);
  };

  const suggestedColumns = useMemo(() => reportableFields.slice(0, 8).map((field) => field.key), [reportableFields]);

  if (loading) {
    return <div className="flex h-[70vh] items-center justify-center"><Spin size="large" /></div>;
  }

  if (!canUseBuilder) {
    return <div className="flex h-[70vh] items-center justify-center"><Empty description="دسترسی به گزارش‌ساز ندارید" /></div>;
  }

  return (
    <div className="mx-auto max-w-[1680px] animate-fadeIn p-4 md:p-8">
      <div className="min-h-[70vh] rounded-[2rem] border border-gray-200 bg-white p-6 shadow-sm transition-colors dark:border-gray-800 dark:bg-[#1a1a1a]">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Title level={3} className="!mb-1">{isEditMode ? 'ویرایش گزارش' : 'گزارش جدید'}</Title>
            <Text className="text-gray-500">گزارش جدولی و آماری با ویزارد چندمرحله‌ای، شرط‌ساز reusable و پشتیبانی از ماژول فرعی</Text>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate('/reports')}>بازگشت</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} className="bg-leather-600 hover:!bg-leather-500" onClick={() => void handleSave()}>
              {isEditMode ? 'ذخیره تغییرات' : 'ثبت گزارش'}
            </Button>
          </div>
        </div>

        {setupMissing && (
          <Alert
            type="warning"
            showIcon
            className="mb-6"
            message="زیرساخت دیتابیس گزارشات هنوز اعمال نشده است"
            description="قبل از استفاده از گزارش‌ساز، migration مربوط به report_definitions را اجرا کنید."
          />
        )}

        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          {STEPS.map((title, index) => {
            const active = step === index;
            const done = step > index;
            return (
              <button
                key={title}
                type="button"
                onClick={() => {
                  if (index <= step || validateStep(step)) setStep(index as WizardStep);
                }}
                className={`rounded-2xl border px-4 py-4 text-right transition-colors ${active ? 'border-leather-500 bg-leather-600 text-white' : done ? 'border-leather-300 bg-leather-50 text-leather-800 dark:border-leather-700 dark:bg-leather-900/30 dark:text-leather-200' : 'border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-[#1c1c1c] dark:text-gray-200'}`}
              >
                <div className="text-xs opacity-80">مرحله {toPersianNumber(index + 1)}</div>
                <div className="mt-1 font-black">{title}</div>
              </button>
            );
          })}
        </div>

        {step === 0 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="mb-2 font-bold">نام گزارش</div>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: فروش تفکیک‌شده بازاریاب‌ها" />
              </div>
              <div>
                <div className="mb-2 font-bold">نوع گزارش</div>
                <Select className="w-full" value={calculationMode} options={[{ label: 'عادی', value: 'normal' }, { label: 'تفاضلی', value: 'difference' }, { label: 'درصدی', value: 'percentage' }]} onChange={(value) => {
                  const nextMode = value as ReportCalculationMode;
                  setCalculationMode(nextMode);
                  setGroupBys([]);
                  if (nextMode !== 'normal') {
                    setColumns([]); setConditionsAll([]); setConditionsAny([]); setMetricFields([]);
                  }
                }} />
              </div>
              {calculationMode === 'normal' ? <>
                <div>
                  <div className="mb-2 font-bold">ماژول اصلی</div>
                  <Select className="w-full" showSearch optionFilterProp="label" value={mainModuleId || undefined} options={moduleOptions} placeholder="انتخاب ماژول اصلی" onChange={(value) => { setMainModuleId(String(value || '')); resetSecondarySelections(); }} />
                </div>
                <div>
                  <div className="mb-2 font-bold">ماژول فرعی</div>
                  <Select className="w-full" mode="multiple" allowClear showSearch optionFilterProp="label" value={secondaryModuleIds} options={secondaryModuleOptions} placeholder="در صورت نیاز انتخاب کنید" onChange={(value) => { setSecondaryModuleIds((value || []).map((item) => String(item))); setColumns([]); setConditionsAll([]); setConditionsAny([]); setGroupBys([]); setMetricFields([]); }} />
                </div>
                <div>
                  <div className="mb-2 font-bold">حداکثر ردیف</div>
                  <InputNumber min={20} max={500} className="w-full persian-number" value={rowLimit} onChange={(value) => setRowLimit(clampReportRowLimit(value))} />
                </div>
              </> : <div className="md:col-span-2">
                <div className="mb-2 font-bold">گزارش‌های مرجع</div>
                <Select className="w-full" mode="multiple" showSearch optionFilterProp="label" value={referenceReportIds} options={referenceReports.filter((report) => String(report.id) !== String(reportId || '')).map((report) => ({ label: report.name, value: String(report.id) }))} placeholder="یک یا چند گزارش عادی را انتخاب کنید" onChange={(value) => {
                  const ids = (value || []).map((item) => String(item));
                  setReferenceReportIds(ids); setIncreaseMetrics((current) => current.filter((item) => ids.includes(item.report_id))); setDecreaseMetrics((current) => current.filter((item) => ids.includes(item.report_id))); setPercentageTargetMetric((current) => current && ids.includes(current.report_id) ? current : null); setPercentageTotalMetric((current) => current && ids.includes(current.report_id) ? current : null); setGroupBys([]);
                }} />
                <div className="mt-1 text-xs text-gray-500">فقط گزارش‌های عادیِ قابل‌دسترسی انتخاب می‌شوند؛ گزارش ترکیبی نمی‌تواند مرجع خودش باشد.</div>
              </div>}
            </div>

            <div>
              <div className="mb-2 font-bold">توضیحات</div>
              <Input.TextArea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="شرح کوتاه هدف گزارش" />
            </div>

            <div className="rounded-[1.5rem] border border-gray-200 p-4 dark:border-gray-700">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                <div className="font-black text-gray-800 dark:text-gray-100">اجازه مشاهده گزارش</div>
                <Checkbox checked={showInMembersDashboard} onChange={(event) => setShowInMembersDashboard(event.target.checked)}>
                  نمایش در داشبورد اعضا
                </Checkbox>
              </div>
              <div className="mb-3 text-sm text-gray-500">کاربران یا نقش‌های انتخاب‌شده، نتیجه کامل محاسبات این گزارش را می‌بینند؛ جزئیات خام ماژول‌ها همچنان با سطح دسترسی خودشان کنترل می‌شود. با فعال‌سازی گزینه داشبورد، همین خروجی فشرده به‌عنوان یک اسلاید برای اعضای مجاز نمایش داده می‌شود.</div>
              <AdaptiveIdentityPicker
                className="w-full"
                mode="multiple"
                scopes={['user', 'role']}
                valueMode="token"
                value={[...viewerUserIds.map((id) => `user:${id}`), ...viewerRoleIds.map((id) => `role:${id}`)]}
                placeholder="انتخاب کاربر یا نقش برای مشاهده گزارش"
                onChange={(value) => {
                  const tokens = (Array.isArray(value) ? value : []).map((item) => parseIdentityToken(item).token).filter((token): token is Exclude<typeof token, null> => token !== null);
                  setViewerUserIds(tokens.filter((token) => token.startsWith('user:')).map((token) => token.slice('user:'.length)));
                  setViewerRoleIds(tokens.filter((token) => token.startsWith('role:')).map((token) => token.slice('role:'.length)));
                }}
              />
            </div>

            <div className="rounded-[1.5rem] border border-gray-200 p-4 dark:border-gray-700">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-black text-gray-800 dark:text-gray-100">ارسال دوره‌ای</div>
                  <div className="text-sm text-gray-500">ارسال خودکار لینک داخلی گزارش به کاربران و گروه‌های انتخاب‌شده</div>
                </div>
                <Switch checked={scheduleEnabled} onChange={setScheduleEnabled} checkedChildren="فعال" unCheckedChildren="غیرفعال" />
              </div>
              {scheduleEnabled && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                    <InputNumber min={1} className="w-full persian-number" value={scheduleIntervalValue} onChange={(value) => setScheduleIntervalValue(Math.max(1, Number(value || 1)))} />
                    <Select className="w-full" value={scheduleIntervalUnit} onChange={(value) => setScheduleIntervalUnit(value as ReportScheduleUnit)} options={[{ label: 'ساعت', value: 'hour' }, { label: 'روز', value: 'day' }]} />
                  </div>
                  <div>
                    <div className="mb-2 font-bold">ساعت ارسال گزارش</div>
                    <Input
                      type="time"
                      className="w-full"
                      value={scheduleIntervalAt}
                      onChange={(event) => setScheduleIntervalAt(event.target.value)}
                    />
                    {scheduleIntervalUnit === 'hour' && <div className="mt-1 text-xs text-gray-500">در ارسال ساعتی، دقیقه انتخاب‌شده در هر ساعت اعمال می‌شود.</div>}
                  </div>
                  <div>
                    <div className="mb-2 font-bold">زمان اولین ارسال</div>
                    <PersianDatePicker
                      type="DATETIME"
                      value={scheduleFirstRunAt}
                      onChange={setScheduleFirstRunAt}
                      className="w-full"
                      placeholder="اختیاری؛ از زمان فعلی محاسبه می‌شود"
                      modalContainer={popupContainer}
                    />
                    <div className="mt-1 text-xs text-gray-500">پس از این زمان، گزارش در هر نوبت ابتدا اجرا و سپس ارسال می‌شود.</div>
                  </div>
                  <div>
                    <div className="mb-2 font-bold">روش‌های ارسال دوره‌ای گزارش</div>
                    <Checkbox.Group
                      value={scheduleChannels}
                      onChange={(value) => setScheduleChannels(value as ReportScheduleChannel[])}
                      options={[
                        { label: 'ایمیل', value: 'email' },
                        { label: 'یادداشت داخلی', value: 'note' },
                        { label: 'پیامک', value: 'sms' },
                        { label: 'گروه بات', value: 'bot_group' },
                      ]}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <AdaptiveIdentityPicker
                      className="w-full"
                      mode="multiple"
                      scopes={['user']}
                      valueMode="raw"
                      value={scheduleRecipientIds}
                      placeholder="یک یا چند کاربر را انتخاب کنید"
                      onChange={(value) => setScheduleRecipientIds((Array.isArray(value) ? value : []).map((item) => String(item)))}
                    />
                  </div>
                  {scheduleChannels.includes('bot_group') && (
                    <div className="md:col-span-2">
                      <Select
                        className="w-full"
                        mode="multiple"
                        showSearch
                        optionFilterProp="label"
                        value={scheduleBotGroupIds}
                        options={botGroupOptions}
                        placeholder="یک یا چند گروه بات را انتخاب کنید"
                        onChange={(value) => setScheduleBotGroupIds((value || []).map((item) => String(item)))}
                      />
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <Alert type="info" showIcon message="تنظیمات زمان‌بندی در گزارش ذخیره می‌شود. اجرای واقعی ارسال دوره‌ای به runner زمان‌بندی‌شده پروژه متصل خواهد شد." />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          calculationMode !== 'normal' ? <Alert type="info" showIcon message="بر اساس گزارش‌های مرجع" description="ستون‌های گزارش ترکیبی از خروجی‌های گزارش‌های مرجع ساخته می‌شوند." /> : <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-black text-gray-800 dark:text-gray-100">انتخاب ستون‌ها</div>
                <div className="text-sm text-gray-500">فیلد مسئول/بازاریاب و فیلدهای ماژول فرعی نیز در این لیست حاضر هستند</div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => setColumns(reportableFields.map((field) => field.key))}>انتخاب همه</Button>
                <Button onClick={() => setColumns(suggestedColumns)}>پیشنهاد سریع</Button>
              </div>
            </div>
            <Select
              className="w-full"
              mode="multiple"
              showSearch
              optionFilterProp="label"
              value={columns}
              options={reportableFields.map((field) => ({ label: field.labels?.fa || field.key, value: field.key }))}
              placeholder="ستون‌های گزارش را انتخاب کنید"
              onChange={(value) => setColumns((value || []).map((item) => String(item)))}
            />
          </div>
        )}

        {step === 2 && (
          calculationMode !== 'normal' ? <Alert type="info" showIcon message="بر اساس گزارش‌های مرجع" description="فیلترهای هر منبع در خود گزارش مرجع حفظ می‌شوند." /> : <div className="space-y-6">
            <div className="rounded-[1.5rem] border border-gray-200 p-4 dark:border-gray-700">
              <div className="mb-4 font-black text-gray-800 dark:text-gray-100">همه این شرط‌ها باید برقرار باشند</div>
              <WorkflowConditionsGroup
                value={conditionsAll}
                onChange={setConditionsAll}
                fields={conditionFields}
                dynamicOptions={dynamicOptions}
                relationOptions={relationOptions}
                overlayZIndexBase={1400}
                popupContainer={popupContainer}
              />
            </div>
            <div className="rounded-[1.5rem] border border-gray-200 p-4 dark:border-gray-700">
              <div className="mb-4 font-black text-gray-800 dark:text-gray-100">کافی است یکی از این شرط‌ها برقرار باشد</div>
              <WorkflowConditionsGroup
                value={conditionsAny}
                onChange={setConditionsAny}
                fields={conditionFields}
                dynamicOptions={dynamicOptions}
                relationOptions={relationOptions}
                overlayZIndexBase={1400}
                popupContainer={popupContainer}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="rounded-[1.5rem] border border-gray-200 p-4 dark:border-gray-700">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-black text-gray-800 dark:text-gray-100">گروه‌بندی</div>
                  <div className="text-sm text-gray-500">تا ۳ معیار گروه‌بندی با ترتیب صعودی یا نزولی</div>
                </div>
                <Button icon={<PlusOutlined />} onClick={addGrouping} disabled={groupBys.length >= 3}>افزودن گروه</Button>
              </div>
              <div className="space-y-3">
                {groupBys.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="بدون گروه‌بندی، گزارش فقط جدولی اجرا می‌شود" />}
                {groupBys.map((item, index) => (
                  <div key={`${item.field}-${index}`} className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_170px_180px_56px]">
                    <Select
                      className="w-full"
                      showSearch
                      optionFilterProp="label"
                      value={item.field || undefined}
                      options={(calculationMode === 'normal'
                        ? groupableFields.map((field) => ({ label: field.labels?.fa || field.key, value: field.key }))
                        : compositeGroupOptions
                      ).filter((field) => field.value === item.field || !groupBys.some((group, groupIndex) => group.field === field.value && groupIndex !== index))}
                      onChange={(value) => setGroupBys((current) => current.map((group, groupIndex) => groupIndex === index ? { ...group, field: String(value || ''), source_fields: {} } : group))}
                    />
                    {(item.field === '__report_date__' || ([FieldType.DATE, FieldType.DATETIME] as any[]).includes(groupableFields.find((field) => field.key === item.field)?.type)) ? (
                      <Select
                        className="w-full"
                        value={item.date_granularity || 'daily'}
                        options={[{ label: 'روزانه', value: 'daily' }, { label: 'هفتگی', value: 'weekly' }, { label: 'ماهانه', value: 'monthly' }, { label: 'فصلی', value: 'quarterly' }, { label: 'سالانه', value: 'yearly' }]}
                        onChange={(value) => setGroupBys((current) => current.map((group, groupIndex) => groupIndex === index ? { ...group, date_granularity: value } : group))}
                      />
                    ) : <div />}
                    <Select
                      className="w-full"
                      value={item.direction}
                      options={[{ label: 'صعودی', value: 'asc' }, { label: 'نزولی', value: 'desc' }]}
                      onChange={(value) => setGroupBys((current) => current.map((group, groupIndex) => groupIndex === index ? { ...group, direction: value as 'asc' | 'desc' } : group))}
                    />
                    <Button danger icon={<DeleteOutlined />} onClick={() => setGroupBys((current) => current.filter((_, groupIndex) => groupIndex !== index))} />
                    {calculationMode !== 'normal' && item.field && (
                      <div className="md:col-span-4 rounded-xl bg-gray-50 p-3 dark:bg-white/5">
                        <div className="mb-2 text-xs font-bold text-gray-600 dark:text-gray-300">فیلد متناظر در هر گزارش مرجع</div>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                          {selectedReferenceReports.map((report) => {
                            const refConfig = normalizeReportConfig(report.config);
                            const fields = item.field === '__report_date__'
                              ? getGroupableReportFields(String(report.module_id || ''), refConfig.secondary_module_ids).filter((field) => [FieldType.DATE, FieldType.DATETIME].includes(field.type))
                              : getGroupableReportFields(String(report.module_id || ''), refConfig.secondary_module_ids).filter((field) => field.key === item.field);
                            return <Select key={report.id} className="w-full" value={item.source_fields?.[String(report.id)] || undefined} options={fields.map((field) => ({ label: `${report.name}: ${field.labels?.fa || field.key}`, value: field.key }))} placeholder={`${report.name}: انتخاب فیلد`} onChange={(value) => setGroupBys((current) => current.map((group, groupIndex) => groupIndex === index ? { ...group, source_fields: { ...(group.source_fields || {}), [String(report.id)]: String(value || '') } } : group))} />;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-gray-200 p-4 dark:border-gray-700">
              <div className="mb-1 font-black text-gray-800 dark:text-gray-100">محاسبات گروهی و نمودار</div>
              <div className="mb-4 text-sm text-gray-500">
                این تنظیمات برای کارت‌های آماری، نمودار و ردیف جمع زیر هر گروه استفاده می‌شود.
              </div>
              <div className="space-y-4">
                {calculationMode === 'normal' ? <>
                  <Select className="w-full" value={metricType} options={[{ label: 'تعداد رکوردها', value: 'count' }, { label: 'جمع فیلدهای عددی/مبلغی', value: 'sum' }, { label: 'میانگین فیلدهای عددی/مبلغی', value: 'avg' }]} onChange={(value) => {
                    setMetricType(value as 'count' | 'sum' | 'avg');
                    if (value !== 'sum' && value !== 'avg') setMetricFields([]);
                  }} />
                {(metricType === 'sum' || metricType === 'avg') && (
                  <Select
                    className="w-full"
                    mode="multiple"
                    showSearch
                    optionFilterProp="label"
                    value={metricFields}
                    options={summableFields.map((field) => ({ label: field.labels?.fa || field.key, value: field.key }))}
                    placeholder="یک یا چند فیلد عددی انتخاب کنید"
                    onChange={(value) => setMetricFields((value || []).map((item) => String(item)).slice(0, 4))}
                  />
                )}
                </> : calculationMode === 'difference' ? <>
                  <div className="font-bold">مقادیر افزاینده</div>
                  <Select className="w-full" mode="multiple" showSearch optionFilterProp="label" value={increaseMetrics.map((item) => `${item.report_id}::${item.metric_key}`)} options={referenceMetricOptions.filter((option) => !decreaseMetrics.some((item) => `${item.report_id}::${item.metric_key}` === option.value))} placeholder="نتیجه‌های اصلی گزارش‌های مرجع" onChange={(values) => setIncreaseMetrics(uniqueReferenceMetrics((values || []).map(parseReferenceMetricValue).filter((item): item is ReportReferenceMetric => !!item)))} />
                  <div className="font-bold">مقادیر کاهنده</div>
                  <Select className="w-full" mode="multiple" showSearch optionFilterProp="label" value={decreaseMetrics.map((item) => `${item.report_id}::${item.metric_key}`)} options={referenceMetricOptions.filter((option) => !increaseMetrics.some((item) => `${item.report_id}::${item.metric_key}` === option.value))} placeholder="نتیجه‌هایی که از مقدار افزاینده کم می‌شوند" onChange={(values) => setDecreaseMetrics(uniqueReferenceMetrics((values || []).map(parseReferenceMetricValue).filter((item): item is ReportReferenceMetric => !!item)))} />
                  <Alert type="info" showIcon message="خالص هر گروه از مجموع افزاینده‌ها منهای مجموع کاهنده‌ها به‌دست می‌آید." />
                </> : <>
                  <div className="font-bold">مقدار هدف (صورت)</div>
                  <Select className="w-full" showSearch optionFilterProp="label" value={percentageTargetMetric ? `${percentageTargetMetric.report_id}::${percentageTargetMetric.metric_key}` : undefined} options={referenceMetricOptions.filter((option) => option.value !== (percentageTotalMetric ? `${percentageTotalMetric.report_id}::${percentageTotalMetric.metric_key}` : ''))} placeholder="خروجی هدف را انتخاب کنید" onChange={(value) => setPercentageTargetMetric(parseReferenceMetricValue(value))} />
                  <div className="font-bold">مقدار کل (مخرج)</div>
                  <Select className="w-full" showSearch optionFilterProp="label" value={percentageTotalMetric ? `${percentageTotalMetric.report_id}::${percentageTotalMetric.metric_key}` : undefined} options={referenceMetricOptions.filter((option) => option.value !== (percentageTargetMetric ? `${percentageTargetMetric.report_id}::${percentageTargetMetric.metric_key}` : ''))} placeholder="خروجی کل را انتخاب کنید" onChange={(value) => setPercentageTotalMetric(parseReferenceMetricValue(value))} />
                  <Alert type="info" showIcon message="نرخ هر گروه از مقدار هدف تقسیم بر مقدار کل محاسبه می‌شود." />
                </>}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-gray-200 p-4 dark:border-gray-700">
              <div className="mb-2 font-black text-gray-800 dark:text-gray-100">خروجی‌های قابل نمایش</div>
              <div className="mb-4 text-xs text-gray-500">فقط خروجی‌های انتخاب‌شده در صفحهٔ گزارش نشان داده می‌شوند.</div>
              <div className="space-y-4">
                <Checkbox.Group
                  className="flex flex-wrap gap-x-5 gap-y-3"
                  value={outputModes}
                  options={[
                    { label: 'جدول', value: 'table' },
                    { label: 'نمودار ستونی', value: 'bar' },
                    { label: 'نمودار خطی', value: 'line' },
                    { label: 'نمودار دایره‌ای', value: 'pie' },
                  ]}
                  onChange={(values) => setOutputModes((values as ReportOutputMode[]).filter((value) => ['table', 'bar', 'pie', 'line'].includes(value)))}
                />
                {outputModes.some((mode) => mode !== 'table') && (
                  <Select
                    className="w-full"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    value={chartDimensionField || undefined}
                    options={calculationMode === 'normal' ? groupableFields.map((field) => ({ label: field.labels?.fa || field.key, value: field.key })) : compositeGroupOptions}
                    placeholder="معیار/عنوان نمودار؛ اگر خالی باشد گروه اول استفاده می‌شود"
                    onChange={(value) => setChartDimensionField(value ? String(value) : null)}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <Button icon={<ArrowRightOutlined />} disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1) as WizardStep)}>
            مرحله قبل
          </Button>
          <div className="text-sm text-gray-500">
            ماژول اصلی: <span className="font-bold text-gray-700 dark:text-gray-100">{MODULES[mainModuleId]?.titles?.fa || '-'}</span>
          </div>
          {step < 3 ? (
            <Button type="primary" icon={<ArrowLeftOutlined />} className="bg-leather-600 hover:!bg-leather-500" onClick={() => {
              if (validateStep(step)) setStep((current) => Math.min(3, current + 1) as WizardStep);
            }}>
              مرحله بعد
            </Button>
          ) : (
            <Button type="primary" icon={<SaveOutlined />} loading={saving} className="bg-leather-600 hover:!bg-leather-500" onClick={() => void handleSave()}>
              ثبت نهایی
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportBuilderPage;
