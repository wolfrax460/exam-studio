# Cloudflare Tunnel for Exam Studio (Option B, recommended)

This exposes only the Exam Studio API through a Cloudflare Tunnel on a
subdomain like `api.examstudio.example.com`. It does not change Caddy,
Apache, or any other service on the server.

## On your PC (one time)
1. Log in to Cloudflare and add the domain you want to use (or use an existing Zone).
2. Install `cloudflared` on the Oracle server only.

## On the server (SSH)
```bash
# 1. Install cloudflared (Debian/Ubuntu x86_64)
sudo mkdir -p /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared

# 2. Authenticate and create a tunnel (replace api.examstudio.example.com)
sudo cloudflared tunnel login
sudo cloudflared tunnel create exam-studio
# note the TUNNEL_ID printed.

# 3. Configure ingress in /etc/cloudflared/config.yml
sudo tee /etc/cloudflared/config.yml >/dev/null <<'EOF'
tunnel: TUNNEL_ID
credentials-file: /etc/cloudflared/TUNNEL_ID.json
ingress:
  - hostname: api.examstudio.example.com
    service: http://127.0.0.1:3100
  - service: http_status:404
EOF
# replace TUNNEL_ID with the real value

# 4. Run and enable service
sudo cloudflared route dns exam-studio api.examstudio.example.com
sudo cloudflared service install
sudo systemctl enable --now cloudflared

# 5. Verify only Exam Studio is exposed
curl -sS https://api.examstudio.example.com/api/health
```

## Firewall
No inbound port changes are required for option B when cloudflared runs
outbound-only. Keep Oracle security list unchanged.

## HTTPS headers
Set `TRUST_PROXY=1` and `CORS_ORIGIN=https://exams-studio.vercel.app` in
`/opt/exam-studio/.env`.
'