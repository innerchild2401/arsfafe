# Arsfafe Design Principles: "The Cockpit"

## Design Philosophy

**Core Concept**: "The Cockpit" - A persistent, unified "App Shell" where users feel like they are in a single powerful tool, not navigating between disconnected pages.

**Current Problem**: Pages feel distinct and disconnected (Dashboard vs. Chat vs. Upload).

**New Goal**: A persistent, unified workspace with no "page jumps."

---

## Theme & Visual Identity

### Color Scheme
- **Background**: Dark Mode Only - `zinc-950`
- **Signal Color System** (replaces generic Blue/Red):
  - **Emerald-500 (Glow)**: Ready, Success, "Zorxido" Avatar
  - **Amber-500 (Pulse)**: Pending Approval, Processing Book
  - **Rose-500 (Solid)**: Error, Suspended
  - **Violet-500 (Deep)**: Admin features

### Typography
- **UI Text**: Inter (sans-serif)
- **Data/IDs**: JetBrains Mono (monospace)
- **AI Responses**: Serif font (Merriweather or Source Serif) to distinguish "Synthetic Wisdom" from UI data

---

## Phase 1: Structural Refactoring (The Layout)

### 1. The "App Shell" (Global Navigation)

**Rail Navigation** (collapsed sidebar on far left):
- **Width**: 64px (Icon only)
- **Expands on hover** to show labels
- **Items**:
  - 📚 Library (Dashboard)
  - ⚡ Quantum Chat (Knowledge Center)
  - 📤 Import (Upload)
  - 🧠 Memory (Chunks Inspector)
  - 🛡️ Control (Admin - conditional)

**Why**: Saves horizontal space for data, feels like VS Code.

---

### 2. Refactoring `/dashboard` → "The Library"

**Problem**: Stats cards take up too much prime real estate.

**Refactor**:
- **Header**: Move stats to a thin "Status Bar" at the very top (border-bottom)
- **Format**: `Ready: 12 Books | Processed: 45k Pages | Credits: 85%` (Monospace, small)
- **Main View**: Convert "Book Cards" into a **Data Grid (Table)**
- **Columns**: Status (Icon), Title, Author, Processed Chunks (Count), Last Chat, Actions
- **Visual**: Row hover reveals action buttons (Chat, Inspect, Delete) that are otherwise hidden to reduce noise

---

### 3. Refactoring `/knowledge-center` → "The Workbench"

**Problem**: It's a separate page.

**Refactor**:
- **Sidebar**: The "Book Selector" becomes a **Context Sidebar**
- **List**: "All Knowledge Base" (Top), followed by pinned/recent books
- **Visual**: Each book has a "Health Dot" (Green = Ready, Amber = Processing)
- **Chat Area**: Remove the "Bubbles"
- **Style**: Use "Thread View" (Slack/Discord style but cleaner)
  - **User**: Plain text, slightly brighter color
  - **Zorxido**: Markdown content, distinct background (e.g., `bg-zinc-900/50`), with a vertical colored line (accent color) on the left margin to denote "AI Response"

---

### 4. Refactoring `/admin` → "Mission Control"

**Refactor**:
- Merge "Pending" and "All Users" into one powerful table with **Tabs as filters**
- **Quick Actions**: Add "Toggle Switches" directly in the table rows for "Suspend" or "Approve" (don't bury them in menus)
- **Usage Graphs**: Replace big number cards with small "Sparkline" charts (micro-charts) to show activity trends over the last 7 days

---

## Phase 2: Visual Polish (The Skin)

### 1. Component Design

#### Inputs (Upload/Login)
- **Old**: Bordered box
- **New**: **Underlined Inputs**. Minimalist. When focused, the line glows Emerald.

#### Buttons
- **Primary**: `bg-zinc-100` (White) `text-zinc-900` (Black). High contrast.
- **Secondary**: `border border-zinc-800 hover:bg-zinc-800`

#### Badges/Tags (Status)
- Don't use solid fills. Use **Outlines + Glow**.
- **CSS**: `border-emerald-500/50 text-emerald-400 bg-emerald-500/10`

---

### 2. The "Zorxido" Persona

- **Avatar**: Instead of a static image, use a CSS-animated "Orb" or simple geometric shape that **pulses when generating text**
- **Typography**: AI response uses serif font to distinguish "Synthetic Wisdom" from UI's sans-serif "Data"

---

## Phase 3: The Experience (Micro-Interactions)

### 1. The Upload Experience ("The Task Runner")

When a book is uploaded, don't just show a spinner.

**Show a "Terminal Log" drawer at the bottom**

**Why**: It builds trust. The user sees the work happening.

---

### 2. The Chat Experience ("Streaming Thought")

#### Citations
- When Zorxido cites a source, render it as `[Ref: 12]`
- **Interaction**: Hovering this badge should pop up a "Glass Panel" tooltip showing the raw paragraph text instantly

#### Loading
- Replace "3 bouncing dots" with a **Shimmer Effect** on skeleton text lines. It feels faster.

---

### 3. The "Pending" Limbo

**Current**: "Auto-refreshes every 5 seconds."

**Refactor**:
- Remove the "Refresh" button
- Show a **Radar/Scan animation** (circles rippling out)
- **Text**: "Scanning for Admin clearance..."
- Use **WebSocket (Supabase Realtime)** to auto-redirect the millisecond they are approved. Surprise them with speed.

---

## Mobile Adaptation (Responsive)

### The "Stack" Navigation
- On Mobile, the Left Rail becomes a **Bottom Bar**

### Chat Mode
- The Input field is fixed to the bottom
- The "Library" is accessed via a swipe-down or a top-left icon

### Book Inspector
- The `/chunks` page is too dense for mobile
- On mobile, this button should likely be hidden or simplified to just "Show Topic Labels"

---

## Summary of Refactored Components to Build

1. **AppShell**: Wraps the whole app, handles the Rail Sidebar
2. **LibraryGrid**: Replaces the dashboard cards
3. **TerminalDrawer**: For showing upload/processing status
4. **QuantumChat**: The new chat interface with thread-style layout
5. **CitationTooltip**: The hover card for references

---

## Implementation Notes

- All pages should feel like views within the same app shell
- No full-page reloads or navigation jumps
- Consistent dark theme throughout
- Micro-interactions make the system feel alive
- Data-first approach: prioritize information density over decorative elements