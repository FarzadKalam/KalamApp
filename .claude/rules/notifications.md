---
description: context بخش Notifications و Messaging — فقط وقتی روی NotificationsPopover یا فایل‌های مرتبط کار می‌کنی
paths:
  - "components/NotificationsPopover.tsx"
  - "utils/notificationViewModels.ts"
  - "utils/uiNotificationOverlayStore.ts"
  - "utils/notificationConversationRpc.ts"
  - "hooks/useNotification*.ts"
  - "hooks/use*Timeline.ts"
---

# Context: Notifications & Messaging

## فایل‌های کلیدی
- `components/NotificationsPopover.tsx` — کامپوننت اصلی (~8000 خط)
- `utils/uiNotificationOverlayStore.ts` — Zustand store برای overlay
- `utils/notificationViewModels.ts` — view model مکالمات
- `utils/notificationConversationRpc.ts` — RPC calls
- `hooks/useNotificationConversationList.ts` — لیست مکالمات
- `hooks/useNotificationRealtimeSync.ts` — realtime sync
- `hooks/useBotConversationTimeline.ts` — timeline bot
- `hooks/useInternalConversationTimeline.ts` — timeline داخلی

## الگوهای مهم (باگ‌های قبلی)
- **Bot read state**: از `seenBotMessageIds.has(id)` استفاده کن — **نه** hardcoded `false`
- **Mark as read**: `markNotificationEntriesRead()` باید خارج از `if (messageIds.size === 0) return` باشد
- **Drawer close**: عملیات سنگین بعد از animation با `window.setTimeout(..., 80)`
- **Page resume**: کلاس `page-resuming` روی body اضافه و بعد 400ms حذف شود
- **visibilitychange**: debounce 600ms قبل از `refreshAll(false, { force: true })`

## Realtime
- channel مکالمه: `message-events-${convoId}`
- channel سازمانی: `org-notifications-${orgId}`

## احتیاط
این فایل بسیار بزرگ است (~8000 خط). قبل از ویرایش:
1. خط دقیق را با Grep پیدا کن
2. فقط آن بخش را Read کن
3. با Edit تغییر بده — هرگز کل فایل را بازنویسی نکن
