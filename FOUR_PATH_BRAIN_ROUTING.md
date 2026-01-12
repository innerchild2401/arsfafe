# Four-Path Brain Routing Strategy

## Overview

Zorxido uses a **Four-Path Brain Strategy** to intelligently route user queries to the most appropriate processing method based on intent detection. The routing happens in a **priority order** with keyword-based intent detection.

---

## The Routing Decision Tree

```
User Query
    ↓
[1] Name Question? → Direct Response (hardcoded)
    ↓ NO
[2] Meta Question? → Direct Response (fetch books list)
    ↓ NO
[3] Global Query (Path B)? → Use Pre-computed Summary
    ↓ NO
[4] Action Planner (Path D)? → Generate Structured Artifact
    ↓ NO
[5] Reasoning Query (Path C)? → Deep Analysis with GPT-4o
    ↓ NO
[6] Default (Path A) → Hybrid Search with GPT-4o-mini
```

---

## Path Priority & Execution Order

### Priority 1: Name Questions (Direct Response)
**Location:** `backend/app/routers/chat.py` lines ~180-220

**Detection:**
```python
name_questions = ["what is your name", "who are you", "what's your name", 
                  "what are you called", "tell me your name"]
is_name_question = any(question in user_message_lower for question in name_questions)
```

**Action:** Hardcoded response, no search, no model call
- **Response:** "Hello! I'm Zorxido, your AI assistant..."
- **Model:** None (direct response)
- **Speed:** Instant

---

### Priority 2: Meta Questions (Direct Response)
**Location:** `backend/app/routers/chat.py` lines ~2512-2582

**Detection:**
```python
meta_question_keywords = [
    "what books", "which books", "how many books", "list books", "books available",
    "books do you have", "books can you", "books can i", "books can access",
    "cearte carti", "care carti", "cate carti"  # Romanian translations
]
is_meta_question = any(keyword in user_message_lower for keyword in meta_question_keywords)
```

**Action:** Query database for user's accessible books, format list
- **Model:** None (direct database query)
- **Speed:** ~100-200ms (database query only)

---

### Priority 3: Path B (Global Query) - Pre-computed Summaries
**Location:** `backend/app/routers/chat.py` lines ~266-340 (non-streaming) and ~1737-1815 (streaming)

**Detection:**
```python
global_intent_keywords = [
    "summarize", "summarise", "summary", "overview", 
    "what is this book about", "what is the book about", "what was the book about",
    "what's this book about", "what's the book about", "what was this book about",
    "tell me about this book", "describe this book", "describe the book",
    "what does this book cover", "what does the book cover", "book summary",
    "what is it about", "what was it about", "what's it about"
]
is_global_query = any(keyword in user_message_lower for keyword in global_intent_keywords) 
                  and not is_reasoning_query 
                  and not is_action_planner_query
```

**Conditions:**
- ✅ Global query keywords detected
- ✅ NOT a reasoning query
- ✅ NOT an action planner query
- ✅ Single book selected (`len(book_ids) == 1`)

**Action:**
1. Query `books.global_summary` from database
2. If summary exists → Use it with GPT-4o-mini to format response
3. If summary missing → Fall back to Path A (chunk search)

**Model:** `gpt-4o-mini` (from `settings.chat_model`)
**Temperature:** 0.4 (deterministic)
**Speed:** ~1-2 seconds
**Cost:** Low (~$0.001-0.01 per query)

---

### Priority 4: Path D (Action Planner) - Structured Artifacts
**Location:** `backend/app/routers/chat.py` lines ~448-600 (non-streaming) and ~1820-2000 (streaming)

**Detection:**
```python
action_planner_keywords = [
    "plan", "schedule", "how to", "how do", "solve", "simulate", "simulation",
    "script", "routine", "checklist", "steps", "step-by-step", "guide me",
    "create a", "make a", "build a", "design a", "implement", "methodology",
    "framework", "process", "procedure", "workflow"
]
is_action_planner_query = any(keyword in user_message_lower for keyword in action_planner_keywords) 
                         and not is_reasoning_query
```

**Conditions:**
- ✅ Action planner keywords detected
- ✅ NOT a reasoning query (reasoning takes precedence)

**Action:**
1. Search for methodology chunks (prioritizes chunks with `action_metadata` tags)
2. Use GPT-4o to generate structured JSON artifact
3. Return artifact with `artifact_type` ('checklist' | 'notebook' | 'script')

**Model:** `gpt-4o` (from `settings.reasoning_model`)
**Temperature:** 0.3 (structured output)
**Speed:** ~3-5 seconds
**Cost:** Higher (~$0.05-0.15 per query)
**Output:** JSON artifact (not plain text)

---

### Priority 5: Path C (Deep Reasoner) - Complex Analysis
**Location:** `backend/app/routers/chat.py` lines ~700-900 (non-streaming) and ~2000-2200 (streaming)

**Detection:**
```python
reasoning_intent_keywords = [
    "analyze", "analyse", "analysis", "compare", "comparison", "contrast",
    "why", "how does", "how is", "how are", "what causes", "what leads to",
    "connect", "connection", "relationship", "relate", "correlate",
    "explain why", "what is the relationship", "what is the connection",
    "difference between", "similarities between", "distinguish"
]
is_reasoning_query = any(keyword in user_message_lower for keyword in reasoning_intent_keywords)
```

**Conditions:**
- ✅ Reasoning keywords detected
- ✅ Works with single or multiple books

**Action:**
1. **Single Book:** Hybrid search → GPT-4o for deep analysis
2. **Multiple Books (Map-Reduce):**
   - Fire parallel searches (one per book)
   - Get top chunks from each book
   - Feed both sets to GPT-4o with contrastive analysis prompt

**Model:** `gpt-4o` (from `settings.reasoning_model`)
**Temperature:** 0.5 (balanced for reasoning)
**Speed:** ~3-5 seconds (single book), ~5-8 seconds (multi-book)
**Cost:** Higher (~$0.05-0.15 per query)
**Chunks:** 15 (broader context for deep analysis)

---

### Priority 6: Path A (Specific Query) - Default Fallback
**Location:** `backend/app/routers/chat.py` lines ~900-1100 (non-streaming) and ~2060-2200 (streaming)

**Detection:** Default - catches everything that doesn't match other paths

**Action:**
1. Generate query embedding
2. Hybrid search (vector + keyword via RRF)
3. Retrieve top chunks
4. Use GPT-4o-mini to generate response with citations

**Model:** `gpt-4o-mini` (from `settings.chat_model`)
**Temperature:** 0.7 (balanced creativity)
**Speed:** ~2-4 seconds
**Cost:** Moderate (~$0.01-0.05 per query)
**Chunks:** 10-15 (depending on query type)

---

## Intent Detection Logic

### Keyword Matching Strategy

The system uses **simple keyword matching** (case-insensitive) on the lowercased user message:

```python
user_message_lower = chat_message.message.lower()
is_reasoning_query = any(keyword in user_message_lower for keyword in reasoning_intent_keywords)
```

**Important:** The order of checks matters because of exclusion rules:
- `is_global_query` excludes reasoning and action planner queries
- `is_action_planner_query` excludes reasoning queries
- `is_reasoning_query` is checked independently

### Exclusion Rules

1. **Global Query excludes Reasoning & Action Planner:**
   ```python
   is_global_query = ... and not is_reasoning_query and not is_action_planner_query
   ```

2. **Action Planner excludes Reasoning:**
   ```python
   is_action_planner_query = ... and not is_reasoning_query
   ```

3. **Reasoning has no exclusions** (highest priority for analysis)

---

## The "Brain" - Decision Flow

The "brain" is the **routing logic** that runs in this order:

### Non-Streaming Endpoint (`/api/chat`)
```python
# 1. Name question?
if is_name_question:
    return direct_response()

# 2. Global query (Path B)?
if is_global_query and len(book_ids) == 1:
    return use_precomputed_summary()

# 3. Action planner (Path D)?
if is_action_planner_query:
    return generate_artifact()

# 4. Reasoning query (Path C)?
if is_reasoning_query:
    return deep_analysis()

# 5. Default (Path A)
return hybrid_search()
```

### Streaming Endpoint (`/api/chat/stream`)
Same logic, but yields events instead of returning:
```python
# 1. Name question?
if is_name_question:
    yield direct_response()
    return

# 2. Meta question?
if is_meta_question:
    yield books_list()
    return

# 3. Global query (Path B)?
if is_global_query and len(book_ids) == 1:
    yield summary_response()
    return

# 4. Action planner (Path D)?
if is_action_planner_query:
    yield artifact_response()
    return

# 5. Reasoning query (Path C)?
if is_reasoning_query:
    yield reasoning_response()
    return

# 6. Default (Path A)
yield hybrid_search_response()
```

---

## Key Design Principles

1. **Priority-Based Routing:** Higher priority paths are checked first
2. **Keyword Detection:** Simple, fast keyword matching (no ML model needed)
3. **Exclusion Rules:** Prevents conflicts (e.g., "analyze" won't trigger global query)
4. **Fallback Strategy:** Path A always catches unmatched queries
5. **Cost Optimization:** Fast paths (B, A) use cheaper models; complex paths (C, D) use expensive models only when needed

---

## Examples

### Example 1: "What is this book about?"
- **Keywords:** "what is this book about" → matches `global_intent_keywords`
- **Path:** Path B (Global Query)
- **Model:** GPT-4o-mini
- **Action:** Use pre-computed summary

### Example 2: "Compare risk factors in Book A vs Book B"
- **Keywords:** "compare" → matches `reasoning_intent_keywords`
- **Path:** Path C (Deep Reasoner)
- **Model:** GPT-4o
- **Action:** Map-Reduce (parallel searches) → contrastive analysis

### Example 3: "How to create a sleep training schedule?"
- **Keywords:** "how to", "schedule" → matches `action_planner_keywords`
- **Path:** Path D (Action Planner)
- **Model:** GPT-4o
- **Action:** Search methodology chunks → generate checklist artifact

### Example 4: "What is the bond maturity date?"
- **Keywords:** None match (specific question)
- **Path:** Path A (Specific Query) - default fallback
- **Model:** GPT-4o-mini
- **Action:** Hybrid search → retrieve relevant chunks → generate response

### Example 5: "Analyze the relationship between X and Y"
- **Keywords:** "analyze", "relationship" → matches `reasoning_intent_keywords`
- **Path:** Path C (Deep Reasoner)
- **Model:** GPT-4o
- **Action:** Deep analysis with broader context

---

## Summary

The "brain" is a **rule-based routing system** that:
1. Detects intent via keyword matching
2. Routes to appropriate path based on priority
3. Uses different models and methods for different query types
4. Optimizes for speed and cost (cheap models for simple queries, expensive models only when needed)

The routing happens **synchronously** in a single function call, with clear priority order and exclusion rules to prevent conflicts.
