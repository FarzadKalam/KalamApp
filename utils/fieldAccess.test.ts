import { describe, expect, it } from 'vitest';
import { canFieldAction, canModuleAction, canWriteFieldValue, normalizePermissionSearch } from './fieldAccess';
import { mergePermissionsWithDefaults } from './permissions';

describe('module and field actions', () => {
  it('inherits the old combined action until create is explicitly configured', () => {
    expect(canModuleAction({ edit: false }, 'create')).toBe(false);
    expect(canModuleAction({ create: true, edit: false }, 'create')).toBe(true);
    expect(canModuleAction({ create: false, edit: true }, 'edit')).toBe(true);
    expect(canModuleAction({ view: false, create: true }, 'create')).toBe(false);
    const merged = mergePermissionsWithDefaults({ products: { edit: false } }, { products: { edit: true } });
    expect(merged.products.create).toBe(false);
  });
  it('preserves action overrides when merging roles and defaults', () => {
    const merged = mergePermissionsWithDefaults({ products: { create: false, field_actions: { price: { edit: false } } } },
      { products: { field_actions: { price: { delete: false } } } });
    expect(merged.products.field_actions?.price).toEqual({ edit: false, delete: false });
    expect(merged.products.create).toBe(false);
  });
  it('keeps visibility, creation, editing, clearing and record deletion separate', () => {
    const permission = { delete: false, field_actions: { price: { create: true, edit: true, delete: false } } };
    expect(canWriteFieldValue(permission, 'price', 0, false)).toBe(true);
    expect(canWriteFieldValue(permission, 'price', null, false)).toBe(false);
    expect(canWriteFieldValue(permission, 'price', [], false)).toBe(false);
    expect(canWriteFieldValue(permission, 'price', null, true)).toBe(true);
    expect(canFieldAction(permission, 'price', 'delete')).toBe(false);
    expect(canModuleAction(permission, 'delete')).toBe(false);
    expect(canFieldAction({ fields: { price: false } }, 'price', 'edit')).toBe(false);
    expect(canFieldAction({ field_actions: { price: { view: false } } }, 'price', 'create')).toBe(false);
  });
  it('normalizes Persian and Arabic spelling for filtering', () => {
    expect(normalizePermissionSearch('  شركت‌ها  ')).toBe('شرکت ها');
    expect(normalizePermissionSearch('ويرايش')).toBe('ویرایش');
  });
});
