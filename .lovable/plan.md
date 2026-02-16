

## Fix: Wrong VPS URL path in label-impose edge function

### The Problem
The `label-impose` edge function is calling `https://pdf-api.jaimar.dev/impose/labels`, but the VPS FastAPI endpoint is actually registered at `https://pdf-api.jaimar.dev/imposition/labels`.

- Edge function (line 85): `/impose/labels` -- **WRONG**
- VPS actual route: `/imposition/labels` -- **CORRECT**

This is why every call returns `404 - {"detail":"Not Found"}`.

### The Fix
One line change in `supabase/functions/label-impose/index.ts`:

Change line 85 from:
```
const response = await fetch(`${VPS_PDF_API_URL}/impose/labels`, {
```
To:
```
const response = await fetch(`${VPS_PDF_API_URL}/imposition/labels`, {
```

### Technical Details
- **File**: `supabase/functions/label-impose/index.ts`, line 85
- **Root cause**: The VPS uses `app.include_router(imposition_router, prefix="/imposition")` in `main.py`, not `/impose`
- **Confirmed**: The VPS Swagger docs at `/docs` show the endpoint registered as `POST /imposition/labels`
- After the fix, the edge function will be redeployed automatically

