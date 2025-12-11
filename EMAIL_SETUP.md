# Thesara Email Setup - Automated Security Reports

## 📧 PREGLED

Server automatski šalje dnevne security reportove na `reports@thesara.space`.

**Implementirano: 2025-12-11**

---

## ⚙️ POSTFIX KONFIGURACIJA

### Instalacija:

```bash
apt update
apt install -y mailutils postfix
```

### Konfiguracija tijekom instalacije:

- **General type:** Internet Site
- **System mail name:** thesara.space

### Postfix Settings:

```bash
# Postavljena konfiguracija:
postconf -e 'myhostname = thesara.space'
postconf -e 'myorigin = $myhostname'
postconf -e 'mydestination = localhost, vps-thesaraspace-plusvps-com'
postconf -e 'relayhost ='
postconf -e 'inet_interfaces = loopback-only'

# Restart nakon promjena
systemctl restart postfix
```

### Provjera statusa:

```bash
systemctl status postfix
postconf -n
```

---

## 🌐 DNS KONFIGURACIJA

### SPF Record (OBAVEZNO):

Da bi emailovi stigli u inbox umjesto u spam, mora biti postavljen SPF record.

```
Type: TXT
Name: thesara.space (ili @)
Value: v=spf1 ip4:178.218.160.180 ~all
TTL: 14400
```

**Objašnjenje:**
- `v=spf1` - verzija SPF protokola
- `ip4:178.218.160.180` - autorizirana IP adresa servera
- `~all` - "soft fail" za ostale IP adrese

### DMARC Record (Opcionalno, ali preporučeno):

```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:reports@thesara.space
TTL: 14400
```

**Objašnjenje:**
- `p=none` - policy je "none" (samo monitoring)
- `rua=mailto:reports@thesara.space` - šalje DMARC reportove na reports email

### Provjera DNS propagacije:

```bash
# Check SPF record
dig TXT thesara.space +short

# Should return:
# "v=spf1 ip4:178.218.160.180 ~all"

# Check DMARC record
dig TXT _dmarc.thesara.space +short

# Should return:
# "v=DMARC1; p=none; rua=mailto:reports@thesara.space"
```

DNS propagacija može trajati 5-60 minuta.

---

## 📜 SECURITY REPORT SCRIPT

### Lokacija:
```
/root/daily-security-report.sh
```

### Što Script Provjerava:

1. **Malware procese** - xmrig, pcpcat, traffmonetizer, etc.
2. **Process count** - PM2 daemon, API proces, Web proces
3. **Orphan procese** - Port 8789
4. **Service health** - API (/health endpoint) i Web (HTTP 200)
5. **Firewall status** - UFW aktivan/neaktivan
6. **Fail2ban status** - Broj banovanih IP-ova
7. **Docker containers** - Broj aktivnih containera
8. **System stats** - Load average, memory korištenje, failed logins

### Izvršavanje:

```bash
# Manual run (za testing)
/root/daily-security-report.sh

# Automatski preko cron-a (svaki dan u 4 AM)
0 4 * * * /root/daily-security-report.sh
```

---

## ⏰ CRON SCHEDULE

### Trenutni Cron Jobovi:

```bash
# 1. Kill orphan process - Nedeljom u 2 AM
0 2 * * 0 pkill -9 -f 'node.*8789' 2>/dev/null

# 2. Security report - Svaki dan u 4 AM
0 4 * * * /root/daily-security-report.sh

# 3. PM2 graceful reload - Nedeljom u 4:05 AM
5 4 * * 0 /usr/bin/pm2 reload all
```

### Provjera cron jobova:

```bash
crontab -l
```

### Dodavanje novog cron joba:

```bash
crontab -e
# Dodaj novu liniju i spremi
```

---

## 🧪 TESTIRANJE

### Test #1: Send Test Email

```bash
echo "Test email from Thesara server - $(date)" | mail -s "Manual Test" reports@thesara.space
```

### Test #2: Check Mail Log

```bash
tail -20 /var/log/mail.log

# Traži liniju:
# status=sent (250 OK ...)
```

### Test #3: Check Mail Queue

```bash
mailq

# Should return: "Mail queue is empty"
```

### Test #4: Run Security Report Manually

```bash
/root/daily-security-report.sh
```

Provjeri inbox za `reports@thesara.space`.

---

## 🐛 TROUBLESHOOTING

### Problem: Email se ne šalje

```bash
# 1. Check Postfix status
systemctl status postfix

# 2. Restart Postfix
systemctl restart postfix

# 3. Check logs
tail -50 /var/log/mail.log
journalctl -u postfix -n 50
```

### Problem: Email ide u SPAM

**Razlozi:**
1. SPF record nije postavljen
2. DNS još nije propagiran
3. Email provider blokata server IP

**Rješenje:**
```bash
# 1. Provjeri SPF record
dig TXT thesara.space +short

# 2. Pričekaj DNS propagaciju (30-60min)

# 3. Markaj email kao "Not Spam" u inboxu
```

### Problem: "unknown user" error

```bash
# Check mydestination setting
postconf mydestination

# Should NOT include thesara.space in the list
# If it does:
postconf -e 'mydestination = localhost, vps-thesaraspace-plusvps-com'
systemctl restart postfix
```

### Problem: "Invalid HELO name"

```bash
# Check myhostname
postconf myhostname

# Should be: thesara.space
# If not:
postconf -e 'myhostname = thesara.space'
systemctl restart postfix
```

### Problem: Email bounced

```bash
# Check bounce messages
tail -50 /var/log/mail.log | grep bounce

# Check recipient mailbox
mail -u root
```

---

## 📊 LOG FILES

### Mail Logs:

```bash
# Main mail log
/var/log/mail.log

# View last 30 lines
tail -30 /var/log/mail.log

# Follow in real-time
tail -f /var/log/mail.log

# Search for specific email
grep "reports@thesara.space" /var/log/mail.log
```

### Postfix Queue:

```bash
# List mail queue
mailq

# Flush queue (force send)
postfix flush

# Delete all queued emails
postsuper -d ALL
```

---

## 🔧 MAINTENAN CE

### Tjedno:

- [ ] Provjeri da li stižu dnevni reportovi
- [ ] Provjeri mail log za errore: `tail -50 /var/log/mail.log`
- [ ] Provjeri da li je queue prazan: `mailq`

### Mjesečno:

- [ ] Provjeri SPF record: `dig TXT thesara.space +short`
- [ ] Test email sa raznih providera (Gmail, Outlook)
- [ ] Update Postfix: `apt update && apt upgrade postfix`

---

## 📞 CONTACTS & RESOURCES

### Postfix Dokumentacija:
- http://www.postfix.org/documentation.html

### SPF Record Checker:
- https://mxtoolbox.com/spf.aspx

### DMARC Analyzer:
- https://mxtoolbox.com/dmarc.aspx

### Email Testing:
- https://www.mail-tester.com/

---

**Zadnje updateano: 2025-12-11**
**Server: vps-thesaraspace.plusvps.com**
**Daily Reports: reports@thesara.space**
**Status: ✅ ACTIVE**
