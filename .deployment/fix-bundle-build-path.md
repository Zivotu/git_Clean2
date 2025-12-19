# Fix: Bundle vs Build Path Alignment
**Date:** 2025-12-19  
**Issue:** "App not found" errors, broken asset loading

## 📋 Changes Made

### 1. `apps/api/src/paths.ts`
```typescript
// BEFORE:
export function getBundleDir(id: string) {
  return path.join(BUNDLE_ROOT, 'builds', id, 'bundle');
}

// AFTER:
export function getBundleDir(id: string) {
  return path.join(BUNDLE_ROOT, 'builds', id, 'build');
}
```

### 2. `apps/api/src/workers/bundleBuildWorker.ts` (line 1317)
```typescript
// BEFORE:
const baseHref = `/builds/${buildId}/bundle/`;

// AFTER:
const baseHref = `/builds/${buildId}/build/`;
```

## 🎯 What This Fixes

**Root Cause:**
- Disk structure uses: `/builds/<ID>/build/`
- Frontend requests: `/builds/<ID>/build/`
- But HTML was injected with: `<base href="/builds/<ID>/bundle/">`
- Result: Assets 404, app crashes → "App not found"

**Solution:**
- HTML now gets correct `<base href="/builds/<ID>/build/">`
- All relative asset paths now resolve correctly
- Play, shims, storage, tokens all continue working unchanged

## ✅ Deployment Checklist

### Pre-Deploy (LOCAL)
- [x] Changed `paths.ts` getBundleDir
- [x] Changed `bundleBuildWorker.ts` baseHref
- [ ] Run local build: `pnpm build` (API)
- [ ] Verify no TypeScript errors
- [ ] Test locally if possible

### Deploy Steps

1. **Commit Changes**
   ```bash
   git add apps/api/src/paths.ts apps/api/src/workers/bundleBuildWorker.ts
   git commit -m "Fix: Align bundle paths with actual disk structure (bundle → build)"
   git push origin main
   ```

2. **On Server**
   ```bash
   cd /srv/thesara/app
   git pull origin main
   cd apps/api
   pnpm install  # if needed
   pnpm build
   pm2 restart api
   ```

3. **Verify**
   - Open existing app through Play
   - Check browser console for errors
   - Verify assets load correctly
   - Test storage/rooms if you use them

### Post-Deploy Verification

**Test These:**
- [ ] Open app via `/play/<app-slug>` → should load
- [ ] Check browser Network tab → `/build/` URLs should 200
- [ ] Test iframe loading → no "App not found"
- [ ] Verify images load
- [ ] Test manifest fetch
- [ ] Verify shims work (storage, rooms)

**Check Logs:**
```bash
pm2 logs api --lines 50
```

Look for:
- ✅ No 404 errors for `/build/` assets
- ✅ "Injected storage shim + base href" messages
- ❌ Any "bundle_index_missing" redirects (shouldn't happen anymore)

## 🔄 Rollback Plan (if needed)

If something goes wrong:

```bash
cd /srv/thesara/app
git log --oneline -5  # find previous commit hash
git checkout <PREVIOUS_COMMIT_HASH>
cd apps/api
pnpm build
pm2 restart api
```

## 🚨 What DOESN'T Change

This fix is **safe** because it ONLY affects:
- Path helpers (`getBundleDir`)
- HTML base href injection

**Unchanged (still works):**
- ✅ Play mechanism
- ✅ Shim communication
- ✅ Storage API
- ✅ Rooms sync
- ✅ Authentication/tokens
- ✅ iframe sandbox
- ✅ CSP headers
- ✅ Existing compatibility routes (`/bundle/` → `/build/` redirects)

## 📊 Expected Impact

**Before Fix:**
```
User opens app → iframe loads /builds/ABC/build/ ✅
index.html served ✅
BUT: <base href="/builds/ABC/bundle/"> ❌
App requests ./app.js → browser tries /builds/ABC/bundle/app.js ❌
404 → App crashes → "App not found"
```

**After Fix:**
```
User opens app → iframe loads /builds/ABC/build/ ✅
index.html served ✅
<base href="/builds/ABC/build/"> ✅
App requests ./app.js → browser loads /builds/ABC/build/app.js ✅
200 → App works! 🎉
```

## 🐛 Known Edge Cases

**Existing builds with `/bundle/` directory:**
- API has fallback mechanism in `index.ts` (lines 653-663, 704-713)
- If `/build/` doesn't exist, tries `/bundle/`
- Old builds will still work via fallback

**New builds:**
- Worker creates files in `/build/` (already does this)
- HTML gets correct `<base href="/build/">`
- Everything aligns ✅

## 📝 Notes

- ChatGPT's analysis was ~95% correct
- The issue was the HTML base href injection, not the API routes
- API already supported both `/build/` and `/bundle/` paths
- This fix just makes everything consistent

**Separate Issue:** Missing `/uploads/` images
- Not fixed by this change
- Needs separate restoration from backup
