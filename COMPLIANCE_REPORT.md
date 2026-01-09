# Design Compliance Report: "The Knowledge Cockpit"

## ✅ COMPLIANT

### I. Visual Manifesto
- ✅ **Dark Mode**: bg-zinc-950 (App Shell), bg-zinc-900 (Panels)
- ✅ **Borders**: border-zinc-800
- ✅ **Typography**: 
  - ✅ Inter (UI/Labels)
  - ✅ JetBrains Mono (Data/IDs)
  - ⚠️ **ISSUE**: AI responses use `font-serif` but CSS defines `Merriweather` - should be `Source Serif 4` per spec
- ✅ **Signal Colors**: Emerald/Amber/Rose/Violet properly implemented
- ✅ **Buttons**: Monochrome high-contrast (bg-zinc-100 text-zinc-900) ✓
- ✅ **Input Fields**: Underlined style ✓
- ✅ **Loading**: Shimmer effect ✓
- ✅ **Scrollbars**: Slim & dark (4px) ✓

### II. Desktop Layout
- ✅ **Navigation Rail**: 64px, expands on hover ✓
- ⚠️ **Pane 1 (Source)**: Library Grid exists, but **MISSING PDF Viewer**
- ⚠️ **Pane 2 (Editor)**: Chunks page exists, but **NOT a proper Workbench** (no merge/split/edit actions, no color-coded confidence borders)
- ✅ **Pane 3 (Assistant)**: Chat with Zorxido Orb ✓

### III. Mobile Layout
- ✅ **Base Layer**: Library exists ✓
- ⚠️ **Reader Layer**: Not implemented (should show text view when tapping book)
- ⚠️ **Overlay Layer**: Chat exists but **NO FAB** (should be floating action button with sparkles icon, glassmorphism drawer)

### IV. Customer Journey
- ✅ **Onboarding**: Radar scan animation ✓
- ✅ **Ingestion**: Terminal drawer ✓
- ⚠️ **Deep Read**: Tri-pane exists but **MISSING citation click handlers** (should scroll PDF and highlight chunks)
- ❌ **Teaching**: Active learning not implemented (no merge/split/edit with diff history)

### V. UI Component Specs
- ✅ **Input Fields**: Underlined ✓
- ✅ **Buttons**: Monochrome ✓
- ✅ **Loading**: Shimmer ✓
- ⚠️ **Tags/Badges**: Have background fills - should be **outline-only** per spec
- ✅ **Scrollbars**: Slim & dark ✓

## ❌ MISSING / NEEDS FIX

1. **Typography**: Change AI font from Merriweather to Source Serif 4
2. **PDF Viewer**: Add react-pdf component for Pane 1
3. **Chunk Inspector/Editor**: Convert chunks page to proper workbench with:
   - Color-coded borders (confidence-based)
   - Merge/Split/Edit actions
   - Diff history on hover
4. **Citation Click Handlers**: Make citations clickable to scroll PDF and highlight chunks
5. **Mobile FAB**: Add floating action button for chat drawer
6. **Badges**: Remove background fills, make outline-only
7. **Tri-Pane Layout**: Knowledge center should have 3 resizable panes (PDF/Editor/Chat)

## PRIORITY FIXES

### High Priority (Core Experience)
1. Fix typography (Source Serif 4 for AI)
2. Make badges outline-only
3. Add citation click handlers

### Medium Priority (Enhanced Experience)
4. Add PDF viewer component
5. Convert chunks page to proper workbench
6. Implement tri-pane layout

### Low Priority (Nice to Have)
7. Mobile FAB drawer
8. Active learning (merge/split/edit with diff history)