# Architecture Documentation - Bartar Leather ERP

**Version:** 4.0  
**Last Updated:** February 9, 2026

## 🎯 Overview

Bartar Leather ERP uses a **Meta-Driven Architecture** where the entire user interface is generated dynamically from JSON-like configuration files. This document explains the technical architecture, data flow, and design patterns.

---

## 📐 Architecture Layers

```
┌─────────────────────────────────────────────────┐
│           Presentation Layer (React)            │
│  ┌─────────────┐  ┌─────────────┐              │
│  │  Pages      │  │ Components  │              │
│  │  (Routes)   │  │ (Smart UI)  │              │
│  └─────────────┘  └─────────────┘              │
├─────────────────────────────────────────────────┤
│              Configuration Layer                │
│  ┌─────────────┐  ┌─────────────┐              │
│  │  Module     │  │  Type       │              │
│  │  Configs    │  │  System     │              │
│  └─────────────┘  └─────────────┘              │
├─────────────────────────────────────────────────┤
│            Data Access Layer (Refine)           │
│  ┌─────────────┐  ┌─────────────┐              │
│  │  Supabase   │  │   React     │              │
│  │  Client     │  │   Query     │              │
│  └─────────────┘  └─────────────┘              │
├─────────────────────────────────────────────────┤
│          Backend (Supabase/PostgreSQL)          │
│  ┌─────────────┐  ┌─────────────┐              │
│  │  Database   │  │  Auth/RLS   │              │
│  │  Tables     │  │  Storage    │              │
│  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow

### 1. Configuration → UI Generation

```typescript
// Step 1: Define Module Config
const productsConfig: ModuleDefinition = {
  id: 'products',
  fields: [
    { key: 'name', type: FieldType.TEXT, ... },
    { key: 'price', type: FieldType.PRICE, ... }
  ],
  blocks: [...],
  relatedTabs: [...]
};

// Step 2: Register in Central Registry
export const MODULES = {
  products: productsConfig
};

// Step 3: Router Automatically Generates Routes
<Route path="/products" element={<ModuleListRefine />} />
<Route path="/products/:id" element={<ModuleShow />} />

// Step 4: Components Read Config and Render UI
const ModuleShow = () => {
  const { moduleId } = useParams();
  const config = MODULES[moduleId]; // ← Meta-driven!
  
  return config.fields.map(field => (
    <SmartFieldRenderer field={field} />
  ));
};
```

### 2. User Interaction → Database

```
User Action (Click/Type)
    ↓
React Event Handler
    ↓
Supabase Client Query
    ↓
PostgreSQL Database
    ↓
Response Data
    ↓
State Update (useState/useTable)
    ↓
UI Re-render
```

### 3. Refine Framework Integration

```typescript
// Refine provides:
// - useTable: Automatic pagination, sorting, filtering
// - dataProvider: Supabase integration
// - routerProvider: React Router bindings

const { tableProps } = useTable({
  resource: 'products',
  // Refine automatically handles:
  // - Fetching data
  // - Pagination
  // - Sorting
  // - Filtering
});
```

---

## 🧩 Component Hierarchy

### Page-Level Components

```
App.tsx (Root)
  └── Layout.tsx
       ├── Sidebar
       │    ├── Logo
       │    ├── Menu (Dynamic from MODULES)
       │    └── User Profile
       │
       └── Content Area
            ├── ModuleList_Refine.tsx
            │    ├── ViewManager (Save/Load Views)
            │    ├── FilterBuilder (Advanced Filters)
            │    └── SmartTableRenderer
            │         └── Table/Grid/Kanban Views
            │
            ├── ModuleShow.tsx
            │    ├── Header (Breadcrumb, Actions)
            │    ├── Tabs (Blocks)
            │    │    ├── Block Renderer
            │    │    │    ├── SmartFieldRenderer
            │    │    │    └── EditableTable
            │    │    └── BomStructureRenderer
            │    │
            │    └── RelatedSidebar
            │         ├── ActivityPanel (Notes/Tasks)
            │         └── RelatedRecordsPanel
            │
            └── ModuleCreate.tsx
                 └── SmartForm
                      └── SmartFieldRenderer (per field)
```

### Reusable Components

#### **SmartFieldRenderer.tsx**
Renders any field type based on `FieldType` enum:
- TEXT → `<Input />`
- NUMBER → `<InputNumber />`
- SELECT → `<Select options={...} />`
- RELATION → `<Select>` (populated from related module)
- DATE/TIME/DATETIME → `<PersianDatePicker />` (Jalali UI, Gregorian DB strings)
- IMAGE → `<Upload />`
- TAGS → `<TagInput />`

#### **SmartTableRenderer.tsx**
Dynamic table generator:
- Reads `fields` with `isTableColumn: true`
- Generates columns with sorting/filtering
- Supports search within columns
- Custom renderers for complex types
- Supports layout overrides via `containerClassName`, `scrollX`, and `tableLayout`

#### **EditableTable.tsx**
Inline editable table for master-detail relationships:
- Add/remove rows
- Edit cells directly
- Auto-save on blur
- Supports relations in cells
- Modular helpers under `components/editableTable/` for scroll handling, table utilities, and domain logic (inventory/invoice/production)

#### **QrScanPopover.tsx**
Quick QR-based selection for products/shelves in production flows.

#### **Production Workflow Utilities**
`utils/productionWorkflow.ts` centralizes inventory transfer for production lifecycle:
- `collectProductionMoves` → compute required material moves
- `applyProductionMoves` / `rollbackProductionMoves`
- `consumeProductionMaterials` → final material deduction
- `addFinishedGoods` + `syncProductStock`

---

## 🗂️ State Management

### Current Approach: Local State + Supabase

```typescript
// Most components use:
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetchData();
}, [dependency]);

const fetchData = async () => {
  const { data } = await supabase.from('products').select('*');
  setData(data);
  setLoading(false);
};
```

### Future: React Query Integration

```typescript
// Planned migration:
const { data, isLoading, refetch } = useQuery({
  queryKey: ['products'],
  queryFn: () => supabase.from('products').select('*')
});

// Benefits:
// - Automatic caching
// - Background refetching
// - Optimistic updates
// - Retry logic
```

---

## 🔐 Security Architecture

### Row Level Security (RLS)

**Current Status:** ⚠️ Partially Implemented

```sql
-- Example RLS Policy (To Be Implemented):
CREATE POLICY "Users can view their own products"
ON products FOR SELECT
USING (
  auth.uid() = created_by
  OR
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'warehouse')
  )
);
```

### Field-Level Security

```typescript
// Defined in ModuleField:
fieldAccess: {
  viewRoles: [UserRole.ADMIN, UserRole.SALES],
  editRoles: [UserRole.ADMIN]
}

// Enforced in UI:
const canEdit = field.fieldAccess?.editRoles?.includes(currentUserRole);
if (!canEdit) return <span>{value}</span>;
```

---

## 📊 Database Design Patterns

### 1. Core Entity Tables
```sql
products (id, name, category, supplier_id, ...)
customers (id, first_name, last_name, ...)
suppliers (id, business_name, ...)
```

### 2. Junction Tables (Many-to-Many)
```sql
-- Current: Using JSONB for tags
products → tags: { tags: ['tag1', 'tag2'] }

-- Proper approach (to be implemented):
record_tags (
  record_id uuid,
  tag_id uuid,
  record_type text,  -- 'products', 'customers', etc.
  PRIMARY KEY (record_id, tag_id)
)
```

### 3. Master-Detail Tables
```sql
boms (id, name, status, ...)
bom_items (
  id,
  bom_id uuid REFERENCES boms(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  quantity numeric
)
```

### 4. System Tables
```sql
profiles (id, full_name, role, avatar_url, ...)
org_roles (id, title, permissions jsonb)
saved_views (id, module_id, filters jsonb, ...)
company_settings (id, company_name, logo_url, ...)
```

---

## 🔍 Relation Resolution

### Forward Relations (1:N)

```typescript
// Config:
{
  key: 'supplier_id',
  type: FieldType.RELATION,
  relationConfig: {
    targetModule: 'suppliers',
    targetField: 'business_name'
  }
}

// Runtime:
1. Load product: { id: 'abc', supplier_id: 'xyz' }
2. Query suppliers: SELECT * FROM suppliers WHERE id = 'xyz'
3. Display: <Tag>نام تامین‌کننده</Tag>
```

### Reverse Relations (N:1 Display)

```typescript
// Config in supplierConfig:
relatedTabs: [
  {
    name: 'products',
    relationField: 'supplier_id',
    displayFields: ['name', 'category']
  }
]

// Runtime:
1. Open supplier: { id: 'xyz' }
2. Query products: SELECT * FROM products WHERE supplier_id = 'xyz'
3. Display in sidebar: <RelatedRecordsPanel />
```

### Many-to-Many (Planned)

```typescript
// Future implementation:
{
  key: 'categories',
  type: FieldType.MULTI_SELECT,
  relationConfig: {
    targetModule: 'categories',
    junctionTable: 'product_categories',
    junctionKeys: {
      left: 'product_id',
      right: 'category_id'
    }
  }
}
```

---

## 🎨 Rendering Engine

### Block Renderer Logic

```typescript
// ModuleShow.tsx renders blocks in order:
config.blocks.sort((a, b) => a.order - b.order).map(block => {
  
  // Check visibility condition:
  if (block.visibleIf) {
    const { field, operator, value } = block.visibleIf;
    if (!checkCondition(data[field], operator, value)) {
      return null; // Hide block
    }
  }
  
  // Render based on type:
  switch (block.type) {
    case BlockType.FIELD_GROUP:
      return <FieldGroup fields={block.fields} />;
    
    case BlockType.TABLE:
      return <EditableTable columns={block.tableColumns} />;
    
    default:
      return null;
  }
});
```

### Field Renderer Logic

```typescript
// SmartFieldRenderer.tsx:
switch (field.type) {
  case FieldType.TEXT:
    return <Input value={value} onChange={onChange} />;
  
  case FieldType.RELATION:
    // Fetch options from target module:
    const options = await fetchRelationOptions(field.relationConfig);
    return <Select options={options} />;
  
  case FieldType.DATE:
  case FieldType.TIME:
  case FieldType.DATETIME:
    return <PersianDatePicker type={field.type} />;
  
  // ... 26 field types supported
}
```

---

## ⚡ Performance Optimization

### Current Bottlenecks:
1. ❌ **No virtualization** for large lists (1000+ items)
2. ❌ **No code splitting** (entire app loads at once)
3. ❌ **No database indexing** on frequently queried columns
4. ❌ **Multiple sequential queries** instead of batch loading

### Planned Optimizations:

#### 1. Virtual Scrolling
```typescript
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={data.length}
  itemSize={50}
>
  {({ index, style }) => (
    <div style={style}>{data[index].name}</div>
  )}
</FixedSizeList>
```

#### 2. Code Splitting
```typescript
const ModuleShow = lazy(() => import('./pages/ModuleShow'));
const ModuleList = lazy(() => import('./pages/ModuleList_Refine'));

<Suspense fallback={<Spin />}>
  <Routes>
    <Route path="/:moduleId" element={<ModuleList />} />
  </Routes>
</Suspense>
```

#### 3. Database Indexes
```sql
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_supplier ON products(supplier_id);
```

#### 4. Batch Queries
```typescript
// Instead of:
for (const product of products) {
  const supplier = await supabase.from('suppliers').select('*').eq('id', product.supplier_id);
}

// Use:
const supplierIds = products.map(p => p.supplier_id);
const { data: suppliers } = await supabase
  .from('suppliers')
  .select('*')
  .in('id', supplierIds);
```

---

## 🧪 Testing Strategy (Future)

### Unit Tests
```typescript
// Example: SmartFieldRenderer.test.tsx
import { render, screen } from '@testing-library/react';
import SmartFieldRenderer from './SmartFieldRenderer';

test('renders text input for TEXT field type', () => {
  const field = { key: 'name', type: FieldType.TEXT };
  render(<SmartFieldRenderer field={field} value="" onChange={() => {}} />);
  expect(screen.getByRole('textbox')).toBeInTheDocument();
});
```

### Integration Tests
```typescript
// Example: ModuleShow.test.tsx
test('loads and displays product data', async () => {
  render(<ModuleShow />);
  await waitFor(() => {
    expect(screen.getByText('نام محصول')).toBeInTheDocument();
  });
});
```

### E2E Tests (Playwright/Cypress)
```typescript
// Example: products.spec.ts
test('create new product', async ({ page }) => {
  await page.goto('/products');
  await page.click('button:has-text("افزودن محصول")');
  await page.fill('[name="name"]', 'کیف چرمی');
  await page.click('button:has-text("ذخیره")');
  await expect(page.locator('.ant-message-success')).toBeVisible();
});
```

---

## 📦 Build & Deployment

### Development Build
```bash
npm run dev
# Uses Vite dev server with HMR
# Fast refresh for instant updates
```

### Production Build
```bash
npm run build
# Output: dist/
# - Minified JavaScript
# - Optimized CSS
# - Asset fingerprinting
# - Source maps (optional)
```

### Deployment Options:

#### 1. Vercel (Recommended)
```bash
vercel --prod
# Automatic CDN
# Edge functions
# Zero config
```

#### 2. Netlify
```bash
netlify deploy --prod
# JAMstack optimized
# Form handling
# Serverless functions
```

#### 3. Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "preview"]
```

---

## 🔄 Migration Path (Future Improvements)

### Phase 1: Refactoring (Current)
- [ ] Extract large components into hooks
- [ ] Implement proper TypeScript strict mode
- [ ] Add ESLint/Prettier configuration
- [ ] Remove deprecated files (`-old.tsx`)

### Phase 2: State Management
- [ ] Migrate to React Query
- [ ] Implement global state (Zustand/Jotai)
- [ ] Add optimistic updates

### Phase 3: Performance
- [ ] Virtual scrolling for lists
- [ ] Code splitting by route
- [ ] Database indexing
- [ ] Image optimization (WebP, lazy load)

### Phase 4: Testing
- [ ] Unit tests (Vitest)
- [ ] Integration tests (React Testing Library)
- [ ] E2E tests (Playwright)
- [ ] CI/CD pipeline

---

## 📚 Additional Resources

- **Refine Docs:** https://refine.dev/docs
- **Supabase Docs:** https://supabase.com/docs
- **Ant Design:** https://ant.design
- **TypeScript:** https://www.typescriptlang.org/docs

---

**Maintained by:** Farzad  
**AI Assistant:** Claude (Anthropic)
