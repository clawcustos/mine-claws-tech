#!/bin/bash
set -e
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR=$(mktemp -d)
echo "Copying to $DEPLOY_DIR..."
rsync -a --exclude=node_modules --exclude=.next --exclude=.git "$REPO_DIR/" "$DEPLOY_DIR/"
cd "$DEPLOY_DIR"
mkdir -p .vercel
cp "$REPO_DIR/.vercel/project.json" .vercel/
echo "Deploying..."
vercel deploy --prod
rm -rf "$DEPLOY_DIR"
