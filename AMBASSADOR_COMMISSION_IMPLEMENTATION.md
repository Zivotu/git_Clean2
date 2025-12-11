# 🎯 AMBASSADOR DUAL COMMISSION MODEL - IMPLEMENTATION COMPLETE

**Implementirano:** 10.12.2025 20:05  
**Status:** ✅ Backend & Frontend Ready | ⚠️ Commission Tracking Pending

---

## ✅ 1. IMPLEMENTIRANO

### **Backend (`apps/api`)**

#### **Type Definitions (`src/types.ts`)**
- ✅ Dodano `CommissionModel = 'turbo' | 'partner'`
- ✅ `AmbassadorInfo.commissionModel?: CommissionModel`
- ✅ `PromoCode.benefit` sada podržava:
  - Legacy: `{ type: 'free_gold_trial', durationDays: number }`
  - New: `{ type: 'discount', discount1stMonth: 0.40, discount2ndMonth: 0.50 }`

#### **API Routes (`src/routes/ambassador.ts`)**
- ✅ `POST /api/ambassador/apply` - Accept `commissionModel` (default: 'turbo')
- ✅ `POST /api/admin/ambassadors/approve` - Promo code uses discount benefit
- ✅ `POST /promo-codes/redeem` - Handles both trial and discount models
- ✅ All ambassador routes fixed with `/api` prefix (404 error resolved)

### **Frontend (`apps/web`)**

#### **Application Modal (`components/AmbassadorApplicationModal.tsx`)**
- ✅ UI za odabir modela (Turbo vs Partner)
- ✅ Visual feedback (checkmark, colors)
- ✅ Form submission includes `commissionModel`

#### **Type Definitions (`lib/ambassador.ts`)**
- ✅ `AmbassadorApplicationPayload.commissionModel?: 'turbo' | 'partner'`

#### **Landing Page (`app/ambassador/page.tsx`)**
- ✅ Sekcija "Choose Your Earning Model"
- ✅ Dvije kartice (Turbo + Partner)
- ✅ Ažurirani tekstovi (70% commission, itd.)

#### **Prijevodi (`messages/*.json`)**
- ✅ `hr.json`, `en.json`, `de.json` - `models` sekcija dodana

---

## ⚠️ 2. NEDOSTAJE: COMMISSION TRACKING LOGIC

**Što treba implementirati:**

### **KORAK 1: Billing Event Listener**
Kada korisnik plati (npr. Stripe webhook ili Firebase Billing webhook):

```typescript
// Pseudo-kod za webhook handler
async function onPaymentSuccess(event: PaymentEvent) {
  const { userId, amount, billingPeriod } = event;
  
  // 1. Provjera: Je li korisnik došao preko Ambasadora?
  const user = await db.collection('users').doc(userId).get();
  const referredBy = user.data()?.referredBy;
  
  if (!referredBy) return; // Nije referral
  
  // 2. Dohvati Ambassador podatke
  const ambassadorUid = referredBy.ambassadorUid;
  const ambassador = await db.collection('users').doc(ambassadorUid).get();
  const ambassadorInfo = ambassador.data()?.ambassador;
  
  if (!ambassadorInfo || ambassadorInfo.status !== 'approved') return;
  
  // 3. Izračunaj proviziju prema modelu
  const commissionModel = ambassadorInfo.commissionModel || 'turbo';
  const commission = calculateCommission(commissionModel, amount, billingPeriod, referredBy);
  
  if (commission > 0) {
    // 4. Dodaj u Ambassador earnings
    await db.collection('users').doc(ambassadorUid).update({
      'ambassador.earnings.currentBalance': FieldValue.increment(commission),
      'ambassador.earnings.totalEarned': FieldValue.increment(commission),
    });
    
    // 5. Audit log
    await logBillingEvent({
      eventType: 'ambassador.commission.earned',
      ambassadorUid,
      userId,
      amount: commission,
      ts: Date.now(),
      details: { model: commissionModel, billingPeriod },
    });
  }
}
```

### **KORAK 2: Commission Calculator**

```typescript
function calculateCommission(
  model: 'turbo' | 'partner',
  amount: number, // Plaćeni iznos (6€, 5€, 10€...)
  billingPeriod: number, // Koji mjesec (1, 2, 3...)
  referredBy: ReferredByInfo
): number {
  const FULL_PRICE = 10; // Gold plan full price
  const redemptionAge = Date.now() - referredBy.redeemedAt;
  const monthsSinceRedemption = Math.floor(redemptionAge / (30 * 24 * 60 * 60 * 1000));
  
  if (model === 'turbo') {
    // TURBO: 55% (M1) + 15% (M2) + 0% (M3+)
    if (monthsSinceRedemption === 0) {
      return FULL_PRICE * 0.55; // 5.50€
    } else if (monthsSinceRedemption === 1) {
      return FULL_PRICE * 0.15; // 1.50€
    }
    return 0;
  } else if (model === 'partner') {
    // PARTNER: 10% trajno na SVE
    return amount * 0.10;
  }
  
  return 0;
}
```

### **KORAK 3: App Sales Tracking (Partner Model Only)**

Ako korisnik **proda** svoju aplikaciju na marketplaceu (6-mjesečna licenca):

```typescript
async function onAppSale(event: AppSaleEvent) {
  const { sellerUid, buyerUid, amount } = event;
  
  // 1. Provjeri: Je li prodavatelj (seller) došao preko Ambasadora?
  const seller = await db.collection('users').doc(sellerUid).get();
  const referredBy = seller.data()?.referredBy;
  
  if (!referredBy) return;
  
  // 2. Dohvati Ambasadora
  const ambassadorUid = referredBy.ambassadorUid;
  const ambassador = await db.collection('users').doc(ambassadorUid).get();
  const ambassadorInfo = ambassador.data()?.ambassador;
  
  // 3. SAMO PARTNER model dobiva proviziju od prodaje
  if (ambassadorInfo?.commissionModel === 'partner') {
    const commission = amount * 0.10; // 10%
    
    await db.collection('users').doc(ambassadorUid).update({
      'ambassador.earnings.currentBalance': FieldValue.increment(commission),
      'ambassador.earnings.totalEarned': FieldValue.increment(commission),
    });
    
    // Log
    await logBillingEvent({
      eventType: 'ambassador.commission.app_sale',
      ambassadorUid,
      sellerId: sellerUid,
      buyerId: buyerUid,
      amount: commission,
      ts: Date.now(),
    });
  }
}
```

---

## 📋 3. GDJE DODATI BILLING LOGIC?

**Opcija 1:** Stripe/PayPal Webhook Handler  
Ako koristiš Stripe, dodaj u:
```
apps/api/src/routes/billing.ts
```

**Opcija 2:** Firebase Function Trigger  
Ako koristiš Firestore, kreiraj Cloud Function koji se triggera na:
```
.onCreate('/billingEvents/{eventId}')
```

---

## 🧪 4. TESTIRANJE

1. ✅ Prijava Ambasadora (odabir modela)
2. ✅ Approval (promo kod s discount benefitom)
3. ✅ Promo redeem (discount apliciran)
4. ⚠️ Payment webhook (TODO: Commission calculation)
5. ⚠️ App sale webhook (TODO: Partner model commission)

---

## 📝 5. SLJEDEĆI KORACI

1. **Implementiraj billing webhook handler** (kao gore)
2. **Testiraj s test Stripe podacima**
3. **Admin panel za review commissions** (optional)
4. **Migrate postojeće ambassadore** (postavi default `commissionModel: 'turbo'`)

---

**Implementirao:** AI Agent (Antigravity)  
**Za pitanja:** Pregledaj `apps/api/src/routes/ambassador.ts`
