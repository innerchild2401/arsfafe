# Design System Documentation: "The Cockpit"

## Overview

This document describes the design elements, responsive patterns, and rendering strategies for both PC browsers and mobile devices in the Arsfafe knowledge management application. The design philosophy follows "The Cockpit" concept—a persistent, unified app shell that provides a consistent experience across all device sizes.

---

## Design Philosophy

**Core Concept**: "The Cockpit" - A persistent, unified App Shell where users feel like they're in a single powerful tool, not navigating between disconnected pages.

**Key Principles**:
- **Dark Mode Only**: Consistent dark theme throughout (`zinc-950` background)
- **Persistent Navigation**: Rail sidebar on desktop, bottom bar on mobile
- **Signal Color System**: Emerald/Amber/Rose/Violet instead of generic Blue/Red
- **Typography Hierarchy**: Inter (UI), JetBrains Mono (Data), Source Serif 4 (AI Responses)
- **Responsive by Default**: Mobile-first approach with progressive enhancement

---

## Color System

### Background Colors
- **App Shell**: `bg-zinc-950` (main background)
- **Panels/Cards**: `bg-zinc-900` or `bg-zinc-900/50` (semi-transparent panels)
- **Borders**: `border-zinc-800` (subtle separation)
- **Input Fields**: Transparent with underlined style

### Signal Colors (Semantic Colors)
- **Emerald-500**: Ready, Success, Primary actions, "Zorxido" avatar glow
- **Amber-500**: Pending approval, Processing, Warning states (with pulse animation)
- **Rose-500**: Error, Suspended, Destructive actions
- **Violet-500**: Admin features, Special states

### Text Colors
- **Primary Text**: `text-zinc-50` (high contrast)
- **Secondary Text**: `text-zinc-200` (medium contrast)
- **Muted Text**: `text-zinc-400` (low contrast, metadata)
- **Disabled Text**: `text-zinc-500` (lowest contrast)

---

## Typography System

### Font Families
1. **Inter** (Sans-serif) - UI text, labels, buttons
   - Applied via: `font-sans` (default)
   - Used for: Navigation, buttons, form labels, UI text

2. **JetBrains Mono** (Monospace) - Data, IDs, code
   - Applied via: `font-mono`
   - Used for: Book IDs, chunk IDs, citations (`#chk_xxxx`), metadata, status badges

3. **Source Serif 4** (Serif) - AI responses
   - Applied via: `font-serif`
   - Used for: Assistant messages, chunk text, quoted content
   - **Why**: Distinguishes "Synthetic Wisdom" from UI data

### Font Sizes
- **Text-xs**: `0.75rem` - Metadata, labels, timestamps
- **Text-sm**: `0.875rem` - Body text, button labels
- **Text-base**: `1rem` - Headings, important UI text
- **Text-lg**: `1.125rem` - Section headings
- **Text-xl**: `1.25rem` - Page titles

---

## Layout System

### Desktop Layout (≥768px / `md:` breakpoint)

#### App Shell Structure
```
┌─────────────────────────────────────────────────────────┐
│  Rail Navigation (64px)  │  Main Content Area (flex-1)  │
│  (Fixed, expands on      │                               │
│   hover to 256px)        │                               │
│                          │                               │
│  • Library               │  [Page Content]               │
│  • Quantum Chat          │                               │
│  • Import                │                               │
│  • Memory                │                               │
│  • Control (Admin)       │                               │
│                          │                               │
│  [Sign Out]              │                               │
└─────────────────────────────────────────────────────────┘
```

**Rail Navigation** (`components/AppShell.tsx`):
- **Default Width**: `w-16` (64px) - Icons only
- **Expanded Width**: `w-64` (256px) - Icons + labels
- **Behavior**: Expands on `onMouseEnter`, collapses on `onMouseLeave`
- **Position**: `md:relative` (fixed on mobile, relative on desktop)
- **Transition**: `transition-all duration-300 ease-in-out`

#### Knowledge Center Layout
```
┌─────────────────────────────────────────────────────────┐
│  Context Sidebar    │  Chat Area                        │
│  (320px fixed)      │  (flex-1)                         │
│                     │                                   │
│  [Book List]        │  [Messages Thread]                │
│                     │                                   │
│                     │  [Input Field]                    │
│                     │                                   │
│                     │  [Chunk Viewer Panel] (optional)  │
│                     │  (slides in from right)           │
└─────────────────────────────────────────────────────────┘
```

**Context Sidebar** (`components/ContextSidebar.tsx`):
- **Width**: `w-80` (320px)
- **Position**: `md:relative` (always visible on desktop)
- **Background**: `bg-zinc-900/50` (semi-transparent)
- **Border**: `border-r border-zinc-800`

**Chunk Viewer Panel** (`components/ChunkViewerPanel.tsx`):
- **Width**: `md:w-96 lg:w-[32rem]` (384px on medium, 512px on large)
- **Position**: `md:relative` (side-by-side with chat on desktop)
- **Behavior**: Slides in from right, overlays chat on mobile
- **Transition**: `transition-transform duration-300 ease-out`

### Mobile Layout (<768px)

#### App Shell Structure
```
┌─────────────────────────┐
│                         │
│                         │
│   Main Content Area     │
│   (Full width)          │
│                         │
│                         │
│                         │
│  [Rail Navigation]      │
│  (Fixed bottom bar)     │
└─────────────────────────┘
```

**Rail Navigation** (Mobile):
- **Position**: `fixed` at bottom (to be implemented)
- **Height**: ~56px
- **Behavior**: Icons only, horizontal layout
- **Current**: Fixed left sidebar (`fixed md:relative`) - needs mobile bottom bar implementation

#### Knowledge Center Layout (Mobile)
```
┌─────────────────────────┐
│ [☰] Header              │
├─────────────────────────┤
│                         │
│   Chat Messages         │
│   (Full width)          │
│                         │
│                         │
├─────────────────────────┤
│ Input Field             │
└─────────────────────────┘

[Sidebar Overlay] (when opened)
┌─────────────────────────┐
│ Context Sidebar         │
│ [X]                     │
│                         │
│ [Book List]             │
│                         │
└─────────────────────────┘
```

**Context Sidebar** (Mobile):
- **Position**: `fixed` (overlay)
- **Transform**: `-translate-x-full md:translate-x-0` (hidden by default, slides in)
- **Overlay**: `bg-black/50` backdrop when open
- **Z-index**: `z-50` (above content)
- **Transition**: `transition-transform duration-300 ease-in-out`

**Chunk Viewer Panel** (Mobile):
- **Position**: `fixed` (full-screen overlay)
- **Width**: `w-full` (100% on mobile)
- **Overlay**: `bg-black/50` backdrop
- **Transform**: `translate-x-full md:translate-x-0` (slides in from right)
- **Close**: Tap overlay or close button

---

## Component Patterns

### 1. AppShell (`components/AppShell.tsx`)

**Desktop Behavior**:
- Rail sidebar: `fixed md:relative`
- Width: `w-16` (collapsed), `w-64` (expanded on hover)
- Transitions: Smooth expand/collapse with CSS transitions

**Mobile Behavior**:
- Currently: Fixed left sidebar (needs bottom bar implementation)
- Should be: Bottom navigation bar with horizontal icon layout

**Code Pattern**:
```tsx
<aside className={cn(
  "fixed md:relative h-full z-50 bg-card border-r border-border",
  "transition-all duration-300 ease-in-out flex flex-col",
  sidebarExpanded ? 'w-64' : 'w-16'
)}>
```

### 2. QuantumChat (`components/QuantumChat.tsx`)

**Layout Structure**:
```
<div className="flex flex-1 h-full bg-zinc-950 overflow-hidden">
  <div className="flex-1 flex flex-col min-w-0">
    {/* Messages Area */}
    <div className="flex-1 overflow-y-auto overscroll-contain">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Thread-style messages */}
      </div>
    </div>
    {/* Input Area */}
  </div>
  {/* Chunk Viewer Panel */}
</div>
```

**Message Thread Pattern**:
- **User Messages**: Right-aligned (`justify-end`), `max-w-[75%]`
- **Assistant Messages**: Left-aligned (`justify-start`), `max-w-[85%]`
- **Avatar**: Zorxido Orb on left for assistant messages
- **Vertical Accent**: `w-0.5 bg-emerald-500/50` left border
- **Content Box**: `bg-zinc-900/50`, `border-l-2 border-emerald-500/30`

**Responsive Patterns**:
- **Panel Overlay**: `fixed md:relative` (overlay on mobile, side-by-side on desktop)
- **Panel Width**: `w-full md:w-96 lg:w-[32rem]`
- **Panel Transform**: `translate-x-full md:translate-x-0` (slides in on mobile)

### 3. ChunkViewerPanel (`components/ChunkViewerPanel.tsx`)

**Structure**:
```
<div className="h-full w-full md:w-96 lg:w-[32rem] bg-zinc-900">
  {/* Header */}
  {/* Scrollable Content */}
  <div className="flex-1 overflow-y-auto overscroll-contain">
    {/* Book Info */}
    {/* Parent Context */}
    {/* Child Chunk */}
  </div>
</div>
```

**Responsive Behavior**:
- **Desktop**: Side panel, fixed width (`md:w-96 lg:w-[32rem]`)
- **Mobile**: Full-screen overlay (`w-full`), slides in from right

### 4. CitationTooltip (`components/CitationTooltip.tsx`)

**Pattern**:
- **Citation Badge**: `border border-emerald-500/30`, `text-emerald-400`, `font-mono`
- **Hover Tooltip**: `absolute bottom-full`, glassmorphism (`bg-zinc-900/98 backdrop-blur-md`)
- **Tooltip Width**: `w-80 max-w-sm`
- **Z-index**: `z-50` (above content)

**Positioning**:
```tsx
<span className="relative inline-block">
  <button>{persistentId}</button>
  {isOpen && (
    <div className="absolute bottom-full left-0 mb-2 w-80 max-w-sm z-50">
      {/* Tooltip content */}
    </div>
  )}
</span>
```

### 5. ContextSidebar (`components/ContextSidebar.tsx`)

**Desktop**:
- Always visible: `md:relative`
- Fixed width: `w-80`
- Background: `bg-zinc-900/50`

**Mobile**:
- Overlay: `fixed`, `-translate-x-full md:translate-x-0`
- Controlled by parent state (`sidebarOpen`)
- Close button: `md:hidden` (only shown on mobile)

---

## Responsive Breakpoints

### Tailwind CSS Breakpoints
- **Default**: < 640px (mobile)
- **sm**: ≥ 640px (small tablets)
- **md**: ≥ 768px (tablets, desktop)
- **lg**: ≥ 1024px (large desktop)
- **xl**: ≥ 1280px (extra large)

### Common Patterns

**Show/Hide Based on Screen Size**:
```tsx
// Mobile only
className="md:hidden"

// Desktop only
className="hidden md:block"

// Conditional width
className="w-full md:w-80 lg:w-96"
```

**Flex Direction**:
```tsx
// Stack on mobile, row on desktop
className="flex flex-col md:flex-row"
```

**Position**:
```tsx
// Fixed on mobile, relative on desktop
className="fixed md:relative"

// Transform on mobile, normal on desktop
className="translate-x-full md:translate-x-0"
```

---

## Animation & Transitions

### CSS Transitions
- **Duration**: `duration-300` (300ms) - standard transitions
- **Easing**: `ease-in-out` or `ease-out`
- **Properties**: `transition-all`, `transition-transform`, `transition-colors`

### Keyframe Animations

**Shimmer Effect** (`app/globals.css`):
```css
@keyframes shimmer {
  0% { background-position: -1000px 0; }
  100% { background-position: 1000px 0; }
}
```
- Used for: Loading skeletons
- Duration: `2s infinite`
- Gradient: Zinc color transitions

**Zorxido Orb Pulse** (`app/globals.css`):
```css
@keyframes pulse-orb {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.05); }
}
```
- **Normal**: `2s ease-in-out infinite`
- **Active** (when generating): `0.8s ease-in-out infinite`

**Pulse Animation** (Tailwind):
- `animate-pulse` - Used for processing states (Amber dots)

---

## Interactive Elements

### Buttons
- **Style**: Monochrome high-contrast
- **Hover**: `hover:bg-accent/50`, `hover:text-foreground`
- **Active State**: `bg-accent`, `text-accent-foreground`
- **Transitions**: `transition-colors duration-200`

### Input Fields
- **Style**: Underlined (transparent background, bottom border)
- **Focus**: Ring highlight
- **Padding**: Minimal padding, focused on content

### Citations
- **Style**: `border border-emerald-500/30`, `text-emerald-400`
- **Hover**: `hover:bg-emerald-500/20`, `hover:border-emerald-500/50`
- **Glow**: `box-shadow: 0 0 8px rgba(16, 185, 129, 0.2)`
- **Click**: Opens ChunkViewerPanel

### Status Indicators
- **Ready**: `bg-emerald-400` (solid dot)
- **Processing**: `bg-amber-400 animate-pulse` (pulsing dot)
- **Error**: `bg-rose-400` (solid dot)
- **Unknown**: `bg-zinc-500` (solid dot)

---

## Scrollbar Styling

**Custom Scrollbars** (`app/globals.css`):
```css
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: rgb(24, 24, 27); /* zinc-900 */
}

::-webkit-scrollbar-thumb {
  background: rgb(63, 63, 70); /* zinc-700 */
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgb(82, 82, 91); /* zinc-600 */
}
```

**Characteristics**:
- **Width**: 8px (slim)
- **Colors**: Dark zinc tones
- **Hover**: Slightly lighter thumb
- **Border Radius**: Rounded corners

---

## Loading States

### Shimmer Skeleton
- **Pattern**: Gradient animation on gray rectangles
- **Usage**: Message loading, chunk loading, panel loading
- **Classes**: `shimmer`, `bg-zinc-800`

### Thinking Steps
- **Pattern**: Animated text with emoji spinner
- **Usage**: Shows search progress during streaming
- **Classes**: `animate-pulse`, `animate-spin`

### Zorxido Orb
- **Pattern**: Pulsing circle animation
- **States**:
  - **Idle**: Slow pulse (`2s`)
  - **Active** (generating): Fast pulse (`0.8s`)

---

## Z-Index Hierarchy

- **Base Content**: `z-0` (default)
- **Fixed Sidebar** (mobile): `z-50`
- **Overlay Backdrop**: `z-40`
- **Panel/Sidebar**: `z-50`
- **Tooltip/Citation**: `z-50`
- **Modal/Dialog**: `z-60` (if implemented)

---

## Spacing System

### Tailwind Spacing Scale
- **Padding/Margin**: `p-2`, `p-4`, `p-6`, `p-8` (0.5rem, 1rem, 1.5rem, 2rem)
- **Gaps**: `gap-2`, `gap-4`, `gap-6` (for flex/grid)

### Common Patterns
- **Section Padding**: `px-6 py-8` (horizontal 1.5rem, vertical 2rem)
- **Card Padding**: `p-4` (1rem all around)
- **Compact Padding**: `px-3 py-2` (0.75rem horizontal, 0.5rem vertical)
- **Message Spacing**: `space-y-6` (1.5rem between messages)

---

## Border Radius

- **Default**: `rounded-lg` (0.5rem) - cards, panels, buttons
- **Small**: `rounded` (0.25rem) - badges, small elements
- **Large**: `rounded-xl` (0.75rem) - special cases
- **Full**: `rounded-full` - avatars, status dots

---

## Shadow System

- **Subtle**: `shadow-sm` - subtle elevation
- **Standard**: `shadow` - cards, panels
- **Large**: `shadow-2xl` - modals, overlays
- **Custom Glow**: `box-shadow: 0 0 8px rgba(16, 185, 129, 0.2)` - citation badges

---

## Accessibility Considerations

### Color Contrast
- All text meets WCAG AA standards (4.5:1 ratio)
- Primary text: High contrast (`text-zinc-50` on `bg-zinc-950`)
- Muted text: Lower contrast but still readable

### Interactive Elements
- **Focus States**: Visible focus rings on keyboard navigation
- **Hover States**: Clear visual feedback
- **Touch Targets**: Minimum 44x44px on mobile

### Semantic HTML
- Proper heading hierarchy (`h1`, `h2`, `h3`)
- Button elements for clickable actions
- ARIA labels where appropriate (`aria-label`)

---

## Implementation Notes

### CSS-in-JS
- **Framework**: Tailwind CSS (utility-first)
- **Custom Styles**: `app/globals.css` for animations and global styles
- **CSS Variables**: HSL color system for theme customization

### Component Structure
- **Pattern**: Client components (`"use client"`) for interactivity
- **State Management**: React hooks (`useState`, `useEffect`)
- **Responsive Logic**: Tailwind breakpoint classes (`md:`, `lg:`)

### Performance Considerations
- **Transitions**: Hardware-accelerated (`transform`, `opacity`)
- **Overscroll**: `overscroll-contain` prevents scroll chaining
- **Lazy Loading**: Images and heavy components loaded on demand

---

## Mobile-Specific Patterns (Implemented)

### 1. Bottom Navigation Bar (`components/BottomNav.tsx`)

**Implementation**: ✅ Implemented

**Behavior**:
- **Mobile Only**: `md:hidden` (hidden on desktop)
- **Position**: `fixed bottom-0 left-0 right-0`
- **Height**: `h-16` (64px)
- **Style**: `bg-zinc-950/90 backdrop-blur-md border-t border-zinc-800`
- **Layout**: Horizontal flex with `justify-around` for equal spacing
- **Items**: 3-4 icons max (Library, Upload, Profile)
- **Active State**: `text-emerald-400` (active), `text-zinc-400` (inactive)
- **Z-index**: `z-50` (above content)

**Code Pattern**:
```tsx
<nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-950/90 backdrop-blur-md border-t border-zinc-800 flex justify-around items-center z-50">
  {navItems.map((item) => (
    <Link href={item.path} className="flex flex-col items-center">
      <Icon className="w-5 h-5 mb-1" />
      <span className="text-xs font-medium">{item.label}</span>
    </Link>
  ))}
</nav>
```

### 2. Desktop Rail Navigation (Hidden on Mobile)

**Implementation**: ✅ Updated

**Behavior**:
- **Desktop Only**: `hidden md:flex` (hidden on mobile)
- **Mobile**: Completely hidden, replaced by BottomNav
- **Desktop**: Same as before (64px collapsed, 256px expanded on hover)

**Code Pattern**:
```tsx
<aside className="hidden md:flex h-full z-50 bg-card border-r border-border">
  {/* Desktop navigation */}
</aside>
```

### 3. Library Feed List (Mobile)

**Implementation**: ✅ Implemented

**Desktop**: Table grid with multiple columns (Status, Title, Author, Chunks, Last Chat, Actions)

**Mobile**: Feed list with minimal information:
- **Layout**: `md:hidden` (hidden on desktop)
- **Structure**: Vertical list with `divide-y divide-zinc-900`
- **Rows**: `h-16` (64px) full-width rows
- **Content**: Status dot (left) + Title (center) + Chevron (right)
- **Hidden on Mobile**: Author, Chunks count, Last Chat date, Action buttons
- **Interaction**: Tap row to navigate to chat page

**Code Pattern**:
```tsx
{/* Desktop: Table */}
<div className="hidden md:block">
  <table>{/* Table content */}</table>
</div>

{/* Mobile: Feed List */}
<div className="md:hidden bg-zinc-950">
  <div className="divide-y divide-zinc-900">
    {books.map((book) => (
      <Link className="flex items-center h-16 px-4">
        <StatusDot />
        <Title className="flex-1" />
        <Chevron />
      </Link>
    ))}
  </div>
</div>
```

### 4. Floating Action Button (FAB) for Chat

**Status**: ⚠️ Not yet implemented (Future Enhancement)

**Planned Behavior**:
- **Position**: `fixed bottom-20 right-4` (above BottomNav, 80px from bottom)
- **Size**: `h-14 w-14` (56px × 56px)
- **Style**: `bg-emerald-500 rounded-full shadow-lg shadow-emerald-500/20`
- **Icon**: Sparkles or Message icon
- **Visibility**: Only on document/chunk pages (`md:hidden` - mobile only)
- **Interaction**: Opens chat drawer/sheet (85vh height)
- **Z-index**: `z-50` (same as BottomNav)

**Planned Code Pattern**:
```tsx
{/* FAB - Mobile Only, on Document Pages */}
<button className="md:hidden fixed bottom-20 right-4 h-14 w-14 bg-emerald-500 rounded-full z-50 flex items-center justify-center shadow-lg shadow-emerald-500/20">
  <SparklesIcon className="w-6 h-6 text-zinc-950" />
</button>
```

### 5. Chat Drawer (Future Enhancement)

**Status**: ⚠️ Not yet implemented

**Planned Behavior**:
- **Component**: Shadcn UI Drawer component
- **Height**: `85vh` (leaving top 15% visible for context)
- **Interaction**: Opens from FAB tap
- **Citation Click**: When citation is tapped, drawer minimizes to small bar at bottom
- **Style**: Glassmorphism with backdrop blur

---

## Responsive Patterns Summary

### Show/Hide Patterns

**Desktop-Only Components**:
```tsx
className="hidden md:block"  // Hidden on mobile, visible on desktop
className="hidden md:flex"   // Hidden on mobile, flex on desktop
```

**Mobile-Only Components**:
```tsx
className="md:hidden"        // Visible on mobile, hidden on desktop
className="block md:hidden"  // Block on mobile, hidden on desktop
```

**Conditional Rendering**:
```tsx
{/* Desktop Table */}
<div className="hidden md:block">{/* Desktop content */}</div>

{/* Mobile Feed */}
<div className="md:hidden">{/* Mobile content */}</div>
```

### Layout Patterns

**Fixed Positioning**:
- **Mobile**: `fixed bottom-0` (BottomNav)
- **Desktop**: `relative` or `fixed` depending on context

**Main Content Padding**:
```tsx
className="pb-16 md:pb-0"  // Bottom padding on mobile (for BottomNav), none on desktop
```

**Navigation**:
- **Mobile**: Bottom tab bar (`fixed bottom-0`)
- **Desktop**: Left rail sidebar (`fixed md:relative`)

---

## Future Enhancements

### Still Needed
- **FAB**: Floating Action Button for chat on document pages (mobile only)
- **Chat Drawer**: Sheet/Drawer component for mobile chat interface
- **Segmented Control**: Source PDF vs Parsed Text toggle on reader pages

### Responsive Improvements
- **Tablet Optimization**: Better use of medium breakpoint (768px-1024px)
- **Large Screen**: Multi-column layouts for extra-large screens (≥1280px)

### Animation Enhancements
- **Page Transitions**: Smooth transitions between routes
- **Micro-interactions**: More refined hover/focus animations
- **Drawer Animations**: Slide-in/out animations for mobile drawers

---

## Summary

The design system follows a **mobile-first, progressive enhancement** approach:

1. **Base Styles**: Optimized for mobile (< 768px)
   - Bottom navigation bar
   - Feed-style lists
   - Full-width layouts
   - Touch-optimized interactions

2. **Desktop Enhancement**: Additional features/layouts for `md:` breakpoint (≥ 768px)
   - Left rail sidebar
   - Table grids
   - Multi-pane layouts
   - Hover interactions

3. **Large Screen**: Further optimizations for `lg:` breakpoint (≥ 1024px)
   - Wider panels
   - More columns
   - Enhanced spacing

**Key Patterns**:
- **Navigation**: `hidden md:flex` (desktop rail) + `md:hidden` (mobile bottom bar)
- **Layouts**: `hidden md:block` (desktop table) + `md:hidden` (mobile feed)
- **Fixed/relative positioning switch**: `fixed md:relative`
- **Transform-based animations**: `translate-x-full md:translate-x-0`
- **Conditional visibility**: `hidden md:block`, `md:hidden`
- **Responsive width**: `w-full md:w-80 lg:w-96`
- **Content padding**: `pb-16 md:pb-0` (for bottom nav)

**Mobile-First Philosophy**:
- **Don't squeeze desktop layouts into mobile**
- **Hide desktop components entirely on mobile** (`hidden md:flex`)
- **Show mobile-specific components** (`md:hidden`)
- **Separate layouts, not responsive resize**

**Consistency**: All components follow the same responsive patterns, ensuring a cohesive experience across all device sizes with native-app feel on mobile.
