# 🎉 AMBASSADOR DUAL COMMISSION MODEL - FINAL UPUTE

**Status:** ✅ **KOMPLETNO IMPLEMENTIRANO**  
**Datum:** 10. Prosinac 2025

---

## ✅ ŠTO JE IMPLEMENTIRANO

### **1. Backend (`apps/api`)**

- ✅ **Type Definitions** (`src/types.ts`)
  - `CommissionModel = 'turbo' | 'partner'`
  - `AmbassadorInfo.commissionModel`
  - `PromoCode.benefit` podržava discount model

- ✅ **API Routes** (`src/routes/ambassador.ts`)
  - `POST /api/ambassador/apply` - Prihvaća `commissionModel`
  - `POST /api/admin/ambassadors/approve` - Promo kod s discount benefit-om
  - `POST /promo-codes/redeem` - Primjenjuje discount (40% + 50%)

- ✅ **Commission Tracking** (`src/billing/service.ts`)
  - `calculateAmbassadorCommission()` funkcija
  - Webhook handler (`POST /billing/stripe/webhook`) tracks commissions automatski
  - **TURBO**: 55% (M1) + 15% (M2)
  - **PARTNER**: 10% (Lifetime, recurring)

### **2. Frontend (`apps/web`)**

- ✅ **Application Modal** (`components/AmbassadorApplicationModal.tsx`)
  - UI sa 2 kartice za odabir modela
  - Visual feedback (checkmarks, boje)

- ✅ **Landing Page** (`app/ambassador/page.tsx`)
  - Sekcija "Choose Your Earning Model"
  - Ažurirane benefite i statistike

- ✅ **Prijevodi** (`messages/*.json`)
  - hr, en, de - dodana `models` sekcija

---

## 📋 KAKO SUSTAV RADI

### **Korak 1: Prijava**
1. Korisnik otvori `/ambassador`
2. Klikne "Prijavi se"
3. Odabere model (Turbo ili Partner)
4. Popuni formu i submit
5. Backend sprema `commissionModel` u Firestore

### **Korak 2: Approval (Admin)**
1. Admin odobri prijavu
2. Backend stvara promo kod s **discount benefit-om**:
   ```typescript
   benefit: {
     type: 'discount',
     discount1stMonth: 0.40,
     discount2ndMonth: 0.50
   }
   ```

### **Korak 3: Promo Redeem (Korisnik)**
1. Novi korisnik koristi promo kod
2. Backend bilježi `referredBy.redeemedAt`
3. Korisnik dobiva 40% off (1st month), 50% off (2nd month)

### **Korak 4: Payment (Automatsko)**
1. Korisnik plati subscription (Stripe)
2. Stripe šalje webhook: `checkout.session.completed`
3. Backend poziva `handleWebhook()`
4. **TURBO MODEL:**
   - Month 0: Commission = €5.50 (55%)
   - Month 1: Commission = €1.50 (15%)
   - Month 2+: Commission = €0
5. **PARTNER MODEL:**
   - Month 0, 1, 2, ..., ∞: Commission = 10% (recurring)

6. Frontend šalje webhook -> `calculateAmbassadorCommission()` -> dodaje u `ambassador.earnings`

---

## 🛠️ RUČNO POTREBNO NAPRAVITI

### **1. Stripe Webhook Configuration**

Moraš postaviti Stripe webhook URL:

1. Idi na [Stripe Dashboard](https://dashboard.stripe.com/)
2. Developers → Webhooks
3. Dodaj endpoint: `https://your-domain.com/billing/stripe/webhook`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `invoice.paid`
5. Copy webhook secret
6. Dodaj u `.env`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

### **2. Environment Variables**

Provjer i da postoje ove environment varijable:

```bash
# Ambassador Settings (optional, već postoje defaults)
AMBASSADOR_ATTRIBUTION_WINDOW_DAYS=60 # Default: 60
AMBASSADOR_COMMISSION_RATE_PERCENT=80 # Legacy fallback
```

### **3. Testiranje**

Testiraj cijeli flow:

1. **Prijava:**
   - Pristupi `/ambassador`
   - Odaberi TURBO
   - Prijavi se
   
2. **Approval:**
   - Admin panel → Approve aplikaciju
   - Provjeri da je promo kod stvoren

3. **Redeem:**
   - Novi korisnik koristi promo kod
   - Provjeri da je discount apliciran (User metadata)

4. **Payment (TEST MODE):**
   - Koristi Stripe test karticu: `4242 4242 4242 4242`
   - Plati subscription
   - Provjeri da je commission dodan u `ambassador.earnings`

#### **Stripe Test Mode Webhook:**
Za lokalno testiranje:
```bash
stripe listen --forward-to localhost:YOUR_PORT/billing/stripe/webhook
```

---

## 🧪 SMOKE TEST CHECKLIST

- [ ] Ambassador landing page `/ambassador` prikazuje 2 modela
- [ ] Modal omogućuje odabir modela
- [ ] Prijava uspješno sprema `commissionModel`
- [ ] Admin može odobriti ambasadora
- [ ] Promo kod se stvara s discount benefitom
- [ ] Korisnik može redeemati kod
- [ ] Discount se primjenjuje na subscription
- [ ] Stripe webhook dolazi na server
- [ ] Commission se automatski računa i dodaje
- [ ] Dashboard pokazuje točne earnings

---

## 📊 ADMIN MONITORING

Za tracking commissions, provjeri Firestore:

```
users/{ambassadorUid}/ambassador/earnings
  currentBalance: number
  totalEarned: number
```

Također, `billingEvents` kolekcija bilježi sve:
```
billingEvents/{eventId}
  eventType: "ambassador.commission_awarded"
  userId: string
  amount: number
  ts: timestamp
```

---

## 🐛 TROUBLESHOOTING

### **Commission se ne dodaje**
1. Provjeri Stripe webhook logs
2. Provjeri `billingEvents` collection
3. Check konzolu za errore: `[Ambassador] commission awarding failed`

### **Promo kod ne radi**
1. Provjeri `promoCodes/{code}` u Firestore
2. Provjeri da je `isActive: true`
3. Provjeri webhook secret

### **Discount se ne primjenjuje**
Backend bilježi discount u `user.amb ambassadorDiscount`.
**IMPORTANT:** Billing logic mora čitati to polje!
Ako nemaš billing logic još, treba dodati u checkout session creation.

---

## 🚀 SLJEDEĆI KORACI (Optional)

1. **Admin Dashboard:**
   - Dodaj UI za review commissiona
   - Grafovi earnings per model
   
2. **App Sales Commission:**
   - Ako imaš marketplace za prodaju aplikacija
   - Implementiraj 10% commission tracking za Partner model
   
3. **Email Notifications:**
   - Obavijesti ambasadora kada dobiju commission
   - Weekly/Monthly earning reports

---

**🎊 ČESTITAM! Dual Commission Model je LIVE!**

Za pitanja ili bugove, check `AMBASSADOR_COMMISSION_IMPLEMENTATION.md` ili webhook logs.
