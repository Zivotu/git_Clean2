# Microsoft Clarity - Dijagnostika i Provjera

## 📋 Clarity Implementacija - Status

### ✅ Clarity je pravilno implementiran

**Clarity ID:** `u61xrk1m1g`

**Lokacija:** `apps/web/app/layout.tsx` (linija 110-116)

```tsx
<Script id="microsoft-clarity" strategy="afterInteractive">
  {`(function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window, document, "clarity", "script", "u61xrk1m1g");`}
</Script>
```

### ✅ CSP (Content Security Policy) Konfiguracija

**Lokacija:** `apps/api/src/lib/cspBuilder.ts` (linija 166-170)

Microsoft Clarity je pravilno dodan u:
- `scriptSrc` - dopušta učitavanje Clarity skripte
- `connectSrc` - dopušta slanje podataka na Clarity servere
- `imgSrc` - dopušta učitavanje Clarity resursa

### ✅ Custom Eventi

Clarity custom eventi su implementirani na:
- **Play stranica** (`PlayPageClient.tsx`) - prati `app_id` i `app_name`
- **Tutorial stranica** (`tutorial/page.tsx`) - prati `view_tutorial` event
- **User Profile** (`UserProfileClient.tsx`) - prati profile views
- **Team Creation** (`StvaranjeTimaClient.tsx`) - prati team creation

---

## 🔍 KAKO PROVJERITI DA LI CLARITY RADI

### 1. Browser Console Provjera

Otvori bilo koju stranicu na **thesara.space**, otvori Developer Tools (F12), i u Console unesi:

```javascript
// Provjeri da li je Clarity učitan
if (window.clarity) {
  console.log("✅ Clarity is loaded!");
  clarity("event", "test_event");
  console.log("✅ Test event sent!");
} else {
  console.log("❌ Clarity is NOT loaded!");
}
```

### 2. Network Tab Provjera

1. Otvori Developer Tools (F12)
2. Idi na **Network** tab
3. Filter po "clarity"
4. Učitaj stranicu
5. Trebaš vidjeti:
   - Request na `https://www.clarity.ms/tag/u61xrk1m1g`
   - Request(e) na `https://www.clarity.ms/collect`

Ako **NE vidiš** ove requestove:
- ✅ Imaš AdBlocker (isključi ga)
- ✅ Browser blokira tracking (npr. Brave, Firefox Strict mode)
- ✅ Network error ili firewall

### 3. Clarity Dashboard Provjera

1. Idi na: **https://clarity.microsoft.com/**
2. Prijavi se sa svojim Microsoft računom
3. Odaberi projekt: **thesara.space** (ili kako god se zove)
4. Provjeri:
   - **Dashboard** - da li vidiš broj sesija danas
   - **Recordings** - da li ima novih snimaka
   - **Heatmaps** - da li se generiraju

---

## 🚨 MOGUĆI UZROCI PROBLEMA

### Problem #1: Ad Blockers 🛑

**Najvjerojatniji uzrok!** Microsoft Clarity je tracking tool i ad blockeri ga blokiraju.

**Testiranje:**
- Otvori stranicu u **Incognito/Private mode** BEZ ekstenzija
- Koristi drugi browser bez ad blockera
- Privremeno isključi uBlock Origin, AdBlock Plus, Brave Shields, itd.

### Problem #2: Browser Privacy Settings 🔒

**Firefox:** Strict Tracking Protection blokira Clarity
- Postavke → Privacy & Security → Enhanced Tracking Protection → odaberi "Standard"

**Brave:** Shields blokira Clarity
- Klikni na Brave logo u address baru → Shields: Down

**Safari:** Prevent Cross-Site Tracking
- Preferences → Privacy → ukloni označeno "Prevent cross-site tracking"

### Problem #3: Network/Firewall/VPN 🌐

- Provjeri da li kompanijska mrežareže blokira clarity.ms
- Provjeri da li VPN blokira tracking
- Provjeri firewall postavke

### Problem #4: Clarity Account Konfiguracija ⚙️

1. Idi na **https://clarity.microsoft.com/projects**
2. Provjeri da li projekt sa `u61xrk1m1g` postoji
3. Provjeri:
   - Da li je projekt **aktivan**
   - Da li je domena **thesara.space** dodana
   - Da li ima data retention limita

---

## 🔧 DEBUGGING KORACI

### Korak 1: Provjera u Production

Otvori **https://www.thesara.space/** u browseru:

```javascript
// U browser console
console.log("Clarity loaded:", typeof window.clarity !== "undefined");
console.log("Clarity function:", window.clarity);
```

### Korak 2: Ručno aktiviraj Clarity

```javascript
// Ako Clarity nije učitan, možda se učitava asinkrono
setTimeout(() => {
  if (window.clarity) {
    console.log("✅ Clarity loaded after delay");
    clarity("event", "manual_test");
  } else {
    console.log("❌ Still not loaded - check blockers!");
  }
}, 3000);
```

### Korak 3: Provjera Clarity Script Tag-a

```javascript
// Provjeri da li je script tag dodan u DOM
const clarityScript = document.querySelector('Script[src*="clarity.ms"]');
console.log("Clarity script in DOM:", clarityScript);
```

### Korak 4: Provjera Console Errors

Otvori Console i provjeri da li ima grešaka:
- `ERR_BLOCKED_BY_CLIENT` - Ad blocker blokira
- `Failed to load resource` - Network problem
- `CSP violation` - Content Security Policy blokira (ali ne bi trebao)

---

## ✅ RJEŠENJE: Ako je problem Ad Blocker

### Opcija 1: Server-Side Tracking Proxy (Preporučeno)

Umjesto da browser direktno zove `clarity.ms`, možeš napraviti proxy kroz svoj server:

1. Dodati proxy endpoint u API: `/api/clarity-proxy`
2. Modificirati Clarity script da šalje na tvoj endpoint
3. Tvoj server proslije podatke na `clarity.ms`

**Prednosti:**
- ✅ Bypass-a ad blockere
- ✅ Poštuje privacy (još uvijek je first-party)
- ✅ Pouzdaniji tracking

### Opcija 2: Custom Domain za Clarity

Microsoft Clarity podržava custom subdomene:
1. Setup DNS: `clarity.thesara.space` → CNAME → `clarity.ms`
2. Update Clarity konfig da koristi custom domenu
3. Ad blockeri manje vjerojatno blokiraju

### Opcija 3: Edukacija korisnika

Dodati obavijest:
> "Za najbolje iskustvo, molimo privremeno isključite ad blocker na thesara.space"

---

## 📊 PROVJERA IMPLEMENTACIJE

### Testiranje u različitim browserima:

- [ ] **Chrome** (bez ekstenzija)
- [ ] **Firefox** (Standard tracking protection)
- [ ] **Safari**
- [ ] **Edge**
- [ ] **Brave** (Shields down)
- [ ] **Mobile Chrome**
- [ ] **Mobile Safari**

### Testne stranice:

- [ ] Homepage (`/`)
- [ ] Play stranica (`/play/[appId]`)
- [ ] Tutorial (`/tutorial`)
- [ ] User Profile (`/u/[username]`)
- [ ] My Apps (`/my`)

---

## 🎯 SLJEDEĆI KORACI

1. **Odmah:** Otvori https://www.thesara.space u INKOGNITU (bez ekstenzija) i provjeri browser console
2. **Provjera Clarity Dashboard:** Idi na https://clarity.microsoft.com i vidi da li ima podataka
3. **Test sa različitim browserima:** Chrome, Firefox, Safari - bez ad blockera
4. **Network Analysis:** Provjeri da li se šalju podaci na clarity.ms u Network tabu

---

## 📞 Clarity Support

Ako nakon svih provjera još uvijek nemaš podatke:

**Microsoft Clarity Support:**
- Email: clarity@microsoft.com
- Forum: https://github.com/microsoft/clarity/discussions
- Twitter: @MSFTClarity

**Mogući problemi na Clarity strani:**
- Account nije aktiviran
- Projekt je u "pending" statusu
- Domena nije verificirana
- Data collection je pauziran/disabled

---

## 🔎 QUICK DIAGNOSTIC SCRIPT

Kopiraj i zalijepi u browser console na **thesara.space**:

```javascript
(function() {
  console.log("=== CLARITY DIAGNOSTIC ===");
  
  // 1. Provjeri da li je Clarity globalno dostupan
  if (typeof window.clarity === "undefined") {
    console.error("❌ window.clarity is NOT defined");
  } else {
    console.log("✅ window.clarity is defined");
  }
  
  // 2. Provjeri da li je Clarity script učitan u DOM
  const scripts = document.querySelectorAll('script[src*="clarity"]');
  if (scripts.length === 0) {
    console.error("❌ No Clarity script found in DOM");
  } else {
    console.log(`✅ Found ${scripts.length} Clarity script(s)`);
    scripts.forEach((s, i) => console.log(`  Script ${i+1}:`, s.src));
  }
  
  // 3. Provjeri Network requests
  console.log("⏳ Check Network tab for requests to clarity.ms");
  
  // 4. Test Clarity event
  if (typeof window.clarity !== "undefined") {
    try {
      window.clarity("event", "diagnostic_test");
      console.log("✅ Test event sent successfully");
    } catch(e) {
      console.error("❌ Error sending test event:", e);
    }
  }
  
  // 5. Provjeri Ad Blockers
  const img = new Image();
  img.src = "https://www.clarity.ms/favicon.ico";
  img.onload = () => console.log("✅ Can reach clarity.ms (no blocker)");
  img.onerror = () => console.error("❌ Cannot reach clarity.ms (blocker or network issue)");
  
  console.log("=== END DIAGNOSTIC ===");
})();
```

---

**ZAKLJUČAK:**

Clarity je **pravilno implementiran** na tehničkom nivou. Ako vidiš nule u statistikama, najvjerojatniji razlog je:
1. **Ad blocker** (90% slučajeva)
2. Browser privacy postavke
3. Problem u Clarity account konfiguraciji

Slijedi gore navedene dijagnostičke korake za identifikaciju točnog uzroka!
