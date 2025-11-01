# Auto-Sync Architecture: KV Storage ↔️ Firestore

## Problem

Thesara koristi **dual storage backend** arhitekturu:
- **KV Storage** (Local JSON files): Brz pristup za development i backup
- **Firestore** (Cloud database): Skalabilna cloud baza za production

### Split-Brain Bug

Originalni kod je imao **split-brain** problem:
- ✍️ **Publish** operacija je pisala **SAMO u KV storage** (`ensureListingRecord` → `backend.patch`)
- 📖 **Approve/Play** operacije su čitale **SAMO iz Firestore** (`resolveBuildContext` → `readApps`)

**Rezultat**: Mini-aplikacije objavljene lokalno nisu bile dostupne u Firestore, što je izazvalo failure pri approve/play.

#### Primjer Bug-a (Listing 203)

```
1. User objavi mini-app 203 → buildId: c2cb6e31-d612-48f2-b056-aac1f1af71cd
2. ensureListingRecord() zapisuje u KV storage/kv/listing-203.json
3. Firestore ostaje prazan (nema zapisa)
4. Admin klikne Approve → readApps() čita iz Firestore → NE PRONALAZI listing 203
5. Browser zahtijeva build ali dobija pogrešan buildId
6. Mini-app ne učitava (MIME type errors)
```

## Rješenje: Auto-Sync Mehanizam

### Implementacija

Dodao sam **automatsku sinkronizaciju** nakon svake KV write operacije u `ensureListingRecord()`:

```typescript
// apps/api/src/routes/publish.ts (linija ~107)

// AUTO-SYNC: Write to Firestore to prevent split-brain architecture issues
// This ensures that KV storage and Firestore stay synchronized
try {
  const { updateApp } = await import('../db.js');
  const firestorePayload: any = {
    id,
    title: safeTitle,
    pendingBuildId: buildId,
  };
  if (isNew) {
    firestorePayload.status = 'pending_review';
    if (uid) firestorePayload.authorUid = uid;
    firestorePayload.createdAt = ops.find((op: any) => op.key === 'createdAt')?.value;
  } else {
    firestorePayload.updatedAt = ops.find((op: any) => op.key === 'updatedAt')?.value;
  }
  await updateApp(id, firestorePayload);
  console.log('[ensureListingRecord] ✅ Auto-synced to Firestore:', { listingId: id, pendingBuildId: buildId });
} catch (syncError) {
  console.error('[ensureListingRecord] ⚠️ Failed to sync to Firestore (KV write succeeded):', syncError);
  // Don't throw - KV write succeeded, Firestore sync is best-effort
}
```

### Kako Radi

1. **KV Write**: `backend.patch()` zapisuje listing u KV storage (kao prije)
2. **Auto-Sync**: Odmah nakon KV write, podaci se kopiraju u Firestore
3. **Best-Effort**: Ako Firestore sync faila, ne baca se error (KV write je uspješan)
4. **Logging**: Svaka operacija se loguje za debugging

### Sync Polja

Auto-sync kopira ova polja iz KV → Firestore:

- `id`: Listing ID
- `title`: Naslov mini-aplikacije
- `pendingBuildId`: **Ključno polje** - buildId koji čeka approval
- `status`: Status listinga (pending_review/published/rejected)
- `authorUid`: UID korisnika koji je objavio
- `createdAt`: Timestamp kreiranja (samo za nove listinge)
- `updatedAt`: Timestamp update-a (samo za postojeće listinge)

## Verifikacija

### Manual Sync Script

Za existing listinge koji su objavljeni prije ovog fixa, kreiran je `sync-kv-to-firestore.mjs`:

```bash
cd apps/api
node sync-kv-to-firestore.mjs
```

Ovaj script:
- Čita sve `listing-*.json` iz `storage/kv/`
- Piše ih u Firestore sa `merge: true`
- Verifikuje da buildId postoji u `storage/bundles/builds/`

### Testing

```bash
# 1. Pokreni API
cd apps/api
pnpm run dev

# 2. Objavi novu mini-aplikaciju kroz UI ili API

# 3. Provjeri KV storage
cat ../../storage/kv/listing-<ID>.json

# 4. Provjeri Firestore
curl http://localhost:8789/api/app-meta/<ID>

# Oba trebaju imati isti pendingBuildId!
```

## Architectural Decision

**Odabrano rješenje**: **Opcija 1 - Auto-Sync KV → Firestore**

### Razlozi

✅ **Minimalna promjena koda** - Samo jedan dodatak u `ensureListingRecord()`  
✅ **Zadržava prednosti oba backenda**:
   - KV: Brz, jednostavan, ne zahtijeva connection
   - Firestore: Skalabilan, cloud-native, production-ready  
✅ **Backward compatible** - Ne mijenja API ni ponašanje  
✅ **Best-effort sync** - Ne blokira publish ako Firestore nije dostupan  

### Alternativne Opcije (Odbijene)

❌ **Opcija 2: Samo Firestore** - Gubi brzinu KV storage-a, zahtijeva connection za svaki write  
❌ **Opcija 3: Samo KV Storage** - Ne skalira za production, nema cloud backup  

## Maintenance

### Debug Logging

Auto-sync ima built-in logging:

```
[ensureListingRecord] ✅ Auto-synced to Firestore: { listingId: '203', pendingBuildId: 'c2cb6e31-...' }
```

Ako sync faila:

```
[ensureListingRecord] ⚠️ Failed to sync to Firestore (KV write succeeded): Error: ...
```

### Monitoring

Ključni pokazatelji:

- **KV writes uspješni, Firestore sync failuje** → Provjeriti Firestore credentials/connection
- **pendingBuildId mismatch** → Provjeriti da li approve koristi Firestore (trebao bi)
- **Build directory postoji ali app ne učitava** → Provjeriti buildId permutaciju (ne bi trebalo da se dešava)

### Future Improvements

1. **Metrics**: Dodati Prometheus metrics za sync success/failure rate
2. **Retry Logic**: Implementirati retry sa exponential backoff ako Firestore sync faila
3. **Consistency Check**: Periodic job koji provjerava KV vs Firestore consistency
4. **Firestore Triggers**: Firestore Cloud Functions za automatski update metrics/search index

## Related Files

- `apps/api/src/routes/publish.ts` - Auto-sync implementacija
- `apps/api/src/db.ts` - Firestore updateApp() funkcija
- `apps/api/sync-kv-to-firestore.mjs` - Manual sync script za existing data
- `apps/api/diagnose-203.mjs` - Diagnostic tool za verifikaciju buildId

## Changelog

### 2025-11-01
- ✅ Identificiran split-brain bug (Listing 203 failure)
- ✅ Implementiran auto-sync u `ensureListingRecord()`
- ✅ Kreiran sync script za existing data
- ✅ Sinhronizovano 12 listinga iz KV → Firestore
- ✅ Verifikovano da listing 203 ima ispravan buildId u Firestore
- ✅ Approve workflow funkcioniše korektno

## See Also

- [THESARA_RUNBOOK.md](../THESARA_RUNBOOK.md) - Operational runbook
- [Izvjestaj_Analiza_Problema.md](../Izvjestaj_Analiza_Problema.md) - Problem analysis report
