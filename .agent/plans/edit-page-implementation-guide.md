# Implementacijska specifikacija: Redizajn stranice za uređivanje aplikacije

**Projekt**: Thesara - App Edit Page Redesign  
**Datum**: 2025-11-21  
**Cilj**: Uskladiti stranicu za uređivanje aplikacije s novim dizajnom i funkcionalnostima

---

## 📊 ANALIZA RAZLIKA

### Trenutna stranica (`/app/edit/[slug]`)
**Lokacija**: `apps/web/app/app/edit/page.tsx`

#### Što POSTOJI:
- ✅ Title input
- ✅ Description textarea
- ✅ Tags input (comma-separated text)
- ✅ Visibility select (public/unlisted)
- ✅ Rooms mode select (off/optional/required)
- ✅ Save/Cancel buttons

#### Što NEDOSTAJE:
- ❌ Dark/light mode support
- ❌ Moderan dizajn (trenutno je basic HTML)
- ❌ Long description textarea
- ❌ Preview title input
- ❌ Cover art selection (presets + upload)
- ❌ Screenshots gallery (upload/manage)
- ❌ Tag selection buttons (predefined list, max 2)
- ❌ Translations (EN, DE, HR)
- ❌ Live preview card
- ❌ Progress tracking
- ❌ Collapsible sections
- ❌ Proper error handling UI

### Referentna stranica (`/create`)
**Lokacija**: `apps/web/app/create/CreateRedesign.tsx`

#### Dizajn elementi za preuzeti:
- ✅ Sticky header s gradientom
- ✅ Grid layout (7/12 + 5/12)
- ✅ Dark mode aware komponente
- ✅ Emerald accent colors
- ✅ Glassmorphism efekti
- ✅ StatusChip komponenta
- ✅ Badge komponenta
- ✅ Collapsible sections (Rooms, Translations)
- ✅ Tag selection buttons
- ✅ Cover art grid selector
- ✅ Screenshot upload grid
- ✅ Live preview card
- ✅ Progress bar s completion tracking

---

## 🎯 IMPLEMENTACIJSKI PLAN

### FAZA 1: Kreiranje nove komponente
**Trajanje**: 30-45 min  
**Cilj**: Postaviti osnovnu strukturu

#### Korak 1.1: Kreirati datoteku
```bash
# Lokacija
apps/web/app/app/edit/EditRedesign.tsx
```

#### Korak 1.2: Kopirati template iz CreateRedesign
- Otvoriti `apps/web/app/create/CreateRedesign.tsx`
- Kopirati cijelu strukturu
- Ukloniti Step 0 (Source section) - nije potreban za edit
- Zadržati samo Step 1 (Basics & Visuals)

#### Korak 1.3: Prilagoditi Props interface
```typescript
interface EditRedesignProps {
  // Data
  slug: string;
  initialData: {
    title: string;
    description: string;
    longDescription?: string;
    tags: string[];
    visibility: 'public' | 'unlisted';
    previewUrl?: string | null;
    overlayTitle?: string;
    screenshots?: Array<{id: string; url: string}>;
    roomsMode?: 'off' | 'optional' | 'required';
    translations?: {
      en?: {title: string; description: string};
      de?: {title: string; description: string};
      hr?: {title: string; description: string};
    };
  };
  
  // Handlers
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
  
  // State
  saving: boolean;
  error?: string;
  
  // i18n
  t: (key: string) => string;
  
  // Assets
  PREVIEW_PRESET_PATHS: string[];
}
```

#### Korak 1.4: Inicijalizirati state iz initialData
```typescript
const [manifestName, setManifestName] = useState(initialData.title);
const [manifestDescription, setManifestDescription] = useState(initialData.description);
const [longDescription, setLongDescription] = useState(initialData.longDescription || '');
const [selectedTags, setSelectedTags] = useState<string[]>(initialData.tags || []);
const [visibility, setVisibility] = useState(initialData.visibility);
const [overlayTitle, setOverlayTitle] = useState(initialData.overlayTitle || '');
const [previewUrl, setPreviewUrl] = useState(initialData.previewUrl);
const [screenshots, setScreenshots] = useState(initialData.screenshots || []);
const [roomsMode, setRoomsMode] = useState(initialData.roomsMode || 'off');
const [trEn, setTrEn] = useState(initialData.translations?.en || {title: '', description: ''});
const [trDe, setTrDe] = useState(initialData.translations?.de || {title: '', description: ''});
const [trHr, setTrHr] = useState(initialData.translations?.hr || {title: '', description: ''});
```

**Deliverable**: `EditRedesign.tsx` s osnovnom strukturom

---

### FAZA 2: Prilagodba Header-a
**Trajanje**: 15 min  
**Cilj**: Promijeniti header za edit mode

#### Korak 2.1: Promijeniti naslov
```tsx
// Umjesto
<h1>{t('publishAppHeading')}</h1>

// Staviti
<h1>{t('editAppHeading')} · {manifestName || 'Untitled'}</h1>
```

#### Korak 2.2: Ukloniti step navigation
```tsx
// Obrisati cijeli <nav> element s step navigacijom
// Zadržati samo logo i naslov
```

#### Korak 2.3: Dodati "Back" link
```tsx
<div className="flex items-center gap-3">
  <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">
    ← Back to My Projects
  </button>
</div>
```

**Deliverable**: Header prilagođen za edit mode

---

### FAZA 3: Prilagodba Layout-a
**Trajanje**: 20 min  
**Cilj**: Ukloniti step logiku, prikazati samo form

#### Korak 3.1: Ukloniti step conditional
```tsx
// Umjesto
{step === 0 ? (...) : (...)}

// Staviti direktno form content
<div className="grid lg:grid-cols-12 gap-8 mt-6">
  {/* Left column - Form */}
  {/* Right column - Preview */}
</div>
```

#### Korak 3.2: Dodati Visibility sekciju u right column
```tsx
{/* U right column, nakon Live Preview */}
<div className="bg-white dark:bg-[#121212] border border-gray-200 dark:border-white/10 rounded-2xl p-5">
  <h3 className="text-sm font-bold mb-3">Visibility</h3>
  <div className="flex gap-2">
    <button
      onClick={() => setVisibility('public')}
      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border ${
        visibility === 'public'
          ? 'bg-emerald-500 text-white border-emerald-500'
          : 'bg-gray-100 dark:bg-[#1E1E1E] border-gray-200 dark:border-white/10'
      }`}
    >
      Public
    </button>
    <button
      onClick={() => setVisibility('unlisted')}
      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border ${
        visibility === 'unlisted'
          ? 'bg-emerald-500 text-white border-emerald-500'
          : 'bg-gray-100 dark:bg-[#1E1E1E] border-gray-200 dark:border-white/10'
      }`}
    >
      Unlisted
    </button>
  </div>
</div>
```

**Deliverable**: Layout bez step logike, s visibility kontrolama

---

### FAZA 4: Prilagodba Action Buttons
**Trajanje**: 15 min  
**Cilj**: Zamijeniti "Publish" s "Save Changes"

#### Korak 4.1: Promijeniti Publish button
```tsx
// Umjesto
<button onClick={publish}>
  {publishing ? 'Publishing...' : 'Publish Application'}
</button>

// Staviti
<button 
  onClick={handleSave} 
  disabled={saving || !hasChanges}
  className="w-full py-4 rounded-xl font-bold text-sm uppercase tracking-widest transition-all transform shadow-lg flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-black shadow-emerald-500/20 hover:-translate-y-0.5 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:text-gray-500 disabled:cursor-not-allowed"
>
  {saving ? 'Saving...' : 'Save Changes'}
</button>
```

#### Korak 4.2: Dodati Cancel button
```tsx
<button 
  onClick={onCancel}
  className="w-full py-3 rounded-xl font-medium text-sm border border-gray-300 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5"
>
  Cancel
</button>
```

#### Korak 4.3: Implementirati handleSave
```typescript
const handleSave = () => {
  const data = {
    title: manifestName,
    description: manifestDescription,
    longDescription,
    tags: selectedTags,
    visibility,
    overlayTitle,
    previewUrl,
    screenshots,
    roomsMode,
    translations: {
      en: trEn,
      de: trDe,
      hr: trHr,
    },
  };
  onSave(data);
};
```

**Deliverable**: Action buttons prilagođeni za edit mode

---

### FAZA 5: Implementacija Screenshot Management
**Trajanje**: 30 min  
**Cilj**: Omogućiti upload i brisanje screenshota

#### Korak 5.1: Dodati state za nove screenshote
```typescript
const [newScreenshots, setNewScreenshots] = useState<Array<{id: string; file: File; dataUrl: string}>>([]);
const [removedScreenshotIds, setRemovedScreenshotIds] = useState<string[]>([]);
```

#### Korak 5.2: Implementirati remove handler
```typescript
const handleRemoveScreenshot = (id: string) => {
  // Ako je existing screenshot
  if (screenshots.find(s => s.id === id)) {
    setRemovedScreenshotIds(prev => [...prev, id]);
    setScreenshots(prev => prev.filter(s => s.id !== id));
  }
  // Ako je novi screenshot
  else {
    setNewScreenshots(prev => prev.filter(s => s.id !== id));
  }
};
```

#### Korak 5.3: Prilagoditi screenshot grid
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  {/* Existing screenshots */}
  {screenshots.map((shot) => (
    <div key={shot.id} className="relative">
      <Image src={shot.url} alt="Screenshot" layout="fill" />
      <button 
        onClick={() => handleRemoveScreenshot(shot.id)}
        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
      >
        ✕
      </button>
    </div>
  ))}
  
  {/* New screenshots */}
  {newScreenshots.map((shot) => (
    <div key={shot.id} className="relative">
      <Image src={shot.dataUrl} alt="New screenshot" layout="fill" />
      <button 
        onClick={() => handleRemoveScreenshot(shot.id)}
        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
      >
        ✕
      </button>
    </div>
  ))}
  
  {/* Add new button */}
  {(screenshots.length + newScreenshots.length) < 4 && (
    <button onClick={() => screenshotInputRef.current?.click()}>
      + Add Screenshot
    </button>
  )}
</div>
```

**Deliverable**: Screenshot management funkcionalnost

---

### FAZA 6: Integracija s page.tsx
**Trajanje**: 30 min  
**Cilj**: Povezati EditRedesign s page.tsx

#### Korak 6.1: Importirati EditRedesign u page.tsx
```typescript
// apps/web/app/app/edit/page.tsx
import EditRedesign from './EditRedesign';
import { useTheme } from '@/components/ThemeProvider';
```

#### Korak 6.2: Dodati state za EditRedesign props
```typescript
const [previewFile, setPreviewFile] = useState<File | null>(null);
const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
const previewInputRef = useRef<HTMLInputElement>(null);
const screenshotInputRefs = useRef<(HTMLInputElement | null)[]>([]);
```

#### Korak 6.3: Implementirati handleSave
```typescript
const handleSave = async (data: any) => {
  setBusy(true);
  try {
    // 1. Upload preview image if changed
    let newPreviewUrl = data.previewUrl;
    if (previewFile) {
      const formData = new FormData();
      formData.append('preview', previewFile);
      const res = await fetch(`${PUBLIC_API_URL}/listing/${slug}/preview`, {
        method: 'POST',
        headers: await buildHeaders(false),
        body: formData,
      });
      if (res.ok) {
        const json = await res.json();
        newPreviewUrl = json.previewUrl;
      }
    }
    
    // 2. Upload screenshots if any
    let newScreenshots = data.screenshots;
    if (screenshotFiles.length > 0) {
      const formData = new FormData();
      screenshotFiles.forEach((file, i) => {
        formData.append(`screenshot${i}`, file);
      });
      const res = await fetch(`${PUBLIC_API_URL}/listing/${slug}/screenshots`, {
        method: 'POST',
        headers: await buildHeaders(false),
        body: formData,
      });
      if (res.ok) {
        const json = await res.json();
        newScreenshots = [...data.screenshots, ...json.screenshots];
      }
    }
    
    // 3. Update listing
    await apiPatch(`/listing/${slug}`, {
      ...data,
      previewUrl: newPreviewUrl,
      screenshots: newScreenshots,
    }, { auth: true });
    
    router.push('/my');
  } catch (e) {
    setError('Failed to update application');
  } finally {
    setBusy(false);
  }
};
```

#### Korak 6.4: Renderirati EditRedesign
```tsx
return (
  <EditRedesign
    slug={slug}
    initialData={{
      title,
      description,
      longDescription: '', // TODO: load from API
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      visibility,
      previewUrl: null, // TODO: load from API
      overlayTitle: '', // TODO: load from API
      screenshots: [], // TODO: load from API
      roomsMode,
      translations: {}, // TODO: load from API
    }}
    onSave={handleSave}
    onCancel={() => router.back()}
    saving={busy}
    error={error}
    t={(key) => key} // TODO: implement i18n
    PREVIEW_PRESET_PATHS={[
      '/presets/gradient-1.jpg',
      '/presets/gradient-2.jpg',
      // ... add all presets
    ]}
  />
);
```

**Deliverable**: EditRedesign integriran s page.tsx

---

### FAZA 7: Backend API izmjene
**Trajanje**: 45 min  
**Cilj**: Proširiti API za nova polja

#### Korak 7.1: Proširiti GET /listing/:slug
```typescript
// apps/api/src/routes/listing.ts

// Dodati u response:
{
  ...existingFields,
  longDescription: listing.longDescription || '',
  overlayTitle: listing.overlayTitle || '',
  screenshots: listing.screenshots || [],
  translations: listing.translations || {},
}
```

#### Korak 7.2: Proširiti PATCH /listing/:slug
```typescript
router.patch('/listing/:slug', async (req, res) => {
  const { slug } = req.params;
  const {
    title,
    description,
    longDescription,      // NEW
    tags,
    visibility,
    overlayTitle,         // NEW
    previewUrl,           // NEW
    screenshots,          // NEW
    capabilities,
    translations,         // NEW
  } = req.body;
  
  // Validate ownership
  const listing = await db.listings.findOne({ slug });
  if (listing.ownerUid !== req.user.uid) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  // Update
  await db.listings.updateOne(
    { slug },
    {
      $set: {
        title,
        description,
        longDescription,
        tags,
        visibility,
        overlayTitle,
        previewUrl,
        screenshots,
        capabilities,
        translations,
        updatedAt: Date.now(),
      },
    }
  );
  
  res.json({ success: true });
});
```

#### Korak 7.3: Kreirati POST /listing/:slug/preview
```typescript
router.post('/listing/:slug/preview', upload.single('preview'), async (req, res) => {
  const { slug } = req.params;
  const file = req.file;
  
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  // Upload to storage (S3, Cloudinary, etc.)
  const previewUrl = await uploadToStorage(file);
  
  // Update listing
  await db.listings.updateOne(
    { slug },
    { $set: { previewUrl } }
  );
  
  res.json({ previewUrl });
});
```

#### Korak 7.4: Kreirati POST /listing/:slug/screenshots
```typescript
router.post('/listing/:slug/screenshots', upload.array('screenshots', 4), async (req, res) => {
  const { slug } = req.params;
  const files = req.files as Express.Multer.File[];
  
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  
  // Upload all screenshots
  const screenshots = await Promise.all(
    files.map(async (file) => ({
      id: generateId(),
      url: await uploadToStorage(file),
    }))
  );
  
  res.json({ screenshots });
});
```

**Deliverable**: Backend API proširen za nova polja

---

### FAZA 8: Database Schema izmjene
**Trajanje**: 15 min  
**Cilj**: Dodati nova polja u bazu

#### Korak 8.1: Ažurirati Listing schema
```typescript
// Dodati u Listing interface/schema:
interface Listing {
  // ... existing fields
  longDescription?: string;
  overlayTitle?: string;
  screenshots?: Array<{id: string; url: string}>;
  translations?: {
    en?: {title: string; description: string};
    de?: {title: string; description: string};
    hr?: {title: string; description: string};
  };
}
```

#### Korak 8.2: Kreirati migration (ako koristite migrations)
```sql
ALTER TABLE listings 
ADD COLUMN long_description TEXT,
ADD COLUMN overlay_title VARCHAR(50),
ADD COLUMN screenshots JSON,
ADD COLUMN translations JSON;
```

**Deliverable**: Database schema ažuriran

---

### FAZA 9: Translations (i18n)
**Trajanje**: 20 min  
**Cilj**: Dodati prijevode za edit stranicu

#### Korak 9.1: Dodati u hr.json
```json
{
  "editAppHeading": "Uredi aplikaciju",
  "saveChanges": "Spremi izmjene",
  "saving": "Spremanje...",
  "cancel": "Odustani",
  "visibility": "Vidljivost",
  "public": "Javno",
  "unlisted": "Skriveno",
  "longDescriptionLabel": "Detaljan opis",
  "longDescriptionPlaceholder": "Detaljno opiši svoju aplikaciju...",
  "overlayTitleLabel": "Naslov na pregledu",
  "overlayTitlePlaceholder": "Kratak naslov za prikaz"
}
```

#### Korak 9.2: Dodati u en.json
```json
{
  "editAppHeading": "Edit Application",
  "saveChanges": "Save Changes",
  "saving": "Saving...",
  "cancel": "Cancel",
  "visibility": "Visibility",
  "public": "Public",
  "unlisted": "Unlisted",
  "longDescriptionLabel": "Detailed Description",
  "longDescriptionPlaceholder": "Describe your app in detail...",
  "overlayTitleLabel": "Preview Title",
  "overlayTitlePlaceholder": "Short title for display"
}
```

**Deliverable**: Prijevodi dodani

---

### FAZA 10: Testing i Polish
**Trajanje**: 30 min  
**Cilj**: Testirati i popraviti bugove

#### Korak 10.1: Testirati u light mode
- [ ] Svi elementi vidljivi
- [ ] Boje pravilne
- [ ] Hover states rade

#### Korak 10.2: Testirati u dark mode
- [ ] Svi elementi vidljivi
- [ ] Boje pravilne
- [ ] Kontrast dobar

#### Korak 10.3: Testirati funkcionalnosti
- [ ] Učitavanje postojećih podataka
- [ ] Spremanje izmjena
- [ ] Upload preview slike
- [ ] Upload screenshota
- [ ] Brisanje screenshota
- [ ] Tag selection
- [ ] Visibility toggle
- [ ] Rooms mode
- [ ] Translations

#### Korak 10.4: Testirati validaciju
- [ ] Prazna polja
- [ ] Predugački tekst
- [ ] Prevelike slike
- [ ] Network errors

**Deliverable**: Testirano i spremno za produkciju

---

## 📋 CHECKLIST

### Pre-implementation
- [ ] Pročitati cijeli dokument
- [ ] Razumjeti strukturu CreateRedesign.tsx
- [ ] Provjeriti postojeće API endpointe
- [ ] Pripremiti development environment

### Implementation
- [ ] Faza 1: Kreiranje komponente
- [ ] Faza 2: Header prilagodba
- [ ] Faza 3: Layout prilagodba
- [ ] Faza 4: Action buttons
- [ ] Faza 5: Screenshot management
- [ ] Faza 6: Integracija s page.tsx
- [ ] Faza 7: Backend API
- [ ] Faza 8: Database schema
- [ ] Faza 9: Translations
- [ ] Faza 10: Testing

### Post-implementation
- [ ] Code review
- [ ] QA testing
- [ ] Deploy to staging
- [ ] User acceptance testing
- [ ] Deploy to production

---

## 🚨 VAŽNE NAPOMENE

1. **Ne mijenjati CreateRedesign.tsx** - samo kopirati strukturu
2. **Koristiti postojeće komponente** - StatusChip, Badge, itd.
3. **Zadržati dark mode support** - sve komponente moraju biti theme-aware
4. **Validirati sve inpute** - prije slanja na backend
5. **Handleati errors** - prikazati user-friendly poruke
6. **Testirati u oba moda** - light i dark
7. **Responsive design** - mora raditi na mobilnim uređajima

---

## 📞 KONTAKT ZA PITANJA

Ako nešto nije jasno:
1. Provjeriti CreateRedesign.tsx za reference
2. Provjeriti postojeće API endpointe
3. Testirati u development environmentu
4. Dokumentirati sve izmjene

---

**Procijenjeno vrijeme**: 4-5 sati  
**Prioritet**: High  
**Složenost**: Medium-High
