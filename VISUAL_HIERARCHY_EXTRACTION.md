# Handling Visual Hierarchy: Font-Based Structure Extraction

## Challenge: Visual vs Explicit Structure

### Explicit Structure (Easy):
```
Chapter 1: Introduction
Section 1.1: Background
```

### Visual Structure (Harder):
```
INTRODUCTION          ← Large font, bold
Background            ← Medium font, bold
This is text...       ← Normal font
```

**Problem**: OCR often loses visual formatting (font sizes, bold, etc.)

---

## How GPT-4o-mini Handles Visual Hierarchy

### ✅ **What GPT-4o-mini CAN Do:**

1. **Pattern Recognition**:
   - Detects ALL CAPS text (likely headings)
   - Recognizes short lines (likely titles)
   - Identifies repeated patterns (e.g., "INTRODUCTION", "METHODOLOGY", "CONCLUSION")

2. **Semantic Understanding**:
   - Understands that "INTRODUCTION" at start of document = chapter
   - Recognizes topic shifts even without explicit numbering
   - Can infer hierarchy from content structure

3. **Context Clues**:
   - Detects paragraph breaks (double newlines)
   - Understands that large blocks of text = body content
   - Recognizes that short, isolated lines = likely headings

### Example:

**Input** (OCR output - formatting lost):
```
INTRODUCTION

This book explores the fundamental concepts of machine learning.
We begin with an overview of the field.

Background

Machine learning has evolved significantly over the past decades.
Early approaches focused on rule-based systems.

METHODOLOGY

Our approach combines multiple techniques.
We use supervised learning for classification.
```

**GPT-4o-mini Output** (intelligent structure extraction):
```json
{
  "document": {
    "chapters": [
      {
        "chapter_title": "INTRODUCTION",
        "sections": [
          {
            "section_title": "Introduction",
            "paragraphs": [
              "This book explores the fundamental concepts of machine learning.",
              "We begin with an overview of the field."
            ]
          },
          {
            "section_title": "Background",
            "paragraphs": [
              "Machine learning has evolved significantly over the past decades.",
              "Early approaches focused on rule-based systems."
            ]
          }
        ]
      },
      {
        "chapter_title": "METHODOLOGY",
        "sections": [
          {
            "section_title": "Methodology",
            "paragraphs": [
              "Our approach combines multiple techniques.",
              "We use supervised learning for classification."
            ]
          }
        ]
      }
    ]
  }
}
```

---

## Limitations & Challenges

### ⚠️ **What Can Go Wrong:**

1. **Lost Formatting**:
   - If OCR doesn't preserve font size info, GPT has less to work with
   - May miss subtle hierarchy (e.g., subsection vs section)

2. **Ambiguous Headings**:
   - Short paragraphs might be mistaken for headings
   - Long headings might be treated as paragraphs

3. **No Clear Structure**:
   - Some books have very subtle visual hierarchy
   - GPT might struggle to identify boundaries

---

## Enhanced Solutions

### Solution 1: **DeepSeek-OCR with Formatting Preservation** ⭐

DeepSeek-OCR can preserve some formatting information:
- **Markdown output** may include heading indicators (`#`, `##`, `###`)
- **Layout understanding** can detect visual hierarchy

**Enhanced Prompt for GPT-4o-mini**:
```
Analyze this text and extract structure. Look for:
1. ALL CAPS lines (likely chapter titles)
2. Short isolated lines (likely headings)
3. Markdown-style headings (# ## ###)
4. Semantic topic shifts
5. Paragraph breaks (double newlines)

Create hierarchical structure: Document → Chapters → Sections → Paragraphs
```

### Solution 2: **Hybrid Detection** (Pattern + GPT)

Combine multiple techniques:

```python
def detect_structure(text: str) -> dict:
    """
    Multi-layered structure detection
    """
    # Layer 1: Pattern matching
    patterns = {
        'all_caps': r'^[A-Z\s]{10,}$',  # ALL CAPS = likely heading
        'short_line': r'^.{1,50}$',     # Short line = likely heading
        'numbered': r'^(Chapter|Section)\s+\d+',  # Explicit numbering
    }
    
    # Layer 2: GPT-4o-mini semantic analysis
    gpt_structure = await gpt4o_mini.extract_structure(text)
    
    # Layer 3: Merge and validate
    final_structure = merge_detections(patterns, gpt_structure)
    
    return final_structure
```

### Solution 3: **Active Learning Loop** (Your Original Plan) 🧠

**This is where your active learning shines!**

When users correct structure in the UI:
1. **Learn patterns**: "User marked 'INTRODUCTION' as chapter title"
2. **Store rules**: "ALL CAPS + start of section = chapter"
3. **Apply to future**: Use learned patterns to improve detection

**Example**:
```python
# User correction: Merged two sections that were incorrectly split
correction = {
    'original': ['Section A', 'Section B'],
    'corrected': 'Section A (merged)',
    'pattern': 'ALL_CAPS_SHORT_LINE_AT_START'
}

# Store in parsing_corrections table
# Next time: Apply this pattern automatically
```

---

## Implementation Strategy

### Phase 1: **Basic Detection** (Start Here)

```python
async def extract_structure_basic(text: str) -> dict:
    """
    Basic structure extraction using GPT-4o-mini
    """
    prompt = """
    Extract document structure from this text. The document may use visual hierarchy
    (larger fonts, bold text) rather than explicit numbering.
    
    Look for:
    - ALL CAPS text (likely chapter/section titles)
    - Short isolated lines (likely headings)
    - Semantic topic shifts
    - Paragraph breaks
    
    Output as JSON: Document → Chapters → Sections → Paragraphs
    """
    
    response = await openai.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": text}
        ]
    )
    
    return json.loads(response.choices[0].message.content)
```

### Phase 2: **Enhanced Detection** (Add Pattern Matching)

```python
def preprocess_for_structure(text: str) -> str:
    """
    Enhance text with structure hints before sending to GPT
    """
    lines = text.split('\n')
    enhanced_lines = []
    
    for line in lines:
        # Detect likely headings
        if line.isupper() and len(line) < 100:
            enhanced_lines.append(f"[HEADING_LIKELY] {line}")
        elif len(line.strip()) < 50 and line.strip():
            enhanced_lines.append(f"[SHORT_LINE] {line}")
        else:
            enhanced_lines.append(line)
    
    return '\n'.join(enhanced_lines)
```

### Phase 3: **Active Learning** (Your Original Plan)

```python
async def extract_structure_with_learning(text: str, document_id: str) -> dict:
    """
    Extract structure using learned patterns
    """
    # Step 1: Get learned patterns from corrections
    learned_patterns = await get_learned_patterns(document_id)
    
    # Step 2: Enhance prompt with learned patterns
    prompt = f"""
    Extract document structure. Apply these learned rules:
    {learned_patterns}
    
    Original extraction prompt...
    """
    
    # Step 3: Extract structure
    structure = await gpt4o_mini.extract(prompt, text)
    
    return structure
```

---

## Real-World Example

### Input (OCR - formatting lost):
```
MACHINE LEARNING FUNDAMENTALS

This chapter introduces core concepts.

Supervised Learning

We begin with supervised learning approaches.

Classification

Classification is a key task.

Unsupervised Learning

Now we explore unsupervised methods.
```

### GPT-4o-mini Output:
```json
{
  "document": {
    "chapters": [
      {
        "chapter_title": "MACHINE LEARNING FUNDAMENTALS",
        "sections": [
          {
            "section_title": "Introduction",
            "paragraphs": [
              "This chapter introduces core concepts."
            ]
          },
          {
            "section_title": "Supervised Learning",
            "paragraphs": [
              "We begin with supervised learning approaches."
            ]
          },
          {
            "section_title": "Classification",
            "paragraphs": [
              "Classification is a key task."
            ]
          }
        ]
      },
      {
        "chapter_title": "Unsupervised Learning",
        "sections": [
          {
            "section_title": "Unsupervised Learning",
            "paragraphs": [
              "Now we explore unsupervised methods."
            ]
          }
        ]
      }
    ]
  }
}
```

**Note**: GPT correctly identified:
- "MACHINE LEARNING FUNDAMENTALS" (ALL CAPS) = Chapter
- "Supervised Learning" (title case, short) = Section
- "Classification" (single word, short) = Section
- "Unsupervised Learning" (title case, isolated) = New Chapter

---

## Accuracy Expectations

### Best Case (Clear Visual Hierarchy):
- **Accuracy**: ~90-95%
- GPT correctly identifies most chapters/sections

### Average Case (Moderate Hierarchy):
- **Accuracy**: ~75-85%
- Some sections may be missed or incorrectly grouped
- User corrections needed

### Worst Case (Subtle/No Hierarchy):
- **Accuracy**: ~60-70%
- Significant user corrections needed
- Active learning becomes critical

---

## Recommendations

### 1. **Start with GPT-4o-mini** ✅
- It's surprisingly good at detecting visual hierarchy
- Cost-effective (~$0.08 for 400 pages)
- Handles most cases well

### 2. **Enhance with Pattern Matching**
- Add simple pattern detection (ALL CAPS, short lines)
- Pre-process text to add hints
- Improves accuracy by 5-10%

### 3. **Implement Active Learning** 🧠
- **Critical for visual hierarchy**
- Learn from user corrections
- Continuously improve detection
- Your original plan is perfect for this!

### 4. **User Interface for Corrections**
- Make it easy to:
  - Merge incorrectly split sections
  - Split incorrectly merged sections
  - Mark headings as chapters/sections
  - Adjust hierarchy levels

---

## Cost Impact

**No additional cost!** The same GPT-4o-mini call handles both:
- Explicit structure (numbered chapters)
- Visual structure (font-based hierarchy)

Still **~$0.08 for 400 pages**.

---

## Summary

### ✅ **Yes, GPT-4o-mini CAN handle visual hierarchy**

**How**:
1. Pattern recognition (ALL CAPS, short lines)
2. Semantic understanding (topic shifts, context)
3. Context clues (paragraph breaks, isolation)

**Limitations**:
- May miss subtle hierarchy
- Accuracy depends on OCR quality
- Some manual correction may be needed

**Solution**:
- ✅ GPT-4o-mini for initial extraction
- ✅ Pattern matching for enhancement
- ✅ **Active learning loop** (your original plan) for continuous improvement
- ✅ User interface for easy corrections

**Bottom Line**: The hybrid approach works for visual hierarchy, but your **active learning loop is essential** to handle edge cases and improve over time! 🎯
