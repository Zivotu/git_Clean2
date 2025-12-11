# Thesara Server - Quick Commands Reference

## 🚀 DEPLOYMENT

### Deploy nakon git push:
```bash
ssh root@vps-thesaraspace.plusvps.com
cd /srv/thesara/app
./deploy-server.sh
```

### Manual deploy (bez script-a):
```bash
cd /srv/thesara/app
git pull
cd apps/web && rm -rf .next && pnpm build
pm2 restart thesara-web
```

---

## 🔒 SECURITY CHECKS

### Tjedno Security Check:
```bash
cd /srv/thesara/app
./security-check.sh
```

### Brzi system health check:
```bash
pm2 status && ufw status && systemctl status fail2ban --no-pager
```

### Check CPU hogs:
```bash
ps aux --sort=-%cpu | head -10
```

### Check active connections:
```bash
ss -tulpn | grep LISTEN
```

### Check failed login attempts:
```bash
fail2ban-client status sshd
```

---

## 📊 MONITORING

### PM2 Logs:
```bash
pm2 logs thesara-web --lines 50
pm2 logs thesara-api --lines 50
pm2 logs --lines 100
```

### Nginx Logs:
```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### System Logs:
```bash
journalctl -u nginx -n 50
journalctl -u ssh -n 50
```

---

## 🔧 TROUBLESHOOTING

### Website ne radi:
```bash
# 1. Check PM2
pm2 status
pm2 restart thesara-web

# 2. Check Nginx
systemctl status nginx
nginx -t
systemctl reload nginx

# 3. Check logs
pm2 logs thesara-web --lines 50 --nostream
```

### Port already in use:
```bash
# Pronađi proces
lsof -i :3000

# Ubij proces
kill -9 PID
```

### Chunk loading errors:
```bash
# 1. Rebuild web
cd /srv/thesara/app/apps/web
rm -rf .next
pnpm build

# 2. Restart PM2
pm2 restart thesara-web

# 3. Browser hard refresh
# Ctrl + Shift + R
```

---

## 🛡️ FIREWALL

### Check firewall status:
```bash
ufw status numbered
```

### Block IP:
```bash
ufw deny from IP_ADDRESS
ufw reload
```

### Allow port:
```bash
ufw allow PORT/tcp
ufw reload
```

---

## 🔐 SSH

### Add new SSH key:
```bash
nano /root/.ssh/authorized_keys
# Paste key
chmod 600 /root/.ssh/authorized_keys
```

### Remove SSH key:
```bash
nano /root/.ssh/authorized_keys
# Delete line
```

### Test SSH from local:
```powershell
ssh root@vps-thesaraspace.plusvps.com
```

---

## 📦 UPDATES

### Update system:
```bash
apt update
apt upgrade -y
apt autoremove -y
```

### Update PM2:
```bash
npm install -g pm2@latest
pm2 update
```

---

## 💾 BACKUP

### Manual backup:
```bash
# Database
pg_dump thesara > /backups/db-$(date +%Y%m%d).sql

# Uploads
tar -czf /backups/uploads-$(date +%Y%m%d).tar.gz /srv/thesara/storage/uploads

# .env files
tar -czf /backups/env-$(date +%Y%m%d).tar.gz /srv/thesara/app/apps/*/.env
```

---

## 🚨 EMERGENCY

### Server kompromitiran:
```bash
# 1. Run security check
./security-check.sh > /root/incident-$(date +%Y%m%d).log

# 2. Block outgoing (disconnect from internet)
ufw deny out from any

# 3. Check all processes
ps aux --sort=-%cpu > /root/processes.log

# 4. Check network
ss -tulpn > /root/network.log

# 5. Contact support ili fresh install
```

### Kill suspicious process:
```bash
ps aux | grep SUSPICIOUS_NAME
kill -9 PID
```

### Remove malware service:
```bash
systemctl stop SERVICE_NAME
systemctl disable SERVICE_NAME
rm /etc/systemd/system/SERVICE_NAME.service
systemctl daemon-reload
```

---

## 🎯 USEFUL ONE-LINERS

### Check disk space:
```bash
df -h
```

### Check memory usage:
```bash
free -h
```

### Top 10 CPU processes:
```bash
ps aux --sort=-%cpu | head -11
```

### Top 10 memory processes:
```bash
ps aux --sort=-%mem | head -11
```

### Find large files:
```bash
find / -type f -size +100M 2>/dev/null
```

### Check open files limit:
```bash
ulimit -n
```

---

**Sačuvajte ovaj file za brzu referencu!**
