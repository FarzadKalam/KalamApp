import { Input } from 'antd';
import { useMemo, useRef } from 'react';
import { normalizeOtpToken } from '../../utils/otpAuth';

type OtpCodeInputProps = {
  value?: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
};

/** ورودی مرکزی کد تایید؛ اعداد فارسی، عربی و انگلیسی را یکسان می‌پذیرد. */
const OtpCodeInput = ({ value = '', onChange, length = 6, disabled, autoFocus }: OtpCodeInputProps) => {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = useMemo(() => {
    const normalized = normalizeOtpToken(value).slice(0, length);
    return Array.from({ length }, (_, index) => normalized[index] || '');
  }, [length, value]);

  const updateAt = (index: number, raw: unknown) => {
    const nextDigits = [...digits];
    const next = normalizeOtpToken(raw).slice(0, length - index);
    if (next.length > 1) {
      next.split('').forEach((digit, offset) => { nextDigits[index + offset] = digit; });
    } else {
      nextDigits[index] = next;
    }
    onChange(nextDigits.join('').slice(0, length));
    const focusIndex = Math.min(length - 1, index + Math.max(next.length, 1));
    if (next) window.setTimeout(() => refs.current[focusIndex]?.focus(), 0);
  };

  return (
    <div className="flex justify-between gap-2" dir="ltr" aria-label="کد تایید شش رقمی">
      {digits.map((digit, index) => (
        <Input
          key={index}
          ref={(node) => { refs.current[index] = node?.input || null; }}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`رقم ${index + 1} کد تایید`}
          maxLength={length}
          className="!h-12 !w-11 text-center text-xl font-bold"
          onChange={(event) => updateAt(index, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !digit && index > 0) refs.current[index - 1]?.focus();
            if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
            if (event.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus();
          }}
          onPaste={(event) => {
            event.preventDefault();
            updateAt(index, event.clipboardData.getData('text'));
          }}
        />
      ))}
    </div>
  );
};

export default OtpCodeInput;
