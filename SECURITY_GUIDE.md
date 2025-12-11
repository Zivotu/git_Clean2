# Thesara Server - Sigurnosni Vodič i Best Practices

## 🛡️ IMPLEMENTIRANE SIGURNOSNE MJERE (2025-12-11)

### ✅ Trenutno aktivno:

1. **SSH Security**
   - ✅ SSH Key authentication obavezan
   - ✅ Password login onemogućen
   - ✅ PermitRootLogin set na "prohibit-password"

2. **Firewall (UFW)**
   - ✅ Aktivan i enabled on boot
   - ✅ Blokirani malicious IP-ovi: 67.217.57.240
   - ✅ Blokirani Docker API portovi: 2375-2377, 4243-4244
   - ✅ Blokiran SOCKS5 port: 1080
   - ✅ Blokiran Ray cluster port: 8265
   - ✅ Dozvoljeni: 22 (SSH), 80 (HTTP), 443 (HTTPS), 3000 (Next.js), 8788 (API)

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

**Zadnje updateano: 2025-12-11**
**Server: vps-thesaraspace.plusvps.com**
**Status: 🟢 SECURE**
