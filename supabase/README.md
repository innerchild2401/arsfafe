# Supabase Database Setup

## Quick Start

1. **Run the initial schema**:
   - Open Supabase SQL Editor
   - Copy and paste contents of `001_initial_schema.sql`
   - Click "Run"

2. **Sign up via Supabase Auth**:
   - Go to your Supabase project
   - Use the Auth UI to sign up with your email
   - This will automatically create a user profile (via trigger)

3. **Set yourself as admin**:
   - Open `002_setup_admin.sql`
   - Replace `'your-email@example.com'` with your actual email
   - Run the SQL in Supabase SQL Editor

## Database Schema Overview

### Tables Created:
- `user_profiles` - User accounts with roles and limits
- `books` - Uploaded books with deduplication
- `user_book_access` - Many-to-many user-book relationship
- `parent_chunks` - Full chapters/sections
- `child_chunks` - Searchable paragraphs with embeddings
- `chat_messages` - Conversation history
- `parsing_corrections` - Active learning data

### Features:
- ✅ Row-Level Security (RLS) enabled
- ✅ Automatic user profile creation on signup
- ✅ Book count tracking
- ✅ Vector search support (pgvector)
- ✅ Soft delete for books
- ✅ Usage limit tracking

## Next Steps

After running the migrations:
1. Verify tables were created
2. Check that your user is set as admin
3. Test RLS policies
4. Start building the API!
