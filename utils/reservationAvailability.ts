export type ReservationShift = { start: string; end: string };
export type ReservationDaySchedule = {
  enabled?: boolean;
  shifts?: ReservationShift[];
};
export type ReservationDateException = {
  date: string;
  closed?: boolean;
  shifts?: ReservationShift[];
};

export type ReservationAvailabilitySettings = {
  slot_minutes?: number;
  weekly_schedule?: Record<string, ReservationDaySchedule>;
  date_exceptions?: ReservationDateException[];
  allow_official_holidays?: boolean;
};

export type ReservationBusyRange = {
  startAt: string;
  endAt: string;
  quantity: number;
};

export type ReservationSlot = {
  startAt: string;
  endAt: string;
  startLabel: string;
  endLabel: string;
  remainingCapacity: number;
};

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const toTehranInstant = (date: string, time: string) => {
  const parsed = new Date(`${date}T${time}:00+03:30`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getReservationDayKey = (date: string) => {
  const parsed = toTehranInstant(date, "12:00");
  return parsed ? WEEKDAY_KEYS[parsed.getUTCDay()] : null;
};

export const getReservationShiftsForDate = (
  date: string,
  settings: ReservationAvailabilitySettings,
): ReservationShift[] => {
  const exception = (settings.date_exceptions || []).find(
    (item) => item.date === date,
  );
  if (exception?.closed) return [];
  if (exception && Array.isArray(exception.shifts)) return exception.shifts;
  const dayKey = getReservationDayKey(date);
  if (!dayKey) return [];
  const schedule = settings.weekly_schedule?.[dayKey];
  return schedule?.enabled === false ? [] : schedule?.shifts || [];
};

export const buildReservationSlots = ({
  date,
  settings,
  capacity,
  preparationMinutes = 0,
  cleanupMinutes = 0,
  busyRanges,
}: {
  date: string;
  settings: ReservationAvailabilitySettings;
  capacity: number;
  preparationMinutes?: number;
  cleanupMinutes?: number;
  busyRanges: ReservationBusyRange[];
}): ReservationSlot[] => {
  const slotMinutes = Math.max(
    5,
    Math.floor(Number(settings.slot_minutes || 30)),
  );
  const safeCapacity = Math.max(1, Math.floor(Number(capacity || 1)));
  const slots: ReservationSlot[] = [];

  getReservationShiftsForDate(date, settings).forEach((shift) => {
    const shiftStart = toTehranInstant(date, shift.start);
    const shiftEnd = toTehranInstant(date, shift.end);
    if (!shiftStart || !shiftEnd || shiftEnd <= shiftStart) return;

    for (
      let startMs = shiftStart.getTime();
      startMs + slotMinutes * 60_000 <= shiftEnd.getTime();
      startMs += slotMinutes * 60_000
    ) {
      const endMs = startMs + slotMinutes * 60_000;
      const guardedStart = startMs - Math.max(0, preparationMinutes) * 60_000;
      const guardedEnd = endMs + Math.max(0, cleanupMinutes) * 60_000;
      const reserved = busyRanges.reduce((sum, range) => {
        const rangeStart =
          Date.parse(range.startAt) - Math.max(0, preparationMinutes) * 60_000;
        const rangeEnd =
          Date.parse(range.endAt) + Math.max(0, cleanupMinutes) * 60_000;
        return Number.isFinite(rangeStart) &&
          Number.isFinite(rangeEnd) &&
          rangeStart < guardedEnd &&
          rangeEnd > guardedStart
          ? sum + Math.max(0, Number(range.quantity || 0))
          : sum;
      }, 0);
      const remainingCapacity = Math.max(0, safeCapacity - reserved);
      slots.push({
        startAt: new Date(startMs).toISOString(),
        endAt: new Date(endMs).toISOString(),
        startLabel: shift.start,
        endLabel: new Intl.DateTimeFormat("fa-IR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Asia/Tehran",
        }).format(new Date(endMs)),
        remainingCapacity,
      });
    }
  });

  return slots;
};
