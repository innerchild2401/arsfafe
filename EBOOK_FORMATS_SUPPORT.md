# E-Book Formats: PDF vs EPUB Support

## Common E-Book Formats from Online Retailers

### ✅ **PDF** - Universal Format
- **Amazon**: ✅ Available (but not default)
- **Google Play Books**: ✅ Available
- **Apple Books**: ✅ Available
- **Kobo**: ✅ Available
- **Most retailers**: ✅ Available

### ✅ **EPUB** - Standard E-Book Format
- **Amazon**: ❌ Not directly (but can convert)
- **Google Play Books**: ✅ Default format
- **Apple Books**: ✅ Default format
- **Kobo**: ✅ Default format
- **Most retailers**: ✅ Default format

### ⚠️ **Amazon-Specific Formats**
- **AZW/AZW3**: Amazon Kindle proprietary
- **MOBI**: Older Kindle format
- **Note**: Amazon books are usually DRM-protected

---

## Format Breakdown by Retailer

### Amazon Kindle:
- **Primary**: AZW, AZW3, MOBI (DRM-protected)
- **PDF**: Available for some books (usually DRM-free)
- **EPUB**: Not directly, but can convert

### Google Play Books:
- **Primary**: EPUB
- **PDF**: Available

### Apple Books:
- **Primary**: EPUB
- **PDF**: Available

### Kobo:
- **Primary**: EPUB
- **PDF**: Available

### Other Retailers:
- **Most**: EPUB (default) + PDF (option)

---

## Your System: What to Support?

### ✅ **Must Support: PDF**
- Universal format
- Your current architecture handles this
- PyMuPDF + DeepSeek-OCR work with PDF

### ✅ **Should Support: EPUB**
- Very common format
- Different structure than PDF
- Needs different processing

### ❌ **Skip: Amazon Formats (AZW/MOBI)**
- DRM-protected (legal issues)
- Proprietary format
- Users can convert to PDF/EPUB

---

## EPUB vs PDF: Key Differences

### PDF:
- **Structure**: Fixed layout (like printed page)
- **Text Extraction**: Direct (if native) or OCR (if scanned)
- **Tools**: PyMuPDF, DeepSeek-OCR
- **Processing**: Page-by-page

### EPUB:
- **Structure**: Reflowable (like web page)
- **Text Extraction**: HTML/XML-based
- **Tools**: `ebooklib`, `epub2txt`, `pypandoc`
- **Processing**: Chapter-by-chapter (not page-by-page)

---

## EPUB Processing

### EPUB Structure:
```
book.epub (ZIP file)
├── META-INF/
├── OEBPS/
│   ├── content.opf (metadata)
│   ├── toc.ncx (table of contents)
│   └── chapters/
│       ├── chapter1.xhtml
│       ├── chapter2.xhtml
│       └── ...
└── mimetype
```

### Text Extraction from EPUB:

**Option 1: ebooklib** (Python)
```python
import ebooklib
from ebooklib import epub

def extract_epub_text(epub_path: str) -> str:
    book = epub.read_epub(epub_path)
    text = ""
    
    for item in book.get_items():
        if item.get_type() == ebooklib.ITEM_DOCUMENT:
            # Extract HTML content
            content = item.get_content().decode('utf-8')
            # Parse HTML to get text
            text += extract_text_from_html(content)
    
    return text
```

**Option 2: epub2txt** (Simpler)
```python
import epub2txt

def extract_epub_text(epub_path: str) -> str:
    text = epub2txt.extract_text(epub_path)
    return text
```

**Option 3: pypandoc** (Converts to Markdown)
```python
import pypandoc

def epub_to_markdown(epub_path: str) -> str:
    output = pypandoc.convert_file(epub_path, 'markdown')
    return output
```

---

## Updated Architecture: Support Both Formats

### Traffic Light Classifier (Enhanced):

```python
def classify_document(file_path: str) -> dict:
    """
    Classify document type and determine processing method
    """
    file_ext = file_path.lower().split('.')[-1]
    
    if file_ext == 'pdf':
        return classify_pdf(file_path)
    elif file_ext == 'epub':
        return classify_epub(file_path)
    else:
        raise ValueError(f"Unsupported format: {file_ext}")

def classify_epub(epub_path: str) -> dict:
    """
    EPUB processing - always use text extraction (no OCR needed)
    """
    return {
        "type": "epub",
        "tool": "ebooklib",  # or epub2txt
        "needs_ocr": False,  # EPUB always has text
        "processing": "chapter_by_chapter"
    }

def classify_pdf(pdf_path: str) -> dict:
    """
    PDF processing - existing logic
    """
    # Your existing traffic light classifier
    if is_simple_pdf(pdf_path):
        return {"type": "simple", "tool": "pymupdf"}
    else:
        return {"type": "complex", "tool": "deepseek_ocr"}
```

---

## Processing Pipeline (Updated)

### For PDF:
```
PDF Upload
    ↓
Traffic Light Classifier
    ↓
[Simple] → PyMuPDF → Text
[Complex] → DeepSeek-OCR → Markdown
    ↓
GPT-4o-mini → Structured JSON
    ↓
Parent-Child Chunking
```

### For EPUB:
```
EPUB Upload
    ↓
ebooklib/epub2txt → Extract Text (HTML/XML)
    ↓
Parse HTML → Plain Text (preserve structure)
    ↓
GPT-4o-mini → Structured JSON
    ↓
Parent-Child Chunking
```

**Note**: EPUB doesn't need OCR - it always has text!

---

## EPUB Advantages

### ✅ **Benefits of EPUB**:
1. **Always has text** - No OCR needed (free!)
2. **Better structure** - Chapters/sections already defined
3. **Metadata** - Title, author, TOC already available
4. **Cleaner text** - No OCR errors

### Example EPUB Structure:
```xml
<!-- chapter1.xhtml -->
<html>
  <head><title>Chapter 1: Introduction</title></head>
  <body>
    <h1>Chapter 1: Introduction</h1>
    <h2>Section 1.1: Background</h2>
    <p>This is the first paragraph...</p>
    <p>This is the second paragraph...</p>
  </body>
</html>
```

**Already structured!** Easier to parse than PDF.

---

## Cost Comparison

### PDF Processing:
- **Simple PDF**: $0 (PyMuPDF)
- **Complex PDF**: ~$0.01-0.05/page (DeepSeek-OCR)
- **400 pages**: $0 - $20

### EPUB Processing:
- **Always**: $0 (text extraction, no OCR)
- **400 pages**: $0

**EPUB is cheaper!** (No OCR costs)

---

## Implementation Recommendations

### Phase 1: **PDF Only** (Start Here)
- ✅ Your current architecture
- ✅ Handles most cases
- ✅ Simpler to implement

### Phase 2: **Add EPUB Support** (Later)
- ✅ Significant user benefit
- ✅ Lower costs (no OCR)
- ✅ Better structure extraction

---

## EPUB Processing Libraries

### Recommended: **ebooklib**
```python
pip install ebooklib
```

**Pros**:
- ✅ Full control
- ✅ Access to metadata, TOC
- ✅ Can preserve structure

**Cons**:
- ⚠️ More complex
- ⚠️ Need HTML parsing

### Alternative: **epub2txt**
```python
pip install epub2txt
```

**Pros**:
- ✅ Simple API
- ✅ One function call

**Cons**:
- ⚠️ Less control
- ⚠️ May lose some structure

### Alternative: **pypandoc**
```python
pip install pypandoc
```

**Pros**:
- ✅ Converts to Markdown
- ✅ Preserves structure well

**Cons**:
- ⚠️ Requires pandoc installation
- ⚠️ Heavier dependency

---

## Updated File Upload Handler

```python
from fastapi import UploadFile
import ebooklib
from ebooklib import epub

async def process_upload(file: UploadFile) -> dict:
    """
    Handle both PDF and EPUB uploads
    """
    file_ext = file.filename.split('.')[-1].lower()
    
    if file_ext == 'pdf':
        return await process_pdf(file)
    elif file_ext == 'epub':
        return await process_epub(file)
    else:
        raise ValueError(f"Unsupported format: {file_ext}")

async def process_epub(file: UploadFile) -> dict:
    """
    Process EPUB file
    """
    # Save temporarily
    temp_path = f"/tmp/{file.filename}"
    with open(temp_path, 'wb') as f:
        f.write(await file.read())
    
    # Extract text
    book = epub.read_epub(temp_path)
    text = extract_epub_text(book)
    
    # Structure with GPT-4o-mini (same as PDF)
    structured_json = await gpt4o_mini.structure(text)
    
    return structured_json
```

---

## Summary

### Formats You'll Encounter:

| Format | Source | Support Needed? | Processing |
|--------|--------|----------------|------------|
| **PDF** | Most retailers | ✅ **Yes** | PyMuPDF or DeepSeek-OCR |
| **EPUB** | Most retailers | ✅ **Yes** (add later) | ebooklib/epub2txt |
| **AZW/MOBI** | Amazon only | ❌ Skip (DRM) | Users convert to PDF/EPUB |

### Recommendations:

1. **Start with PDF** ✅
   - Your current architecture handles this
   - Most common format
   - Works with your traffic light classifier

2. **Add EPUB later** ✅
   - Very common format
   - Cheaper (no OCR)
   - Better structure extraction
   - Relatively easy to add

3. **Skip Amazon formats** ❌
   - DRM-protected
   - Legal issues
   - Users can convert

### Cost Impact:

- **PDF**: $0 - $20 for 400 pages (depends on complexity)
- **EPUB**: $0 for 400 pages (always free, no OCR)

**EPUB support is valuable!** Consider adding it in Phase 2. 🎯
