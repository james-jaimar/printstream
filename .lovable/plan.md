
# Plan: Reduce Database Egress with Optimized Polling, Queries, and Tab Visibility

## Executive Summary

This plan addresses the excessive Postgres egress (up to 1.8GB/day) through four key optimizations:
1. **Reduce polling intervals** - Change aggressive 10s/30s to 60s/120s
2. **Replace SELECT * with specific columns** - Reduce payload per request by 60-80%
3. **Add tab visibility detection** - Pause ALL polling/subscriptions when tab is hidden
4. **Cache job specifications** - Eliminate repeated RPC calls in usePersonalOperatorQueue

---

## Problem Analysis

### Current Egress Sources Identified

| Hook/Context | Polling | Real-Time | Query Size | Daily Egress (est.) |
|--------------|---------|-----------|------------|---------------------|
| `usePersonalOperatorQueue` | 10s + 30s | Yes | ~50KB/fetch | 400MB+ |
| `KanbanDataContext` | N/A | Yes (cascades) | ~17MB/fetch | 200MB+ |
| `useEnhancedProductionJobs` | N/A | Yes (cascades) | ~17MB/fetch | 200MB+ |
| `useDataManager` | 5 min | N/A | ~17MB/fetch | 50MB |
| `useAutoApprovedJobs` | 5 min | Yes | ~2MB/fetch | 25MB |
| 59+ files with SELECT * | Various | Various | Varies | 100MB+ |

**Total estimated egress sources: ~1GB+ per day from a single browser tab**

---

## Solution Architecture

### Phase 1: Create Tab Visibility Hook (Foundation)

Create a new utility hook that all polling/subscription hooks will use:

**New File: `src/hooks/useTabVisibility.ts`**

```typescript
import { useState, useEffect, useCallback } from 'react';

export const useTabVisibility = () => {
  const [isVisible, setIsVisible] = useState(!document.hidden);
  
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
      console.log(`📱 Tab visibility: ${!document.hidden ? 'visible' : 'hidden'}`);
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
  
  return { isVisible };
};
```

This hook will be imported by all polling hooks to pause activity when the tab is hidden.

---

### Phase 2: Optimize usePersonalOperatorQueue (Biggest Offender)

**Current State:**
- Polls every 10 seconds for active jobs
- Polls every 30 seconds for next jobs
- Makes 2 RPC calls per job for specifications
- Real-time subscription triggers additional refetches

**Changes to `src/hooks/tracker/usePersonalOperatorQueue.tsx`:**

1. **Increase polling intervals:**
   - Active jobs: 10s → 60s
   - Next jobs: 30s → 120s

2. **Add tab visibility check:**
   ```typescript
   const { isVisible } = useTabVisibility();
   
   refetchInterval: isVisible ? 60000 : false, // Pause when hidden
   ```

3. **Cache specifications with proper query key:**
   ```typescript
   const { data: specs } = useQuery({
     queryKey: ['job-specifications', job.job_id],
     queryFn: () => fetchJobSpecifications(job.job_id),
     staleTime: 5 * 60 * 1000, // 5 minutes
     gcTime: 10 * 60 * 1000, // 10 minutes
   });
   ```

4. **Use specific columns instead of full select:**
   ```typescript
   .select(`
     id,
     job_id,
     status,
     scheduled_start_at,
     estimated_duration_minutes,
     production_jobs!inner(wo_no, customer, due_date, reference),
     production_stages!inner(name),
     categories(name, color)
   `)
   ```

---

### Phase 3: Optimize KanbanDataContext

**Current State:**
- Real-time subscription triggers full refetch on ANY production_jobs change
- Fetches `SELECT *` from production_jobs (~17MB)

**Changes to `src/contexts/KanbanDataContext.tsx`:**

1. **Add tab visibility pause:**
   ```typescript
   const [isTabVisible, setIsTabVisible] = useState(!document.hidden);
   
   useEffect(() => {
     const handler = () => setIsTabVisible(!document.hidden);
     document.addEventListener('visibilitychange', handler);
     return () => document.removeEventListener('visibilitychange', handler);
   }, []);
   ```

2. **Debounce real-time refetches:**
   ```typescript
   const debouncedFetch = useRef<NodeJS.Timeout | null>(null);
   
   const handleRealtimeChange = useCallback(() => {
     if (!isTabVisible) return; // Skip if tab hidden
     
     if (debouncedFetch.current) clearTimeout(debouncedFetch.current);
     debouncedFetch.current = setTimeout(() => fetchKanbanData(true), 2000);
   }, [isTabVisible, fetchKanbanData]);
   ```

3. **Select specific columns:**
   ```typescript
   .select(`
     id, wo_no, customer, status, due_date, reference, 
     category_id, created_at, is_expedited
   `)
   ```

---

### Phase 4: Optimize useEnhancedProductionJobs

**Current State:**
- Real-time subscription on production_jobs AND job_stage_instances
- Full refetch on every change (can cascade 5-10x per minute)
- Fetches `SELECT *` from both tables

**Changes to `src/hooks/tracker/useEnhancedProductionJobs.tsx`:**

1. **Add tab visibility check:**
   ```typescript
   const { isVisible } = useTabVisibility();
   ```

2. **Debounce real-time with 3-second window:**
   ```typescript
   const pendingRefetch = useRef<NodeJS.Timeout | null>(null);
   
   const debouncedRefetch = useCallback(() => {
     if (!isVisible) return;
     
     if (pendingRefetch.current) clearTimeout(pendingRefetch.current);
     pendingRefetch.current = setTimeout(fetchJobs, 3000);
   }, [isVisible, fetchJobs]);
   ```

3. **Use subscription only when tab is visible:**
   ```typescript
   useEffect(() => {
     if (!isVisible) return; // Don't subscribe when hidden
     
     const channel = supabase.channel(...)...;
     return () => supabase.removeChannel(channel);
   }, [isVisible, debouncedRefetch]);
   ```

4. **Select specific columns for production_jobs:**
   ```typescript
   .select(`
     id, wo_no, customer, status, due_date, reference,
     created_at, updated_at, is_expedited, has_custom_workflow,
     manual_due_date, proof_approved_at, category_id, user_id,
     categories(id, name, color, sla_target_days)
   `)
   ```

5. **Select specific columns for job_stage_instances:**
   ```typescript
   .select(`
     id, job_id, status, stage_order, started_at, completed_at,
     scheduled_start_at, estimated_duration_minutes, part_assignment,
     production_stage_id,
     production_stages(id, name, color, supports_parts)
   `)
   ```

---

### Phase 5: Optimize useDataManager

**Current State:**
- Auto-refreshes every 5 minutes
- Fetches `SELECT *` with categories join

**Changes to `src/hooks/tracker/useDataManager.tsx`:**

1. **Add tab visibility pause:**
   ```typescript
   const { isVisible } = useTabVisibility();
   
   useEffect(() => {
     if (!user?.id || !isVisible) return;
     
     loadData(false);
     autoRefreshIntervalRef.current = setInterval(() => {
       if (isVisible) loadData(false);
     }, AUTO_REFRESH_INTERVAL);
     // ...
   }, [user?.id, loadData, isVisible]);
   ```

2. **Use specific columns:**
   ```typescript
   .select(`
     id, wo_no, customer, status, due_date, reference,
     created_at, is_expedited, category_id,
     categories(id, name, color, sla_target_days)
   `)
   ```

---

### Phase 6: Fix Real-Time Cascade Problem

The root cause of cascading refreshes is that multiple hooks subscribe to the same tables and all trigger full refetches.

**Create centralized subscription manager:**

**New File: `src/hooks/useRealtimeSubscriptionManager.ts`**

This hook will:
1. Maintain a single subscription per table
2. Debounce updates across all consumers
3. Only notify consumers when tab is visible
4. Batch multiple rapid changes into single update

```typescript
// Singleton pattern for subscriptions
const subscriptionManager = {
  subscribers: new Map<string, Set<() => void>>(),
  channels: new Map<string, any>(),
  
  subscribe(table: string, callback: () => void) {
    // Add subscriber
    // Create channel if first subscriber
    // Return unsubscribe function
  },
  
  notify(table: string) {
    // Debounce 2 seconds
    // Only notify if tab visible
    // Call all subscribers
  }
};
```

---

### Phase 7: Batch SELECT * Replacements

**Priority files to update (based on frequency of use):**

| File | Current | Optimized Columns |
|------|---------|-------------------|
| `useProductionJobs.tsx` | `select('*')` | `id, wo_no, customer, status, due_date, reference, created_at, is_expedited, category_id` |
| `useAutoApprovedJobs.ts` | `select('*')` | `id, wo_no, customer, due_date, proof_approved_at, category_id` |
| `useScheduledJobs.tsx` | `select('*')` | `id, wo_no, customer, due_date, is_expedited, status` |
| `usePrinters.tsx` | `select('*')` | `id, name, type, status, is_active` |
| `useCategories.tsx` | `select('*')` | `id, name, color, sla_target_days` |
| `useDepartments.tsx` | `select('*')` | `id, name, description, is_active` |

Continue for remaining 53 files...

---

## Implementation Order

| Step | Files | Egress Reduction |
|------|-------|------------------|
| 1 | Create `useTabVisibility.ts` | Foundation |
| 2 | Fix `usePersonalOperatorQueue.tsx` | ~400MB/day |
| 3 | Fix `KanbanDataContext.tsx` | ~200MB/day |
| 4 | Fix `useEnhancedProductionJobs.tsx` | ~200MB/day |
| 5 | Fix `useDataManager.tsx` | ~50MB/day |
| 6 | Create `useRealtimeSubscriptionManager.ts` | Prevents cascades |
| 7 | Update high-frequency SELECT * queries | ~100MB/day |

**Expected total reduction: 70-85% of current egress**

---

## Testing Strategy

1. **Before changes:**
   - Note current egress in Supabase dashboard
   - Monitor network tab for request frequency

2. **After each phase:**
   - Verify tab hidden pauses polling
   - Verify debouncing works
   - Check payload sizes reduced

3. **Validation:**
   - Leave app open for 24 hours
   - Compare egress to previous day

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Data staleness | Keep manual refresh buttons working |
| Real-time updates missed | Resume subscription immediately when tab visible |
| User confusion | Data still updates, just not when tab hidden |

---

## Summary of Changes

### New Files
1. `src/hooks/useTabVisibility.ts` - Tab visibility detection
2. `src/hooks/useRealtimeSubscriptionManager.ts` - Centralized subscription management

### Modified Files (Phase 2-5)
1. `src/hooks/tracker/usePersonalOperatorQueue.tsx`
2. `src/contexts/KanbanDataContext.tsx`
3. `src/hooks/tracker/useEnhancedProductionJobs.tsx`
4. `src/hooks/tracker/useDataManager.tsx`

### Modified Files (Phase 7 - SELECT * replacements)
- 59 files with SELECT * patterns will be updated to use specific columns

---

## Expected Outcomes

| Metric | Before | After |
|--------|--------|-------|
| Daily Postgres egress | 1.5-2GB | 200-400MB |
| Requests per minute (tab active) | 20-30 | 2-5 |
| Requests per minute (tab hidden) | 20-30 | 0 |
| Payload size per request | 17MB | 2-3MB |
| Real-time cascade frequency | 5-10x | 1x (debounced) |
