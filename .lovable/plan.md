

# Default Paper Size Mapping for HP12000

## Problem
Jobs come in with paper specs like "170gsm Gloss" but no sheet size, showing as "Unknown Size" on the schedule board. This creates messy grouping (e.g., "170gsm Gloss - Large", "170gsm Gloss - Small", "170gsm Gloss - Unknown Size" all separate). Admin needs a way to set system-level defaults: "170gsm Gloss → Small" so jobs auto-assign the correct HP12000 paper size.

## Solution

### 1. New Database Table: `paper_size_defaults`

Maps a combination of `paper_weight` (from `print_specifications`) and optionally `paper_type` to a default `hp12000_paper_size_id`.

```text
paper_size_defaults
├── id (uuid PK)
├── paper_weight_id (FK → print_specifications.id)  -- e.g., "170gsm"
├── paper_type_id (FK → print_specifications.id, nullable)  -- e.g., "Gloss" (null = any type at this weight)
├── default_paper_size_id (FK → hp12000_paper_sizes.id)  -- e.g., Small
├── created_at, updated_at
└── UNIQUE(paper_weight_id, paper_type_id)
```

When resolving: first try exact match (weight + type), then fallback to weight-only match (where `paper_type_id IS NULL`).

### 2. Admin UI — Settings Page Addition

Add a "Paper Size Defaults" card to `src/pages/Settings.tsx`:
- Table showing current mappings: Weight | Type | Default Size | Actions
- Add/edit rows via inline selects (paper weight dropdown, paper type dropdown, paper size dropdown)
- Delete button per row

### 3. Auto-Apply During Job Creation

**New file: `src/services/PaperSizeDefaultResolver.ts`**
- Called after `PaperSpecAutoResolver` completes (or during stage creation in `DirectJobCreator`)
- For each HP12000 stage instance where `hp12000_paper_size_id IS NULL`:
  1. Look up the job's resolved `paper_type` and `paper_weight` from `job_print_specifications`
  2. Query `paper_size_defaults` for a match (exact first, then weight-only)
  3. If found, update `job_stage_instances.hp12000_paper_size_id`

**Modified: `src/services/DirectJobCreator.ts`**
- After stage creation loop, call `PaperSizeDefaultResolver` to auto-fill paper sizes

### 4. Files

| Action | File |
|--------|------|
| **Migration** | New table `paper_size_defaults` with RLS |
| **New** | `src/services/PaperSizeDefaultResolver.ts` |
| **Modified** | `src/pages/Settings.tsx` — add Paper Size Defaults admin card |
| **Modified** | `src/services/DirectJobCreator.ts` — call resolver after stage creation |

### Flow

```text
Excel import → Job created → PaperSpecAutoResolver sets paper_type/weight
    → PaperSizeDefaultResolver checks paper_size_defaults table
    → Finds "170gsm + Gloss → Small"
    → Sets hp12000_paper_size_id on the stage instance
    → Schedule board shows "170gsm Gloss - Small" ✓
```

Admin changes "170gsm Gloss" from Small to Large → only affects new jobs going forward. Existing jobs keep their assigned size.

