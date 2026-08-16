import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('82.152.211.250', port=9011, username='root', password='2pyxPPTJkjFrR5b', timeout=15)

# Test from VPS
i,o,e = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" https://wishubest.com/ 2>&1')
print("https://wishubest.com:", o.read().decode().strip())

i,o,e = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://wishubest.com/ 2>&1')
print("http://wishubest.com:", o.read().decode().strip())

i,o,e = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://www.wishubest.com/ 2>&1')
print("http://www.wishubest.com:", o.read().decode().strip())

# Check DNS more
i,o,e = ssh.exec_command('dig +short wishubest.com A 2>&1')
print("\nDNS wishubest.com:", o.read().decode().strip())

i,o,e = ssh.exec_command('dig +short www.wishubest.com A 2>&1')
print("DNS www.wishubest.com:", o.read().decode().strip() or "EMPTY")

# Check if Cloudflare proxy is on (orange cloud)
i,o,e = ssh.exec_command('curl -sI https://wishubest.com/ 2>&1 | head -10')
print("\nHeaders:")
print(o.read().decode())

ssh.close()
