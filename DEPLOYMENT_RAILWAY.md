# Railway Deployment - Step by Step

## The Problem
Railway is detecting your project as Node.js because of `package.json` in the root, but you need Python for the backend.

## Solution Option 1: Use Custom Build Command (EASIEST)

### Step 1: Use Custom Build Command
1. In Railway, go to your service
2. Go to **Settings** tab  
3. Scroll to **"Build"** section
4. Enable **"Custom Build Command"**
5. Set Build Command to: `pip3 install -r backend/requirements.txt`
6. Save

### Step 2: Configure Start Command
In the **"Deploy"** section:
1. Enable **"Custom Start Command"** (it's already enabled based on your screenshot)
2. Make sure Start Command is: `cd backend && python3 -m uvicorn main:app --host 0.0.0.0 --port $PORT`
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

## Solution Option 2: Delete Service and Create New One

If Option 1 doesn't work:

1. **Delete your current service** in Railway
2. **Create a new service** from GitHub
3. When connecting the repo, look for **"Root Directory"** option during setup
4. Set it to: `backend`
5. Railway will detect Python automatically
6. Add your environment variables
7. Deploy

## Solution Option 3: Use Nixpacks Config

The `.nixpacks.toml` file in the root should force Railway to install Python. Make sure it's committed and pushed.

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
