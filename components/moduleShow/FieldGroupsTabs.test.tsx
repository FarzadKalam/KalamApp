import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { productsConfig } from '../../modules/productsConfig';
import { BlockType } from '../../types';
import FieldGroupsTabs from './FieldGroupsTabs';

vi.mock('../EditableTable', () => ({ default: () => null }));
vi.mock('../products/ProductStockMovementsPanel', () => ({ default: () => null }));
vi.mock('../shelves/ShelfInventoryPanel', () => ({ default: () => null }));
vi.mock('../shelves/ShelfStockMovementsPanel', () => ({ default: () => null }));
vi.mock('../../utils/taskMeta', () => ({ isTaskLegacySourceField: () => false }));
vi.mock('../../supabaseClient', () => ({ supabase: {} }));
vi.mock('../../hooks/useProductSalesSummary', () => ({ useProductSalesSummary: () => ({}) }));
vi.mock('../products/ProductSiteContentPanel', async () => {
  const { useState } = await import('react');
  return { default: () => {
    const [text, setText] = useState('');
    return <input aria-label="پیش‌نویس سایت" value={text} onChange={(event) => setText(event.target.value)} />;
  } };
});

afterEach(cleanup);

const props = {
  moduleConfig: productsConfig,
  fieldGroups: productsConfig.blocks.filter((block) => block.type === BlockType.FIELD_GROUP),
  moduleId: 'products',
  recordId: 'product-first',
  data: { org_id: 'org-first' },
  relationOptions: {},
  dynamicOptions: {},
  checkVisibility: () => true,
  renderSmartField: () => null,
};

it('loads site content after the retail settings tab and preserves its draft while switching tabs', async () => {
  const { rerender } = render(<FieldGroupsTabs {...props} />);
  const retail = screen.getByRole('tab', { name: 'تنظیمات فاکتور فروشگاهی' });
  const content = screen.getByRole('tab', { name: 'محتوای سایت محصول' });
  expect(screen.getAllByRole('tab').indexOf(content)).toBe(screen.getAllByRole('tab').indexOf(retail) + 1);
  expect(screen.queryByLabelText('پیش‌نویس سایت')).toBeNull();
  fireEvent.click(content);
  fireEvent.change(await screen.findByLabelText('پیش‌نویس سایت'), { target: { value: 'متن فعلی' } });
  fireEvent.click(retail);
  fireEvent.click(content);
  expect(screen.getByLabelText('پیش‌نویس سایت')).toHaveValue('متن فعلی');
  rerender(<FieldGroupsTabs {...props} recordId="product-second" />);
  expect(screen.getByLabelText('پیش‌نویس سایت')).toHaveValue('');
});
