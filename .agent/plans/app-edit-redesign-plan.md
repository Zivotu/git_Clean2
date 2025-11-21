# Plan: Redizajn stranice za uređivanje aplikacije

## 📋 Pregled trenutnog stanja

### Trenutna stranica za uređivanje (`/app/edit/[slug]`)
**Lokacija:** `apps/web/app/app/edit/page.tsx`

**Trenutne funkcionalnosti:**
- ✅ Uređivanje naslova (title)
- ✅ Uređivanje opisa (description)
- ✅ Uređivanje tagova (kao comma-separated string)
- ✅ Promjena vidljivosti (public/unlisted)
- ✅ Rooms mode (off/optional/required)

**Problemi:**
- ❌ Stari, minimalistički dizajn koji ne prati novi stil aplikacije
- ❌ Nema dark/light mode podrške
- ❌ Tagovi su free-text umjesto predefiniranih opcija (kao u CreateRedesign)
- ❌ Nedostaju mnoge funkcionalnosti koje postoje u CreateRedesign:
  - Preview image/cover art
  - Screenshots galerija
  - Long description (detaljni opis)
  - Preview title (overlay title)
  - Translations (EN, DE, HR)
  - Advanced assets
  - LLM API key
- ❌ Nema live preview kartice
- ❌ Nema progress trackinga
- ❌ Jednostavni HTML elementi bez modernog stiliziranja

### Stranica za kreiranje (`/create`)
**Lokacija:** `apps/web/app/create/CreateRedesign.tsx`

**Dizajn karakteristike:**
- ✅ Moderan dark/light mode dizajn
- ✅ Sticky header s navigacijom između koraka
- ✅ Dva koraka: Source i Basics & Visuals
- ✅ Live preview kartica s progress barom
- ✅ Predefined tag selection (max 2)
- ✅ Cover art presets + custom upload
- ✅ Screenshots galerija (do 2+)
- ✅ Collapsible advanced sekcije (Rooms, Translations)
- ✅ Completion status tracking
- ✅ Emerald accent color scheme
- ✅ Glassmorphism efekti
- ✅ Smooth animations i transitions

---

## 🎯 Ciljevi redizajna

### 1. **Vizualna i stilska usklađenost**
   - Primijeniti isti dizajn jezik kao CreateRedesign
   - Dark/light mode podrška
   - Isti color scheme (emerald accents)
   - Isti tipografski stil i spacing
   - Iste komponente (inputs, buttons, cards)

### 2. **Funkcionalna usklađenost**
   - Integrirati sve funkcionalnosti iz CreateRedesign koje imaju smisla za edit mode
   - Omogućiti uređivanje svih polja koja se postavljaju pri kreiranju

### 3. **Korisničko iskustvo**
   - Live preview kako aplikacija izgleda
   - Progress tracking (koliko je polja popunjeno)
   - Jasna organizacija u sekcije
   - Collapsible advanced opcije
   - Validacija i error handling

---

## 🏗️ Arhitektura i struktura

### Opcija A: Kreirati novu komponentu `EditRedesign.tsx`
**Prednosti:**
- Čist kod, lakše održavanje
- Može koristiti istu strukturu kao CreateRedesign
- Lakše testiranje

**Nedostaci:**
- Duplikacija koda između Create i Edit
- Potrebno održavati dvije komponente

### Opcija B: Refaktorirati u zajedničku komponentu
**Prednosti:**
- DRY princip (Don't Repeat Yourself)
- Jedna komponenta za održavanje
- Konzistentnost garantirana

**Nedostaci:**
- Složenija logika (if/else za create vs edit mode)
- Veći refactoring effort

### 🎯 **PREPORUKA: Opcija A + postupni refactoring**
1. Prvo kreirati `EditRedesign.tsx` baziran na `CreateRedesign.tsx`
2. Kasnije, ako bude potrebno, ekstraktirati zajedničke komponente

---

## 📐 Dizajn struktura za Edit stranicu

### Layout organizacija

```
┌─────────────────────────────────────────────────────────┐
│ STICKY HEADER                                           │
│ [Logo] Edit Application: {title}              [v1.0]   │
└─────────────────────────────────────────────────────────┘

┌──────────────────────────┬──────────────────────────────┐
│ LEFT COLUMN (7/12)       │ RIGHT COLUMN (5/12)          │
│                          │ ┌──────────────────────────┐ │
│ ┌──────────────────────┐ │ │ Completion Status        │ │
│ │ ✏️ Basic Info        │ │ │ Progress bar             │ │
│ │ - Name               │ │ │ Status chips             │ │
│ │ - Short description  │ │ └──────────────────────────┘ │
│ │ - Long description   │ │                              │
│ │ - Tags (buttons)     │ │ ┌──────────────────────────┐ │
│ └──────────────────────┘ │ │ Live Preview Card        │ │
│                          │ │ - Cover image            │ │
│ ┌──────────────────────┐ │ │ - Title                  │ │
│ │ 🎨 Visuals           │ │ │ - Description            │ │
│ │ - Preview title      │ │ │ - Badges                 │ │
│ │ - Cover art style    │ │ └──────────────────────────┘ │
│ │ - Screenshots        │ │                              │
│ └──────────────────────┘ │ ┌──────────────────────────┐ │
│                          │ │ Visibility & Status      │ │
│ ┌──────────────────────┐ │ │ - Public/Unlisted        │ │
│ │ 💾 Rooms (beta)      │ │ └──────────────────────────┘ │
│ │ [Collapsible]        │ │                              │
│ └──────────────────────┘ │ ┌──────────────────────────┐ │
│                          │ │ Action Buttons           │ │
│ ┌──────────────────────┐ │ │ [Save Changes]           │ │
│ │ 🌐 Translations      │ │ │ [Cancel]                 │ │
│ │ [Collapsible]        │ │ └──────────────────────────┘ │
│ └──────────────────────┘ │                              │
│                          │                              │
│ [← Back to My Projects] │                              │
└──────────────────────────┴──────────────────────────────┘
```

---

## 🔧 Tehnička implementacija

### Faza 1: Priprema i struktura
**Zadaci:**
1. Kreirati `apps/web/app/app/edit/EditRedesign.tsx`
2. Kopirati osnovnu strukturu iz `CreateRedesign.tsx`
3. Ukloniti Source step (nije potreban za edit)
4. Prilagoditi props interface za edit mode

**Props interface:**
```typescript
interface EditRedesignProps {
  // Existing data
  slug: string;
  initialData: {
    title: string;
    description: string;
    longDescription?: string;
    tags: string[];
    visibility: 'public' | 'unlisted';
    previewUrl?: string | null;
    overlayTitle?: string;
    screenshots?: Array<{url: string}>;
    roomsMode?: RoomsMode;
    translations?: {
      en?: {title: string; description: string};
      de?: {title: string; description: string};
      hr?: {title: string; description: string};
    };
  };
  
  // Handlers
  onSave: (data: UpdatedAppData) => Promise<void>;
  onCancel: () => void;
  
  // State
  saving: boolean;
  error?: string;
  
  // i18n
  tEdit: (key: string) => string;
}
```

### Faza 2: UI komponente
**Sekcije za implementaciju:**

#### 1. Header
- Sticky header s naslovom "Edit Application: {app.title}"
- Logo i verzija
- Dark mode aware

#### 2. Basic Info sekcija
- Name input (manifestName)
- Short description (manifestDescription)
- Long description textarea (longDescription)
- Tag selection buttons (predefined, max 2)

#### 3. Visuals sekcija
- Preview title input (overlayTitle)
- Cover art style selector (presets + upload)
- Screenshots grid (existing + add new)

#### 4. Advanced sekcije (collapsible)
- **Rooms (beta)**: Storage mode dropdown
- **Translations**: EN, DE, HR inputs

#### 5. Right sidebar
- **Completion Status**: Progress bar + status chips
- **Live Preview**: Card preview kako će izgledati
- **Visibility**: Public/Unlisted toggle
- **Actions**: Save Changes + Cancel buttons

### Faza 3: State management
**State varijable:**
```typescript
const [title, setTitle] = useState(initialData.title);
const [description, setDescription] = useState(initialData.description);
const [longDescription, setLongDescription] = useState(initialData.longDescription || '');
const [selectedTags, setSelectedTags] = useState<string[]>(initialData.tags || []);
const [visibility, setVisibility] = useState(initialData.visibility);
const [overlayTitle, setOverlayTitle] = useState(initialData.overlayTitle || '');
const [previewUrl, setPreviewUrl] = useState(initialData.previewUrl);
const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
const [customPreview, setCustomPreview] = useState<File | null>(null);
const [screenshots, setScreenshots] = useState(initialData.screenshots || []);
const [roomsMode, setRoomsMode] = useState(initialData.roomsMode || 'off');
const [trEn, setTrEn] = useState(initialData.translations?.en || {title: '', description: ''});
const [trDe, setTrDe] = useState(initialData.translations?.de || {title: '', description: ''});
const [trHr, setTrHr] = useState(initialData.translations?.hr || {title: '', description: ''});

// UI state
const [showRooms, setShowRooms] = useState(false);
const [showTrans, setShowTrans] = useState(false);
const [expandedLang, setExpandedLang] = useState<string | null>(null);
```

### Faza 4: Backend integracija
**API endpoints potrebni:**

1. **GET `/listing/:slug`** - Učitavanje postojećih podataka
   - Već postoji ✅
   
2. **PATCH `/listing/:slug`** - Spremanje izmjena
   - Već postoji ✅
   - Potrebno proširiti za nova polja:
     - `longDescription`
     - `overlayTitle`
     - `previewUrl` (ako se mijenja)
     - `screenshots` (array)
     - `translations` (object)

3. **POST `/listing/:slug/preview`** - Upload nove preview slike
   - Možda već postoji, provjeriti
   
4. **POST `/listing/:slug/screenshots`** - Upload screenshota
   - Možda već postoji, provjeriti

**Backend izmjene potrebne:**
- Proširiti `PATCH /listing/:slug` handler da prihvaća nova polja
- Dodati validaciju za nova polja
- Osigurati da se slike pravilno uploadaju i spremaju

### Faza 5: Validacija i error handling
**Validacijska pravila:**
- Title: required, min 3 chars
- Description: required, min 10 chars
- Long description: optional, min 20 chars ako postoji
- Tags: max 2, from predefined list
- Preview title: max 22 chars
- Screenshots: max 2MB each

**Error states:**
- Network errors
- Validation errors
- Upload errors
- Permission errors (ako user nije vlasnik)

---

## 🎨 Stilski detalji

### Color scheme (iz CreateRedesign)
```css
/* Light mode */
--bg-primary: white
--bg-secondary: #f9fafb (gray-50)
--bg-tertiary: #f3f4f6 (gray-100)
--border: #e5e7eb (gray-200)
--text-primary: #111827 (gray-900)
--text-secondary: #6b7280 (gray-500)
--accent: #10b981 (emerald-500)

/* Dark mode */
--bg-primary: #121212
--bg-secondary: #0A0A0A
--bg-tertiary: #161616
--border: rgba(255,255,255,0.1)
--text-primary: white
--text-secondary: #9ca3af (gray-400)
--accent: #10b981 (emerald-500)
```

### Komponente za reuse
- `StatusChip` - za completion status
- `Badge` - za FREE, v1.0 oznake
- Tag selection buttons
- Collapsible sections
- Input fields s focus states
- Preview card

---

## 📝 Dodatne funkcionalnosti

### Razlike između Create i Edit

**NE treba u Edit mode:**
- ❌ Source step (code/bundle upload) - to se ne može mijenjati
- ❌ Advanced assets upload - to je vezano uz bundle
- ❌ LLM API key - to je vezano uz build process

**TREBA dodati u Edit mode:**
- ✅ Visibility toggle (public/unlisted) - prominentnije
- ✅ Delete application button (opcionalno, s potvrdom)
- ✅ View public page link
- ✅ Analytics preview (plays, likes) - read-only

### Nice-to-have features
1. **Auto-save draft** - spremanje u localStorage
2. **Unsaved changes warning** - ako user pokuša napustiti stranicu
3. **Change history** - prikaz kada je zadnji put uređivano
4. **Preview changes** - prije spremanja vidjeti kako će izgledati
5. **Bulk edit** - ako ima više aplikacija (future)

---

## 🚀 Plan implementacije (korak po korak)

### Sprint 1: Osnovna struktura i dizajn
**Trajanje: 2-3 sata**

1. ✅ Kreirati `EditRedesign.tsx` komponentu
2. ✅ Implementirati header
3. ✅ Implementirati grid layout (7/12 + 5/12)
4. ✅ Dodati dark mode support
5. ✅ Implementirati Basic Info sekciju
6. ✅ Implementirati tag selection

### Sprint 2: Visuals i preview
**Trajanje: 2-3 sata**

1. ✅ Implementirati Visuals sekciju
2. ✅ Cover art selector (presets + upload)
3. ✅ Screenshots grid
4. ✅ Live preview card
5. ✅ Completion status tracking

### Sprint 3: Advanced features
**Trajanje: 1-2 sata**

1. ✅ Rooms collapsible sekcija
2. ✅ Translations collapsible sekcija
3. ✅ Visibility toggle
4. ✅ Action buttons (Save, Cancel)

### Sprint 4: Backend integracija
**Trajanje: 2-3 sata**

1. ✅ Učitavanje postojećih podataka
2. ✅ Spremanje izmjena (PATCH)
3. ✅ Upload preview slike
4. ✅ Upload screenshota
5. ✅ Error handling

### Sprint 5: Polish i testiranje
**Trajanje: 1-2 sata**

1. ✅ Validacija svih polja
2. ✅ Loading states
3. ✅ Error messages
4. ✅ Success feedback
5. ✅ Responsive design provjera
6. ✅ Dark/light mode testiranje
7. ✅ Browser testing

---

## 🔄 Integracija s postojećim kodom

### Izmjene u `page.tsx`
```typescript
// apps/web/app/app/edit/page.tsx

import EditRedesign from './EditRedesign';

function EditAppClient() {
  const slug = useRouteParam('slug', ...);
  const { user, loading } = useAuth();
  const [initialData, setInitialData] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Load data
  useEffect(() => {
    // fetch listing data
  }, [slug]);
  
  const handleSave = async (data) => {
    setSaving(true);
    try {
      await apiPatch(`/listing/${slug}`, data, { auth: true });
      router.push('/my');
    } catch (e) {
      // handle error
    } finally {
      setSaving(false);
    }
  };
  
  if (!initialData) return <Loading />;
  
  return (
    <EditRedesign
      slug={slug}
      initialData={initialData}
      onSave={handleSave}
      onCancel={() => router.back()}
      saving={saving}
      tEdit={tCreate} // reuse translations
    />
  );
}
```

### Backend API izmjene

**Proširiti PATCH handler:**
```typescript
// apps/api/src/routes/listing.ts

router.patch('/listing/:slug', async (req, res) => {
  const { slug } = req.params;
  const {
    title,
    description,
    longDescription, // NEW
    tags,
    visibility,
    overlayTitle, // NEW
    previewUrl, // NEW
    screenshots, // NEW
    capabilities,
    translations, // NEW
  } = req.body;
  
  // Validate ownership
  // Update listing
  // Return updated listing
});
```

---

## 📊 Success Metrics

### Funkcionalni kriteriji
- ✅ Sve funkcionalnosti iz CreateRedesign su dostupne u Edit mode
- ✅ Korisnik može urediti sve relevantne podatke
- ✅ Izmjene se pravilno spremaju u bazu
- ✅ Slike se pravilno uploadaju

### Dizajnerski kriteriji
- ✅ Vizualno konzistentan s CreateRedesign
- ✅ Dark/light mode radi besprijekorno
- ✅ Responsive na svim uređajima
- ✅ Smooth animations i transitions

### UX kriteriji
- ✅ Intuitivno za korištenje
- ✅ Jasne error poruke
- ✅ Live preview pomaže korisniku
- ✅ Brzo učitavanje i spremanje

---

## 🎯 Prioriteti

### Must-have (P0)
1. Basic Info editing (title, description, tags)
2. Visuals editing (cover, screenshots)
3. Dark/light mode support
4. Save/Cancel functionality
5. Live preview

### Should-have (P1)
1. Rooms mode editing
2. Translations editing
3. Completion status tracking
4. Visibility toggle

### Nice-to-have (P2)
1. Auto-save drafts
2. Unsaved changes warning
3. Change history
4. Analytics preview

---

## 🔍 Pitanja za razjašnjenje

Prije nego počnemo s implementacijom, trebamo razjasniti:

1. **Backend API**: Postoje li već endpointi za upload preview slika i screenshota u edit mode?
2. **Permissions**: Tko sve može uređivati aplikaciju? Samo vlasnik ili i admini?
3. **Versioning**: Trebamo li čuvati povijest izmjena?
4. **Preview**: Treba li "preview changes" funkcionalnost prije spremanja?
5. **Translations**: Kako se trenutno spremaju prijevodi? U istoj tablici ili odvojeno?

---

## 📅 Timeline procjena

**Ukupno vrijeme: 8-13 sati**

- Sprint 1: 2-3h
- Sprint 2: 2-3h
- Sprint 3: 1-2h
- Sprint 4: 2-3h
- Sprint 5: 1-2h

**Preporuka**: Implementirati u 2-3 radna dana, s testiranjem između sprintova.

---

## ✅ Sljedeći koraci

1. **Pregled i odobrenje plana** - Potvrditi da je plan u redu
2. **Razjasniti pitanja** - Odgovoriti na gore navedena pitanja
3. **Kreirati task listu** - Detaljniji breakdown zadataka
4. **Započeti Sprint 1** - Osnovna struktura i dizajn

---

**Datum kreiranja**: 2025-11-21  
**Autor**: Antigravity AI  
**Status**: Draft - čeka odobrenje
