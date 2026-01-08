# Cost Estimate: GPT-4o-mini for 400 Pages Structure Extraction

## GPT-4o-mini Pricing (Current)

- **Input**: $0.15 per 1M tokens
- **Output**: $0.60 per 1M tokens

---

## Token Estimation

### Input Tokens (Text to Process)

**Conservative Estimate** (typical book page):
- 500 words/page × 1.33 tokens/word = **~665 tokens/page**
- 400 pages × 665 tokens = **266,000 tokens**

**Average Estimate** (dense text):
- 600 words/page × 1.33 tokens/word = **~800 tokens/page**
- 400 pages × 800 tokens = **320,000 tokens**

**High Estimate** (very dense text):
- 750 words/page × 1.33 tokens/word = **~1,000 tokens/page**
- 400 pages × 1,000 tokens = **400,000 tokens**

### Output Tokens (Structured JSON)

For hierarchical JSON structure (Document → Chapter → Section → Paragraph), output will include:
- JSON structure overhead (keys, brackets, etc.)
- Metadata (chapter titles, section titles, etc.)
- Potentially verbose formatting

**Conservative** (compact JSON): **10% of input** = ~27,000-40,000 tokens
**Average** (standard JSON): **15% of input** = ~40,000-60,000 tokens
**High** (verbose JSON with metadata): **20% of input** = ~53,000-80,000 tokens

---

## Cost Calculation

### Scenario 1: Conservative (266K input, 27K output)

**Input Cost**:
```
266,000 tokens ÷ 1,000,000 × $0.15 = $0.0399
```

**Output Cost**:
```
27,000 tokens ÷ 1,000,000 × $0.60 = $0.0162
```

**Total**: **$0.056** (~$0.06)

---

### Scenario 2: Average (320K input, 48K output) ⭐ **MOST LIKELY**

**Input Cost**:
```
320,000 tokens ÷ 1,000,000 × $0.15 = $0.048
```

**Output Cost**:
```
48,000 tokens ÷ 1,000,000 × $0.60 = $0.0288
```

**Total**: **$0.077** (~$0.08)

---

### Scenario 3: High (400K input, 80K output)

**Input Cost**:
```
400,000 tokens ÷ 1,000,000 × $0.15 = $0.06
```

**Output Cost**:
```
80,000 tokens ÷ 1,000,000 × $0.60 = $0.048
```

**Total**: **$0.108** (~$0.11)

---

## Summary

| Scenario | Input Tokens | Output Tokens | **Total Cost** |
|----------|--------------|---------------|----------------|
| Conservative | 266K | 27K | **$0.06** |
| **Average** ⭐ | **320K** | **48K** | **$0.08** |
| High | 400K | 80K | **$0.11** |

### **Most Likely Cost: ~$0.08 for 400 pages**

---

## Additional Considerations

### Batch Processing

If processing in batches (e.g., 10 pages at a time):
- **40 API calls** (10 pages each)
- Same total token count
- Same cost: **~$0.08**

### Per-Page Processing

If processing one page at a time:
- **400 API calls**
- Each call: ~800 input + ~120 output = 920 tokens
- Cost per page: ~$0.0002
- Total: **~$0.08** (same total, but more API overhead)

### Optimization Strategies

1. **Batch Multiple Pages**: Process 10-20 pages per API call to reduce overhead
2. **Compact Prompts**: Use concise system prompts to reduce input tokens
3. **Streaming**: Use streaming for large outputs (doesn't reduce cost, but improves UX)

---

## Cost Breakdown per Component

For your full pipeline (400 pages):

| Component | Cost |
|-----------|------|
| **DeepSeek-OCR API** (if used) | ~$4-20 (depends on pricing) |
| **GPT-4o-mini Structure Extraction** | **~$0.08** ⭐ |
| **GPT-4o-mini Topic Labeling** | ~$0.05-0.10 (estimate) |
| **OpenAI Embeddings** (text-embedding-3-large) | ~$0.10-0.15 |
| **Total** | **~$4.23-20.33** |

**Note**: Structure extraction is the **cheapest** part of your pipeline!

---

## Comparison with Alternatives

### GPT-4o (More Expensive)
- Input: $2.50 per 1M tokens
- Output: $10.00 per 1M tokens
- **Cost for 400 pages**: ~$1.33 (16× more expensive)

### GPT-4o-mini (Recommended) ⭐
- **Cost for 400 pages**: **~$0.08**

### DeepSeek Chat API (Alternative)
- Input: $0.30 per 1M tokens
- Output: $1.80 per 1M tokens
- **Cost for 400 pages**: ~$0.15 (almost 2× GPT-4o-mini)

---

## Real-World Example

**400-page book processing**:
- Text extraction: Free (PyMuPDF) or ~$4-20 (DeepSeek-OCR API)
- Structure extraction: **$0.08** (GPT-4o-mini)
- Topic labeling: ~$0.05-0.10
- Embeddings: ~$0.10-0.15

**Total**: **~$0.23-20.33** (depending on OCR choice)

**Very affordable!** 🎉

---

## Conclusion

**Estimated Cost for GPT-4o-mini to structure 400 pages into JSON: ~$0.08**

This is extremely cost-effective and represents a tiny fraction of your overall pipeline costs.
