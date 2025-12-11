#!/bin/bash
# Thesara Security Check Script
# Pokreni tjedno ili kad god sumnjate na kompromis
# Usage: ./security-check.sh

echo "🔒 =========================================="
echo "   THESARA SECURITY CHECK"
echo "   $(date)"
echo "==========================================="
echo ""

# 1. CHECK SUSPICIOUS PROCESSES
echo "📊 [1/10] Provjera sumnjivих procesa..."
SUSPICIOUS=$(ps aux | grep -iE "xmrig|miner|pcpcat|gost|frpc|cryptonight|monero" | grep -v grep)
if [ -z "$SUSPICIOUS" ]; then
    echo "   ✅ Nema sumnjivих procesa"
else
    echo "   ⚠️  UPOZORENJE: Pronađeni sumnjivi procesi:"
    echo "$SUSPICIOUS"
fi
echo ""

# 2. CHECK CPU USAGE
echo "🖥️  [2/10] Provjera CPU opterećenja..."
CPU_LOAD=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}')
CPU_CORES=$(nproc)
echo "   Load average: $CPU_LOAD (cores: $CPU_CORES)"
if (( $(echo "$CPU_LOAD > $CPU_CORES * 2" | bc -l) )); then
    echo "   ⚠️  UPOZORENJE: Visoko CPU opterećenje!"
    echo "   Top CPU procesi:"
    ps aux --sort=-%cpu | head -6
else
    echo "   ✅ CPU opterećenje normalno"
fi
echo ""

# 3. CHECK NETWORK CONNECTIONS
echo "🌐 [3/10] Provjera sumnjivих konekcija..."
SUSPICIOUS_PORTS="1080 2375 2376 2377 4243 4244 8265"
SUSPICIOUS_IPS="67.217.57.240"

for PORT in $SUSPICIOUS_PORTS; do
    if ss -tulpn | grep ":$PORT " > /dev/null 2>&1; then
        echo "   ⚠️  UPOZORENJE: Port $PORT je otvoren!"
        ss -tulpn | grep ":$PORT "
    fi
done

for IP in $SUSPICIOUS_IPS; do
    if ss -tn | grep "$IP" > /dev/null 2>&1; then
        echo "   🚨 KRITIČNO: Konekcija na malicious IP $IP!"
        ss -tn | grep "$IP"
    fi
done
echo "   ✅ Provjera završena"
echo ""

# 4. CHECK SYSTEMD SERVICES
echo "⚙️  [4/10] Provjera sumnjivих systemd servisa..."
SUSPICIOUS_SERVICES=$(systemctl list-unit-files | grep -iE "pcpcat|xmrig|miner|gost|frpc")
if [ -z "$SUSPICIOUS_SERVICES" ]; then
    echo "   ✅ Nema sumnjivих servisa"
else
    echo "   ⚠️  UPOZORENJE: Pronađeni sumnjivi servisi:"
    echo "$SUSPICIOUS_SERVICES"
fi
echo ""

# 5. CHECK CRON JOBS
echo "📅 [5/10] Provjera cron jobova..."
echo "   Root crontab:"
crontab -l 2>/dev/null || echo "   (prazan)"
echo ""
echo "   System cron files:"
ls -la /etc/cron.*/ 2>/dev/null | grep -v "^d" | grep -v "^total" || echo "   (nema custom jobova)"
echo ""

# 6. CHECK UNAUTHORIZED SSH KEYS
echo "🔑 [6/10] Provjera SSH ključeva..."
KEY_COUNT=$(wc -l < /root/.ssh/authorized_keys 2>/dev/null || echo "0")
echo "   Broj SSH ključeva: $KEY_COUNT"
if [ "$KEY_COUNT" -gt 2 ]; then
    echo "   ⚠️  UPOZORENJE: Više od 2 SSH ključa!"
    cat /root/.ssh/authorized_keys
fi
echo ""

# 7. CHECK FIREWALL STATUS
echo "🔥 [7/10] Provjera firewall statusa..."
if systemctl is-active --quiet ufw; then
    echo "   ✅ UFW firewall aktivan"
    ufw status | grep -E "Status|DENY"
else
    echo "   ⚠️  UPOZORENJE: UFW nije aktivan!"
fi
echo ""

# 8. CHECK FAIL2BAN
echo "🛡️  [8/10] Provjera fail2ban..."
if systemctl is-active --quiet fail2ban; then
    echo "   ✅ Fail2ban aktivan"
    fail2ban-client status sshd 2>/dev/null | grep -E "Currently banned|Total banned"
else
    echo "   ⚠️  UPOZORENJE: Fail2ban nije aktivan!"
fi
echo ""

# 9. CHECK SUSPICIOUS FILES
echo "📁 [9/10] Provjera sumnjivих fileova..."
SUSPICIOUS_PATHS="/tmp /var/tmp /dev/shm /opt"
for PATH_CHECK in $SUSPICIOUS_PATHS; do
    SUSPICIOUS_FILES=$(find $PATH_CHECK -type f -executable -mtime -7 2>/dev/null | grep -v "systemd")
    if [ ! -z "$SUSPICIOUS_FILES" ]; then
        echo "   ⚠️  Novi executable fileovi u $PATH_CHECK:"
        echo "$SUSPICIOUS_FILES"
    fi
done
echo "   ✅ Provjera završena"
echo ""

# 10. CHECK LAST LOGINS
echo "👤 [10/10] Provjera posljednjih prijava..."
echo "   Uspješne prijave (zadnjih 10):"
last -n 10 | head -11
echo ""
echo "   Neuspješni pokušaji (ako postoje):"
lastb 2>/dev/null | head -5
echo ""

# SUMMARY
echo "==========================================="
echo "✅ Security check završen!"
echo ""
echo "💡 Preporučeni redoviti taskovi:"
echo "   - Ovaj script: tjedno"
echo "   - apt update && apt upgrade: mjesečno"
echo "   - Backup: dnevno"
echo "   - Log review: tjedno"
echo "==========================================="
