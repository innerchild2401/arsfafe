# Railway Deployment - Step by Step

## The Problem
Railway is detecting your project as Node.js because of `package.json` in the root, but you need Python for the backend.

## Solution: Set Root Directory in Railway

### Step 1: Create/Configure Service
1. In Railway, go to your project
2. Click on your service (or create a new one)
3. Go to **Settings** tab
4. Scroll down to **"Deploy"** section
5. Find **"Root Directory"** field
6. Set it to: `backend`
7. Save

### Step 2: Configure Start Command
In the same Settings page:
1. Find **"Start Command"** field
2. Set it to: `uvicorn main:app --host 0.0.0.0 --port $PORT`
3. Save

### Step 3: Add Environment Variables
Go to **Variables** tab and add:
```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_api_key
CORS_ORIGINS=https://your-frontend.vercel.app,http://localhost:3000
```

### Step 4: Redeploy
Click **"Redeploy"** button

---

## Alternative: Use Nixpacks Config

If Root Directory doesn't work, Railway will use the `nixpacks.toml` file in the `backend/` folder which forces Python detection.

---

## Troubleshooting

### Still detecting Node.js?
1. Make sure Root Directory is set to `backend`
2. Check that `backend/nixpacks.toml` exists
3. Try deleting the service and recreating it with Root Directory set from the start

### Build still failing?
Check Railway logs for specific errors. Common issues:
- Missing environment variables
- Python version mismatch
- Missing dependencies in requirements.txt
