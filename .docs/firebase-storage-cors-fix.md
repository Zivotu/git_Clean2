# Firebase Storage CORS Konfiguracija

## Problem
Profile picture upload ne radi zbog CORS greške:
```
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/v0/b/createx-e0ccc.appspot.com/o?name=public-avatars%2F...' 
from origin 'https://thesara.space' has been blocked by CORS policy
```

## Rješenje

### Opcija 1: Konfigurirati Firebase Storage CORS (Preporučeno)

1. **Kreirati `cors.json` fajl:**

```json
[
  {
    "origin": [
      "https://thesara.space",
      "https://www.thesara.space",
      "http://localhost:3000",
      "http://127.0.0.1:3000"
    ],
    "method": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Authorization", "X-Goog-Upload-Protocol", "X-Goog-Upload-Command"]
  }
]
```

2. **Primijeniti CORS konfiguraciju:**

```bash
# Instalirati Google Cloud SDK ako nije instaliran
# https://cloud.google.com/sdk/docs/install

# Autentificirati se
gcloud auth login

# Postaviti projekt
gcloud config set project createx-e0ccc

# Primijeniti CORS konfiguraciju
gsutil cors set cors.json gs://createx-e0ccc.appspot.com

# Provjeriti konfiguraciju
gsutil cors get gs://createx-e0ccc.appspot.com
```

### Opcija 2: Server-side Upload (Alternativa)

Ako ne možeš konfigurirati Firebase Storage, možeš kreirati server-side endpoint za upload.

**Prednosti:**
- Nema CORS problema
- Bolja kontrola nad uploadom
- Može se dodati validacija i optimizacija slika

**Nedostaci:**
- Dodatni API endpoint
- Malo sporije (dva network requesta umjesto jednog)

## Status

⚠️ **ČEKA IMPLEMENTACIJU**

Potrebno je:
1. Kreirati `cors.json` fajl
2. Primijeniti konfiguraciju sa `gsutil`
3. Testirati upload profilne slike

## Testiranje

Nakon primjene CORS konfiguracije:

1. Prijaviti se kao korisnik
2. Ići na profil
3. Kliknuti na "Javni profil" tab
4. Pokušati promijeniti profilnu sliku
5. Provjeriti da nema CORS greški u konzoli
6. Provjeriti da se slika uspješno uploaduje

## Napomena

Firebase Storage CORS konfiguracija se primjenjuje na cijeli bucket. 
Ova konfiguracija omogućava upload sa svih navedenih origina.
