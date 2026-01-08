#!/bin/bash
set -e

# Print environment info for debugging
echo "=== Starting Backend ==="
echo "Python version: $(python3 --version 2>&1 || echo 'not found')"
echo "Pip version: $(pip3 --version 2>&1 || echo 'not found')"
echo "PORT: ${PORT:-8000}"

# Activate virtual environment
if [ -f "/opt/venv/bin/activate" ]; then
    source /opt/venv/bin/activate
    echo "Virtual environment activated"
    echo "Python path: $(which python)"
    echo "Pip path: $(which pip)"
else
    echo "ERROR: Virtual environment not found at /opt/venv/bin/activate"
    exit 1
fi

# Verify environment variables are set
if [ -z "$SUPABASE_URL" ]; then
    echo "ERROR: SUPABASE_URL is not set"
    exit 1
fi
if [ -z "$SUPABASE_KEY" ]; then
    echo "ERROR: SUPABASE_KEY is not set"
    exit 1
fi
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "ERROR: SUPABASE_SERVICE_ROLE_KEY is not set"
    exit 1
fi
if [ -z "$OPENAI_API_KEY" ]; then
    echo "ERROR: OPENAI_API_KEY is not set"
    exit 1
fi

echo "Environment variables validated"

# Check if uvicorn is installed
if ! command -v uvicorn &> /dev/null; then
    echo "ERROR: uvicorn not found. Checking venv..."
    if [ -f "/opt/venv/bin/uvicorn" ]; then
        UVICORN_CMD="/opt/venv/bin/uvicorn"
    else
        echo "ERROR: uvicorn not found in venv"
        exit 1
    fi
else
    UVICORN_CMD="uvicorn"
fi

echo "Starting FastAPI server..."
exec $UVICORN_CMD main:app --host 0.0.0.0 --port ${PORT:-8000}
