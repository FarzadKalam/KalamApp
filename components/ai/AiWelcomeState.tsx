import React, { useMemo } from 'react';
import { Prompts, Welcome, type PromptProps } from '@ant-design/x';
import {
  BarChartOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  FormOutlined,
  PictureOutlined,
  PlusCircleOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import type { AgentKey } from '../../utils/aiAgentCatalog';
import { getAgentDefinition } from '../../utils/aiAgentCatalog';
import type { AiComposerCapability } from './AiCapabilityComposerActions';
import { AiAgentCameoFigure } from './AiAgentIcon';

export type AiWelcomePromptSelection = {
  prompt: string;
  capabilities?: AiComposerCapability[];
};

type Props = {
  personalTitle: string;
  selectedAgents: AgentKey[];
  contextMode?: 'list' | 'record' | 'dashboard' | string;
  moduleId?: string | null;
  recordLabel?: string | null;
  selectedRecordCount?: number;
  freeChat?: boolean;
  onSelectPrompt: (selection: AiWelcomePromptSelection) => void;
};

type PromptItemWithMeta = PromptProps & {
  promptText: string;
  capabilities?: AiComposerCapability[];
};

export default function AiWelcomeState({
  personalTitle,
  selectedAgents,
  contextMode,
  moduleId,
  recordLabel,
  selectedRecordCount = 0,
  freeChat = false,
  onSelectPrompt,
}: Props) {
  const primaryAgentKey = (selectedAgents[0] || 'lead_orchestrator') as AgentKey;
  const agentDef = freeChat ? null : getAgentDefinition(primaryAgentKey);
  const agentName = freeChat
    ? 'گفتگوی آزاد'
    : primaryAgentKey === 'lead_orchestrator'
      ? personalTitle
      : agentDef?.titleFa || personalTitle;

  const moduleTitle = useMemo(() => {
    const id = String(moduleId || '').trim();
    if (!id) return '';
    return MODULES[id]?.titles?.fa || MODULES[id]?.titles?.faSingular || id;
  }, [moduleId]);

  const descriptionText = useMemo(() => {
    if (freeChat) {
      return 'در این حالت بدون دسترسی به داده‌های سازمان گفتگو می‌کنید؛ برای ایده‌پردازی، ترجمه، نگارش متن یا پرسش‌های عمومی آماده هستم.';
    }
    if (contextMode === 'record' && moduleTitle) {
      return `روی رکورد ${recordLabel ? `«${recordLabel}» در ` : ''}${moduleTitle} هستم. می‌توانم خلاصهٔ وضعیت، پیشنهاد پیگیری یا ویرایش این مورد را برایتان آماده کنم.`;
    }
    if (moduleTitle) {
      const selectedNote = selectedRecordCount > 0
        ? ` (${selectedRecordCount.toLocaleString('fa-IR')} مورد انتخاب شده است)`
        : '';
      return `در ماژول ${moduleTitle}${selectedNote} هستم؛ می‌توانید تحلیل، جستجو، ثبت رکورد جدید یا ارسال گزارش بخواهید.`;
    }
    return 'آماده‌ام درباره داده‌های مجاز سازمان، مشتریان، فاکتورها، فعالیت‌ها یا تولید محتوا و سند به شما کمک کنم.';
  }, [contextMode, freeChat, moduleTitle, recordLabel, selectedRecordCount]);

  const promptItems = useMemo<PromptItemWithMeta[]>(() => {
    if (freeChat) {
      return [
        {
          key: 'free-brainstorm',
          icon: <ThunderboltOutlined className="text-amber-500" />,
          label: 'ایده‌پردازی و متن معرفی',
          description: 'یک متن کوتاه و حرفه‌ای برای معرفی خدمات ما بنویس.',
          promptText: 'یک متن کوتاه، حرفه‌ای و جذاب برای معرفی خدمات کسب‌وکار ما به مشتریان جدید بنویس.',
        },
        {
          key: 'free-image',
          icon: <PictureOutlined className="text-violet-500" />,
          label: 'ساخت تصویر تبلیغاتی',
          description: 'طراحی تصویر یا بنر با توضیح دلخواه شما',
          promptText: 'یک تصویر تبلیغاتی مینیمال و مدرن برای معرفی محصول جدید بساز.',
          capabilities: ['image_generation'],
        },
        {
          key: 'free-summary',
          icon: <FileTextOutlined className="text-sky-500" />,
          label: 'خلاصه‌سازی و ویراستاری',
          description: 'متن زیر را رسمی، خلاصه و بدون غلط نگارشی بازنویسی کن.',
          promptText: 'متن زیر را به لحن رسمی و اداری بازنویسی و خلاصه کن:\n',
        },
      ];
    }

    if (contextMode === 'record' && moduleTitle) {
      return [
        {
          key: 'record-summary',
          icon: <FileSearchOutlined className="text-sky-500" />,
          label: `خلاصهٔ وضعیت این ${MODULES[String(moduleId)]?.titles?.faSingular || moduleTitle}`,
          description: 'نکات مهم، وضعیت مالی و آخرین تغییرات را مرور کن.',
          promptText: `وضعیت فعلی این ${MODULES[String(moduleId)]?.titles?.faSingular || moduleTitle} را خلاصه کن و بگو چه اقدام بعدی پیشنهاد می‌شود.`,
        },
        {
          key: 'record-followup',
          icon: <FormOutlined className="text-emerald-500" />,
          label: 'پیشنهاد پیام یا پیگیری',
          description: 'یک متن آماده برای ارتباط یا ثبت فعالیت بعدی بنویس.',
          promptText: 'بر اساس اطلاعات همین رکورد، یک متن پیگیری حرفه‌ای و کوتاه آماده کن.',
        },
        {
          key: 'record-update',
          icon: <PlusCircleOutlined className="text-indigo-500" />,
          label: 'پیشنهاد اصلاح فیلدها',
          description: 'پیش‌نویس ویرایش با تایید خود شما آماده شود.',
          promptText: 'می‌خواهم این مورد را ویرایش کنم: ',
          capabilities: ['record_creation'],
        },
      ];
    }

    if (moduleTitle) {
      return [
        {
          key: 'list-analyze',
          icon: <BarChartOutlined className="text-sky-500" />,
          label: `تحلیل و گزارش ${moduleTitle}`,
          description: selectedRecordCount > 0
            ? `بررسی و مقایسهٔ ${selectedRecordCount.toLocaleString('fa-IR')} مورد انتخاب‌شده`
            : `خلاصهٔ وضعیت، روندها و موارد نیازمند پیگیری در ${moduleTitle}`,
          promptText: selectedRecordCount > 0
            ? `موارد انتخاب‌شده در ${moduleTitle} را بررسی و مقایسه کن و یک جمع‌بندی بده.`
            : `وضعیت کلی ${moduleTitle} را تحلیل کن و مهم‌ترین موارد نیازمند پیگیری را لیست کن.`,
        },
        {
          key: 'list-create',
          icon: <PlusCircleOutlined className="text-emerald-500" />,
          label: `ثبت سریع در ${moduleTitle}`,
          description: 'پیش‌نویس رکورد جدید را از روی توضیح متنی یا فایل بساز.',
          promptText: `یک مورد جدید در ${moduleTitle} با این مشخصات آماده کن: `,
          capabilities: ['record_creation'],
        },
        {
          key: 'list-doc',
          icon: <FileTextOutlined className="text-violet-500" />,
          label: 'خروجی فایل و گزارش',
          description: 'تولید فایل اکسل، ورد یا پی‌دی‌اف از جمع‌بندی داده‌ها',
          promptText: `از اطلاعات ${moduleTitle} یک گزارش مرتب و قابل دانلود تهیه کن.`,
          capabilities: ['document_generation'],
        },
      ];
    }

    return [
      {
        key: 'dash-overview',
        icon: <BarChartOutlined className="text-sky-500" />,
        label: 'گزارش وضعیت امروز سازمان',
        description: 'مرور فروش، فعالیت‌های معوق و موارد فوری امروز',
        promptText: 'وضعیت کلی امروز سازمان شامل فروش، کارهای باز و موارد نیازمند پیگیری فوری را خلاصه کن.',
      },
      {
        key: 'dash-create',
        icon: <PlusCircleOutlined className="text-emerald-500" />,
        label: 'ثبت مشتری، کار یا فاکتور',
        description: 'با توضیح متنی یا ویس پیش‌نویس آماده و با تایید شما ثبت می‌شود.',
        promptText: 'می‌خواهم یک رکورد جدید ثبت کنم: ',
        capabilities: ['record_creation'],
      },
      {
        key: 'dash-knowledge',
        icon: <SearchOutlined className="text-amber-500" />,
        label: 'پاسخ بر اساس دانش سازمان',
        description: 'جستجو در دستورالعمل‌ها، قیمت‌گذاری و قوانین داخلی',
        promptText: 'بر اساس دانش سازمان، درباره موضوع زیر توضیح بده: ',
      },
      {
        key: 'dash-media',
        icon: <PictureOutlined className="text-violet-500" />,
        label: 'ساخت تصویر یا سند خروجی',
        description: 'تولید بنر، فایل اکسل/ورد یا پیام صوتی حرفه‌ای',
        promptText: 'یک فایل یا تصویر حرفه‌ای با این موضوع بساز: ',
      },
    ];
  }, [contextMode, freeChat, moduleId, moduleTitle, recordLabel, selectedRecordCount]);

  return (
    <div className="ai-welcome-container mx-auto flex max-w-2xl flex-col gap-4 py-4" dir="rtl">
      <Welcome
        variant="borderless"
        className="ai-welcome-card"
        icon={(
          <div
            className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border bg-slate-900 shadow-sm"
            style={{ borderColor: agentDef?.badgeColor ? `${agentDef.badgeColor}88` : undefined }}
          >
            <AiAgentCameoFigure
              agentKey={primaryAgentKey}
              size={38}
              accentColor={agentDef?.badgeColor}
            />
          </div>
        )}
        title={<span className="text-[15px] font-extrabold text-slate-900 dark:text-slate-100">{`سلام! ${agentName} در خدمت شماست`}</span>}
        description={<span className="text-[12.5px] leading-6 text-slate-600 dark:text-slate-300">{descriptionText}</span>}
      />

      <Prompts
        title={<span className="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400">پیشنهادهای شروع سریع (یا تایپ / برای دستورات)</span>}
        wrap
        items={promptItems}
        onItemClick={(info) => {
          const item = info.data as PromptItemWithMeta;
          onSelectPrompt({
            prompt: item.promptText,
            capabilities: item.capabilities,
          });
        }}
        styles={{
          list: { gap: 8 },
          item: {
            flex: '1 1 220px',
            borderRadius: 14,
            border: '1px solid var(--ai-chat-line)',
            background: 'var(--ai-chat-surface)',
            padding: '10px 12px',
          },
        }}
      />
    </div>
  );
}
