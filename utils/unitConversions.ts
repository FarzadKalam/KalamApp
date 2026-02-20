export type UnitValue =
  | 'عدد'
  | 'بسته'
  | 'فوت مربع'
  | 'سانتیمتر مربع'
  | 'میلیمتر مربع'
  | 'متر مربع'
  | 'میلیمتر طول'
  | 'سانتیمتر طول'
  | 'متر طول';

export const HARD_CODED_UNIT_OPTIONS: Array<{ label: UnitValue; value: UnitValue }> = [
  { label: 'عدد', value: 'عدد' },
  { label: 'بسته', value: 'بسته' },
  { label: 'فوت مربع', value: 'فوت مربع' },
  { label: 'سانتیمتر مربع', value: 'سانتیمتر مربع' },
  { label: 'میلیمتر مربع', value: 'میلیمتر مربع' },
  { label: 'متر مربع', value: 'متر مربع' },
  { label: 'میلیمتر طول', value: 'میلیمتر طول' },
  { label: 'سانتیمتر طول', value: 'سانتیمتر طول' },
  { label: 'متر طول', value: 'متر طول' },
];

const FT2_IN_CM2 = 930.25;
const FT2_IN_MM2 = 93025;
const FT2_IN_M2 = 0.0929025;
const M_IN_MM = 1000;
const M_IN_CM = 100;

const AREA_UNITS: UnitValue[] = ['فوت مربع', 'سانتیمتر مربع', 'میلیمتر مربع', 'متر مربع'];
const LENGTH_UNITS: UnitValue[] = ['میلیمتر طول', 'سانتیمتر طول', 'متر طول'];
const roundToThree = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
};

export const convertArea = (value: number, from: UnitValue, to: UnitValue) => {
  if (!Number.isFinite(value)) return 0;
  if (from === to) return roundToThree(value);
  if (['عدد', 'بسته'].includes(from) || ['عدد', 'بسته'].includes(to)) return 0;

  const isArea = AREA_UNITS.includes(from) && AREA_UNITS.includes(to);
  const isLength = LENGTH_UNITS.includes(from) && LENGTH_UNITS.includes(to);
  if (!isArea && !isLength) return 0;

  const toFt2 = (val: number, unit: UnitValue) => {
    switch (unit) {
      case 'فوت مربع':
        return val;
      case 'سانتیمتر مربع':
        return val / FT2_IN_CM2;
      case 'میلیمتر مربع':
        return val / FT2_IN_MM2;
      case 'متر مربع':
        return val / FT2_IN_M2;
      default:
        return 0;
    }
  };

  const fromFt2 = (val: number, unit: UnitValue) => {
    switch (unit) {
      case 'فوت مربع':
        return val;
      case 'سانتیمتر مربع':
        return val * FT2_IN_CM2;
      case 'میلیمتر مربع':
        return val * FT2_IN_MM2;
      case 'متر مربع':
        return val * FT2_IN_M2;
      default:
        return 0;
    }
  };

  const toMeter = (val: number, unit: UnitValue) => {
    switch (unit) {
      case 'متر طول':
        return val;
      case 'سانتیمتر طول':
        return val / M_IN_CM;
      case 'میلیمتر طول':
        return val / M_IN_MM;
      default:
        return 0;
    }
  };

  const fromMeter = (val: number, unit: UnitValue) => {
    switch (unit) {
      case 'متر طول':
        return val;
      case 'سانتیمتر طول':
        return val * M_IN_CM;
      case 'میلیمتر طول':
        return val * M_IN_MM;
      default:
        return 0;
    }
  };

  if (isLength) {
    return roundToThree(fromMeter(toMeter(value, from), to));
  }

  return roundToThree(fromFt2(toFt2(value, from), to));
};
