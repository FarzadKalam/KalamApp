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

const toJalali = (value?: any) => dayjs(value || new Date()).calendar('jalali');

const clampToFiscalYear = (
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
  fiscalYear?: FiscalYearSnapshot | null
) => {
  if (!fiscalYear?.start_date || !fiscalYear?.end_date) {
    return { start, end };
  }

  const fiscalStart = toJalali(fiscalYear.start_date).startOf('day');
  const fiscalEnd = toJalali(fiscalYear.end_date).endOf('day');
  return {
    start: start.isBefore(fiscalStart) ? fiscalStart : start,
    end: end.isAfter(fiscalEnd) ? fiscalEnd : end,
  };
};

const buildFiscalSegmentRange = (
  now: dayjs.Dayjs,
  fiscalYear: FiscalYearSnapshot,
  segmentMonths: 3 | 6
) => {
  const fiscalStart = toJalali(fiscalYear.start_date).startOf('day');
  const fiscalEnd = toJalali(fiscalYear.end_date).endOf('day');
  const rawMonthDelta = now.startOf('month').diff(fiscalStart.startOf('month'), 'month');
  const monthDelta = Math.max(0, rawMonthDelta);
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
  const now = toJalali(referenceDate || new Date());

  if (unit === 'year' && fiscalYear?.start_date && fiscalYear?.end_date) {
    return {
      start: toJalali(fiscalYear.start_date).startOf('day'),
      end: toJalali(fiscalYear.end_date).endOf('day'),
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
