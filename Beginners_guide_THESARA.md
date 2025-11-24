# Vodič za Početnike - THESARA

Dobrodošli na **Thesaru**! 👋

Ovaj dokument je vaš prijateljski vodič kroz našu platformu. Bilo da ste ovdje da istražujete zabavne mini-aplikacije ili da kreirate vlastite uz pomoć umjetne inteligencije, na pravom ste mjestu.

Thesara je platforma gdje se susreću kreativnost i tehnologija. Ovdje možete pronaći, koristiti i objaviti web aplikacije u samo nekoliko klikova – bez potrebe za serverima ili kompliciranim postavljanjem.

---

## 🎓 Dio 1: Za Korisnike (Istraživače)

Ako ste ovdje da se zabavite i koristite aplikacije, evo što trebate znati.

### 1. Istraživanje Aplikacija 🌍
Na naslovnici i u **Galeriji** možete pronaći razne aplikacije koje su kreirali drugi korisnici.
- **Pretraživanje:** Koristite tražilicu ili kategorije da nađete ono što vas zanima.
- **Pokretanje:** Kliknite na karticu aplikacije da biste je otvorili. Aplikacije se učitavaju trenutno u vašem pregledniku.

### 2. Korištenje "Soba" (Rooms) 🏠
Mnoge aplikacije na Thesari podržavaju **Sobe**. To je naša posebna značajka koja omogućuje da dijelite iskustvo s drugima ili spremate svoje podatke.
- **Demo Soba:** Ovo je javna soba. Svi koji su u njoj vide isto stanje. Dobro za isprobavanje.
- **Privatne Sobe:** Možete kreirati vlastitu sobu (npr. "MojaSoba123"). Podaci u toj sobi su vidljivi samo onima koji znaju ime sobe.
    - *Primjer:* Ako koristite aplikaciju za "To-Do listu", možete napraviti sobu "Obitelj" i svi članovi obitelji mogu dodavati zadatke u tu istu listu sa svojih uređaja!

### 3. Vaš Profil i Postavke 👤
U gornjem desnom kutu možete pristupiti svom profilu.
- **Javno Ime:** U postavkama profila možete odabrati kako će se vaše ime prikazivati drugim korisnicima. Možete koristiti svoje pravo ime ili pseudonim (display name), ili pak ostaviti da se vidi vaše korisničko ime (handle).
- **Jezik:** Podesite jezik sučelja (Hrvatski, Engleski, Njemački).
- **Povijest:** Pregledajte aplikacije koje ste lajkali ili spremili.

### 4. Gold Paket 🌟
Thesara nudi **Gold članstvo** za one koji žele više.
- **Bez Reklama:** Uživajte u čistom iskustvu bez ometanja.
- **Podrška:** Prioritetna podrška za sve vaše upite.
- **Rani Pristup:** Isprobajte nove značajke prije svih ostalih.
*Napomena: Tijekom promotivnih razdoblja, Gold značajke mogu biti besplatne za sve korisnike!*

---

## 🚀 Dio 2: Za Kreatore (Sveobuhvatni Vodič)

Želite li postati kreator? Ne morate biti programer! Thesara je dizajnirana da radi savršeno s AI alatima kao što su ChatGPT, Claude ili Google Gemini.

Imate dva načina za objavu aplikacije: **Jednostavni (Kopiraj/Zalijepi)** i **Napredni (Bundle/ZIP)**.

### Metoda A: Jednostavni Način (Kopiraj/Zalijepi) 📋
Ovo je idealno za jednostavne aplikacije koje stanu u jednu datoteku (npr. kalkulatori, jednostavne igre, kvizovi).

1. **Zatražite od AI-a:** "Napravi mi jednostavnu HTML aplikaciju koja je [vaša ideja]. Sve stavi u jednu datoteku (HTML+CSS+JS)."
2. **Kopirajte kod:** AI će vam ispisati blok koda. Kopirajte ga.
3. **Objavite:** Na Thesari kliknite "Objavi App", odaberite opciju **"Paste Code"** (`</>`) i zalijepite kod.

### Metoda B: Napredni Način (Bundle/ZIP) 📦
Ovo je za moćnije aplikacije koje imaju više datoteka, koriste vanjske biblioteke (npm pakete) ili imaju složeniju strukturu.

1. **Zatražite od AI-a:** "Napravi mi složenu aplikaciju za [vaša ideja]. Želim da mi daš strukturu projekta ili ZIP datoteku. Koristi `package.json` za instalaciju potrebnih biblioteka."
2. **Preuzmite ZIP:** Većina modernih AI alata (poput GPT-4 s Code Interpreterom ili Google Gemini Advanced) može generirati ZIP datoteku za preuzimanje.
3. **Objavite:** Na Thesari kliknite "Objavi App", odaberite opciju **"Upload Bundle"** (📦) i učitajte taj ZIP.
    - *Što se događa u pozadini?* Naš sustav će automatski prepoznati `package.json`, instalirati sve potrebne biblioteke i izgraditi vašu aplikaciju.

### Dodavanje Grafike i Zvukova (Custom Assets) 🎨
Bez obzira koju metodu koristite, možda želite dodati svoje slike ili zvukove.

1. **Planiranje:** Recite AI-u točno kako da nazove datoteke u kodu (npr. `logo.png`, `zvuk.mp3`).
    - *Važno:* Uvijek tražite od AI-a da napravi "fallback" (rezervnu opciju) ako slika nedostaje, kako se aplikacija ne bi srušila.
2. **Upload:** U procesu objave, otvorite sekciju **"Advanced Assets"** (⚙️).
3. **Povezivanje:** Uploadajte svoje datoteke ovdje. Naš sustav će ih automatski servirati vašoj aplikaciji pod imenima koja ste odredili.

### Monetizacija - Odredite Cijenu 💰
Vi ste vlasnik svog rada. Prilikom objave ili uređivanja, možete postaviti cijenu za pristup vašoj aplikaciji.
- Možete je ponuditi besplatno ili naplatiti jednokratni iznos.
- Zarada se dijeli između vas i platforme, a isplate se vrše putem našeg partnerskog sustava.

### Sigurnost i API Ključevi 🔑
Ako vaša aplikacija koristi vanjske servise (npr. OpenAI, Weather API), budite oprezni.

**⚠️ NIKADA ne upisujte svoje privatne API ključeve direktno u kod!**
Ako to učinite, svatko tko koristi aplikaciju može vidjeti vaš ključ i potrošiti vaš novac.

**Pravilan način:**
1. Recite AI-u: "Napravi ekran za postavke gdje korisnik može unijeti **SVOJ** API ključ."
2. Aplikacija treba spremiti taj ključ u preglednik korisnika (`localStorage`).
3. Tako je svaki korisnik odgovoran za svoj ključ, a vi ste sigurni.

### Omogućavanje "Soba" (Rooms) 🏠
Želite li da vaša aplikacija bude multiplayer ili da pamti podatke?
- U procesu objave, pod sekcijom **"Rooms"** (💾), odaberite način rada:
    - **Optional:** Korisnik može birati želi li koristiti sobu.
    - **Required:** Aplikacija zahtijeva sobu da bi radila (npr. multiplayer igra).
- Ovo omogućuje našem "Backend-as-a-Service" sustavu da automatski sinkronizira stanje između korisnika.

---

## 🤝 Dio 3: Zajednica i Ambasadori

### Ambasador Program 📢
Volite Thesaru? Postanite naš Ambasador!
- **Što radite?** Dijelite novosti o Thesari, promovirate zanimljive aplikacije na društvenim mrežama i dovodite nove korisnike.
- **Što dobivate?**
    - Zaradu od korisnika koji se registriraju preko vas.
    - Ekskluzivne promo kodove za vašu publiku.
    - Direktan kontakt s timom i utjecaj na razvoj platforme.
- Prijavite se putem linka u podnožju stranice ili na svom profilu.

### Zlatna Knjiga 📖
Ovo je mjesto gdje odajemo počast našim najvećim podupirateljima. Donacijom ulazite u povijest Thesare i pomažete nam da platforma ostane brza, stabilna i puna novih značajki.

---

## 💡 Savjeti za Uspjeh

1. **Budite Kreativni:** Ne bojte se eksperimentirati. Tražite od AI-a lude ideje!
2. **Dizajn je Bitan:** Korisnici vole lijepe aplikacije. U promptu uvijek naglasite da želite "moderan dizajn", "lijepe boje" ili "responsive layout".
3. **Testirajte:** Prije nego što podijelite link, isprobajte aplikaciju u "Demo Sobi" da vidite radi li sve kako treba.

---

*Sretno stvaranje i istraživanje!*
*Vaš Thesara Tim*
