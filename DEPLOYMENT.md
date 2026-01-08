# Backend Deployment Guide

Your FastAPI backend needs to be deployed separately. Here are the best options:

## Option 1: Railway (Recommended - Easiest)

Railway is the easiest way to deploy Python apps.

### Steps:

1. **Sign up at [railway.app](https://railway.app)**

2. **Create a new project**:
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `arsfafe` repository
   - Railway will detect it's a Python project

3. **Configure the deployment**:
   - Set **Root Directory** to `backend`
   - Set **Start Command** to: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Railway will auto-detect `requirements.txt`

4. **Add Environment Variables**:
   Go to your project → Variables tab and add:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   OPENAI_API_KEY=your_openai_api_key
   CORS_ORIGINS=https://your-frontend.vercel.app,http://localhost:3000
   ```

5. **Get your backend URL**:
   - Railway will give you a URL like: `https://your-app.railway.app`
   - Copy this URL

6. **Update Frontend**:
   - Go to Vercel → Your Project → Settings → Environment Variables
   - Add: `NEXT_PUBLIC_BACKEND_URL=https://your-app.railway.app`
   - Redeploy your frontend

---

## Option 2: Render (Free Tier Available)

### Steps:

1. **Sign up at [render.com](https://render.com)**

2. **Create a new Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repo
   - Select your `arsfafe` repository

3. **Configure**:
   - **Name**: `arsfafe-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

4. **Add Environment Variables**:
   Same as Railway above

5. **Deploy**:
   - Render will build and deploy automatically
   - Get your URL: `https://arsfafe-backend.onrender.com`

6. **Update Frontend**:
   - Add `NEXT_PUBLIC_BACKEND_URL` to Vercel environment variables

---

## Option 3: Fly.io

### Steps:

1. **Install Fly CLI**:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login**:
   ```bash
   fly auth login
   ```

3. **Create app**:
   ```bash
   cd backend
   fly launch
   ```

4. **Create `fly.toml`**:
   ```toml
   app = "arsfafe-backend"
   primary_region = "iad"

   [build]

   [http_service]
     internal_port = 8000
     force_https = true
     auto_stop_machines = true
     auto_start_machines = true
     min_machines_running = 0

   [[services]]
     protocol = "tcp"
     internal_port = 8000
   ```

5. **Set secrets**:
   ```bash
   fly secrets set SUPABASE_URL=your_url
   fly secrets set SUPABASE_KEY=your_key
   fly secrets set SUPABASE_SERVICE_ROLE_KEY=your_key
   fly secrets set OPENAI_API_KEY=your_key
   ```

6. **Deploy**:
   ```bash
   fly deploy
   ```

---

## Option 4: Vercel (Using Serverless Functions)

Vercel can run Python, but it's more complex. Create `api/index.py`:

```python
from fastapi import FastAPI
from mangum import Mangum

# Your existing app code
from backend.main import app

handler = Mangum(app)
```

Then install `mangum` in requirements.txt.

---

## Quick Setup Checklist

- [ ] Deploy backend to Railway/Render/Fly.io
- [ ] Get backend URL (e.g., `https://your-backend.railway.app`)
- [ ] Add `NEXT_PUBLIC_BACKEND_URL` to Vercel environment variables
- [ ] Redeploy frontend on Vercel
- [ ] Test upload functionality

---

## Testing Your Backend

Once deployed, test your backend:

```bash
# Health check
curl https://your-backend.railway.app/health

# Should return: {"status":"healthy"}
```

---

## Troubleshooting

### CORS Errors
Make sure `CORS_ORIGINS` includes your frontend URL:
```
CORS_ORIGINS=https://your-frontend.vercel.app,http://localhost:3000
```

### Connection Refused
- Check backend is running
- Verify `NEXT_PUBLIC_BACKEND_URL` is set correctly
- Check backend logs for errors

### Environment Variables
Make sure all backend env vars are set in your hosting platform.
