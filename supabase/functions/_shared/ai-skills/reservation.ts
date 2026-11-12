import {
  sharedRestSelect,
  canViewModuleWithPlan,
  isWithinOrgWorkSchedule,
  normalizeId,
} from '../ai-grounding.ts';
import type { DomainSkillModule, SkillExecutionContext } from './types.ts';

export const checkReservationSlotAvailability = (params: {
  requestedStartAt: Date;
  requestedEndAt: Date;
  resource?: {
    id: string;
    name?: string;
    capacity?: number | null;
    preparation_minutes?: number | null;
    cleanup_minutes?: number | null;
  } | null;
  existingReservations: Array<{
    id?: string;
    name?: string;
    system_code?: string;
    status?: string;
    start_at: string;
    end_at: string;
    reservationItems?: any[];
  }>;
}): {
  validWindow: boolean;
  available: boolean;
  overlappingCount: number;
  capacity: number;
  conflicts: Array<{ name: string; systemCode: string | null; startAt: string; endAt: string }>;
  reasonFa?: string;
} => {
  const startMs = params.requestedStartAt.getTime();
  const endMs = params.requestedEndAt.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return {
      validWindow: false,
      available: false,
      overlappingCount: 0,
      capacity: 0,
      conflicts: [],
      reasonFa: 'زمان پایان رزرو باید دقیقاً بعد از زمان شروع باشد.',
    };
  }

  const prepMs = Math.max(0, Number(params.resource?.preparation_minutes || 0)) * 60_000;
  const cleanupMs = Math.max(0, Number(params.resource?.cleanup_minutes || 0)) * 60_000;
  const capacity = Math.max(1, Number(params.resource?.capacity || 1));
  const resourceId = String(params.resource?.id || '').trim();

  const conflicts: Array<{ name: string; systemCode: string | null; startAt: string; endAt: string }> = [];
  for (const existing of params.existingReservations || []) {
    const status = String(existing?.status || '').toLowerCase();
    if (status === 'canceled' || status === 'cancelled' || status === 'rejected') continue;
    const exStart = new Date(existing.start_at).getTime() - prepMs;
    const exEnd = new Date(existing.end_at).getTime() + cleanupMs;
    if (!Number.isFinite(exStart) || !Number.isFinite(exEnd)) continue;

    if (resourceId && Array.isArray(existing.reservationItems) && existing.reservationItems.length > 0) {
      const touchesResource = existing.reservationItems.some(
        (item: any) => String(item?.resource_id || item?.reservation_resource_id || '').trim() === resourceId,
      );
      if (!touchesResource) continue;
    }

    const overlaps = startMs < exEnd && endMs > exStart;
    if (overlaps) {
      conflicts.push({
        name: String(existing?.name || 'رزرو موجود'),
        systemCode: existing?.system_code ? String(existing.system_code) : null,
        startAt: existing.start_at,
        endAt: existing.end_at,
      });
    }
  }

  const available = conflicts.length < capacity;
  return {
    validWindow: true,
    available,
    overlappingCount: conflicts.length,
    capacity,
    conflicts,
    reasonFa: available
      ? undefined
      : `ظرفیت منبع با احتساب بافر آماده‌سازی/پاکسازی در این بازه تکمیل است (${conflicts.length} تداخل).`,
  };
};

export const reservationSkill: DomainSkillModule = {
  agentKey: 'reservation',
  titleFa: 'ایجنت رزرواسیون',
  buildContractPrompt: () => [
    '## قرارداد تخصصی ایجنت رزرواسیون',
    '1. **قانون زمان و بافر (`reservations` + `reservation_resources`)**:',
    '   - همیشه کنترل کن `end_at > start_at` باشد و تاریخ/ساعت دقیق از `explicit_user_dates` یا `upcoming_dates` با منطقه زمانی `Asia/Tehran` تبدیل شود.',
    '   - ظرفیت هم‌زمان (`capacity`) و بافر قبل و بعد (`preparation_minutes`, `cleanup_minutes`) و تنظیمات `company_settings.reservation_settings` و `work_schedules` را حتماً بررسی کن.',
    '2. **تایید تداخل و تعطیلات**: اگر زمان در روز تعطیل رسمی/جمعه است یا تداخل رزرو وجود دارد، حتماً به کاربر هشدار بده و زمان جایگزین پیشنهاد کن.',
    '3. **اتصال مالی و پیگیری**: در صورت نیاز، مبلغ بیعانه (`deposit_amount`) و اتصال به فاکتور فروش (`sales_invoice_id`) یا ایجاد فعالیت یادآور قبل از نوبت را لحاظ کن.',
  ].join('\n'),
  gatherDomainContext: async (ctx: SkillExecutionContext) => {
    const orgId = normalizeId(ctx.grounding.orgId);
    if (!orgId || ctx.grounding.freeChatMode) return null;
    const perms = ctx.authContext?.permissions;
    const plan = ctx.grounding.planContext;
    const bundle: Record<string, any> = {
      reservation_settings: ctx.grounding.reservationSettings,
      schedule_status_now: isWithinOrgWorkSchedule(
        ctx.grounding.workSchedules,
        new Date(),
        ctx.grounding.calendarContext?.today,
      ),
    };

    const [resources, upcomingReservations] = await Promise.all([
      canViewModuleWithPlan(plan, perms, 'reservation_resources')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'reservation_resources', {
            org_id: `eq.${orgId}`,
            status: 'eq.active',
            select: 'id,name,system_code,resource_type,capacity,preparation_minutes,cleanup_minutes,assignee_id',
            limit: 15,
          })
        : Promise.resolve([]),
      canViewModuleWithPlan(plan, perms, 'reservations')
        ? sharedRestSelect(ctx.supabaseUrl, ctx.serviceRoleKey, 'reservations', {
            org_id: `eq.${orgId}`,
            start_at: `gte.${new Date(Date.now() - 24 * 60 * 60_000).toISOString()}`,
            select: 'id,name,system_code,status,customer_id,assignee_id,start_at,end_at,deposit_amount,reservationItems',
            order: 'start_at.asc',
            limit: 15,
          })
        : Promise.resolve([]),
    ]);

    if (resources.length) bundle.active_resources = resources;
    if (upcomingReservations.length) bundle.upcoming_reservations = upcomingReservations;
    return bundle;
  },
};
