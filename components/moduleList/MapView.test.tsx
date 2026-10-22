// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FieldType } from '../../types';

const { createMap } = vi.hoisted(() => ({ createMap: vi.fn() }));
vi.mock('maplibre-gl', () => ({ default: { Map: createMap } }));
vi.mock('../../utils/maplibreRuntime', () => ({
  ensureMapLibreRTLTextPlugin: vi.fn(),
  attachMissingMapImageFallback: vi.fn(),
}));
vi.mock('./MapRecordModal', () => ({ default: () => null }));
import MapView from './MapView';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('MapView when WebGL is unavailable', () => {
  const props = {
    data: [{ id: 'record', name: 'مشتری', location: '35.6892,51.3890' }],
    moduleId: 'customers',
    moduleConfig: { fields: [{ key: 'location', type: FieldType.LOCATION }] } as any,
    navigate: vi.fn(),
  };

  it('keeps the view usable after initialization fails and allows retry', () => {
    createMap.mockImplementation(function () { throw new Error('Failed to initialize WebGL'); });
    render(<MapView {...props} />);
    expect(screen.getByRole('status').textContent).toContain('نقشه در این مرورگر قابل نمایش نیست');
    fireEvent.click(screen.getByRole('button', { name: 'تلاش مجدد' }));
    expect(createMap).toHaveBeenCalledTimes(2);
  });

  it('initializes when locations arrive after the initial empty render', () => {
    createMap.mockImplementation(function () { throw new Error('Failed to initialize WebGL'); });
    const view = render(<MapView {...props} data={[]} />);
    expect(createMap).not.toHaveBeenCalled();
    view.rerender(<MapView {...props} />);
    expect(createMap).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
