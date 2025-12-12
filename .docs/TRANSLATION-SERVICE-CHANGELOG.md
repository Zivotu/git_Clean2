# Translation Service Changelog

## Promjena: Naslov se NE prevodi (2025-12-12)

### **Što je promijenjeno:**

Automatski prijevodi naslova aplikacija **ISKLJUČENI**.

#### **PRIJE:**
```json
{
  "translations": {
    "hr": {
      "title": "Aplikacija za Budžet",      // ❌ Prevođen
      "description": "Pratite troškove..."  // ✅ Prevođen
    }
  }
}
```

#### **SADA:**
```json
{
  "title": "Budget Tracker Pro",  // ✅ ORIGINALNI naslov (za SVE jezike)
  "translations": {
    "hr": {
      // title više ne postoji u translations!
      "description": "Pratite troškove...",           // ✅ Prevođen
      "longDescription": "Sveobuhvatni alat..."       // ✅ Prevođen
    },
    "en": {
      "description": "Track your expenses...",
      "longDescription": "A comprehensive tool..."
    },
    "de": {
      "description": "Verfolgen Sie Ihre Ausgaben...",
      "longDescription": "Ein umfassendes Tool..."
    }
  }
}
```

### **Razlog:**

- Naslovi aplikacija su brand/identitet i **trebaju ostati konzistentni** 
- Prijevod naslova može zbuniti korisnike
- Dobar naslov često sadržava brand imena ili kreativne nazive koji se ne prevode

### **Što se prevodi:**

| Polje | Prevod? | Primjer |
|-------|---------|---------|
| `title` | ❌ NE | "Budget Tracker Pro" ostaje isto svugdje |
| `description` | ✅ DA | "Track expenses" → "Pratite troškove" |
| `longDescription` | ✅ DA | Cijeli detaljan opis se prevodi |

### **OpenAI Prompt:**

Novi prompt eksplicitno kaže:
```
DO NOT translate the title - return it unchanged in all languages.
Title (DO NOT TRANSLATE): Budget Tracker Pro
Short Description: Track your expenses easily
Long Description: A comprehensive budgeting tool...
```

### **Gdje se to primjenjuje:**

1. **Automatski** kod approve aplikacije (`apps/api/src/routes/review.ts:770`)
2. **API**: `POST /review/builds/:id/approve`
3. **Troškovi**: ~$0.001 po prijevodu (3 jezika: HR/EN/DE)

### **Testiranje:**

Sljedeći approved app će automatski:
- ✅ Zadržati originalni `title` 
- ✅ Prevesti `description` na HR/EN/DE
- ✅ Prevesti `longDescription` (ako postoji)

### **Kontrola:**

Isključi sve prijevode:
```bash
LISTING_TRANSLATIONS_ENABLED=false
```

Ili:
```bash
LLM_TRANSLATIONS_ENABLED=false
```

---

## Files Changed:

- ✅ `apps/api/src/lib/translate.ts` - Logika prijevoda
- ✅ `apps/api/src/types.ts` - TypeScript type definitions
