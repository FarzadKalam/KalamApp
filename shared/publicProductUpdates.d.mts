export interface ProductUpdateItem {
  version: string;
  title: string;
  summary: string;
  details: string[];
}

export const RECENT_PRODUCT_UPDATES: ProductUpdateItem[];
