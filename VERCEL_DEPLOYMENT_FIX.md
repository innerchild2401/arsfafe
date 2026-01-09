# Fixing Duplicate Vercel Deployments

## Problem
You're seeing duplicate deployments (each push triggers 2 builds), causing you to hit the 100 deployments/day limit.

## Root Causes
1. **Duplicate Webhooks**: GitHub has multiple webhooks pointing to Vercel
2. **Multiple Project Connections**: Same repo connected to multiple Vercel projects
3. **Branch Protection**: Multiple branches triggering builds

## Solutions

### 1. Check GitHub Webhooks
1. Go to: `https://github.com/innerchild2401/arsfafe/settings/hooks`
2. Look for Vercel webhooks (should only be ONE)
3. Delete any duplicates
4. Keep only the active one from your main Vercel project

### 2. Check Vercel Project Settings
1. Go to Vercel Dashboard → Your Project → Settings → Git
2. Verify only ONE repository connection exists
3. If you see multiple projects connected to the same repo, disconnect the duplicates

### 3. Configure Branch Builds
1. Go to Vercel Dashboard → Your Project → Settings → Git
2. Under "Production Branch", ensure only `main` is set
3. Disable automatic deployments for other branches if not needed

### 4. Use vercel.json (Already Created)
The `vercel.json` file I created will:
- Only deploy from `main` branch
- Use proper build commands
- Ignore builds if no relevant files changed

### 5. Manual Deployment Control
If you need to reduce deployments:
- Disable "Automatic Deployments" for preview branches
- Only enable for `main` branch
- Use manual redeploy when needed

## Immediate Fix
1. **Delete duplicate webhooks** in GitHub (most common cause)
2. **Disconnect duplicate projects** in Vercel
3. **Wait 24 hours** for the limit to reset, or upgrade to Pro plan

## Prevention
- The `vercel.json` file will help prevent unnecessary builds
- Only connect the repo once
- Use branch protection to limit which branches trigger builds