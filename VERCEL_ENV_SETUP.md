# Vercel Environment Variables Setup

This guide explains how to set up environment variables in Vercel for the frontend application.

## Required Environment Variables

The frontend needs these environment variables to connect to Supabase:

1. **NEXT_PUBLIC_SUPABASE_URL** - Your Supabase project URL
2. **NEXT_PUBLIC_SUPABASE_ANON_KEY** - Your Supabase anonymous/public key

## How to Find These Values

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **API**
4. You'll find:
   - **Project URL** → This is your `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → This is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## How to Set Environment Variables in Vercel

### Option 1: Via Vercel Dashboard (Recommended)

1. Go to your Vercel project dashboard
2. Click on **Settings** tab
3. Click on **Environment Variables** in the left sidebar
4. Add each variable:
   - **Key**: `NEXT_PUBLIC_SUPABASE_URL`
   - **Value**: `https://your-project-id.supabase.co` (from Supabase dashboard)
   - **Environment**: Select all (Production, Preview, Development)
   - Click **Save**
5. Repeat for `NEXT_PUBLIC_SUPABASE_ANON_KEY`:
   - **Key**: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Value**: Your anon key from Supabase dashboard
   - **Environment**: Select all (Production, Preview, Development)
   - Click **Save**

### Option 2: Via Vercel CLI

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Login to Vercel
vercel login

# Set environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## After Setting Environment Variables

1. **Redeploy** your application in Vercel:
   - Go to your project → **Deployments** tab
   - Click the three dots (⋯) on the latest deployment
   - Click **Redeploy**
   - Or make a new commit to trigger automatic deployment

2. **Verify** the variables are set:
   - Go to **Settings** → **Environment Variables**
   - Make sure both variables are listed

## Important Notes

- **NEXT_PUBLIC_** prefix is required for client-side environment variables in Next.js
- These variables are public and will be exposed to the browser (that's safe for anon keys)
- Never commit these values to Git - they should only be in Vercel environment variables
- After adding/changing environment variables, you must redeploy for changes to take effect

## Troubleshooting

### Error: "Your project's URL and Key are required to create a Supabase client!"

This error means the environment variables are not set in Vercel. Follow the steps above to set them.

### Variables not working after setting them

1. Make sure you added `NEXT_PUBLIC_` prefix (not just `SUPABASE_URL`)
2. Redeploy your application after adding variables
3. Check that variables are set for the correct environment (Production/Preview/Development)
4. Verify the values are correct (no extra spaces, correct URL format)

## Example Values

```bash
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYzMzE2ODU2MCwiZXhwIjoxOTQ4NzQ0NTYwfQ.abc123def456ghi789
```

**Note**: These are example values. Use your actual values from the Supabase dashboard.
