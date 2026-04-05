import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { safeJalaliFormat } from './persianNumberFormatter';
import type { GoalDateRange, GoalPeriodUnit } from './goalTypes';

dayjs.extend(quarterOfYear);

export type FiscalYearSnapshot = {
  id?: string | null;
  title?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean | null;
};

export type GoalExplicitRangeInput = {
  startDate?: string | null;
  endDate?: string | null;
};

const toGoalDate = (value?: any) => {
  const parsed = dayjs(value || new Date());
  return parsed.isValid() ? parsed : dayjs();
};

const clampToFiscalYear = (
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
  fiscalYear?: FiscalYearSnapshot | null
) => {
  if (!fiscalYear?.start_date || !fiscalYear?.end_date) {
    return { start, end };
  }

  const fiscalStart = toGoalDate(fiscalYear.start_date).startOf('day');
  const fiscalEnd = toGoalDate(fiscalYear.end_date).endOf('day');
  if (!fiscalStart.isValid() || !fiscalEnd.isValid() || !fiscalEnd.isAfter(fiscalStart)) {
    return { start, end };
  }

  const clamped = {
    start: start.isBefore(fiscalStart) ? fiscalStart : start,
    end: end.isAfter(fiscalEnd) ? fiscalEnd : end,
  };

  if (clamped.end.isBefore(clamped.start)) {
    return { start, end };
  }

  if (
    end.diff(start, 'day') >= 1 &&
    clamped.end.diff(clamped.start, 'day') < 1
  ) {
    return { start, end };
  }

  return clamped;
};

const normalizeGoalRangeOrder = (start: dayjs.Dayjs, end: dayjs.Dayjs) => {
  if (end.isBefore(start)) {
    return {
      start: end.startOf('day'),
      end: start.endOf('day'),
    };
  }

  return {
    start: start.startOf('day'),
    end: end.endOf('day'),
  };
};

const parseExplicitGoalDate = (value?: string | null, edge: 'start' | 'end' = 'start') => {
  if (!value) return null;
  const parsed = toGoalDate(value);
  if (!parsed.isValid()) return null;
  return edge === 'end' ? parsed.endOf('day') : parsed.startOf('day');
};

const buildFiscalSegmentRange = (
  now: dayjs.Dayjs,
  fiscalYear: FiscalYearSnapshot,
  segmentMonths: 3 | 6
) => {
  const fiscalStart = toGoalDate(fiscalYear.start_date).startOf('day');
  const fiscalEnd = toGoalDate(fiscalYear.end_date).endOf('day');
  const maxMonthDelta = Math.max(
    0,
    fiscalEnd.startOf('month').diff(fiscalStart.startOf('month'), 'month')
  );
  const rawMonthDelta = now.startOf('month').diff(fiscalStart.startOf('month'), 'month');
  const monthDelta = Math.min(Math.max(0, rawMonthDelta), maxMonthDelta);
  const segmentIndex = Math.floor(monthDelta / segmentMonths);
  const start = fiscalStart.add(segmentIndex * segmentMonths, 'month').startOf('day');
  const end = start.add(segmentMonths, 'month').subtract(1, 'day').endOf('day');
  return clampToFiscalYear(start, end, fiscalYear);
};

export const buildGoalCurrentRange = (
  unit: GoalPeriodUnit,
  fiscalYear?: FiscalYearSnapshot | null,
  referenceDate?: string | Date | null
) => {
  const now = toGoalDate(referenceDate || new Date());

  if (unit === 'year' && fiscalYear?.start_date && fiscalYear?.end_date) {
    return {
      start: toGoalDate(fiscalYear.start_date).startOf('day'),
      end: toGoalDate(fiscalYear.end_date).endOf('day'),
    };
  }

  if (unit === 'quarter' && fiscalYear?.start_date && fiscalYear?.end_date) {
    return buildFiscalSegmentRange(now, fiscalYear, 3);
  }

  if (unit === 'half_year' && fiscalYear?.start_date && fiscalYear?.end_date) {
    return buildFiscalSegmentRange(now, fiscalYear, 6);
  }

  let start = now.startOf('day');
  let end = now.endOf('day');

  if (unit === 'week') {
    start = now.startOf('week').startOf('day');
    end = now.endOf('week').endOf('day');
  } else if (unit === 'month') {
    start = now.startOf('month').startOf('day');
    end = now.endOf('month').endOf('day');
  } else if (unit === 'quarter') {
    start = now.startOf('quarter').startOf('day');
    end = now.endOf('quarter').endOf('day');
  } else if (unit === 'half_year') {
    const startMonth = now.month() < 6 ? 0 : 6;
    start = now.month(startMonth).startOf('month').startOf('day');
    end = start.add(6, 'month').subtract(1, 'day').endOf('day');
  } else if (unit === 'year') {
    start = now.startOf('year').startOf('day');
    end = now.endOf('year').endOf('day');
  }

  return clampToFiscalYear(start, end, fiscalYear);
};

export const buildGoalExplicitRange = (
  rangeInput?: GoalExplicitRangeInput | null,
  referenceDate?: string | Date | null
) => {
  const explicitStart = parseExplicitGoalDate(rangeInput?.startDate, 'start');
  const explicitEnd = parseExplicitGoalDate(rangeInput?.endDate, 'end');

  if (!explicitStart && !explicitEnd) {
    return null;
  }

  const fallback = toGoalDate(referenceDate || new Date());
  const start = explicitStart || fallback.startOf('day');
  const end = explicitEnd || fallback.endOf('day');
  return normalizeGoalRangeOrder(start, end);
};

export const clampGoalRangeToBounds = (
  range: { start: dayjs.Dayjs; end: dayjs.Dayjs },
  bounds?: { start: dayjs.Dayjs; end: dayjs.Dayjs } | null
) => {
  if (!bounds) return range;

  const start = range.start.isBefore(bounds.start) ? bounds.start : range.start;
  const end = range.end.isAfter(bounds.end) ? bounds.end : range.end;

  if (end.isBefore(start)) {
    return {
      start: bounds.start,
      end: bounds.end,
    };
  }

  return normalizeGoalRangeOrder(start, end);
};

export const buildGoalRangeSnapshot = (start: dayjs.Dayjs, end: dayjs.Dayjs): GoalDateRange => ({
  startIso: start.toISOString(),
  endIso: end.toISOString(),
  startLabel: safeJalaliFormat(start.toISOString(), 'YYYY/MM/DD'),
  endLabel: safeJalaliFormat(end.toISOString(), 'YYYY/MM/DD'),
});

export const getGoalUnitOrder = (unit: GoalPeriodUnit) =>
  ['day', 'week', 'month', 'quarter', 'half_year', 'year'].indexOf(unit);

export const getAvailableGoalSubperiodUnits = (mainUnit: GoalPeriodUnit) => {
  const order = getGoalUnitOrder(mainUnit);
  return ['day', 'week', 'month', 'quarter', 'half_year', 'year']
    .slice(0, order + 1) as GoalPeriodUnit[];
};

export const clampGoalSubperiodUnit = (
  mainUnit: GoalPeriodUnit,
  preferred?: GoalPeriodUnit | null
) => {
  const available = getAvailableGoalSubperiodUnits(mainUnit);
  if (preferred && available.includes(preferred)) {
    return preferred;
  }
  return available[Math.max(0, available.length - 1)];
};

export const calculateRangeRatio = (
  parentRange: GoalDateRange,
  childRange: GoalDateRange
) => {
  const parentMs = Math.max(1, new Date(parentRange.endIso).getTime() - new Date(parentRange.startIso).getTime());
  const childMs = Math.max(0, new Date(childRange.endIso).getTime() - new Date(childRange.startIso).getTime());
  return Math.max(0, Math.min(1, childMs / parentMs));
};
