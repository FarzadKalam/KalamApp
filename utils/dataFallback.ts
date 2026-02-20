/**
 * Data Fallback System
 * 
 * این utility برای fetch کردن data از Supabase استفاده می‌شود
 * اگر Supabase دسترسی‌پذیر نبود، mock data استفاده می‌شود
 * 
 * این سیستم برای development و testing مفید است:
 * - موازی test database quality و functionality
 * - fallback برای offline scenarios
 * - debugging بدون dependency بر database
 */

import { supabase } from '../supabaseClient';
import { MOCK_PRODUCTS, MOCK_BOMS, MOCK_PRODUCTION_ORDERS } from '../mockData';

interface DataFallbackOptions {
  useMockData?: boolean; // force use mock data
  timeout?: number; // timeout برای database query (ms)
}

/**
 * Fetch products از database با fallback به mock
 */
export async function fetchProducts(options: DataFallbackOptions = {}) {
  const { useMockData = false, timeout = 5000 } = options;

  // اگر forcefully mock خواسته شده
  if (useMockData) {
    console.warn('[DataFallback] Using MOCK_PRODUCTS (forced)');
    return MOCK_PRODUCTS;
  }

  try {
    // Try to fetch from Supabase with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .limit(500); // limit برای performance

    clearTimeout(timeoutId);

    if (error) {
      console.warn('[DataFallback] Database error:', error.message);
      console.log('[DataFallback] Falling back to MOCK_PRODUCTS');
      return MOCK_PRODUCTS;
    }

    if (!data || data.length === 0) {
      console.warn('[DataFallback] No products found in database, using MOCK_PRODUCTS');
      return MOCK_PRODUCTS;
    }

    console.log(`[DataFallback] ✅ Loaded ${data.length} products from database`);
    return data;
  } catch (error) {
    console.error('[DataFallback] Exception during products fetch:', error);
    console.log('[DataFallback] Falling back to MOCK_PRODUCTS');
    return MOCK_PRODUCTS;
  }
}

/**
 * Fetch BOMs از database با fallback به mock
 */
export async function fetchBOMs(options: DataFallbackOptions = {}) {
  const { useMockData = false, timeout = 5000 } = options;

  if (useMockData) {
    console.warn('[DataFallback] Using MOCK_BOMS (forced)');
    return MOCK_BOMS;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const { data, error } = await supabase
      .from('boms')
      .select('*')
      .limit(500);

    clearTimeout(timeoutId);

    if (error) {
      console.warn('[DataFallback] Database error:', error.message);
      console.log('[DataFallback] Falling back to MOCK_BOMS');
      return MOCK_BOMS;
    }

    if (!data || data.length === 0) {
      console.warn('[DataFallback] No BOMs found in database, using MOCK_BOMS');
      return MOCK_BOMS;
    }

    console.log(`[DataFallback] ✅ Loaded ${data.length} BOMs from database`);
    return data;
  } catch (error) {
    console.error('[DataFallback] Exception during BOMs fetch:', error);
    console.log('[DataFallback] Falling back to MOCK_BOMS');
    return MOCK_BOMS;
  }
}

/**
 * Fetch Production Orders از database با fallback به mock
 */
export async function fetchProductionOrders(options: DataFallbackOptions = {}) {
  const { useMockData = false, timeout = 5000 } = options;

  if (useMockData) {
    console.warn('[DataFallback] Using MOCK_PRODUCTION_ORDERS (forced)');
    return MOCK_PRODUCTION_ORDERS;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // NOTE: اگر جدول production_orders هنوز ساخته نشده، error خواهد بود
    const { data, error } = await supabase
      .from('production_orders')
      .select('*')
      .limit(500);

    clearTimeout(timeoutId);

    if (error) {
      console.warn('[DataFallback] Database error:', error.message);
      console.log('[DataFallback] Falling back to MOCK_PRODUCTION_ORDERS');
      return MOCK_PRODUCTION_ORDERS;
    }

    if (!data || data.length === 0) {
      console.warn('[DataFallback] No production orders found in database, using MOCK_PRODUCTION_ORDERS');
      return MOCK_PRODUCTION_ORDERS;
    }

    console.log(`[DataFallback] ✅ Loaded ${data.length} production orders from database`);
    return data;
  } catch (error) {
    console.error('[DataFallback] Exception during production orders fetch:', error);
    console.log('[DataFallback] Falling back to MOCK_PRODUCTION_ORDERS');
    return MOCK_PRODUCTION_ORDERS;
  }
}

/**
 * Generic fallback function برای هر table
 * 
 * استفاده:
 * const customers = await fetchWithFallback('customers', MOCK_CUSTOMERS);
 */
export async function fetchWithFallback(
  tableName: string,
  mockData: any[],
  options: DataFallbackOptions = {}
) {
  const { useMockData = false, timeout = 5000 } = options;

  if (useMockData) {
    console.warn(`[DataFallback] Using mock data for ${tableName} (forced)`);
    return mockData;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(500);

    clearTimeout(timeoutId);

    if (error) {
      console.warn(`[DataFallback] Database error for ${tableName}:`, error.message);
      console.log(`[DataFallback] Falling back to mock data for ${tableName}`);
      return mockData;
    }

    if (!data || data.length === 0) {
      console.warn(`[DataFallback] No data found in ${tableName}, using mock data`);
      return mockData;
    }

    console.log(`[DataFallback] ✅ Loaded ${data.length} records from ${tableName}`);
    return data;
  } catch (error) {
    console.error(`[DataFallback] Exception during ${tableName} fetch:`, error);
    console.log(`[DataFallback] Falling back to mock data for ${tableName}`);
    return mockData;
  }
}

/**
 * Helper: Check database connectivity
 * برای debugging و monitoring
 */
export async function checkDatabaseConnectivity() {
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    
    if (error) {
      return {
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }

    return {
      connected: true,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      connected: false,
      error: String(error),
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Initialize data on app startup
 * برای logging و diagnostics
 */
export async function initializeDataSystem() {
  console.group('[DataFallback] Initializing Data System');
  
  const connectivity = await checkDatabaseConnectivity();
  console.log('Database Status:', connectivity);
  
  if (connectivity.connected) {
    console.log('✅ Database connected - will use real data with mock fallback');
  } else {
    console.warn('⚠️ Database not connected - will use mock data for development');
  }
  
  console.groupEnd();
}
