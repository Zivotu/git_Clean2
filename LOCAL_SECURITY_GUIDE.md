# Local Development Security Guide

## 🔒 SIGURNOST LOKALNOG RAZVOJA

**Created:** 2025-12-12  
**Purpose:** Sprječavanje curenja credentials i malware tokom lokalnog developmenta

---

## 1. 🔑 CREDENTIAL MANAGEMENT

### **.env Files (KRITIČNO!)**

#### **ŠTO JE URAĐENO (✅):**
```
✅ .env u .gitignore
✅ Firebase credentials u .gitignore
✅ .pem fileovi u .gitignore
```

#### **PROVJERI REDOVNO:**
```bash
# U projektu - provjeri da li .env NIJE u Git-u
git ls-files | grep ".env"

# Ako vrati rezultat - HITNO REMOVE:
git rm --cached .env
git commit -m "Remove .env from Git"
```

#### **BEST PRACTICE:**
```bash
# Nikad NE commit-uj direktno u .env
# Umjesto toga, održavaj .env.example:

# .env.example
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
JWT_SECRET=your-secret-here
FIREBASE_SERVICE_ACCOUNT_BASE64=base64-encoded-json

# .env (REAL - ne commit-uj!)
DATABASE_URL=postgresql://realuser:realpassword@prod-db:5432/proddb
JWT_SECRET=real-super-secret-key-xyz123
```

---

## 2. 📦 NPM PACKAGE SECURITY

### **Provjera Malware-a:**

```bash
# 1. Audit dependencies (prije install-a)
pnpm audit

# 2. Check za known vulnerabilities
pnpm audit --audit-level=high

# 3. Update vulnerable packages
pnpm update

# 4. Check package za malware (prije install-a)
# Provjerite na: https://socket.dev/
```

### **RED FLAGS u package.json:**

⚠️ **Sumnjivi paketi:**
- Nepoznati autor
- Vrlo mali broj downloads-a
- Novi paket (< 1 mjesec)
- Typosquatting (e.g., `react-domm` umjesto `react-dom`)

### **Zaštita:**

```json
// package.json - lock verzije za kritične pakete
{
  "dependencies": {
    "next": "15.0.3",          // ✅ Exact version
    "react": "^18.2.0"          // ⚠️ ^ dozvoljava minor updates
  }
}
```

**Preporuka:** Za production dependencies, koristi **exact versions** (bez `^` ili `~`).

---

## 3. 🔐 GIT SECURITY

### **Pre-commit Hook (Sprečava slučajni commit credentials):**

```bash
# Kreiraj .git/hooks/pre-commit
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash

# Check za credentials u staged fileovima
if git diff --cached --name-only | grep -qE "\.env$|\.pem$|firebase.*\.json$"; then
    echo "❌ ERROR: Attempted to commit sensitive files!"
    echo "Files blocked:"
    git diff --cached --name-only | grep -E "\.env$|\.pem$|firebase.*\.json$"
    exit 1
fi

# Check za hardcoded secrets
if git diff --cached | grep -qE "password.*=|secret.*=|api_key.*="; then
    echo "⚠️ WARNING: Possible hardcoded credentials detected!"
    echo "Review changes before committing."
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

exit 0
EOF

chmod +x .git/hooks/pre-commit
```

### **Git History Cleanup (ako credentials već commit-ani):**

```bash
# OPASNO - Rewrite history!
# Koristi samo ako ZAISTA treba:

# 1. Remove file iz cijelog Git history-a
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch path/to/.env" \
  --prune-empty --tag-name-filter cat -- --all

# 2. Force push (AKO JE SOLO projekat)
git push --force --all
```

**⚠️ VAŽNO:** Ako je password već bio u Git-u, **MORA SE ROTIRATI!**

---

## 4. 🖥️ LOCAL DEVELOPMENT ENVIRONMENT

### **VSCode / IDE Security:**

#### **Extensions - OPASNO!**

```
⚠️ Provjerite SVAKI extension PRIJE install-a:
- Publisher reputation
- Number of downloads
- Reviews
- Last update date
```

**Sigurni Extensions:**
```
✅ ESLint (Microsoft)
✅ Prettier (Prettier)
✅ GitLens (GitKraken)
✅ Auto Rename Tag (Jun Han)
```

**Sumnjivi Extension Patterns:**
```
❌ "Free Code Generator" - može ukrasti kod
❌ "Auto Import All Packages" - može instalirati malware
❌ Extensions koji traže excessive permissions
```

#### **VSCode Settings:**

```json
// .vscode/settings.json
{
  "files.watcherExclude": {
    "**/.git/objects/**": true,
    "**/node_modules/**": true,
    "**/dist/**": true,
    "**/.next/**": true
  },
  "files.exclude": {
    "**/.env": false  // Vidi .env u exploreru (ali ne commit-uj!)
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.next": true
  }
}
```

---

## 5. 🌐 BROWSER SECURITY

### **Development Extensions (Chrome/Edge):**

⚠️ **Extensions mogu čitati SVAKI REQUEST!**

**Opasni Extension Permissions:**
```
❌ "Read and change all your data on the websites you visit"
❌ "Read your browsing history"
❌ "Manage your downloads"
```

**Sigurni Development Extensions:**
```
✅ React Developer Tools (Facebook)
✅ Redux DevTools (Redux)
✅ JSON Formatter (callumlocke)
```

### **Local Development URLs:**

```bash
# NIKAD NE ŠALJI LOKALNE CREDENTIALS preko browsera!
# Koristi localhost, NE IP adresu:

✅ http://localhost:3000
❌ http://192.168.1.100:3000  # Može biti intercepted na mreži
```

---

## 6. 🛡️ WINDOWS FIREWALL

### **Blokiraj Sumnjive Outbound Connections:**

```powershell
# Blokiraj node.exe od outbound-a (nije za production server!)
# New-NetFirewallRule -DisplayName "Block Node Outbound" -Direction Outbound -Program "C:\Program Files\nodejs\node.exe" -Action Block

# Ili, dozvoli samo specific portove:
New-NetFirewallRule -DisplayName "Allow Node Local Dev" -Direction Outbound -Program "C:\Program Files\nodejs\node.exe" -RemotePort 3000,8788,5432,6379 -Action Allow
```

### **Monitor Outbound Connections:**

```powershell
# Provjeri aktivne konekcije
Get-NetTCPConnection | Where-Object {$_.State -eq "Established"} | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,OwningProcess
```

---

## 7. 🔒 SSH KEYS

### **SSH Key Security (za Git):**

```bash
# Lokacija: C:\Users\Amir\.ssh\

# Provjeri permissions
# Windows: Right-click → Properties → Security
# Samo vaš user account treba imati pristup!
```

### **GitHub SSH Key:**

```bash
# Generate specific key za GitHub
ssh-keygen -t ed25519 -C "your_email@example.com" -f ~/.ssh/github_thesara

# Add to SSH config
# C:\Users\Amir\.ssh\config
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_thesara
```

**⚠️ NIKAD NE COMMIT-UJ:**
- `id_rsa` (private key)
- `id_ed25519` (private key)
- `.pem` files

---

## 8. 📁 LOCAL BACKUP STRATEGY

### **Što Backup-ovati:**

```
✅ C:\thesara_RollBack\  (cijeli projekat)
✅ .env fileovi (SIGURNO! encrypt-aj!)
✅ SSH keys
✅ Firebase credentials
```

### **Gdje Backup-ovati:**

```
✅ Z:\ drive (već koristite)
✅ External HDD (encrypted)
✅ Cloud (ENCRYPTED!) - GitHub Private Repo (BEZ credentials!)
```

### **Backup Script (PowerShell):**

```powershell
# C:\thesara_RollBack\backup-local-dev.ps1

$BackupDate = Get-Date -Format "yyyyMMdd-HHmm"
$BackupPath = "Z:\thesara-dev-backups\$BackupDate"

# Kreiraj backup folder
New-Item -ItemType Directory -Force -Path $BackupPath

# Backup projekt (BEZ node_modules, .next)
robocopy "C:\thesara_RollBack" "$BackupPath\project" /E /XD node_modules .next dist .git

# Backup credentials (ENCRYPTED!)
$SecurePassword = Read-Host -AsSecureString "Enter encryption password"
$CredentialsZip = "$BackupPath\credentials.zip"

# Zip .env i keys
Compress-Archive -Path "C:\thesara_RollBack\.env","C:\thesara_RollBack\apps\api\keys\*" -DestinationPath $CredentialsZip

# TODO: Encrypt $CredentialsZip sa password-om
# (Windows BitLocker ili 7-Zip sa password-om)

Write-Host "✅ Backup complete: $BackupPath"
```

---

## 9. 🔍 DEPENDENCY SCANNING

### **Automatsko Skeniranje:**

```bash
# 1. GitHub Dependabot (automatski)
# Već aktivno ako je GitHub repo

# 2. Snyk (free plan)
npm install -g snyk
snyk auth
snyk test
snyk monitor

# 3. npm audit
pnpm audit --audit-level=moderate
```

### **Pre-install Check:**

```bash
# PRIJE nego install-aš novi paket:

# 1. Check na npm
# https://www.npmjs.com/package/<package-name>

# 2. Check GitHub issues
# Provjeri ima li report-a o security issues

# 3. Check bundlephobia
# https://bundlephobia.com/<package-name>
# (provjeri veličinu - veliki paketi mogu biti sumnjivi)
```

---

## 10. 🚨 INCIDENT RESPONSE (Local)

### **Ako Sumnjate na Compromise:**

#### **1. Freeze Development:**
```bash
# Zaustavi sve dev servere
# Ctrl+C na sve terminale
```

#### **2. Check za Malware:**
```powershell
# Windows Defender Full Scan
Start-MpScan -ScanType FullScan

# Check running processes
Get-Process | Where-Object {$_.CPU -gt 50}
```

#### **3. Rotate ALL Credentials:**
```bash
# Server credentials
# GitHub tokens
# Firebase keys
# Database passwords
# JWT secrets
```

#### **4. Review Git History:**
```bash
# Check za sumnjive commits
git log --all --oneline --graph | head -20

# Check ko je commit-ao
git log --all --pretty=format:"%h %an %ad %s" | head -20
```

#### **5. Clean Install:**
```bash
# Obriši node_modules i reinstall
rm -rf node_modules
pnpm install --frozen-lockfile
```

---

## 11. 📋 SECURITY CHECKLIST (Weekly)

### **Svake Nedjelje:**

- [ ] `pnpm audit` - Provjeri vulnerabilities
- [ ] Review `.gitignore` - Da li su credentials zaštićeni
- [ ] Check running processes - `Get-Process | Sort-Object CPU -Descending | Select-Object -First 10`
- [ ] Backup projekta na Z:/
- [ ] Update dependencies (minor versions)
- [ ] Review browser extensions
- [ ] Check Windows Defender logs

### **Mjesečno:**

- [ ] Full system scan (Windows Defender)
- [ ] Review SSH keys
- [ ] Rotate development credentials
- [ ] Clean temp files (`C:\Users\Amir\AppData\Local\Temp`)
- [ ] Review VSCode extensions
- [ ] Check GitHub security alerts

---

## 12. 🛠️ TOOLS & RESOURCES

### **Security Tools:**

```bash
# 1. Git Secrets (sprečava commit credentials)
git clone https://github.com/awslabs/git-secrets.git
cd git-secrets
./install.sh

# 2. TruffleHog (traži secrets u Git history)
docker run -it trufflesecurity/trufflehog git file://. --only-verified

# 3. npm audit fix
pnpm audit fix
```

### **Useful Links:**

- **npm Security:** https://docs.npmjs.com/auditing-package-dependencies-for-security-vulnerabilities
- **OWASP Top 10:** https://owasp.org/www-project-top-ten/
- **GitHub Security:** https://docs.github.com/en/code-security
- **Snyk:** https://snyk.io/
- **Socket.dev:** https://socket.dev/

---

## 13. 🎓 BEST PRACTICES SUMMARY

### **DO:**
✅ Use `.gitignore` for ALL credentials  
✅ Use environment variables (`.env`)  
✅ Regular `pnpm audit`  
✅ Review packages BEFORE install  
✅ Use SSH keys (not passwords) for Git  
✅ Regular backups  
✅ Update dependencies regularly  
✅ Use exact versions for critical packages  
✅ Pre-commit hooks  
✅ Strong passwords (BitWarden, 1Password)  

### **DON'T:**
❌ NEVER commit `.env` files  
❌ NEVER hardcode credentials in code  
❌ NEVER share `.pem` or private keys  
❌ NEVER install unknown npm packages  
❌ NEVER trust browser extensions blindly  
❌ NEVER use simple passwords  
❌ NEVER commit `node_modules`  
❌ NEVER push to public repo without review  

---

## 14. 🚀 QUICK START CHECKLIST (New Project)

```bash
# 1. Setup .gitignore
echo ".env
.env.*
*.pem
*.key
firebase-*.json
node_modules
dist
.next" > .gitignore

# 2. Create .env.example
cp .env .env.example
# (remove real values, keep only placeholders)

# 3. Pre-commit hook
# (see section 3)

# 4. Initial audit
pnpm audit

# 5. Commit
git add .
git commit -m "Initial commit with security setup"
```

---

**Last Updated:** 2025-12-12  
**Status:** 🟢 ACTIVE  
**Next Review:** Weekly (every Sunday)
