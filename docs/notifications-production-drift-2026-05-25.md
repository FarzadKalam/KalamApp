# ممیزی read-only اعلان‌ها در production - ۱۴۰۵/۰۳/۰۴

## دامنه بررسی

این بررسی پیش از rollout بهینه‌سازی اعلان‌ها انجام شد و فقط شامل query خواندنی روی production بود. فایل ثبت‌نشده `database_v1_phase170_fix_old_workflow_note_unread.sql` در این بررسی deploy یا stage نشده است.

## نتیجه

- اسکریپت `db:migrate:server:list` از مسیر SSH دو بار timeout شد و برای تشخیص pending قابل استفاده نبود.
- اتصال مستقیم read-only به دیتابیس موفق بود؛ جدول `app_schema_migrations` فقط ۲۳ رکورد دارد و با مجموعه migrationهای repo که تا phase `193` ادامه دارد هم‌تراز نیست. بنابراین تاریخچه migration به تنهایی drift کامل production را اثبات نمی‌کند.
- توابع `get_notification_conversations`، `get_internal_conversation_timeline` و `get_bot_conversation_timeline` در production از نوع `security definer` هستند و `search_path=public` دارند.
- policyهای production برای `notes`، `chat_groups`، `counterparty_bot_groups` و `counterparty_bot_messages` هنوز شرط‌های nullable مانند `org_id is null` را مجاز می‌کنند.
- policy موجود `p_notes_org_all` علاوه بر `org_id is null`، مسیر `current_org_id() is null` را هم مجاز می‌کند و باید حذف شود.

## اقدام این rollout

- `database_v1_phase194_notification_runtime_stability.sql` مسیر timeline نامحدود را در API فعلی مهار و policyهای فوق را fail-closed می‌کند.
- `database_v1_phase195_communication_read_cursors.sql` cursor خواندن را با write فقط از طریق RPC کنترل‌شده ایجاد می‌کند.
- `database_v1_phase196_communication_summary_isolation.sql` summary ارتباطات را از پیام‌های سیستم/اتوماسیون جدا می‌کند تا feed سیستم در مسیر داغ لیست گفتگو aggregate نشود.
- فایل‌های `194` تا `196` در production به‌صورت دستی و با ترتیب `195`، سپس `196`، سپس `194` اجرا شدند. این ترتیب به علت استقلال این تغییرات خرابی فعال ایجاد نکرد و وجود objectها و policyهای fail-closed پس از اجرا تایید شد.
- جدول `app_schema_migrations` اجرای دستی فایل‌های `194` تا `196` را ثبت نکرده است؛ پیش از استفاده مجدد از runner باید history آن به شکل کنترل‌شده همگام شود.
- `database_v1_phase197_communication_cursor_runtime.sql` API نسخه‌بندی‌شده summary/timeline را اضافه می‌کند تا read مکالمه از write تک‌پیامی جدا شود؛ RPC cursor در همین phase فقط مرز پیام قابل‌مشاهده و واقعی را می‌پذیرد و timestamp دلخواه کلاینت را ثبت نمی‌کند. این phase دسته قدیمی `assistant` و conversation کلید `system` را نیز از hot path ارتباطات حذف می‌کند.
- اجرای دستی `phase197` در production در تاریخ این audit تایید شد: RPCهای `get_communication_conversations_v2`، `get_communication_timeline` و `mark_communication_read` و index مربوطه موجود هستند؛ این اجرا نیز در `app_schema_migrations` ثبت نشده است.
- `database_v1_phase199_communication_launcher_badge.sql` شمارنده سبک internal/bot برای header را اضافه می‌کند تا موتور کامل ارتباطات در حالت بسته mount نشود. شماره `198` برای migration موازی branding موجود در workspace رزرو شده و توسط این rollout تغییر داده نشده است.
- پاکسازی داده تاریخی unread تا تهیه گزارش دسته‌بندی‌شده و تایید سیاست پاکسازی انجام نمی‌شود.
