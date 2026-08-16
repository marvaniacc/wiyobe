import paramiko, time
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('82.152.211.250', port=9011, username='root', password='2pyxPPTJkjFrR5b', timeout=15)

# Write Caddyfile
cmd = "printf 'wishubest.com, www.wishubest.com {\\n    reverse_proxy localhost:3000\\n}\\n' > /etc/caddy/Caddyfile"
i,o,e = ssh.exec_command(cmd)
o.read()

i,o,e = ssh.exec_command("cat /etc/caddy/Caddyfile")
print("Caddyfile:", o.read().decode())

# Restart Caddy
i,o,e = ssh.exec_command("systemctl restart caddy 2>&1")
print("Restart:", o.read().decode() or "OK")

time.sleep(5)

# Status
i,o,e = ssh.exec_command("systemctl is-active caddy 2>&1")
print("Status:", o.read().decode().strip())

# Ports
i,o,e = ssh.exec_command("ss -tlnp 2>/dev/null | grep -E ':80 |:443 '")
ports = o.read().decode().strip()
print("Ports:", ports or "NONE")

# Test port 80
i,o,e = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://localhost:80/ 2>&1')
print("Port 80:", o.read().decode().strip())

# Test port 443
i,o,e = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" -k https://localhost:443/ 2>&1')
print("Port 443:", o.read().decode().strip())

# Caddy logs
i,o,e = ssh.exec_command("journalctl -u caddy --no-pager -n 15 2>&1")
print("\nCaddy logs:")
print(o.read().decode()[-800:])

ssh.close()
