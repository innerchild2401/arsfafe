# Chat System Upgrade Implementation Plan

## Summary of Changes

Based on the evolution plan provided, I've started implementing the upgrades to transform the chat system from MVP to a high-fidelity "Knowledge Workbench." This document tracks what's been implemented and what remains.

## ✅ Completed

### Phase 2: Database Schema
- ✅ Created migration `008_hybrid_search.sql` with:
  - `tsvector` column for full-text search
  - GIN index for fast keyword search
  - Hybrid search function with RRF (Reciprocal Rank Fusion)
  - `chat_corrections` table for active learning loop
- ✅ Added reasoning model configuration to `config.py`
- ✅ Created `corrections_service.py` for active learning
- ✅ Created `chunk_utils.py` for persistent chunk IDs and parent context

### Phase 1: Path Detection
- ✅ Added reasoning intent detection (Analyze, Compare, Why, Connect)
- ✅ Updated path routing logic to include Path C

### Phase 2: Hybrid Search
- ✅ Started integration of hybrid search function
- ✅ Fixed syntax error in vector search try block

## 🚧 In Progress

### Phase 1: Path C (Deep Reasoner)
- Need to implement full Path C routing
- Use `reasoning_model` (GPT-4o) instead of `chat_model` for complex queries
- Update UI to show violet indicator for deep reasoning

### Phase 1: Investigator Prompt
- Need to upgrade system prompt to be active conflict detector
- Add explicit conflict detection instructions
- Make it ask user for clarification when conflicts found

### Phase 2: Parent Context Retrieval
- Need to use parent chunk text instead of child chunk for LLM context
- Helper function created, needs integration

### Phase 3: Persistent Citations
- Need to replace `[Ref: N]` with `#chk_xxxx` format
- Helper function created, needs integration in context building

### Phase 4: Corrections Check
- Need to query corrections before answering
- Inject corrections context into prompts
- Service created, needs integration

## 📋 Remaining Tasks

### High Priority
1. **Fix syntax error** in chat.py line 300 (try block indentation)
2. **Implement Path C** routing with reasoning model
3. **Update prompt** to "Investigator" mode with conflict detection
4. **Integrate parent context** retrieval in chunk processing
5. **Replace citations** with persistent chunk IDs
6. **Add corrections check** before generating responses

### Medium Priority
7. **Add corrections endpoint** for saving user feedback
8. **Update frontend** to support persistent citations
9. **Add "Fix" button** in UI for corrections
10. **Implement streaming citations** in frontend (future)

### Low Priority
11. **Add embedding column** to `chat_corrections` for better semantic matching
12. **Implement cross-book synthesis** (future)
13. **Add query expansion** (synonyms/related terms) (future)

## Implementation Notes

### Hybrid Search Function
The `match_child_chunks_hybrid` function uses:
- **Vector similarity**: Cosine distance with embedding
- **Keyword matching**: Full-text search with `tsvector` and `plainto_tsquery`
- **RRF (Reciprocal Rank Fusion)**: Combines both results with weights
- **Formula**: `1/(k + rank_vector) * vector_weight + 1/(k + rank_keyword) * keyword_weight`
- **Default weights**: 0.5 each (balanced)

### Parent-Child Context Strategy
- **Search**: Child chunks (paragraphs) - precise matching
- **Context**: Parent chunks (sections) - full context for LLM
- **Why**: Single paragraphs are often too fragmented; full sections provide flow

### Persistent Citation Format
- **Old**: `[Ref: 1]` (temporary, only valid for that response)
- **New**: `#chk_a1b2c3d4` (persistent, hash of chunk UUID)
- **Benefits**: 
  - Can be shared between users
  - Can link to exact paragraph in UI
  - Works across conversations

### Corrections Integration
- Query corrections before answering similar questions
- Inject corrections as context in system prompt
- Build trust by showing user we learned from their feedback

## Next Steps

1. Fix syntax error and test current implementation
2. Complete Path C implementation
3. Integrate all helper functions
4. Test end-to-end with real queries
5. Update frontend to support new features
