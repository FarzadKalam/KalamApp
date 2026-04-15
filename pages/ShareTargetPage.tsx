import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Empty, Input, Select, Typography } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { getSharedInboxPayload, removeSharedInboxPayload, sharedInboxFileToFile, type SharedInboxPayload } from '../utils/webShareInbox';
import { serializeNoteContent } from '../utils/noteContent';
import { insertNotesWithFallback } from '../utils/noteDispatch';
import { FILE_STORAGE_BUCKET, fileStorageClient } from '../utils/storageClient';
import { getActiveChannelSettings } from '../utils/channelSettings';
import { toFaErrorMessage } from '../utils/errorMessageFa';

const { Text, Title } = Typography;

const BOT_LABELS: Record<string, string> = {
  telegram: 'تلگرام',
  bale: 'بله',
  rubika: 'روبیکا',
};
const SHARE_LAST_TARGETS_STORAGE_KEY = 'tazesystem-share-last-targets-v1';
const MAX_SMART_SUGGESTIONS = 6;

type ChatGroup = {
  id: string;
  name: string;
  user_ids: string[];
  role_ids: string[];
};

type BotGroup = {
  id: string;
  title: string;
  channel_type: 'telegram' | 'bale' | 'rubika';
  bot_chat_id: string;
  customer_id: string | null;
  supplier_id: string | null;
};

const sanitizeFileName = (value: string) => {
  const raw = String(value || '').trim();
  return (raw || `share-${Date.now()}`)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
};

const buildRubikaLinkedAttachmentMessage = (
  baseText: string,
  attachments: Array<{ name?: string; url?: string }>,
) => {
  const normalizedBaseText = String(baseText || '').trim();
  const lines: Array<{ text: string; linkUrl?: string }> = [];
  if (normalizedBaseText) lines.push({ text: normalizedBaseText });

  (attachments || []).forEach((item, index) => {
    const name = String(item?.name || `فایل ${index + 1}`).trim() || `فایل ${index + 1}`;
    const url = String(item?.url || '').trim();
    lines.push({ text: `🔗 ${name}`, linkUrl: url || undefined });
  });

  let text = '';
  let cursor = 0;
  const metaDataParts: Array<Record<string, any>> = [];

  lines.forEach((line, index) => {
    if (index > 0) {
      text += '\n';
      cursor += 1;
    }
    const segment = String(line.text || '');
    const startIndex = cursor;
    text += segment;
    cursor += segment.length;

    if (line.linkUrl) {
      metaDataParts.push({
        type: 'Link',
        from_index: startIndex,
        length: segment.length,
        link_url: line.linkUrl,
      });
    }
  });

  return {
    text,
    metadata: metaDataParts.length > 0 ? { meta_data_parts: metaDataParts } : undefined,
  };
};

const ShareTargetPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const shareId = String(searchParams.get('share_id') || '').trim();

  const [currentUserId, setCurrentUserId] = useState('');
  const [currentOrgId, setCurrentOrgId] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [botGroups, setBotGroups] = useState<BotGroup[]>([]);
  const [sharePayload, setSharePayload] = useState<SharedInboxPayload | null>(null);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastTargets, setLastTargets] = useState<string[]>([]);
  const [autoDefaultDone, setAutoDefaultDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const bootstrap = await fetchSessionBootstrap(supabase);
        const userId = String(bootstrap?.user?.id || '').trim();
        const orgId = String(bootstrap?.orgId || '').trim();
        if (!userId || !orgId) {
          if (!cancelled) {
            message.warning('برای دریافت اشتراک‌گذاری باید وارد حساب کاربری شوید.');
            navigate('/login', { replace: true });
          }
          return;
        }

        const payload = await getSharedInboxPayload(shareId);
        if (!payload) {
          if (!cancelled) {
            setSharePayload(null);
          }
          return;
        }

        const inferredText = [
          String(payload?.title || '').trim(),
          String(payload?.text || '').trim(),
          String(payload?.url || '').trim(),
        ]
          .filter(Boolean)
          .join('\n')
          .trim();

        const [directory, groupsResult, botGroupsResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, email, mobile_1, role_id')
            .eq('org_id', orgId)
            .order('full_name', { ascending: true })
            .limit(500),
          supabase
            .from('chat_groups')
            .select('id, name, user_ids, role_ids')
            .eq('org_id', orgId)
            .order('updated_at', { ascending: false })
            .limit(200),
          supabase
            .from('counterparty_bot_groups')
            .select('id, group_title, group_join_link, channel_type, bot_chat_id, customer_id, supplier_id, status')
            .in('channel_type', ['telegram', 'bale', 'rubika'])
            .eq('status', 'active')
            .order('updated_at', { ascending: false })
            .limit(200),
        ]);

        if (directory.error) throw directory.error;
        if (groupsResult.error) throw groupsResult.error;
        if (botGroupsResult.error) throw botGroupsResult.error;

        if (!cancelled) {
          setCurrentUserId(userId);
          setCurrentOrgId(orgId);
          setSharePayload(payload);
          setMessageText(inferredText);
          setAllUsers(Array.isArray(directory.data) ? directory.data : []);
          setChatGroups(
            (groupsResult.data || []).map((group: any) => ({
              id: String(group?.id || ''),
              name: String(group?.name || 'گروه'),
              user_ids: Array.isArray(group?.user_ids) ? group.user_ids.map((value: any) => String(value)) : [],
              role_ids: Array.isArray(group?.role_ids) ? group.role_ids.map((value: any) => String(value)) : [],
            })),
          );
          setBotGroups(
            (botGroupsResult.data || [])
              .map((row: any) => {
                const channelType = String(row?.channel_type || '').trim() as 'telegram' | 'bale' | 'rubika';
                if (!['telegram', 'bale', 'rubika'].includes(channelType)) return null;
                return {
                  id: String(row?.id || ''),
                  title: String(row?.group_title || row?.group_join_link || row?.id || 'گروه بات').trim(),
                  channel_type: channelType,
                  bot_chat_id: String(row?.bot_chat_id || '').trim(),
                  customer_id: row?.customer_id ? String(row.customer_id) : null,
                  supplier_id: row?.supplier_id ? String(row.supplier_id) : null,
                };
              })
              .filter(Boolean) as BotGroup[],
          );
        }
      } catch (error: any) {
        if (!cancelled) {
          message.error(toFaErrorMessage(error, 'بارگذاری اشتراک‌گذاری ناموفق بود.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (!shareId) {
      setLoading(false);
      return;
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [message, navigate, shareId]);

  const targetOptions = useMemo(
    () => [
      ...botGroups.map((group) => ({
        label: `بات ${BOT_LABELS[group.channel_type]}: ${group.title}`,
        value: `bot_group:${group.id}`,
      })),
      ...chatGroups.map((group) => ({
        label: `گروه داخلی: ${group.name}`,
        value: `chat_group:${group.id}`,
      })),
      ...allUsers
        .filter((user) => String(user?.id || '') !== String(currentUserId || ''))
        .map((user) => ({
          label: `داخلی: ${user.full_name || user.email || user.mobile_1 || user.id}`,
          value: `user:${user.id}`,
        })),
    ],
    [allUsers, botGroups, chatGroups, currentUserId],
  );

  const targetLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    targetOptions.forEach((item) => {
      map.set(String(item.value || ''), String(item.label || item.value || ''));
    });
    return map;
  }, [targetOptions]);

  const smartSuggestions = useMemo(() => {
    const optionsSet = new Set(targetOptions.map((item) => String(item.value || '').trim()).filter(Boolean));
    const merged: string[] = [];
    const pushIfValid = (value: string) => {
      const normalized = String(value || '').trim();
      if (!normalized || !optionsSet.has(normalized) || merged.includes(normalized)) return;
      merged.push(normalized);
    };

    lastTargets.forEach(pushIfValid);
    targetOptions
      .filter((item) => String(item.value || '').startsWith('bot_group:'))
      .slice(0, 2)
      .forEach((item) => pushIfValid(String(item.value || '')));
    targetOptions
      .filter((item) => String(item.value || '').startsWith('chat_group:'))
      .slice(0, 2)
      .forEach((item) => pushIfValid(String(item.value || '')));
    targetOptions
      .filter((item) => String(item.value || '').startsWith('user:'))
      .slice(0, 2)
      .forEach((item) => pushIfValid(String(item.value || '')));

    return merged.slice(0, MAX_SMART_SUGGESTIONS);
  }, [lastTargets, targetOptions]);

  const addTargets = (values: string[]) => {
    const next = Array.from(
      new Set([
        ...targetIds.map((item) => String(item || '').trim()).filter(Boolean),
        ...values.map((item) => String(item || '').trim()).filter(Boolean),
      ]),
    );
    setTargetIds(next);
  };

  const toggleTarget = (value: string) => {
    const normalizedValue = String(value || '').trim();
    if (!normalizedValue) return;
    if (targetIds.includes(normalizedValue)) {
      setTargetIds((prev) => prev.filter((item) => item !== normalizedValue));
      return;
    }
    setTargetIds((prev) => Array.from(new Set([...prev, normalizedValue])));
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(SHARE_LAST_TARGETS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setLastTargets(parsed.map((item) => String(item || '').trim()).filter(Boolean));
    } catch {
      // ignore malformed local cache
    }
  }, []);

  useEffect(() => {
    if (autoDefaultDone) return;
    if (targetOptions.length === 0) return;
    if (targetIds.length > 0) {
      setAutoDefaultDone(true);
      return;
    }
    const suggestions = smartSuggestions.filter(Boolean);
    if (suggestions.length > 0) {
      setTargetIds([suggestions[0]]);
      setAutoDefaultDone(true);
      return;
    }
    if (targetOptions.length === 1) {
      setTargetIds([String(targetOptions[0].value || '')]);
      setAutoDefaultDone(true);
      return;
    }
    setAutoDefaultDone(true);
  }, [autoDefaultDone, smartSuggestions, targetIds.length, targetOptions]);

  const handleSubmit = async () => {
    if (!sharePayload) {
      message.warning('داده اشتراک‌گذاری پیدا نشد.');
      return;
    }

    const normalizedTargets = Array.from(new Set(targetIds.map((value) => String(value || '').trim()).filter(Boolean)));
    if (normalizedTargets.length === 0) {
      message.warning('حداقل یک مقصد انتخاب کنید.');
      return;
    }

    setSubmitting(true);
    try {
      const uploadedAttachments: Array<{ url: string; name: string; mimeType: string }> = [];
      const shareFiles = Array.isArray(sharePayload.files) ? sharePayload.files : [];

      for (const item of shareFiles) {
        const file = sharedInboxFileToFile(item);
        const safeName = sanitizeFileName(file.name);
        const filePath = `share_inbox/${currentOrgId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
        const { error: uploadError } = await fileStorageClient.storage
          .from(FILE_STORAGE_BUCKET)
          .upload(filePath, file, {
            upsert: false,
            contentType: file.type || 'application/octet-stream',
          });
        if (uploadError) throw uploadError;

        const { data } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(filePath);
        uploadedAttachments.push({
          url: data.publicUrl,
          name: safeName,
          mimeType: file.type || 'application/octet-stream',
        });
      }

      const payloads: Array<Record<string, any>> = [];
      const botTargets: BotGroup[] = [];

      const author = allUsers.find((item) => String(item?.id || '') === currentUserId);
      const authorName = String(author?.full_name || '').trim() || null;

      normalizedTargets.forEach((targetId) => {
        if (targetId.startsWith('chat_group:')) {
          const groupId = targetId.replace('chat_group:', '');
          const group = chatGroups.find((item) => item.id === groupId);
          if (!group) return;

          const roleDrivenUserIds = allUsers
            .filter((user) => user?.role_id && group.role_ids.includes(String(user.role_id)))
            .map((user) => String(user.id));

          const mentionUserIds = Array.from(new Set([...group.user_ids, ...roleDrivenUserIds])).filter((userId) => userId !== currentUserId);

          payloads.push({
            module_id: 'profiles',
            record_id: currentUserId,
            content: serializeNoteContent(String(messageText || '').trim(), uploadedAttachments as any),
            reply_to: null,
            mention_user_ids: mentionUserIds,
            mention_role_ids: group.role_ids,
            author_id: currentUserId,
            author_name: authorName,
            metadata: { source_type: 'web_share_target', chat_group_id: group.id },
          });
          return;
        }

        if (targetId.startsWith('bot_group:')) {
          const groupId = targetId.replace('bot_group:', '');
          const group = botGroups.find((item) => item.id === groupId);
          if (group) botTargets.push(group);
          return;
        }

        if (targetId.startsWith('user:')) {
          const userId = targetId.replace('user:', '');
          if (!userId || userId === currentUserId) return;
          payloads.push({
            module_id: 'profiles',
            record_id: currentUserId,
            content: serializeNoteContent(String(messageText || '').trim(), uploadedAttachments as any),
            reply_to: null,
            mention_user_ids: [userId],
            mention_role_ids: [],
            author_id: currentUserId,
            author_name: authorName,
            metadata: { source_type: 'web_share_target' },
          });
        }
      });

      if (payloads.length > 0) {
        await insertNotesWithFallback(payloads);
      }

      const attachmentNames = uploadedAttachments
        .map((item) => `🔗 ${item.name}`)
        .join('\n');

      for (const target of botTargets) {
        if (!target.bot_chat_id) throw new Error(`chat id برای گروه بات "${target.title}" تنظیم نشده است.`);

        const activeConnection = await getActiveChannelSettings(target.channel_type);
        const connectionId = String(activeConnection?.id || '').trim();
        if (!connectionId) {
          throw new Error(`تنظیمات فعال بات ${BOT_LABELS[target.channel_type]} پیدا نشد.`);
        }

        const isRubikaTarget = target.channel_type === 'rubika';
        const rubikaLinkedMessage = isRubikaTarget ? buildRubikaLinkedAttachmentMessage(String(messageText || '').trim(), uploadedAttachments) : null;
        const externalText = [String(messageText || '').trim(), uploadedAttachments.map((item) => `فایل: ${item.url}`).join('\n')]
          .filter(Boolean)
          .join('\n');

        const botMessageText = isRubikaTarget
          ? (String(rubikaLinkedMessage?.text || '').trim() || 'فایل اشتراک‌گذاری‌شده ارسال شد.')
          : (externalText || 'فایل اشتراک‌گذاری‌شده ارسال شد.');

        const fallbackText = isRubikaTarget
          ? [String(messageText || '').trim(), attachmentNames].filter(Boolean).join('\n')
          : undefined;

        const { data: proxyData, error: proxyError } = await supabase.functions.invoke('bot-admin', {
          body: {
            action: 'send_test_message',
            channel: target.channel_type,
            connectionId,
            chatId: target.bot_chat_id,
            text: botMessageText,
            skipLog: false,
            extraPayload: isRubikaTarget && rubikaLinkedMessage?.metadata ? { metadata: rubikaLinkedMessage.metadata } : undefined,
            fallbackText,
          },
        });

        if (proxyError) throw proxyError;
        if (!proxyData?.success) throw new Error(String(proxyData?.message || 'ارسال به بات ناموفق بود.'));

        await supabase.from('counterparty_bot_messages').insert([
          {
            bot_group_id: target.id,
            customer_id: target.customer_id,
            supplier_id: target.supplier_id,
            channel_type: target.channel_type,
            direction: 'outbound',
            message_type: uploadedAttachments.length > 0 ? 'file' : 'text',
            chat_id: target.bot_chat_id,
            provider_message_id: String(proxyData?.provider_result?.result?.message_id || proxyData?.provider_result?.message_id || '') || null,
            content_text: String(botMessageText || '').trim() || null,
            file_url: uploadedAttachments[0]?.url || null,
            file_name: uploadedAttachments[0]?.name || null,
            mime_type: uploadedAttachments[0]?.mimeType || null,
            payload: {
              attachments: uploadedAttachments,
              provider_response: proxyData?.provider_result || {},
              source_type: 'web_share_target',
            },
          },
        ]);
      }

      await removeSharedInboxPayload(sharePayload.id);
      if (typeof window !== 'undefined') {
        const cacheTargets = normalizedTargets.slice(0, 12);
        window.localStorage.setItem(SHARE_LAST_TARGETS_STORAGE_KEY, JSON.stringify(cacheTargets));
      }
      message.success('اشتراک‌گذاری با موفقیت ارسال شد.');
      navigate('/', { replace: true });
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'ارسال اشتراک‌گذاری ناموفق بود.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!shareId) {
    return (
      <div className="mx-auto mt-10 w-full max-w-3xl px-4">
        <Card>
          <Empty description="درخواستی برای اشتراک‌گذاری پیدا نشد." />
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto mt-10 w-full max-w-3xl px-4">
        <Card loading />
      </div>
    );
  }

  if (!sharePayload) {
    return (
      <div className="mx-auto mt-10 w-full max-w-3xl px-4">
        <Card>
          <Empty description="داده اشتراک‌گذاری منقضی یا حذف شده است." />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-6 w-full max-w-4xl px-4 pb-8">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <Title level={4} className="!mb-0">اشتراک‌گذاری ورودی</Title>
          <Text type="secondary">TazeSystem</Text>
        </div>

        <div className="space-y-4">
          <div>
            <Text strong>فایل‌ها</Text>
            {sharePayload.files.length === 0 ? (
              <div className="mt-2 text-sm text-gray-500">فایلی ارسال نشده است.</div>
            ) : (
              <div className="mt-2 rounded-lg border border-gray-200 p-3 text-sm">
                {sharePayload.files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="mb-1 last:mb-0">
                    {file.name} ({Math.max(1, Math.round((file.size || 0) / 1024))} KB)
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <Text strong>متن پیام</Text>
            <Input.TextArea
              className="mt-2"
              rows={5}
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              placeholder="متن یا توضیح اختیاری"
            />
          </div>

          <div>
            <Text strong>مقصد</Text>
            {smartSuggestions.length > 0 ? (
              <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
                <div className="mb-2 text-xs text-gray-500">پیشنهاد هوشمند</div>
                <div className="flex flex-wrap gap-2">
                  {smartSuggestions.map((value) => {
                    const selected = targetIds.includes(value);
                    return (
                      <Button
                        key={value}
                        size="small"
                        type={selected ? 'primary' : 'default'}
                        onClick={() => toggleTarget(value)}
                      >
                        {targetLabelMap.get(value) || value}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="small"
                onClick={() => addTargets(targetOptions.filter((item) => String(item.value).startsWith('bot_group:')).slice(0, 3).map((item) => String(item.value)))}
              >
                انتخاب سریع بات‌ها
              </Button>
              <Button
                size="small"
                onClick={() => addTargets(targetOptions.filter((item) => String(item.value).startsWith('chat_group:')).slice(0, 3).map((item) => String(item.value)))}
              >
                انتخاب سریع گروه‌ها
              </Button>
              <Button
                size="small"
                onClick={() => addTargets(targetOptions.filter((item) => String(item.value).startsWith('user:')).slice(0, 5).map((item) => String(item.value)))}
              >
                انتخاب سریع داخلی
              </Button>
              <Button size="small" onClick={() => setTargetIds([])}>
                پاک‌کردن انتخاب
              </Button>
            </div>
            <Select
              className="mt-2 w-full"
              mode="multiple"
              showSearch
              allowClear
              placeholder="انتخاب مقصد (چت داخلی / گروه داخلی / بات)"
              value={targetIds}
              onChange={(values) => setTargetIds((values || []).map((value) => String(value)))}
              options={targetOptions}
              optionFilterProp="label"
              maxTagCount="responsive"
              getPopupContainer={(trigger) => trigger.parentElement || document.body}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={() => {
                void removeSharedInboxPayload(sharePayload.id);
                navigate('/', { replace: true });
              }}
            >
              انصراف
            </Button>
            <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
              ارسال
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ShareTargetPage;
