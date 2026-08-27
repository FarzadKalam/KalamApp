import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CampaignField, { CampaignFieldSurfaceProvider } from './CampaignField';
import { FieldType } from '../../types';

vi.mock('../SmartFieldRenderer', () => ({
  default: (props: any) => (
    <input
      aria-label="smart-field"
      data-overlay-z-index={String(props.overlayZIndexBase || '')}
      value={String(props.value || '')}
      readOnly
    />
  ),
}));

vi.mock('../../moduleRegistry', () => ({ MODULES: {} }));

afterEach(cleanup);

describe('CampaignField', () => {
  it('keeps the field label visible and forwards the modal overlay level', () => {
    const { getByText, getByLabelText } = render(
      <CampaignFieldSurfaceProvider alwaysShowLabels overlayZIndexBase={15380}>
        <CampaignField
          fieldKey="estimated_audience"
          label="تعداد تخمینی مخاطبان پیامک"
          type={FieldType.NUMBER}
          value={120}
          onChange={() => undefined}
        />
      </CampaignFieldSurfaceProvider>,
    );

    expect(getByText('تعداد تخمینی مخاطبان پیامک').className).not.toContain('sm:hidden');
    expect(getByLabelText('smart-field').getAttribute('data-overlay-z-index')).toBe('15380');
  });

  it('keeps long-text labels visible without a special surface provider', () => {
    const { getByText } = render(
      <CampaignField
        fieldKey="message_template"
        label="متن پیامک"
        type={FieldType.LONG_TEXT}
        value="متن آزمایشی"
        onChange={() => undefined}
      />,
    );

    expect(getByText('متن پیامک').className).not.toContain('sm:hidden');
  });
});
