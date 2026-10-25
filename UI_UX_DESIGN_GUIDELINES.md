# GYANAM AI Portal — UI/UX Design Guidelines & Theme Specification

This document provides complete design specifications for UI/UX designers and frontend developers working on the **GYANAM AI Portal**.

---

## 🏛️ Brand & Aesthetic Direction

GYANAM AI is engineered for High Court Judges, Advocates General, Judicial Registrars, and Legal Researchers.
The aesthetic direction combines:
1. **Sovereign Judicial Dignity**: Deep navy, polished parchment, subtle antique gold accents, and authoritative typography.
2. **Cutting-Edge AI Precision**: Glassmorphism cards, glowing status indicators, crisp data visualization, and micro-animations.

---

## 🎨 Color Palette & Design Tokens

### Primary Brand Palette
| Token Name | Hex Code | Tailwind Equivalent / Usage | Purpose |
|---|---|---|---|
| **Deep Court Navy** | `#0A192F` | `bg-slate-900 / dark:bg-[#0A192F]` | Primary application background, sidebar header |
| **Judicial Midnight** | `#070F1E` | `bg-[#070F1E]` | Deepest background layer, modal backdrops |
| **Parchment Cream** | `#F8F9FA` | `bg-slate-50 / text-stone-100` | Light mode surface / contrast text |
| **Antique Gold** | `#D97706` / `#F59E0B` | `amber-500 / amber-600` | Judicial seals, highlights, primary action buttons |
| **Sovereign Emerald** | `#10B981` | `emerald-500` | Verified citation badges, good law status |
| **Overruled Crimson** | `#EF4444` | `rose-500` | Overruled judgments, warning alerts, invalid citations |
| **Border Slate** | `#1E293B` | `border-slate-800` | Card borders, table dividers |

### Glassmorphism & Elevation
- **Cards**: `background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08);`
- **Floating Menus**: `box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);`

---

## 🔤 Typography

The portal relies on three complementary typefaces (loaded via Google Fonts in `<head>`):

1. **Heading Display**: `'Cinzel', serif`
   - Used for: Portal branding ("GYANAM AI"), judicial document titles, court seals, and high-level section headings.
   - Character: Classical, stately, engraved Roman judicial dignity.

2. **UI & Body Interface**: `'Outfit', sans-serif` (or `'Inter'`)
   - Used for: Primary UI navigation, search inputs, modal bodies, button text, table rows.
   - Character: Modern, hyper-legible, geometric sans-serif with excellent numerals.

3. **Monospace & Citations**: `'JetBrains Mono', monospace`
   - Used for: Citation codes (e.g. `(2023) 4 SCC 122`), FIR numbers, hash checksums, DPDP ledger timestamps.
   - Character: High readability, distinct punctuation, fixed-width tabular numbers.

---

## 🧩 Key UI Components in `frontend/index.html`

### 1. Unified Navigation Dock (Top Header & Tabs)
- Brand emblem: NLU Jodhpur seal + Ashoka emblem.
- Mode indicator: Live database status (1.18 Lakh judgments connected), latency badge (`<12ms`).
- Tab switcher: Seamless pill-style buttons with active glow rings (`ring-2 ring-amber-500/50`).

### 2. Intake & OCR Scanner (`#tab-intake`)
- Drag-and-drop zone with animated scanning beam for degraded handwritten FIRs.
- Dual-column comparison: Raw degraded scan on the left, OCR recognized & corrected legal text on the right.
- Highlighting for IPC / BNS section detection and accused/complainant entity tags.

### 3. Legal Research Hub (`#tab-research`)
- Search bar with instant autocomplete, filters for Court (SC / Delhi HC / Bombay HC / etc.), Bench strength, and Year range.
- Result cards featuring:
  - Case Title & Citation badge.
  - "Good Law" vs "Overruled" visual indicators.
  - Excerpt with keyword highlighting.
  - One-click "Add to Judgment Draft" action button.

### 4. Judgment Drafting Studio (`#tab-judgment`)
- Split-screen workspace: Left panel for Case Facts & FIR details; Right panel for Draft Judicial Order.
- Floating AI Toolbar: "Synthesize Ratio", "Check Precedents", "Insert Statutory Provisos", "Export Clean PDF".

### 5. Citation Lineage Graph (`#tab-citation-graph`)
- Interactive node-link precedence visualization.
- Green nodes = Good Law / Affirming; Red nodes = Overruled / Distinguished; Blue nodes = Foundational Constitutional Benches.

---

## 💡 Suggestions for UI/UX Redesign & Modernization

If you are looking to revamp or upgrade the UI/UX, here are high-impact areas to explore:

1. **Component Modularization**:
   - Split `index.html` into modern frontend components (e.g., React/Next.js, Vue/Nuxt, or SvelteKit) if you want strict type safety or reactive state stores.
2. **Micro-Interactions & Transitions**:
   - Add Framer Motion or Lucide-animated SVG icons for tab switching, search filtering, and document upload progress bars.
3. **Command Palette (`Cmd+K` / `Ctrl+K`)**:
   - Add a global command palette for quick searching of case law, jumping between tabs, or toggling dark/light themes.
4. **Rich Text Drafting Editor**:
   - Integrate TipTap, Lexical, or ProseMirror for WYSIWYG legal document drafting with footnote/citation insertion popups.
5. **Mobile & Tablet Responsive Polish**:
   - Optimize the split-view judgment studio into a swipeable tabbed interface on iPad/tablet screens (frequently used by judges in court chambers).
