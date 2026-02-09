

# Fix Plan: Kanban "Failed to load job stages" and Setup "Something went wrong"

## Problem 1: Setup/Admin Page Crash

**Root Cause**: The `PremiumUserManagement` component crashes because `user.full_name` can be `null`.

When the label system creates customer contact accounts (like james@jaimar.dev, dwain@klintscales.co.za, etc.), these users get profiles with `full_name: null`. The `get_all_users()` RPC returns ALL auth users. When these users are processed, `fetchUsers()` sets `full_name: null`. Then this line in `PremiumUserManagement.tsx` crashes:

```
user.full_name.toLowerCase()  // TypeError: Cannot read property 'toLowerCase' of null
```

**Evidence**: 4 label customer contact users confirmed to have `null` full_name in profiles:
- dwain@klintscales.co.za
- james@jaimar.dev
- michael@ontrendmedia.co.za
- bianca@ontrendmedia.co.za

**Fix**: Add null-safe access in `PremiumUserManagement.tsx` line 151-154:

```typescript
const filteredUsers = users.filter(user => 
    (user.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.role || '').toLowerCase().includes(searchQuery.toLowerCase())
);
```

Also fix the `getInitials` function (line 157) which would similarly crash:
```typescript
const getInitials = (name: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
};
```

And fix `userService.ts` to default `full_name` to empty string instead of null:
```typescript
full_name: profile?.full_name || '',
```

---

## Problem 2: Kanban "Failed to load job stages"

**Root Cause**: The query in `fetchJobStagesFromSupabase` passes 681 UUIDs in a `.in()` clause, which exceeds the URL length limit for GET requests.

There are 681 active (non-completed) jobs. The `fetchJobStagesFromSupabase` function builds a query:
```typescript
supabase.from("job_stage_instances")
    .select(...)
    .in("job_id", jobIds)  // 681 UUIDs = ~25KB of URL params
```

PostgREST uses GET requests for SELECT queries. The URL with 681 UUIDs (~25KB) exceeds the typical ~12KB URL limit, causing a server error.

**Fix**: Batch the query into chunks of 100 job IDs at a time in `fetchJobStages.ts`:

```typescript
// Split jobIds into chunks to avoid URL length limits
const CHUNK_SIZE = 100;
const chunks = [];
for (let i = 0; i < jobIds.length; i += CHUNK_SIZE) {
    chunks.push(jobIds.slice(i, i + CHUNK_SIZE));
}

let allData: any[] = [];
for (const chunk of chunks) {
    const { data, error } = await supabase
        .from("job_stage_instances")
        .select(`*, production_stage:production_stages(...)`)
        .in("job_id", chunk)
        .eq("job_table_name", "production_jobs")
        .order("stage_order", { ascending: true });
    
    if (error) throw error;
    if (data) allData.push(...data);
}
```

---

## Files to Modify

1. **src/components/users/PremiumUserManagement.tsx** - Add null-safe access for `full_name`, `email`, `role` in filter and `getInitials`
2. **src/services/userService.ts** - Default `full_name` to empty string instead of null
3. **src/hooks/tracker/useRealTimeJobStages/fetchJobStages.ts** - Batch `.in()` queries into chunks of 100

## No Database Changes Required

Both issues are purely frontend code bugs. No migrations needed.

