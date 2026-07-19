import { beforeEach, describe, expect, it } from 'vitest';
import {
  persistLoadingBrandIdentity,
  readCachedLoadingBrandIdentity,
  resolveLoadingBrandIdentity,
} from './loadingBrand';

describe('loading brand identity', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('uses the organization names and slogan without relying on a logo', () => {
    expect(resolveLoadingBrandIdentity({
      company_name_en: 'Taze Co',
      company_full_name: 'شرکت تازه',
      slogan: 'مدیریت ساده‌تر عملیات',
      logo_url: 'https://example.test/logo.png',
    })).toEqual({
      englishName: 'Taze Co',
      primaryName: 'شرکت تازه',
      slogan: 'مدیریت ساده‌تر عملیات',
    });
  });

  it('keeps the cached identity scoped to the current hostname', () => {
    persistLoadingBrandIdentity({
      englishName: 'Taze Co',
      primaryName: 'شرکت تازه',
      slogan: 'مدیریت ساده‌تر عملیات',
    });

    expect(readCachedLoadingBrandIdentity()).toEqual({
      englishName: 'Taze Co',
      primaryName: 'شرکت تازه',
      slogan: 'مدیریت ساده‌تر عملیات',
    });
  });
});
