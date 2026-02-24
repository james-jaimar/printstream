

# Add "Replace Artwork" to Flagged Item Cards

## Problem
When a client requests changes on specific items, the admin sees the banner listing which items need updating, but:
1. The individual item cards show no visual indicator that they're flagged
2. There's no way to replace artwork on a specific card -- only delete and re-upload

## Changes

### 1. LabelItemCard -- Add replace button and flagged state (`src/components/labels/items/LabelItemCard.tsx`)

- Add new props: `onReplaceArtwork?: (file: File) => void`, `artworkIssue?: string`, `isFlagged?: boolean`
- When `isFlagged` is true:
  - Show a red/orange border or highlight on the card
  - Display the `artworkIssue` text below the thumbnail (same style as the portal)
  - Show a "Replace" button (file input trigger) alongside the delete button
- The Replace button opens a hidden file input (`accept=".pdf"`), and on selection calls `onReplaceArtwork(file)`
- The replace button appears in the top-left area of the thumbnail (next to trash), using a `RefreshCw` or `Upload` icon

### 2. LabelItemsGrid -- Wire replace handler (`src/components/labels/items/LabelItemsGrid.tsx`)

- Add `onReplaceArtwork?: (itemId: string, file: File) => void` prop
- Pass `isFlagged`, `artworkIssue`, and `onReplaceArtwork` down to each `LabelItemCard`
- An item is flagged when `item.proofing_status === 'client_needs_upload'` or `item.artwork_issue` is set

### 3. LabelOrderModal -- Implement replace logic (`src/components/labels/order/LabelOrderModal.tsx`)

- Add a `handleReplaceArtwork` callback that:
  1. Uploads the new PDF to storage at the item's existing path (upsert)
  2. Generates a new thumbnail
  3. Updates the item's `proof_pdf_url`, `proof_thumbnail_url` (or `artwork_*` fields)
  4. Resets `proofing_status` to `ready_for_proof` and clears `artwork_issue`
  5. Runs VPS preflight on the new file
- Pass `onReplaceArtwork` to `LabelItemsGrid`

## Technical Details

### Replace upload flow
```text
User clicks Replace on flagged card
  -> hidden file input opens
  -> user selects PDF
  -> upload to storage (same path, upsert: true)
  -> generate thumbnail
  -> update item record:
       proof_pdf_url = new URL
       proof_thumbnail_url = new thumb path
       proofing_status = 'ready_for_proof'
       artwork_issue = null
  -> run VPS preflight async
  -> toast confirmation
```

### Flagged card visual
- Card gets `border-destructive/50` border class
- Artwork issue text shown in a small red banner below the thumbnail
- Replace button uses `RefreshCw` icon, positioned in the top-left alongside the delete button

## File Summary

| File | Change |
|------|--------|
| `src/components/labels/items/LabelItemCard.tsx` | Add `onReplaceArtwork`, `artworkIssue`, `isFlagged` props; show flagged state and replace button |
| `src/components/labels/items/LabelItemsGrid.tsx` | Pass flagged state and replace handler to cards |
| `src/components/labels/order/LabelOrderModal.tsx` | Implement `handleReplaceArtwork` with upload, thumbnail gen, and status reset |

