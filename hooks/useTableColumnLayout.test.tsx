import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTableColumnLayout } from './useTableColumnLayout';

const columns = [{ key: 'name', dataIndex: 'name', width: 220, title: 'نام' }, { key: 'status', dataIndex: 'status', width: 120, title: 'وضعیت' }];
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
describe('table column interaction state', () => {
  it('restores widths and order separately for every org/user/view', () => {
    const rootRef = { current: document.createElement('div') };
    const { result, rerender } = renderHook(({ key }) => useTableColumnLayout({ columns, scopeKey: key, rootRef }), { initialProps: { key: 'org-a:user-a:view' } });
    act(() => result.current.moveColumn('status', 'name'));
    let header = (result.current.columns.find((column) => column.key === 'name')?.onHeaderCell as any)?.({});
    act(() => header.onResizeWidth('name', 280));
    expect(result.current.columns.map((column) => column.key)).toEqual(['status', 'name']);
    expect(rootRef.current.style.getPropertyValue('--smarttable-col-name')).toBe('280px');
    rerender({ key: 'org-b:user-a:view' });
    expect(result.current.columns.map((column) => column.key)).toEqual(['name', 'status']);
    expect(rootRef.current.style.getPropertyValue('--smarttable-col-name')).toBe('220px');
    rerender({ key: 'org-a:user-a:view' });
    expect(result.current.columns.map((column) => column.key)).toEqual(['status', 'name']);
    header = (result.current.columns.find((column) => column.key === 'name')?.onHeaderCell as any)?.({});
    act(() => header.onResizeWidth('name'));
    expect(rootRef.current.style.getPropertyValue('--smarttable-col-name')).toBe('220px');
  });
  it('resizes RTL columns without a React render per pointer movement', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1; });
    const rootRef = { current: document.createElement('div') };
    let renders = 0;
    const { result } = renderHook(() => { renders++; return useTableColumnLayout({ columns, scopeKey: 'resize-test', rootRef }); });
    const header = (result.current.columns[0].onHeaderCell as any)?.({});
    act(() => header.onResizeStart('name', { clientX: 300, button: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() }));
    const initialRenders = renders;
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 260 })); });
    expect(rootRef.current.style.getPropertyValue('--smarttable-col-name')).toBe('260px');
    expect(renders).toBe(initialRenders);
    act(() => { window.dispatchEvent(new MouseEvent('pointerup')); });
    expect(JSON.parse(localStorage.getItem('resize-test') || '{}').widths.name).toBe(260);
  });
});
