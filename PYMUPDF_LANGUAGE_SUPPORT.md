# PyMuPDF Language Support & Limitations

## Important Distinction First ⚠️

**PyMuPDF is NOT an OCR tool** - it extracts text from **native PDFs** that already have text layers embedded.

---

## How PyMuPDF Works

### ✅ **What PyMuPDF Does**:
- Extracts text from PDFs that have **selectable text** (native PDFs)
- Reads the text layer that's already embedded in the PDF
- Works with any language that's in the PDF's text layer

### ❌ **What PyMuPDF Does NOT Do**:
- Does NOT perform OCR (Optical Character Recognition)
- Does NOT read scanned images
- Does NOT extract text from image-based PDFs

---

## Language Support

### ✅ **Language Agnostic for Native PDFs**

PyMuPDF can extract text in **any language** from native PDFs because:
- It reads the text layer directly (not interpreting images)
- No language detection needed
- Works with Unicode text
- Supports all languages that PDF supports (virtually all)

**Supported Languages** (when PDF has text layer):
- ✅ English
- ✅ Chinese (Simplified & Traditional)
- ✅ Japanese
- ✅ Korean
- ✅ Arabic
- ✅ Hebrew (right-to-left)
- ✅ Russian
- ✅ All European languages
- ✅ **Any language with Unicode support**

### Example:

```python
import fitz  # PyMuPDF

# Extract text from Chinese PDF (if it has text layer)
doc = fitz.open("chinese_book.pdf")
text = ""
for page in doc:
    text += page.get_text()

# Works perfectly if PDF has Chinese text layer
print(text)  # 输出中文文本
```

---

## The Problem: Scanned PDFs

### ❌ **PyMuPDF CANNOT Handle Scanned PDFs**

**Scanned PDF = Image-based PDF**:
- PDF contains images of pages (not text)
- No text layer embedded
- PyMuPDF returns empty or garbled text

**Example**:
```python
# Scanned PDF (image-based)
doc = fitz.open("scanned_book.pdf")
text = page.get_text()
print(text)  # Returns: "" (empty) or garbled text
```

**Solution**: Use DeepSeek-OCR for scanned PDFs

---

## Language Support Comparison

### Native PDFs (Text Layer Present):

| Tool | Language Support | Notes |
|------|------------------|-------|
| **PyMuPDF** | ✅ **All languages** | Reads text layer directly |
| **DeepSeek-OCR** | ✅ 50+ languages | Performs OCR on images |

### Scanned PDFs (Image-Based):

| Tool | Language Support | Notes |
|------|------------------|-------|
| **PyMuPDF** | ❌ **None** | Cannot OCR images |
| **DeepSeek-OCR** | ✅ 50+ languages | Performs OCR, language-aware |

---

## How to Detect PDF Type

```python
def is_native_pdf(pdf_path: str) -> bool:
    """
    Check if PDF has text layer (native) or is scanned (image-based)
    """
    import fitz
    
    doc = fitz.open(pdf_path)
    page = doc[0]
    
    # Try to extract text
    text = page.get_text()
    
    # Check text density
    text_length = len(text.strip())
    
    # Check for images
    image_list = page.get_images()
    
    # Native PDF: Has substantial text
    if text_length > 100:
        return True
    
    # Scanned PDF: Little/no text, but has images
    if text_length < 50 and len(image_list) > 0:
        return False
    
    # Ambiguous: Check text density ratio
    text_blocks = page.get_text("blocks")
    if len(text_blocks) > 10:
        return True
    
    return False
```

---

## Traffic Light Classifier (Updated)

```python
def classify_pdf(pdf_path: str) -> dict:
    """
    Classify PDF and determine processing method
    """
    import fitz
    
    doc = fitz.open(pdf_path)
    page = doc[0]
    
    # Check 1: Is it native PDF?
    text = page.get_text()
    text_length = len(text.strip())
    
    # Check 2: Has images/diagrams?
    image_list = page.get_images()
    has_images = len(image_list) > 0
    
    # Check 3: Language detection (if needed)
    # PyMuPDF doesn't need this, but DeepSeek-OCR might benefit
    
    if text_length > 100 and not has_images:
        # Native PDF, text-only
        return {
            "type": "simple",
            "tool": "pymupdf",
            "language_agnostic": True,  # ✅ Works with any language
            "reason": "Native PDF with text layer"
        }
    elif text_length > 100 and has_images:
        # Native PDF with diagrams
        return {
            "type": "complex",
            "tool": "deepseek_ocr",  # For diagram extraction
            "language_agnostic": True,  # ✅ Works with any language
            "reason": "Native PDF with visual elements"
        }
    else:
        # Scanned PDF (image-based)
        return {
            "type": "scanned",
            "tool": "deepseek_ocr",
            "language_aware": True,  # DeepSeek detects language
            "reason": "Scanned PDF, needs OCR"
        }
```

---

## Real-World Examples

### Example 1: English Native PDF
```python
# English book (native PDF)
doc = fitz.open("english_book.pdf")
text = doc[0].get_text()
# ✅ Works perfectly
# Output: "Chapter 1: Introduction..."
```

### Example 2: Chinese Native PDF
```python
# Chinese book (native PDF)
doc = fitz.open("chinese_book.pdf")
text = doc[0].get_text()
# ✅ Works perfectly (if PDF has Chinese text layer)
# Output: "第一章：介绍..."
```

### Example 3: Scanned English PDF
```python
# Scanned English book (image-based)
doc = fitz.open("scanned_english_book.pdf")
text = doc[0].get_text()
# ❌ Returns empty or garbled
# Solution: Use DeepSeek-OCR
```

### Example 4: Scanned Chinese PDF
```python
# Scanned Chinese book (image-based)
doc = fitz.open("scanned_chinese_book.pdf")
text = doc[0].get_text()
# ❌ Returns empty or garbled
# Solution: Use DeepSeek-OCR (supports 50+ languages)
```

---

## Language Detection (If Needed)

### For Native PDFs:
- **Not needed** - PyMuPDF extracts text as-is
- Text is already in correct language/encoding

### For Scanned PDFs (DeepSeek-OCR):
- DeepSeek-OCR can detect language automatically
- Or you can specify: `language="zh"` for Chinese, `language="en"` for English
- Supports 50+ languages

---

## Recommendations

### ✅ **Use PyMuPDF When**:
1. PDF has text layer (native PDF)
2. Any language is fine (language agnostic)
3. No diagrams/complex layouts
4. Want free, fast extraction

### ✅ **Use DeepSeek-OCR When**:
1. PDF is scanned (image-based)
2. PDF has diagrams/charts
3. Complex layouts
4. Need OCR capabilities

### Language-Specific Considerations:

| Scenario | Tool | Language Support |
|---------|------|------------------|
| Native English PDF | PyMuPDF | ✅ Perfect |
| Native Chinese PDF | PyMuPDF | ✅ Perfect |
| Native Arabic PDF | PyMuPDF | ✅ Perfect |
| Scanned English PDF | DeepSeek-OCR | ✅ Perfect |
| Scanned Chinese PDF | DeepSeek-OCR | ✅ Perfect (50+ languages) |
| Scanned Arabic PDF | DeepSeek-OCR | ✅ Check language support |

---

## Summary

### ✅ **PyMuPDF is Language Agnostic for Native PDFs**

**For Native PDFs**:
- ✅ Works with **any language**
- ✅ No language detection needed
- ✅ Reads text layer directly
- ✅ Unicode support

**For Scanned PDFs**:
- ❌ Cannot extract text (not an OCR tool)
- ❌ Use DeepSeek-OCR instead
- ✅ DeepSeek-OCR supports 50+ languages

### Key Takeaway:

**PyMuPDF language support depends on PDF type**:
- **Native PDF** (text layer): ✅ **Any language** (language agnostic)
- **Scanned PDF** (image-based): ❌ **No language support** (not an OCR tool)

**Your traffic light classifier should**:
1. Check if PDF is native or scanned
2. Route native PDFs → PyMuPDF (any language, free)
3. Route scanned PDFs → DeepSeek-OCR (50+ languages, paid)

---

## Code Example: Language-Agnostic Extraction

```python
import fitz  # PyMuPDF

def extract_text_language_agnostic(pdf_path: str) -> str:
    """
    Extract text from native PDF - works with any language
    """
    doc = fitz.open(pdf_path)
    text = ""
    
    for page in doc:
        # Get text - works with any Unicode language
        page_text = page.get_text()
        text += page_text
    
    doc.close()
    return text

# Works with:
# - English: "Hello world"
# - Chinese: "你好世界"
# - Arabic: "مرحبا بالعالم"
# - Japanese: "こんにちは世界"
# - Any language with Unicode support
```

---

## Bottom Line

**Question**: Is PyMuPDF language agnostic?

**Answer**: 
- ✅ **YES for native PDFs** - Works with any language (reads text layer)
- ❌ **NO for scanned PDFs** - Not an OCR tool, cannot extract from images

**For your use case**:
- Native PDFs in any language → PyMuPDF (free, language agnostic)
- Scanned PDFs in any language → DeepSeek-OCR (paid, 50+ languages supported)

Your traffic light classifier handles this automatically! 🎯
