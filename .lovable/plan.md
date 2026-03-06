

# Fix: "beyond the curtain" User Incorrectly Routed to Die Cutting Machine Dashboard

## Problem

The user **beyondthecurtain@impressweb.co.za** (operator role, "beyond the curtain" group) has `can_work` permissions on **9 stages**: Box Gluing, Case Binding, CD 102 5 Col, Die Cutting, Folding, Litho Lam, Outsource, Perfect Binding, Section Sewing.

The routing logic in `SchedulerAwareOperatorDashboard.tsx` (line 100-111) checks: "if operator has die cutting stages AND NOT dtp AND NOT packaging → redirect to `/tracker/die-cutting`". This user matches that condition because they have a "Die Cutting" stage, so they get sent to the **machine management dashboard** — which is designed for die cutting managers assigning jobs to specific machines, not for general operators.

This user should be on the **multi-column Finishing dashboard** (`/tracker/finishing`) which shows all their accessible stages as separate queues. Die Cutting is just one of 9 stages for them.

## Root Cause

The redirect logic treats any operator with a die cutting stage as a "die cutting only" operator. It should only redirect when die cutting stages are the **only** stages the user has access to.

## Fix

### File: `src/components/tracker/factory/SchedulerAwareOperatorDashboard.tsx`

Update the redirect logic (lines 100-118) to only redirect to die-cutting when the user **exclusively** has die cutting stages (no other non-DTP, non-packaging stages):

```
// Current (broken):
if (hasDieCuttingStages && !hasDtpStages && !hasPackagingStages) → die-cutting

// Fixed:
const hasOtherStages = accessibleStages.some(stage => 
  !DIE_CUTTING_PATTERNS.some(...) && 
  !DTP_PATTERNS.some(...) && 
  !PACKAGING_PATTERNS.some(...)
);

if (hasDieCuttingStages && !hasOtherStages && !hasDtpStages && !hasPackagingStages) → die-cutting
```

This way, "beyond the curtain" (which has Box Gluing, Folding, etc. in addition to Die Cutting) will fall through to the finishing redirect instead. Users who **only** have die cutting access will still be correctly routed to the machine dashboard.

### No other changes needed
- Permissions are correct (can_work on all 9 stages)
- Queue merge groups are correct (Trimming and Finishing groups don't conflict)
- The Finishing dashboard already handles Die Cutting as a queue column via `useUserStagePermissions`

