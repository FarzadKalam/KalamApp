
/**
 * Mock Data for Development & Testing
 * 
 * این داده‌ها برای development استفاده می‌شوند اگر Supabase دسترسی‌پذیر نباشد.
 * 
 * نحوه استفاده:
 * - اگر database فعال باشد: داده‌های real از Supabase استفاده می‌شوند
 * - اگر database نباشد: این mock data استفاده می‌شود
 * 
 * برای استفاده صریح mock data:
 * import { fetchProducts } from './utils/dataFallback';
 * const products = await fetchProducts({ useMockData: true });
 * 
 * @see utils/dataFallback.ts برای helper functions
 */

export const MOCK_PRODUCTS: any[] = [
  {
    id: '1',
    sku: 'LTHR-B001',
    custom_code: '100-25A',
    name: 'کیف اداری چرم طبیعی مدل برنارد',
    product_type: 'final',
    category: 'کیف اداری',
    image: 'https://picsum.photos/200/200?random=1',
    sell_price: 4500000,
    stock: 85,
    reorder_point: 20,
    wip: 12,
    supplier: 'چرم مشهد',
    colors: ['#3e2723', '#000000'],
    tags: ['پرفروش', 'اداری', 'جدید'],
    status: 'active',
    description: 'ساخته شده از بهترین چرم گاوی با یراق آلات وارداتی.',
    specs: {
      material: 'چرم گاوی',
      brand: 'برتر',
      texture: 'فلوتر',
      unit: 'عدد'
    },
    createdAt: '2023-04-04T10:30:00',
    createdBy: 'سیستم',
    updatedAt: '2023-08-11T14:20:00',
    updatedBy: 'علی رضایی',
    source: 'دستی'
  },
  {
    id: '2',
    sku: 'LTHR-W023',
    custom_code: 'WALLET-99',
    name: 'کیف پول کتی مردانه',
    product_type: 'final',
    category: 'کیف پول',
    image: 'https://picsum.photos/200/200?random=2',
    sell_price: 1200000,
    stock: 45,
    reorder_point: 15,
    wip: 50,
    supplier: 'چرم تبریز',
    colors: ['#5d4037', '#8d6e63', '#000000'],
    tags: ['هدیه', 'اقتصادی'],
    status: 'active',
    description: 'طراحی مینیمال و جادار برای کارت‌های اعتباری.',
    specs: {
      material: 'چرم بزی',
      brand: 'برتر',
      texture: 'ساده',
      unit: 'عدد'
    },
    createdAt: '2023-05-01T09:00:00',
    createdBy: 'سیستم',
    updatedAt: '2023-08-23T11:00:00',
    updatedBy: 'علی رضایی',
    source: 'اکسل'
  },
  {
    id: '3',
    sku: 'LTHR-BLT05',
    custom_code: 'BLT-005',
    name: 'کمربند کلاسیک مردانه',
    product_type: 'final',
    category: 'اکسسوری',
    image: 'https://picsum.photos/200/200?random=3',
    sell_price: 890000,
    stock: 12,
    reorder_point: 30,
    wip: 0,
    supplier: 'تامین کننده داخلی',
    colors: ['#000000'],
    tags: [],
    status: 'draft',
    description: '',
    specs: {
      material: 'چرم مصنوعی',
      brand: 'اکو',
      texture: 'طرح‌دار',
      unit: 'عدد'
    },
    createdAt: '2023-05-26T16:45:00',
    createdBy: 'زهرا محمدی',
    updatedAt: '2023-05-26T16:45:00',
    updatedBy: 'زهرا محمدی',
    source: 'دستی'
  },
  {
    id: '4',
    sku: 'LTHR-S099',
    custom_code: 'SHOE-OX-1',
    name: 'کفش رسمی مدل آکسفورد',
    product_type: 'final',
    category: 'کفش',
    image: 'https://picsum.photos/200/200?random=4',
    sell_price: 6500000,
    stock: 100,
    reorder_point: 10,
    wip: 20,
    supplier: 'چرم تهران',
    colors: ['#3e2723'],
    tags: ['لوکس', 'صادراتی'],
    status: 'active',
    description: 'کفش دست دوز تمام چرم.',
    specs: {
      material: 'چرم گاوی',
      brand: 'برتر',
      texture: 'واکس خور',
      unit: 'جفت'
    },
    createdAt: '2023-07-11T08:30:00',
    createdBy: 'سیستم',
    updatedAt: '2023-11-06T12:00:00',
    updatedBy: 'علی رضایی',
    source: 'وب‌سایت'
  },
];

export const MOCK_BOMS: any[] = [
    {
        id: '1',
        name: 'BOM کیف اداری برنارد',
        custom_code: 'BOM-001',
        status: 'approved',
        created_at: '2023-09-01',
        product_id: 'کیف اداری چرم طبیعی مدل برنارد',
        items: [
            { id: '101', product_name: 'چرم گاوی فلوتر', length: 120, width: 60, count: 1, consumption: 7200, waste: 10 },
            { id: '102', product_name: 'آستر اشبالت', length: 100, width: 50, count: 1, consumption: 5000, waste: 5 },
            { id: '103', product_name: 'زیپ فلزی سایز 5', length: 40, width: 0, count: 2, consumption: 80, waste: 0 },
            { id: '104', product_name: 'سرزیپ فلزی', length: 0, width: 0, count: 2, consumption: 2, waste: 0 },
        ]
    },
    {
        id: '2',
        name: 'BOM کفش آکسفورد',
        custom_code: 'BOM-002',
        status: 'draft',
        created_at: '2023-10-05',
        product_id: 'کفش رسمی مدل آکسفورد',
        items: [
            { id: '201', product_name: 'چرم گاوی واکس خور', length: 40, width: 30, count: 2, consumption: 2400, waste: 12 },
            { id: '202', product_name: 'کفی طبی', length: 0, width: 0, count: 2, consumption: 2, waste: 0 },
        ]
    }
];

export const MOCK_PRODUCTION_ORDERS: any[] = [
    {
        id: '1',
        name: 'تولید سفارش زمستانه - کیف برنارد',
        order_code: 'ORD-1402-101',
        product_id: 'کیف اداری چرم طبیعی مدل برنارد',
        qty: 50,
        start_date: '2023-11-01',
        due_date: '2023-11-15',
        status: 'in_progress',
        created_at: '2023-10-25',
        items: [
            { id: '1', product_name: 'چرم گاوی فلوتر', qty: 100, category: 'چرم', length: 120, width: 60, area: 72, consumption: 7200, waste: 10 },
            { id: '2', product_name: 'آستر اشبالت', qty: 50, category: 'آستر', length: 100, width: 50, area: 50, consumption: 5000, waste: 5 },
            { id: '3', product_name: 'زیپ فلزی', qty: 100, category: 'یراق', length: 40, width: 0, area: 0, consumption: 4000, waste: 0 },
        ]
    },
    {
        id: '2',
        name: 'تولید آزمایشی کفش آکسفورد',
        order_code: 'ORD-1402-102',
        product_id: 'کفش رسمی مدل آکسفورد',
        qty: 10,
        start_date: '2023-11-10',
        due_date: '2023-11-12',
        status: 'planned',
        created_at: '2023-11-05',
        items: [
            { id: '1', product_name: 'چرم گاوی واکس خور', qty: 20, category: 'چرم', length: 40, width: 30, area: 12, consumption: 2400, waste: 12 },
            { id: '2', product_name: 'کفی طبی', qty: 20, category: 'زیره', length: 0, width: 0, area: 0, consumption: 0, waste: 0 },
        ]
    }
];