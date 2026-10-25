#!/bin/bash
# Direct Zero-Prompt Cloudflare Edge Tunnel for Gyanam AI (No IP Password Gate)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
exec /opt/homebrew/bin/cloudflared tunnel --url http://localhost:8090 --no-autoupdate
