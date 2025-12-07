# 📚 THESARA TUTORIAL: Vodič za apsolutne početnike

Dobrodošao/la na Thesaru! 🎉
Ako želiš objaviti svoju igru ili aplikaciju, a ne znaš odakle krenuti, na pravom si mjestu. Ovaj vodič će te provesti kroz svaki korak, "za dummiese".

---

## 1. 🚀 Prvi korak: Registracija i Prijava

Nemoguće je objaviti išta bez računa.

1.  Otiđi na naslovnicu Thesare.
2.  Klikni **"Prijava"** ili **"Registracija"** (gumb u gornjem desnom kutu).
3.  Prijavi se najlakše putem **Google** računa ili ispuni formu za registraciju.
4.  Kad se prijaviš, spreman/na si za akciju!

---

## 2. ➕ Kreiranje aplikacije

Idemo stvoriti tvoje prvo remek-djelo.

1.  U izborniku potraži gumb **"Stvori"**, **"Objavi"** ili **"Publish"**.
2.  Otvorit će ti se čarobnjak za stvaranje aplikacije.

---

## 3. 📦 Vrsta aplikacije (Code vs. Bundle)

Moraš odabrati jedan od dva načina. Ovo je najvažniji izbor!

### Opcija A: HTML/React Kod 💻
*   *Za koga je?* Za brze ideje ili ako ti je AI (npr. **ChatGPT, Claude, Gemini**) generirao kod.
*   *Kako?* Samo kopiraj kod koji ti je AI dao i zalijepi ga direktno u naš editor. Nema filozofije!

### Opcija B: Bundle (.zip) 📁
*   *Za koga je?* Za veće projekte ili ako si preuzeo cijelu aplikaciju (npr. export iz **Google AI Studija**, **Replita** ili sa svog računala).
*   *Kako?* Ako već imaš .zip datoteku (jer ti ju je alat dao), samo je učitaj.
*   **💡 Savjet:** Ako imaš mapu s datotekama na kompjuteru, samo ih označi sve, klikni desni klik -> "Compress to ZIP" i to je to!

---

## 4. 📝 Osnovne informacije

Reci svijetu što si napravio/la!

*   **Naziv aplikacije:** Neko zvučno ime.
*   **Opis:** O čemu se radi? (npr. "Najbolja pizza igra ikad!").
*   **Dozvole (Permissions):** Većini igara ovo ne treba.
    *   Označi *Kamera* ili *Mikrofon* SAMO ako tvoja igra to stvarno koristi. U suprotnom, ostavi prazno.

---

## 5. 🏠 Thesara Rooms (Sobe s PIN-om)

Ovo je super značajka za privatnost ili multiplayer.

*   **Isključeno (Disabled):** Svatko igra za sebe, standardno.
*   **Opcionalno (Optional):** Igrači mogu (ako žele) upisati PIN da uđu u svoju privatnu "sobu".
*   **Obavezno (Required):** Igrač MORA upisati PIN prije nego igra počne.
    *   *Savjet:* Postoji javna demo soba s PIN-om **1111** za testiranje.

---

## 6. 🎨 Slike i Grafika

Ljudi su vizualna bića. Uljepšaj svoju objavu!

*   **Preview Slika (Ikona):**
    *   Odaberi neku od gotovih boja ili učitaj svoju sliku.
    *   **Pravilo:** Slika ne smije biti veća od **1MB**.
*   **Screenshots (Snimke zaslona):**
    *   Učitaj 1 ili 2 slike iz same igre da ljudi vide gameplay.
    *   Također pazi na veličinu (do 1MB).

---

## 7. 📂 Custom Assets (Vlastiti resursi)

Ako tvoja igra treba posebne slike (npr. pozadinu) koje želiš hostati kod nas:

1.  Učitaj ih u sekciju **"Custom Assets"**.
2.  Kopiraj link koji dobiješ i koristi ga u svom kodu.

**⚠️ Pravila za veličinu:**
*   Većina datoteka mora biti manja od **100KB**.
*   Dozvoljena je **samo jedna** veća datoteka do **500KB** (npr. velika pozadinska slika).
*   Ako pokušaš učitati više velikih slika, sustav će vikati na tebe.

---

## 8. 🚀 Objava (Publish) & Build

Sve spremno?

1.  Klikni **"Objavi" (Publish)**.
2.  Gledaj prozor s napretkom ("Build Log").
3.  Nemoj zatvarati tab dok ne piše **"Success"**!
4.  Ako vidiš crveni tekst (Error), pročitaj što piše – obično ti kaže što si zaboravio/la.

---

## 9. 👮‍♂️ Admin Pregled (Review)

Strpljenje je vrlina.

*   Nakon objave, tvoja aplikacija je u statusu **"Pending Approval" (Čeka odobrenje)**.
*   Administratori će provjeriti aplikaciju (da nije virus ili nešto zločesto).
*   Dok čekaš, samo ti (autor) možeš vidjeti i pokrenuti aplikaciju na svom profilu.
*   Kad te odobre, aplikacija postaje javna i svi je vide!

---

## 💡 Pro Tips (Napredni savjeti)

*   **Spremanje igre (Save Game):** Ako želiš da igra pamti rezultate, koristi `localStorage`. Thesara "shim" sustav će se pobrinuti da ti podaci ostanu sigurni čak i ako korisnik promijeni uređaj.
*   **AI Aplikacije:** Ako koristiš Google Gemini ili sličan AI, nemoj zaboraviti upisati svoj **API Key** u posebno polje prilikom objave. Bez toga AI neće raditi.
*   **Lokalni Preview:** Nakon builda, dobit ćeš link za "Preview". Isprobaj igru tu. Ako tu ne radi, neće raditi ni javno.

---

## ❓ Rješavanje problema (Troubleshooting)

*   **"File too large":** Smanji slike! Koristi alate poput *TinyPNG* da smanjiš veličinu slika bez gubitka kvalitete.
*   **"Unexpected end of file" (ili ZIP greške):** Vjerojatno si krivo zapakirao/la ZIP. Sjeti se: selektiraj datoteke -> desni klik -> Compress to ZIP. Ne mapu!
*   **Igra se ne učitava:** Provjeri konzolu u pregledniku (F12). Možda ti fali neka datoteka u zipu.

Sretno! Vidimo se na Thesari! 🚀
