# Bundle Upload Authorization

## Problem (Prije)
Samo administratori su mogli uploadovati bundle-ove zbog striktne `admin_required` provjere.  
To je blokiralo regularnu publishers da objavljuju svoje aplikacije.

**Greška**: `Only admins can publish bundles.` (403 Forbidden)

---

## Rješenje (Sada)

### ✅ Dozvoljena akcija - KO MOŽE ŠTA:

| Akcija | Obični korisnik | Admin |
|--------|-----------------|-------|
| **Kreiraj novu aplikaciju** | ✅ Da (u limitu) | ✅ Da |
| **Updateuj svoju aplikaciju** | ✅ Da | ✅ Da |
| **Updateuj tuđu aplikaciju** | ❌ Ne | ✅ Da |

### 📝 Authorization Flow:

1. **Korisnik je autentikovan** (uid obavezan)
2. **Prihvaćeni Terms of Service**
3. **Ako upload-uje UPDATE postojeće app**:
   - Provjeri: Da li app postoji? (404 ako ne)
   - Provjeri: Da li je korisnik vlasnik ILI admin? (403 ako ni jedno)
4. **Ako kreira NOVU app**:
   - Provjeri limit aplikacija (MAX_APPS_PER_USER ili GOLD_MAX_APPS_PER_USER)
   - (403 ako dostignut limit)
5. **Nastavi sa bundle processing**

### 🔒 Ownership Provjera:

```typescript
const isOwner = existingApp.author?.uid === uid || existingApp.ownerUid === uid;
const isAdmin = authUser?.role === 'admin' || authUser?.claims?.admin === true;

if (!isOwner && !isAdmin) {
  return 403; // Forbidden
}
```

---

## API Response Codes

| Code | Error | Razlog |
|------|-------|--------|
| `202` | ✅ Success | Bundle prihvaćen, build započet |
| `401` | `unauthorized` | Nisu autentifikovani |
| `403` | `not_owner` | Pokušaj updatea tuđe aplikacije (non-admin) |
| `403` | `max_apps` | Dostignut limit aplikacija |
| `404` | `app_not_found` | AppId ne postoji (za update) |
| `428` | `terms_not_accepted` | Terms nije prihvaćen |

---

## Testiranje

### Test Case 1: Novi korisnik uploaduje svoj prvi bundle
```bash
# Expected: 202 Accepted
POST /api/publish/bundle
Authorization: Bearer [user_token]
Content-Type: multipart/form-data

title=My First App
file=bundle.zip
```

### Test Case 2: Korisnik updateuje svoju aplikaciju
```bash
# Expected: 202 Accepted
POST /api/publish/bundle
Authorization: Bearer [user_token]

id=123  # existing app owned by user
title=My App v2
file=bundle.zip
```

### Test Case 3: Korisnik pokušava updateovati tuđu aplikaciju
```bash
# Expected: 403 Forbidden (error: 'not_owner')
POST /api/publish/bundle
Authorization: Bearer [user_token]

id=456  # app owned by someone else
file=bundle.zip
```

### Test Case 4: Admin updateuje bilo koju aplikaciju
```bash
# Expected: 202 Accepted
POST /api/publish/bundle
Authorization: Bearer [admin_token]

id=456  # any app
file=bundle.zip
```

---

## Deploy Notes

Nakon deploya:
1. Restart API server
2. Svi korisnici sada mogu uploadovati bundle-ove
3. Admini i dalje imaju puna prava

**Commit**: `3cee25a`  
**Datum**: 2026-01-06
