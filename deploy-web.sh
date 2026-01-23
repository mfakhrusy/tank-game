#!/bin/bash
# Deploy to Cloudflare Pages
# Requires: npm install -g wrangler (or npx)

set -e

# Build first
./build-web.sh

# Deploy to Cloudflare Pages
echo "Deploying to Cloudflare Pages..."
npx wrangler pages deploy bin/web --project-name=tank-game

echo "Deploy complete!"
