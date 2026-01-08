# Railway Environment Variables

## Required Variables for Backend

Add these in Railway → Your Service → Variables:

```
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
OPENAI_API_KEY=your_openai_api_key
CORS_ORIGINS=https://arsfafer.vercel.app,http://localhost:3000
```

**Important**: Make sure to set `CORS_ORIGINS` with your actual Vercel domain. The backend will automatically include `https://arsfafer.vercel.app` and `http://localhost:3000` even if not specified, but it's best to set it explicitly.

## Note

- `SUPABASE_URL` and `SUPABASE_KEY` are for the backend (no NEXT_PUBLIC_ prefix)
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are for the frontend (Vercel)
- They can have the same values, but the backend needs the unprefixed names

## How to Get Values

1. **Supabase URL & Keys**:
   - Go to your Supabase project dashboard
   - Settings → API
   - Copy:
     - Project URL → `SUPABASE_URL`
     - anon public key → `SUPABASE_KEY`
     - service_role key (secret) → `SUPABASE_SERVICE_ROLE_KEY`

2. **OpenAI API Key**:
   - Get from https://platform.openai.com/api-keys

3. **CORS Origins**:
   - Your frontend URL (e.g., `https://arsfafe.vercel.app`)
   - Include localhost for local dev
