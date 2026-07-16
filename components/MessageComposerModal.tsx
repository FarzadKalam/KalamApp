import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Empty, Input, Modal, Tag } from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  LoadingOutlined,
  PlusOutlined,
  RobotOutlined,
  SaveOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import { listActiveNotificationBots, type NotificationBotChannel } from '../utils/channelSettings';
import { fetchCurrentUserRolePermissions, resolveReadyTextPermissions } from '../utils/permissions';
import {
  getMessageTemplateVariables,
  getMessageReadyTextScopeModuleId,
  getRecordBotTargets,
  getRecordPhoneCandidates,
  renderRecordTemplate,
  type MessageReadyTextScope,
} from '../utils/recordMessaging';
import { sendSmsViaGateway } from '../utils/smsGateway';
import { sendBotMessageViaGateway } from '../utils/botGateway';
import AdaptiveSelectField from './AdaptiveSelectField';
import PhoneDisplay from './PhoneDisplay';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { KALAM_POPUP_ROOT_Z_INDEX, resolveOverlayPopupContainer } from '../utils/popupContainer';
import { resolveTemplateOptionLabelMaps, type TemplateOptionLabelMaps } from '../utils/messageTemplateRenderer';
import { extractTemplateTokens } from '../shared/recordRuntime';
import { resolveWorkflowFieldValue } from '../utils/workflowRuntime';

const MESSAGE_COMPOSER_MODAL_Z_INDEX = KALAM_POPUP_ROOT_Z_INDEX + 100;

type ReadyTextRow = {
  id: string;
  title: string;
  content: string;
  moduleId: string | null;
};

type MessageComposerModalProps = {
  open: boolean;
  onCancel: () => void;
  mode: 'sms' | 'bot' | 'template';
  moduleId?: string | null;
  record?: Record<string, any> | null;
  initialPhone?: string | null;
  smsRecipients?: string[];
  templateOnlyTitle?: string;
  onApplyTemplate?: (value: string) => void;
  onInsertVariable?: (token: string) => void;
  templateVariableOptions?: Array<{ key: string; label: string; token: string }>;
  readyTextScope?: MessageReadyTextScope;
  zIndex?: number;
};

const MessageComposerModal: React.FC<MessageComposerModalProps> = ({
  open,
  onCancel,
  mode,
  moduleId,
  record,
  initialPhone,
  smsRecipients,
  templateOnlyTitle,
  onApplyTemplate,
  onInsertVariable,
  templateVariableOptions,
  readyTextScope = 'module',
  zIndex,
}) => {
  const { message: msg } = App.useApp();
  const messageInputRef = useRef<any>(null);
  const [messageText, setMessageText] = useState('');
  const [selectedVariable, setSelectedVariable] = useState<string | undefined>(undefined);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [selectedBotChannel, setSelectedBotChannel] = useState<NotificationBotChannel | undefined>(undefined);
  const [sending, setSending] = useState(false);

  const [readyTextsLoading, setReadyTextsLoading] = useState(false);
  const [readyTexts, setReadyTexts] = useState<ReadyTextRow[]>([]);
  const [templateOptionLabelMaps, setTemplateOptionLabelMaps] = useState<TemplateOptionLabelMaps>({});
  const [addingReadyText, setAddingReadyText] = useState(false);
  const [newReadyTextTitle, setNewReadyTextTitle] = useState('');
  const [newReadyTextContent, setNewReadyTextContent] = useState('');
  const [editingReadyTextId, setEditingReadyTextId] = useState<string | null>(null);
  const [editingReadyTextTitle, setEditingReadyTextTitle] = useState('');
  const [editingReadyTextContent, setEditingReadyTextContent] = useState('');
  const [updatingReadyText, setUpdatingReadyText] = useState(false);
  const [deletingReadyTextId, setDeletingReadyTextId] = useState<string | null>(null);
  const [readyTextPermissions, setReadyTextPermissions] = useState({
    canView: true,
    canAdd: true,
    canEdit: true,
    canDelete: true,
  });
  const [loadedRecord, setLoadedRecord] = useState<Record<string, any> | null>(null);
  const [resolvedTemplateRecord, setResolvedTemplateRecord] = useState<Record<string, any>>({});

  const [activeBotsLoading, setActiveBotsLoading] = useState(false);
  const [activeBots, setActiveBots] = useState<Array<{ channel: NotificationBotChannel; label: string }>>([]);

  const moduleConfig = moduleId ? MODULES[moduleId] : null;
  const effectiveRecord = useMemo(() => loadedRecord || record || {}, [loadedRecord, record]);
  const buildResolvedTemplateRecord = useCallback(async (template: string) => {
    const nextRecord = { ...effectiveRecord };
    if (!moduleId) return nextRecord;
    await Promise.all(extractTemplateTokens(template).map(async (fieldKey) => {
      if (Object.prototype.hasOwnProperty.call(nextRecord, fieldKey)) return;
      nextRecord[fieldKey] = await resolveWorkflowFieldValue({
        fieldKey,
        currentRecord: effectiveRecord,
        moduleId,
      }).catch(() => null);
    }));
    return nextRecord;
  }, [effectiveRecord, moduleId]);
  const scopedModuleId = getMessageReadyTextScopeModuleId(moduleId, readyTextScope);
  const readyTextCategoryLabel = readyTextScope === 'ai'
    ? 'هوش مصنوعی'
    : readyTextScope === 'workflow_automation'
      ? 'گردش‌کار و اتوماسیون'
      : (moduleConfig?.titles?.fa || 'پیام‌های عمومی');
  const readyTextCategoryDescription = readyTextScope === 'ai'
    ? 'این پرامپت‌ها فقط در بخش‌های هوش مصنوعی نمایش داده می‌شوند.'
    : readyTextScope === 'workflow_automation'
      ? 'این پیام‌ها بین همه اکشن‌های گردش‌کارها و اتوماسیون‌ها مشترک هستند.'
      : moduleConfig?.titles?.fa
        ? `این پیام‌ها فقط برای ماژول «${moduleConfig.titles.fa}» نمایش داده می‌شوند.`
        : 'این پیام‌ها فقط در بخش‌های عمومیِ بدون ماژول نمایش داده می‌شوند.';
  const isTemplateMode = mode === 'template';
  const isBulkSmsMode = mode === 'sms' && Array.isArray(smsRecipients) && smsRecipients.length > 0;
  const modalZIndex = Math.max(
    typeof zIndex === 'number' ? zIndex : MESSAGE_COMPOSER_MODAL_Z_INDEX,
    MESSAGE_COMPOSER_MODAL_Z_INDEX
  );

  const phoneOptions = useMemo(
    () =>
      (isBulkSmsMode
        ? Array.from(new Set((smsRecipients || []).map((value) => String(value || '').trim()).filter(Boolean)))
        : getRecordPhoneCandidates(moduleId, effectiveRecord, initialPhone)
      ).map((value) => ({
        label: <PhoneDisplay value={value} size="md" className="w-full" />,
        value,
        searchText: String(value || '').toLowerCase(),
      })),
    [effectiveRecord, initialPhone, isBulkSmsMode, moduleId, smsRecipients]
  );

  const botTargets = useMemo(() => getRecordBotTargets(effectiveRecord), [effectiveRecord]);

  const availableBotOptions = useMemo(() => {
    return activeBots
      .filter((item) => Boolean(botTargets[item.channel]))
      .map((item) => ({
        label: item.label,
        value: item.channel,
        searchText: String(item.label || '').toLowerCase(),
      }));
  }, [activeBots, botTargets]);

  const variableOptions = useMemo(() => {
    const optionsByToken = new Map<string, { label: string; value: string; searchText: string }>();
    [
      ...getMessageTemplateVariables(moduleId, effectiveRecord),
      ...(Array.isArray(templateVariableOptions) ? templateVariableOptions : []),
    ].forEach((item) => {
      const token = String(item?.token || '').trim();
      const key = String(item?.key || '').trim();
      const label = String(item?.label || key || token).trim();
      if (!token || optionsByToken.has(token)) return;
      optionsByToken.set(token, {
        label,
        value: token,
        searchText: `${label} ${key} ${token}`.toLowerCase(),
      });
    });
    return Array.from(optionsByToken.values());
  }, [effectiveRecord, moduleId, templateVariableOptions]);

  const selectPopupContainer = (node?: HTMLElement | null) => resolveOverlayPopupContainer(node);
  const commonSelectFilter = (input: string, option?: { label?: unknown; searchText?: unknown }) =>
    String(option?.searchText || option?.label || '')
      .toLowerCase()
      .includes(String(input || '').toLowerCase());
  const commonSelectProps = {
    showSearch: true,
    optionFilterProp: 'searchText' as const,
    filterOption: commonSelectFilter as any,
    getPopupContainer: selectPopupContainer,
    modalContainer: selectPopupContainer,
    popupMatchSelectWidth: false,
    listHeight: 240,
    virtual: false,
    overlayZIndexBase: modalZIndex + 100,
  };

  useEffect(() => {
    if (!open) {
      setTemplateOptionLabelMaps({});
      return;
    }

    let cancelled = false;
    resolveTemplateOptionLabelMaps(supabase, messageText, moduleId, resolvedTemplateRecord)
      .then((maps) => {
        if (!cancelled) setTemplateOptionLabelMaps(maps);
      })
      .catch((error) => {
        console.warn('Could not load message template dynamic options', error);
        if (!cancelled) setTemplateOptionLabelMaps({});
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedTemplateRecord, open, messageText, moduleId]);

  useEffect(() => {
    let cancelled = false;
    if (!open) {
      setResolvedTemplateRecord(effectiveRecord);
      return () => { cancelled = true; };
    }
    void buildResolvedTemplateRecord(messageText).then((nextRecord) => {
      if (!cancelled) setResolvedTemplateRecord(nextRecord);
    });
    return () => { cancelled = true; };
  }, [buildResolvedTemplateRecord, effectiveRecord, messageText, open]);

  const renderedPreview = useMemo(
    () => renderRecordTemplate(messageText, resolvedTemplateRecord, moduleId, { optionLabelMaps: templateOptionLabelMaps }),
    [messageText, resolvedTemplateRecord, moduleId, templateOptionLabelMaps]
  );

  useEffect(() => {
    if (!open) {
      setLoadedRecord(null);
      return;
    }
    const tableName = String((moduleConfig as any)?.table || '').trim();
    const recordId = String(record?.id || '').trim();
    if (!tableName || !recordId) {
      setLoadedRecord(null);
      return;
    }
    const hasOnlyId = Object.keys(record || {}).filter((key) => key !== 'id').length === 0;
    if (!hasOnlyId) {
      setLoadedRecord(record || null);
      return;
    }

    let cancelled = false;
    supabase
      .from(tableName)
      .select('*')
      .eq('id', recordId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('Could not load message template record', error);
          setLoadedRecord(record || null);
          return;
        }
        setLoadedRecord(data || record || null);
      });

    return () => {
      cancelled = true;
    };
  }, [moduleConfig, open, record]);

  useEffect(() => {
    let cancelled = false;

    const loadPermissions = async () => {
      try {
        const permissions = await fetchCurrentUserRolePermissions(supabase);
        if (!cancelled) {
          setReadyTextPermissions(resolveReadyTextPermissions(permissions, moduleId));
        }
      } catch {
        if (!cancelled) {
          setReadyTextPermissions(resolveReadyTextPermissions(null, moduleId));
        }
      }
    };

    void loadPermissions();
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  useEffect(() => {
    if (!open) return;
    setMessageText('');
    setSelectedVariable(undefined);
    setSelectedPhones(() => {
      if (!isBulkSmsMode) return [];
      return phoneOptions.map((item) => String(item.value || '')).filter(Boolean);
    });
    setSelectedPhone((prev) => {
      const current = String(prev || '').trim();
      if (current && phoneOptions.some((item) => item.value === current)) return current;
      return phoneOptions[0]?.value || '';
    });
    setSelectedBotChannel((prev) => {
      const current = prev ? String(prev) : '';
      if (current && availableBotOptions.some((item) => item.value === current)) {
        return current as NotificationBotChannel;
      }
      return availableBotOptions[0]?.value as NotificationBotChannel | undefined;
    });
  }, [open, phoneOptions, availableBotOptions, isBulkSmsMode]);

  const loadReadyTexts = async () => {
    if (!readyTextPermissions.canView) {
      setReadyTexts([]);
      return;
    }

    setReadyTextsLoading(true);
    try {
      let query = supabase
        .from('ready_texts')
        .select('id, title, content, module_id')
        .order('created_at', { ascending: false })
        .limit(200);

      query = query.eq('module_id', scopedModuleId);

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || [])
        .map((row: any) => ({
          id: String(row?.id || ''),
          title: String(row?.title || '').trim(),
          content: String(row?.content || ''),
          moduleId: row?.module_id ? String(row.module_id) : null,
        }))
        .filter((row) => row.id && row.content.trim());

      setReadyTexts(rows);
    } catch (error) {
      console.warn('Could not load message ready texts', error);
      msg.error('برای الگوهای پیام ابتدا migration جدول ready_texts را اجرا کنید.');
      setReadyTexts([]);
    } finally {
      setReadyTextsLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadReadyTexts();
  }, [open, scopedModuleId, readyTextPermissions.canView]);

  useEffect(() => {
    if (!open || mode !== 'bot') return;
    let cancelled = false;

    const loadBots = async () => {
      setActiveBotsLoading(true);
      try {
        const rows = await listActiveNotificationBots();
        if (!cancelled) {
          setActiveBots(rows);
        }
      } catch (error) {
        console.warn('Could not load active notification bots', error);
        if (!cancelled) {
          setActiveBots([]);
          msg.error('دریافت لیست بات‌های فعال ناموفق بود.');
        }
      } finally {
        if (!cancelled) setActiveBotsLoading(false);
      }
    };

    void loadBots();
    return () => {
      cancelled = true;
    };
  }, [mode, open]);

  const insertTokenIntoMessage = (token: string) => {
    if (!token) return;
    if (isTemplateMode) {
      onInsertVariable?.(String(token));
      return;
    }
    const nextValue = String(token);
    const textarea = messageInputRef.current?.resizableTextArea?.textArea as HTMLTextAreaElement | undefined;
    if (!textarea) {
      setMessageText((prev) => `${prev || ''}${nextValue}`);
      return;
    }

    const start = textarea.selectionStart ?? messageText.length;
    const end = textarea.selectionEnd ?? messageText.length;
    const updated = `${messageText.slice(0, start)}${nextValue}${messageText.slice(end)}`;
    setMessageText(updated);
    window.setTimeout(() => {
      textarea.focus();
      const caret = start + nextValue.length;
      textarea.setSelectionRange(caret, caret);
    }, 0);
  };

  const addReadyText = async () => {
    if (!readyTextPermissions.canAdd) {
      msg.warning('دسترسی افزودن الگوی پیام برای این ماژول فعال نیست.');
      return;
    }

    const content = String(newReadyTextContent || '').trim();
    const title = String(newReadyTextTitle || '').trim();
    if (!content) {
      msg.warning('متن الگوی پیام نمی‌تواند خالی باشد.');
      return;
    }

    setAddingReadyText(true);
    try {
      const { error } = await supabase.from('ready_texts').insert([{
        title: title || content.slice(0, 40),
        content,
        module_id: scopedModuleId,
      }]);
      if (error) throw error;
      setNewReadyTextTitle('');
      setNewReadyTextContent('');
      await loadReadyTexts();
      msg.success('الگوی پیام اضافه شد.');
    } catch (error) {
      console.warn('Could not add message ready text', error);
      msg.error('ثبت الگوی پیام ناموفق بود.');
    } finally {
      setAddingReadyText(false);
    }
  };

  const startEditReadyText = (item: ReadyTextRow) => {
    if (!readyTextPermissions.canEdit) {
      msg.warning('دسترسی ویرایش الگوی پیام برای این ماژول فعال نیست.');
      return;
    }
    setEditingReadyTextId(item.id);
    setEditingReadyTextTitle(item.title || '');
    setEditingReadyTextContent(item.content || '');
  };

  const cancelEditReadyText = () => {
    setEditingReadyTextId(null);
    setEditingReadyTextTitle('');
    setEditingReadyTextContent('');
  };

  const updateReadyText = async () => {
    if (!editingReadyTextId) return;
    if (!readyTextPermissions.canEdit) {
      msg.warning('دسترسی ویرایش الگوی پیام برای این ماژول فعال نیست.');
      return;
    }

    const title = String(editingReadyTextTitle || '').trim();
    const content = String(editingReadyTextContent || '').trim();
    if (!content) {
      msg.warning('متن الگوی پیام نمی‌تواند خالی باشد.');
      return;
    }

    setUpdatingReadyText(true);
    try {
      const { error } = await supabase
        .from('ready_texts')
        .update({
          title: title || content.slice(0, 40),
          content,
        })
        .eq('id', editingReadyTextId)
        .eq('module_id', scopedModuleId);

      if (error) throw error;
      await loadReadyTexts();
      cancelEditReadyText();
      msg.success('الگوی پیام بروزرسانی شد.');
    } catch (error) {
      console.warn('Could not update message ready text', error);
      msg.error('بروزرسانی الگوی پیام ناموفق بود.');
    } finally {
      setUpdatingReadyText(false);
    }
  };

  const deleteReadyText = async (id: string) => {
    if (!readyTextPermissions.canDelete) {
      msg.warning('دسترسی حذف الگوی پیام برای این ماژول فعال نیست.');
      return;
    }

    setDeletingReadyTextId(id);
    try {
      const { error } = await supabase
        .from('ready_texts')
        .delete()
        .eq('id', id)
        .eq('module_id', scopedModuleId);
      if (error) throw error;
      setReadyTexts((prev) => prev.filter((item) => item.id !== id));
      if (editingReadyTextId === id) cancelEditReadyText();
      msg.success('الگوی پیام حذف شد.');
    } catch (error) {
      console.warn('Could not delete message ready text', error);
      msg.error('حذف الگوی پیام ناموفق بود.');
    } finally {
      setDeletingReadyTextId(null);
    }
  };

  const copyReadyText = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      msg.success('متن کپی شد.');
    } catch {
      msg.error('کپی متن ناموفق بود.');
    }
  };

  const renderReadyTextForApply = async (content: string) => {
    const source = String(content || '').trim();
    if (!source) return '';
    const finalRecord = await buildResolvedTemplateRecord(source);
    const finalOptionLabelMaps = await resolveTemplateOptionLabelMaps(supabase, source, moduleId, finalRecord)
      .catch(() => templateOptionLabelMaps);
    return String(renderRecordTemplate(source, finalRecord, moduleId, { optionLabelMaps: finalOptionLabelMaps }) || '').trim();
  };

  const handleSend = async () => {
    if (isTemplateMode) {
      onCancel();
      return;
    }

    const finalRecord = await buildResolvedTemplateRecord(messageText);
    const finalOptionLabelMaps = await resolveTemplateOptionLabelMaps(supabase, messageText, moduleId, finalRecord)
      .catch(() => templateOptionLabelMaps);
    const finalText = String(renderRecordTemplate(messageText, finalRecord, moduleId, { optionLabelMaps: finalOptionLabelMaps }) || '').trim();
    if (!finalText) {
      msg.warning('متن پیام خالی است.');
      return;
    }

    setSending(true);
    try {
      if (mode === 'sms') {
        const recipients = isBulkSmsMode
          ? selectedPhones.map((value) => String(value || '').trim()).filter(Boolean)
          : [String(selectedPhone || '').trim()].filter(Boolean);
        if (!recipients.length) {
          msg.warning('شماره دریافت‌کننده مشخص نیست.');
          return;
        }
        await sendSmsViaGateway({
          to: recipients,
          text: finalText,
          moduleId: moduleId || undefined,
          recordId: !isBulkSmsMode && record?.id ? String(record.id) : undefined,
          customerId: moduleId === 'customers' && record?.id ? String(record.id) : undefined,
          title: isBulkSmsMode ? 'ارسال پیامک گروهی' : 'ارسال پیامک',
          metadata: {
            source_type: 'message_composer_modal',
            mode: 'sms',
            bulk_send: isBulkSmsMode,
            recipient_count: recipients.length,
          },
        });
        msg.success(isBulkSmsMode ? 'پیامک گروهی ارسال شد.' : 'پیامک ارسال شد.');
      } else {
        const channel = selectedBotChannel;
        if (!channel) {
          msg.warning('بات مقصد انتخاب نشده است.');
          return;
        }
        const chatId = String(botTargets[channel] || '').trim();
        if (!chatId) {
          msg.warning('شناسه چت برای این بات ثبت نشده است.');
          return;
        }
        await sendBotMessageViaGateway({
          channel,
          chatId,
          text: finalText,
          moduleId: moduleId || undefined,
          recordId: record?.id ? String(record.id) : undefined,
          customerId: moduleId === 'customers' && record?.id ? String(record.id) : undefined,
        });
        msg.success('پیام بات ارسال شد.');
      }
      onCancel();
    } catch (error: any) {
      console.warn('Could not send composed message', error);
      msg.error(toFaErrorMessage(error, 'ارسال پیام ناموفق بود.'));
    } finally {
      setSending(false);
    }
  };

  const title = isTemplateMode
    ? (templateOnlyTitle || 'پیام‌های آماده')
    : (mode === 'sms' ? 'ارسال پیامک' : 'ارسال پیام با بات');
  const noBotTarget = mode === 'bot' && !availableBotOptions.length && !activeBotsLoading;
  const noPhoneTarget = mode === 'sms' && !phoneOptions.length;

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      width={1080}
      destroyOnHidden
      zIndex={modalZIndex}
      maskClosable={false}
      getContainer={() => resolveOverlayPopupContainer()}
      modalRender={(node) => (
        <div
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {node}
        </div>
      )}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          بستن
        </Button>,
        ...(!isTemplateMode
          ? [
              <Button
                key="send"
                type="primary"
                icon={<SendOutlined />}
                loading={sending}
                disabled={noBotTarget || noPhoneTarget}
                onClick={() => void handleSend()}
              >
                ارسال
              </Button>,
            ]
          : []),
      ]}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-[#171717]">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {moduleConfig?.titles?.fa && (
                <Tag color="blue">{moduleConfig.titles.fa}</Tag>
              )}
              {record?.system_code ? <Tag>{String(record.system_code)}</Tag> : null}
              {record?.full_name ? <Tag>{String(record.full_name)}</Tag> : null}
              {record?.business_name ? <Tag>{String(record.business_name)}</Tag> : null}
            </div>

            {!isTemplateMode && mode === 'sms' ? (
              <div className="mb-3">
                <div className="mb-1 text-xs text-gray-500">{isBulkSmsMode ? 'شماره‌های مقصد' : 'شماره مقصد'}</div>
                {isBulkSmsMode ? (
                  <AdaptiveSelectField
                    {...commonSelectProps}
                    mode="multiple"
                    value={selectedPhones}
                    onChange={(values) =>
                      setSelectedPhones(((values as Array<string | number> | undefined) || []).map((value: string | number) => String(value)))
                    }
                    className="w-full"
                    options={phoneOptions}
                    placeholder="شماره‌ای برای ارسال پیدا نشد"
                    maxTagCount="responsive"
                  />
                ) : (
                  <AdaptiveSelectField
                    {...commonSelectProps}
                    value={selectedPhone || undefined}
                    onChange={setSelectedPhone}
                    className="w-full"
                    options={phoneOptions}
                    placeholder="شماره‌ای برای ارسال پیدا نشد"
                  />
                )}
              </div>
            ) : null}
            {!isTemplateMode && mode === 'bot' ? (
              <div className="mb-3">
                <div className="mb-1 text-xs text-gray-500">بات مقصد</div>
                <AdaptiveSelectField
                  {...commonSelectProps}
                  value={selectedBotChannel}
                  onChange={(value) => setSelectedBotChannel(value as NotificationBotChannel)}
                  className="w-full"
                  loading={activeBotsLoading}
                  options={availableBotOptions}
                  placeholder={activeBotsLoading ? 'در حال دریافت بات‌های فعال...' : 'بات فعالی برای این رکورد موجود نیست'}
                />
              </div>
            ) : null}

            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_120px]">
              <AdaptiveSelectField
                {...commonSelectProps}
                allowClear
                value={selectedVariable}
                onChange={(value) => setSelectedVariable(value)}
                options={variableOptions}
                pickerTitle="انتخاب متغیر"
                placeholder="انتخاب متغیر ماژول"
                listHeight={260}
              />
              <Button
                onClick={() => {
                  if (!selectedVariable) return;
                  insertTokenIntoMessage(selectedVariable);
                }}
                disabled={!selectedVariable}
              >
                درج متغیر
              </Button>
            </div>

            {!isTemplateMode ? (
              <Input.TextArea
                ref={messageInputRef}
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                autoSize={{ minRows: 8, maxRows: 14 }}
                placeholder="متن پیام را بنویسید یا از الگوهای پیام استفاده کنید..."
              />
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-white/5 dark:text-gray-300">
                الگوهای آماده را از ستون کنار انتخاب کنید. درج متغیر هم مستقیم در متن چت انجام می‌شود.
              </div>
            )}
          </div>

          {!isTemplateMode ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-white/5">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
              {mode === 'sms' ? <SendOutlined /> : <RobotOutlined />}
              پیش‌نمایش نهایی
            </div>
            {noPhoneTarget ? (
              <div className="text-sm text-amber-600 dark:text-amber-300">برای این رکورد شماره‌ای برای ارسال پیامک پیدا نشد.</div>
            ) : noBotTarget ? (
              <div className="text-sm text-amber-600 dark:text-amber-300">برای این رکورد هیچ بات فعالی با `chat_id` ثبت نشده است.</div>
            ) : (
              <div className="min-h-[92px] whitespace-pre-wrap break-words rounded-xl border border-gray-200 bg-white p-3 text-sm dark:border-gray-700 dark:bg-[#111111]">
                {renderedPreview || 'پیش‌نمایش متن پیام اینجا نمایش داده می‌شود.'}
              </div>
            )}
          </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-[#171717]">
            <div className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">الگوهای پیام</div>
            <div className="mb-3 text-xs text-gray-500">
              {readyTextCategoryDescription}
            </div>
            {readyTextPermissions.canAdd && (
              <div className="space-y-2">
                <Input
                  value={newReadyTextTitle}
                  onChange={(event) => setNewReadyTextTitle(event.target.value)}
                  placeholder="عنوان الگوی پیام"
                  maxLength={120}
                />
                <Input.TextArea
                  value={newReadyTextContent}
                  onChange={(event) => setNewReadyTextContent(event.target.value)}
                  autoSize={{ minRows: 2, maxRows: 5 }}
                  placeholder="متن الگوی پیام..."
                />
                <div className="flex justify-end">
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => void addReadyText()} loading={addingReadyText}>
                    افزودن الگو
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="max-h-[52vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-[#171717]">
            {readyTextsLoading ? (
              <div className="flex h-40 items-center justify-center gap-2 text-sm text-gray-500">
                <LoadingOutlined />
                در حال بارگذاری...
              </div>
            ) : readyTexts.length === 0 ? (
              <div className="py-8">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="الگوی پیامی ثبت نشده است." />
              </div>
            ) : (
              <div className="space-y-2">
                {readyTexts.map((item) => (
                  <div key={item.id} className="rounded-xl border border-gray-100 p-2 dark:border-gray-800">
                      {editingReadyTextId === item.id ? (
                        <div className="space-y-2">
                          <Input
                            value={editingReadyTextTitle}
                            onChange={(event) => setEditingReadyTextTitle(event.target.value)}
                            placeholder="عنوان الگو"
                            maxLength={120}
                          />
                          <Input.TextArea
                            value={editingReadyTextContent}
                            onChange={(event) => setEditingReadyTextContent(event.target.value)}
                            autoSize={{ minRows: 2, maxRows: 6 }}
                          />
                          <div className="flex items-center justify-end gap-1">
                            <Button size="small" type="primary" icon={<SaveOutlined />} onClick={() => void updateReadyText()} loading={updatingReadyText}>
                              ذخیره
                            </Button>
                            <Button size="small" onClick={cancelEditReadyText}>
                              انصراف
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-xs font-semibold text-gray-800 dark:text-gray-100">
                                {item.title || 'بدون عنوان'}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                <Tag color={readyTextScope === 'module' && moduleConfig?.titles?.fa ? 'blue' : 'default'}>
                                  {readyTextCategoryLabel}
                                </Tag>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="small"
                                onClick={async () => {
                                  if (isTemplateMode) {
                                    const rendered = await renderReadyTextForApply(item.content);
                                    onApplyTemplate?.(rendered || item.content);
                                    onCancel();
                                    return;
                                  }
                                  setMessageText(item.content);
                                }}
                              >
                                استفاده
                              </Button>
                              <Button size="small" icon={<CopyOutlined />} onClick={() => void copyReadyText(item.content)} />
                              {readyTextPermissions.canEdit && (
                                <Button size="small" icon={<EditOutlined />} onClick={() => startEditReadyText(item)} />
                              )}
                              {readyTextPermissions.canDelete && (
                                <Button
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  loading={deletingReadyTextId === item.id}
                                  onClick={() => {
                                    Modal.confirm({
                                      title: 'حذف الگوی پیام',
                                      content: 'این الگوی پیام حذف شود؟',
                                      okText: 'حذف',
                                      cancelText: 'انصراف',
                                      okButtonProps: { danger: true },
                                      onOk: async () => {
                                        await deleteReadyText(item.id);
                                      },
                                    });
                                  }}
                                />
                              )}
                            </div>
                          </div>
                          <div className="whitespace-pre-wrap break-words text-xs text-gray-600 dark:text-gray-300">
                            {item.content}
                          </div>
                        </>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default MessageComposerModal;

