# Bartar Leather ERP - Architecture & Technical Guide

**Version:** 3.0 (CRM, SCM, & Advanced Views)
**Stack:** React + TypeScript + Vite + Ant Design + Tailwind CSS + Supabase

This document outlines the architectural standards and codebase structure for the Bartar Leather ERP. The system is designed as a **Meta-Driven Platform**, meaning the UI is dynamically generated based on JSON-like configuration files rather than hardcoded layouts.

---

## 1. Project Structure (No `src` folder)

The project uses a flat structure tailored for Vite. All source code resides in the root or specific feature folders.

```text
/
├── components/          # Reusable UI Atoms (SmartForm, TagInput, etc.)
│   ├── renderers/       # Specific renderers like BomStructureRenderer
│   ├── Sidebar/         # Layout specific sidebars
│   └── ...
├── modules/             # Configuration files for each entity
│   ├── productsConfig.ts
│   ├── customerConfig.ts
│   ├── supplierConfig.ts
│   └── ...
├── pages/               # Main Route Components
│   ├── ModuleList.tsx   # The "All Records" view (List/Grid/Kanban)
│   ├── ModuleShow.tsx   # The "Single Record" view (Tabs/Forms)
│   └── Settings/        # Settings & Admin pages
├── App.tsx              # Main Entry & Routing
├── moduleRegistry.ts    # Central registry linking configs to ID strings
├── supabaseClient.ts    # Database connection instance
├── types.ts             # TypeScript Interfaces & Enums (The DNA of the app)
└── ...

```

---

## 2. Core Architecture: The "Meta-Driven" Engine

### A. The Configuration (`modules/*.ts`)

Instead of writing HTML/JSX for every page, we define the "Metadata" of a module.

* **Example:** To add a "Phone Number" field to Customers, we add a generic object to `customerConfig.ts`:
```typescript
{ key: 'mobile', type: FieldType.PHONE, location: FieldLocation.HEADER, ... }

```



### B. The Registry (`moduleRegistry.ts`)

This file imports all individual configs and exports a single `MODULES` object. The application reads from this registry to know which routes exist (e.g., `/customers`, `/products`).

### C. The Rendering Engines

1. **`ModuleList.tsx`:**
* Handles data fetching for collections.
* Supports **3 View Modes**:
* **List:** Standard table with sorting/filtering.
* **Grid:** Visual cards (great for products).
* **Kanban:** Grouped columns (by Status, Category, or Rank).


* Includes `ViewManager` for saving custom filters.


2. **`ModuleShow.tsx`:**
* Handles the single record view.
* Manages **Tabs**, **Field Groups**, and **Master-Detail** relationships.
* Integrates the **Tagging System** and **Assignee** logic.



---

## 3. Key Components & Features

### Smart Components

* **`SmartForm.tsx`:** A dynamic form builder that handles validation, file uploads, date picking (via `PersianDatePicker` with Persian calendar UI), and Select options based on the `FieldType`.
* **`SmartTableRenderer.tsx`:** A dynamic table that handles searching inside columns, custom rendering (Tags, Avatars, Prices), and row selection. Supports layout overrides via `containerClassName`, `scrollX`, and `tableLayout` for nested tables.
* **`EditableTable.tsx`:** Split into smaller helpers under `components/editableTable/` (scroll wrapper, table utils, and domain helpers for changelog, inventory, invoices, production orders).
  - Dynamic option filters are normalized and option labels are deduplicated to avoid mismatches.
  - Nested SmartTable reloads when filters change (via internal versioning).
  - Production item rows can show QR scan to quickly select products/shelves.
  - Field locking enforces editable-only columns for production items (e.g., waste_rate/length/width/usage/main_unit/buy_price).

### Tagging System

A flexible, many-to-many tagging system implemented via Supabase.

* **Tables:** `tags` (definitions) + `record_tags` (links).
* **UI:** Managed by `components/TagInput.tsx`. Allows creating and assigning colored tags to any record type.

### Master-Detail Logic (BOMs)

For entities like **Production BOM**, the system renders a hierarchical tree or a nested table.

* **Config:** Defined using `BlockType.TABLE` in the module config.
* **Renderer:** `BomStructureRenderer` handles the recursive tree visualization.

### Date/Time Handling

All date/time inputs and displays are standardized through **`PersianDatePicker`** and **`react-date-object`**:

- **DB storage:** Gregorian strings
  - DATE: `YYYY-MM-DD`
  - TIME: `HH:mm`
  - DATETIME: ISO string
- **UI display:** Jalali calendar with Persian numerals
- **Component:** `components/PersianDatePicker.tsx` (used by `SmartFieldRenderer` and related UI)

---

## 4. Database Schema (Supabase/PostgreSQL)

The backend relies on Supabase. Key tables include:

* **Core Entities:** `products`, `customers`, `suppliers`, `production_boms`.
* **System Tables:**
  * `profiles`: Extended user data (connected to Auth).
  * `org_roles`: Role-Based Access Control (RBAC) definitions.
  * `tags` & `record_tags`: Universal tagging.
  * `saved_views`: Stores user-defined filters for `ModuleList`.
  * `company_settings`: Global settings (Logo, Name).

**Security:** Row Level Security (RLS) is enabled. Currently set to allow authenticated access, but ready for granular policies.

📖 **See:** `DATABASE_SCHEMA.md` for complete schema documentation.

---

## 5. Relations System (Relational Data)

The platform supports multiple types of relationships:

### A. One-to-Many (1:N) - Forward Relations
```typescript
// Example: Product → Supplier
{
  key: 'supplier_id',
  type: FieldType.RELATION,
  relationConfig: {
    targetModule: 'suppliers',
    targetField: 'business_name'
  }
}
```

### B. Reverse Relations (N:1 View)
Display related records in the parent record's sidebar:
```typescript
relatedTabs: [
  {
    name: 'products',
    label: 'محصولات',
    icon: 'ShoppingCart',
    relationField: 'supplier_id',  // Foreign key in products table
    displayFields: ['name', 'category', 'stock']
  }
]
```

### C. Many-to-Many (N:M)
Requires junction tables:
```sql
-- Example: Products ↔ Categories
CREATE TABLE product_categories (
  product_id uuid REFERENCES products(id),
  category_id uuid REFERENCES categories(id),
  PRIMARY KEY (product_id, category_id)
);
```

### D. Master-Detail (Table Blocks)
Nested editable tables within a record:
```typescript
{
  id: 'bom_items',
  type: BlockType.TABLE,
  tableColumns: [
    { key: 'item_id', type: FieldType.RELATION, ... },
    { key: 'quantity', type: FieldType.NUMBER, ... }
  ]
}
```

📖 **See:** `RELATIONS_GUIDE.md` for detailed implementation guide.

---

## 6. BOM (Bill of Materials) System

The BOM system calculates production costs across multiple categories:

### Cost Calculation Tables:
- **Leather Section** (`items_leather`): Material costs
- **Lining Section** (`items_lining`): Fabric costs  
- **Fittings Section** (`items_fitting`): Hardware costs
- **Accessories Section** (`items_accessory`): Additional materials
- **Labor Section** (`items_labor`): Workforce costs

### BOM as “Filter Definition” (Updated Workflow)
In the current production flow, BOM tables **do not select a specific product**. Instead, each row represents a **filter** that later drives product selection inside Production Orders.

Key changes:
- The first column in BOM tables is **"محصول مادر"** and is **read-only**.
- It stores the **material category** (`leather`, `lining`, `accessory`, `fitting`) and acts as a base filter.
- Each row uses the **spec fields** (e.g., `leather_type`, `lining_color`, `fitting_type`) to define product constraints.
- For **Leather/Lining/Accessory**, optional **Length/Width** are available and **Usage** is auto-calculated as $\text{length} \times \text{width}$ when filled.

### Production Orders – BOM-driven Product Selection
When creating a Production Order:
- Selecting a **BOM** (`bom_id`) automatically copies all table rows from the BOM into the order.
- Each row can be expanded to open a **SmartTableRenderer** list of products **filtered by that row’s criteria**.
- The user selects the product to use and then chooses the **source shelf** (inventory location) for deduction.
- Filtering uses normalized label/value matching and de-duplicates option labels to avoid mismatches in dynamic options.

### Auto-Calculation Formula:
```typescript
total_price = usage × buy_price
grandTotal = Σ(all sections)
```

### Production Completion Quantity
On production completion, the system prefers the latest quantity derived from `production_lines` (or preview) to avoid stale `data.quantity` values when transferring finished goods to inventory.

### Renderer Component:
`components/renderers/BomStructureRenderer.tsx` displays the hierarchical structure with real-time calculations.

---

## 7. View Management & Filtering

Users can create and save custom views with:

* **Filter Operators:** `eq`, `neq`, `ilike`, `gt`, `lt`, `gte`, `lte`, `in`, `is`
* **Column Selection:** Choose which fields to display
* **View Modes:** List, Grid, Kanban, Timeline, Calendar, Gantt
* **Persistence:** Saved in `saved_views` table

**Component:** `components/ViewManager.tsx`

---

## 8. Permissions & Security (RBAC)

### Role Levels:
```typescript
enum UserRole {
  ADMIN = 'admin',        // Full access
  SALES = 'sales',        // CRM & Orders
  WAREHOUSE = 'warehouse', // Inventory
  PRODUCTION = 'production', // Manufacturing
  VIEWER = 'viewer'       // Read-only
}
```

### Field-Level Permissions:
```typescript
fieldAccess: {
  viewRoles: [UserRole.ADMIN, UserRole.SALES],
  editRoles: [UserRole.ADMIN]
}
```

### Current Status:
⚠️ **RLS Policies are NOT fully implemented.** All authenticated users can access all data.

🔒 **TODO:** Implement row-level security policies in Supabase.

---

## 9. Tag System

A flexible many-to-many tagging system:

### Tables:
- `tags`: Tag definitions (name, color)
- `record_tags`: Links tags to any record

### Usage:
```typescript
{ 
  key: 'tags', 
  type: FieldType.TAGS,
  // Automatically renders TagInput component
}
```

**Component:** `components/TagInput.tsx`

---

## 10. Design System & Theming

* **Theme:** Fully supports **Dark/Light** modes via Tailwind classes (`dark:bg-black`) and Ant Design ConfigProvider.
* **Color Palette:**
  * Primary: Leather Orange (`#c58f60`)
  * Dark Backgrounds: Deep Black (`#141414`) and Dark Grey (`#1f1f1f`)

* **Responsiveness:** Mobile-first design. Sidebar collapses on mobile, tables become scrollable, and headers adapt.

---

## 11. Best Practices

### Adding a New Module:
1. ✅ Create table in Supabase
2. ✅ Define config file in `modules/`
3. ✅ Register in `moduleRegistry.ts`
4. ✅ Add route to `Layout.tsx` sidebar
5. ✅ Test CRUD operations

### Code Organization:
- **Keep configs under 200 lines**: Split large modules
- **Use custom hooks**: Extract logic from components
- **Type everything**: Avoid `any` types
- **Add comments**: Explain complex logic

### Performance Tips:
- Use `isTableColumn` to limit displayed fields
- Implement pagination for large datasets
- Add database indexes for frequently queried fields
- Use React Query for caching (planned)

---

## 12. Known Issues & Limitations

### Critical:
- ❌ **RLS not implemented**: Security risk in production
- ❌ **Many-to-Many relations incomplete**: Need junction table support
- ❌ **Large file components**: `ModuleShow.tsx` (664 lines) needs refactoring

### Medium Priority:
- ⚠️ **No virtualization**: Performance issues with 1000+ records
- ⚠️ **Hard-coded strings**: Need i18n system
- ⚠️ **Type safety gaps**: Many optional fields should be required

### Low Priority:
- 📝 Old files (`-old.tsx`) still present
- 📝 Mock data in production code
- 📝 Missing database indexes

---

## 13. Development Roadmap

### Phase 1: Core Fixes (2 weeks)
1. ✅ Implement RLS policies
2. ✅ Add Many-to-Many relation support
3. ✅ Refactor large components
4. ✅ Complete `relatedTabs` implementation

### Phase 2: Features (3 weeks)
1. 📊 **Dashboard**: Widget-based metrics visualization
2. 💰 **Financial Module**: Complete invoice system with tax calculations
3. 📈 **Reports**: Excel/PDF export functionality
4. 🔍 **Advanced Search**: Global search across modules

### Phase 3: Optimization (2 weeks)
1. ⚡ React Query integration
2. ⚡ Virtual scrolling for tables
3. ⚡ Database indexing
4. ⚡ Code splitting and lazy loading

### Phase 4: Advanced Features (4 weeks)
1. 🤖 **Formula Engine**: Real-time field calculations
2. 📄 **Print Templates**: Custom PDF generation
3. 📱 **Mobile App**: React Native version
4. 🔔 **Notifications**: Real-time updates

---

## 14. Troubleshooting

### Common Issues:

**Problem:** "Cannot read property of undefined"
- **Solution:** Check if field exists in config and database

**Problem:** Dropdown menus don't open in forms
- **Solution:** Ensure `getPopupContainer` is set in Select components

**Problem:** Images not uploading
- **Solution:** Check Supabase storage bucket permissions

**Problem:** Relations not displaying
- **Solution:** Verify `relationConfig.targetModule` matches module ID

**Problem:** Performance issues with large lists
- **Solution:** Enable pagination and add database indexes

---

## 15. Resources & Documentation

- 📚 **Architecture Details**: See `ARCHITECTURE.md`
- 🔗 **Relations Guide**: See `RELATIONS_GUIDE.md`
- 🗄️ **Database Schema**: See `DATABASE_SCHEMA.md`
- 🎨 **Ant Design**: https://ant.design
- ⚛️ **Refine Framework**: https://refine.dev
- 🔥 **Supabase**: https://supabase.com/docs

---

**Last Updated:** February 9, 2026
**Version:** 4.1