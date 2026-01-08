# FastAPI Backend

## Setup

1. **Install dependencies**:
```bash
cd backend
pip install -r requirements.txt
```

2. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. **Run the server**:
```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`

## API Documentation

Once running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Project Structure

```
backend/
├── main.py              # FastAPI app entry point
├── app/
│   ├── __init__.py
│   ├── config.py        # Configuration settings
│   ├── database.py      # Supabase client
│   ├── routers/         # API route handlers
│   ├── services/        # Business logic
│   └── utils/           # Utility functions
└── requirements.txt
```
