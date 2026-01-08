#!/bin/bash
set -e

# Activate virtual environment
source /opt/venv/bin/activate

# Verify environment variables are set
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] || [ -z "$OPENAI_API_KEY" ]; then
    echo "ERROR: Required environment variables are missing!"
    echo "Please set: SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY"
    exit 1
fi

# Start the application
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
