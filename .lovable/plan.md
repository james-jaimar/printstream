

# Fix Mapping Library: Server-Side Pagination, Search & Filtering

## Problem
The Mapping Library loads mappings with a single `supabase.select()` which returns max 1000 rows (Supabase default). There are actually **4,114 mappings** in the database. This causes:
- Stats showing 2000 instead of 4114 (the 2000 was likely from an earlier state)
- Paper Specifications filter showing 0 results (the 323 paper spec mappings fall outside the first 1000 rows returned)
- Search failing to find known references that exist beyond the 1000-row cutoff

## Solution
Move from client-side filtering to **server-side filtering with pagination**.

### 1. Server-Side Stats Query
Replace the client-side stats calculation with a dedicated lightweight query:

```sql
SELECT 
  count(*) as total,
  count(*) FILTER (WHERE is_verified) as verified,
  count(*) FILTER (WHERE mapping_type = 'production_stage') as production_stages,
  count(*) FILTER (WHERE mapping_type = 'paper_specification') as paper_specs,
  count(*) FILTER (WHERE mapping_type = 'delivery_specification') as delivery_specs
FROM excel_import_mappings
```

This will be called via `supabase.rpc()` using a new database function `get_mapping_library_stats()`.

### 2. Server-Side Filtered Query with Pagination
Replace the single `loadMappings()` call with a parameterized query that applies filters at the database level:

- **Search**: Use `.ilike('excel_text', '%term%')` or `.or()` to search across excel_text and joined table names
- **Type filter**: Use `.eq('mapping_type', type)` when not "all"
- **Verification filter**: Use `.eq('is_verified', true/false)` when not "all"
- **Pagination**: Use `.range(offset, offset + pageSize - 1)` with a page size of 50
- Request `count: 'exact'` to get total filtered count for pagination controls

### 3. Pagination UI
Add simple pagination controls below the table:
- Page indicator: "Showing 1-50 of 323"
- Previous / Next buttons
- Reset to page 1 when filters change

### 4. Files Modified

**New migration**: `get_mapping_library_stats` SQL function  
**Modified**: `src/components/admin/MappingLibrary.tsx`
- Remove full client-side data load
- Add server-side filtering with debounced search
- Add pagination state and controls
- Stats loaded from dedicated RPC function

### 5. Technical Detail

The `loadMappings` function will be refactored to accept filter params:

```typescript
const loadMappings = async (page: number, search: string, typeFilter: string, verifiedFilter: string) => {
  let query = supabase
    .from('excel_import_mappings')
    .select('*, production_stages!...(...), ...', { count: 'exact' });
  
  if (typeFilter !== 'all') query = query.eq('mapping_type', typeFilter);
  if (verifiedFilter === 'verified') query = query.eq('is_verified', true);
  if (verifiedFilter === 'unverified') query = query.eq('is_verified', false);
  if (search) query = query.ilike('excel_text', `%${search}%`);
  
  const pageSize = 50;
  query = query.range(page * pageSize, (page + 1) * pageSize - 1)
    .order('created_at', { ascending: false });
  
  const { data, count } = await query;
  // count gives total matching rows for pagination
};
```

Search input will be debounced (300ms) to avoid excessive queries while typing.

