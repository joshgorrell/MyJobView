# Proposal Luxury Canvas - Rivian-Level Design

## Philosophy
**"Quiet luxury, instant, expensive."**

This isn't software. This is the Rivian configurator for proposals. Every pixel matters. Every interaction whispers premium. When a salesperson opens it, they think "This is the best tool I've ever used." When a $750k client sees it, they think "These guys are the real deal."

---

## ✨ The Experience

### Top Bar (48px) - Off-White Elegance
**Background:** `#FAFAFA` (warm off-white)
**Border:** Hairline `#E5E5E5`

**Left:**
- **Proposal name** - Large, bold, inline editable
  - Hover → subtle color shift to `#0A1A2F`
  - Click → instant edit mode
  - Auto-width based on text length
- **Customer name** - Smaller, subtle `#666666`

**Center:**
- **Auto-save status** - "All changes saved • 3:45 PM"
- Subtle gray `#999999`, never demanding attention

**Right:**
- Settings gear (hover → `#F0F0F0` background)
- **"Share with Customer"** button
  - Deep navy `#0A1A2F` background
  - White text
  - Rounded corners
  - Hover → slightly darker `#0D2342`
- Three-dot menu

---

## 📄 Global Scope Section - Collapsible Cover Letter

**Default Height:** 128px (expanded)
**Collapsed:** 48px

**Interaction:**
- Click header to collapse/expand
- Chevron rotates 180° with smooth ease
- 300ms cubic-bezier(0.16, 1, 0.3, 1)

**Content:**
- Full-width textarea
- Placeholder: "Add project overview, scope of work, or special notes..."
- Border: `#E5E5E5`
- Focus ring: `#0A1A2F`
- Clean, minimal styling

---

## 🎯 The Grid - Full Power Canvas

### Table Structure

**Sticky Header:**
- Background: `#FAFAFA`
- Small uppercase labels: `#666666`
- Letter spacing: `tracking-wide`
- Stays at top during scroll

**Columns:**
| Column | Width | Align | Type |
|--------|-------|-------|------|
| Grip | 32px | - | Drag handle |
| Area | 192px | Left | Room name (gray) |
| Qty | 80px | Center | Editable number |
| Product/Description | Flex | Left | Bold + SKU subtitle |
| Cost | 112px | Right | Monospace, tabular |
| Margin % | 96px | Right | Color-coded |
| Sell Price | 128px | Right | Monospace |
| Total Sell | 128px | Right | Bold, monospace |

### Row Heights
- **Desktop:** 52px (perfect density)
- **Mobile:** 64px (touch-friendly)

### Area Headers
- **Height:** 64px
- **Background:** Deep navy `#0A1A2F`
- **Text:** White, semibold
- **Shadow:** Subtle
- Room name on left
- "+ Add Item" button on right (white/70 → white on hover)

### Normal Rows - The Magic
**Default:**
- Background: White
- Border: Hairline `#F0F0F0` bottom only

**Hover:**
```css
transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1)
transform: translateY(-1px)
background: rgba(10, 26, 47, 0.04) /* 4% navy tint */
box-shadow: subtle
```

**Selected (clicked):**
```css
background: rgba(10, 26, 47, 0.05)
border-left: 2px solid #0A1A2F
```

### Margin % Color Coding
- **≥40%:** Muted green `#227700`
- **25-39%:** Neutral `#666666`
- **<25%:** Warning red `#CC3300`

---

## 💎 Detail Card - The "Wow" Moment

### Slide-In Animation
**Width:** 380px
**Position:** Fixed, right edge
**Animation:** 240ms ease-out

```css
transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1)
transform: translateX(0) /* visible */
transform: translateX(100%) /* hidden */
```

### Behavior:
1. **Hover any row** → Card slides in from right
2. **Click row** → Card pins (stays open)
3. **Hover away** → Card slides out (unless pinned)
4. **Click selected row again** → Unpins, card slides out

### Card Structure:

**Hero Image (192px tall):**
- Edge-to-edge product photo
- Gradient fallback if no image
- Subtle shadow

**Content (scrollable):**
- Product name (large, bold `#111111`)
- SKU subtitle (`#999999`)
- 2-column grid: Quantity, Unit
- Pricing breakdown:
  - Cost per unit
  - Sell price (bold)
  - Margin % (green `#227700`)
- **Line Total** - Huge: 48px, bold, navy
- Close button (if pinned)

---

## 💰 The Money Bar - Three States

### State 1: Full (250px height)
**Tabs across top:**
- Overview | By Area | By Class | By Labor Phase
- Active tab: White with bottom border
- Inactive: White/60, hover → white

**Content:**
4-column grid, centered:
- Total Sell
- Total Cost
- Margin % (green)
- Profit (green)

Each:
- Small gray label (uppercase, tracked)
- Huge number (48px, bold, monospace)

### State 2: Compact (48px height)
Single row, left-aligned:
```
Total Sell $XX,XXX | Cost $XX,XXX | Margin XX% | Profit $X,XXX
```
- Small gray labels
- Bold white numbers
- Monospace font
- Up arrow button on right

### State 3: Hidden (0px)
Footer disappears completely.

**Floating button appears:**
- Bottom right corner
- "Show Totals" button
- Navy background
- Shadow + hover lift

### Cycling States:
Click arrow buttons to cycle: Compact → Full → Compact
Button in state 3 → Compact

---

## 🎨 Design System

### Colors
```css
--bg-primary: #FDFDFD      /* Warm off-white canvas */
--bg-secondary: #FAFAFA    /* Bars and headers */
--navy: #0A1A2F            /* Primary accent */
--navy-hover: #0D2342      /* Buttons hover */
--charcoal: #111111        /* Headings */
--body: #222222            /* Body text */
--gray: #666666            /* Secondary text */
--light-gray: #999999      /* Tertiary text */
--border: #E5E5E5          /* Hairlines */
--success: #227700         /* Muted green */
--success-light: #88DD66   /* Footer green */
--warning: #CC3300         /* Red for low margins */
```

### Typography
**Fonts:**
- Headings: Inter Display
- Body: Inter
- Numbers: Inter with `font-variant-numeric: tabular-nums`

**Sizes:**
- Tiny labels: 10px uppercase, tracked
- Small: 12px
- Body: 14px
- Large: 16px
- XL: 20px
- Display: 24px, 32px, 48px

### Spacing
Consistent 4px base grid:
- 8px, 12px, 16px, 24px, 32px, 48px

---

## ⚡ Animations - Apple Quality

### Timing Function
```css
cubic-bezier(0.16, 1, 0.3, 1)
```
**Never bounce. Never playful. Just confident, expensive motion.**

### Duration Guidelines
- Quick feedback: 150ms
- Standard transitions: 200ms
- Detail card slide: 240ms
- Footer state changes: 300ms
- Scope collapse: 300ms

### What Animates
✅ Row hover (transform + background)
✅ Detail card slide (transform)
✅ Footer height (height + opacity)
✅ Chevron rotations (transform)
✅ Button backgrounds (background-color)
✅ Number updates (scale + fade when values change)

❌ No spinners
❌ No loading skeletons
❌ No excessive motion

---

## 📱 Responsive

### Desktop (>1024px)
- Full layout as described
- Detail card slides from right
- All columns visible
- 52px row height

### Tablet (768px - 1024px)
- Larger touch targets (64px rows)
- Detail card becomes full-width panel
- Some columns hidden by default
- Footer compact by default

### Mobile (<768px)
- Grid becomes vertical card list
- Each item = card with all info
- Detail = full-screen sheet from bottom
- Frosted blur backdrop
- Big floating "+ Add Item" button bottom-right
- Footer always compact

---

## 🎹 Keyboard Shortcuts (Future)

- **Enter anywhere** → Universal search
- **Cmd/Ctrl + S** → Save (though auto-save handles it)
- **Cmd/Ctrl + F** → Product finder modal
- **Escape** → Close detail card
- **Tab** → Navigate fields
- **Arrow keys** → Navigate grid

---

## 🔍 Universal Search (Future Enhancement)

**Trigger:** Click anywhere or hit Enter

**Floating search box:**
- Centered on screen
- Instant dropdown results
- Fuzzy search products/rooms
- Arrow keys to navigate
- Enter to select

**Click magnifying glass:**
- Full-screen product finder modal
- Left: Filters (category, price, brand)
- Right: Thumbnail grid
- Compare mode toggle

---

## 🎯 The Feeling

### For Salespeople:
"This is the best tool I've ever used."
- Fast
- Beautiful
- Never in my way
- Makes me look good

### For $750k Clients:
"These guys are the real deal."
- Professional
- Confident
- Expensive feeling
- Trustworthy

### For Us:
"We built something worthy of the work we do."
- Premium positioning
- Differentiator
- Pride in craft
- Competitive advantage

---

## Summary

✅ **48px top bar** - Inline editable name, auto-save, share button
✅ **Collapsible scope section** - Rich text, smooth animation
✅ **Full-screen grid** - Perfect density, hover lift, color-coded margins
✅ **Area headers** - Navy background, bold, shadow
✅ **Detail card** - 380px, slides from right on hover, pins on click
✅ **Money Bar** - 3 states (full/compact/hidden), cycling arrows
✅ **Apple animations** - cubic-bezier(0.16,1,0.3,1), no bounce
✅ **Luxury colors** - Warm off-white, deep navy, muted green
✅ **Monospace numbers** - Tabular lining figures, perfect alignment
✅ **Hover interactions** - Lift 1px, subtle shadow, 4% navy tint

**Build Status:** ✅ Successful
**Ready for Prime Time:** ✅ Absolutely

This isn't a proposal builder. **It's a statement.**
