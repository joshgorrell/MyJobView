# Dark Slate & Cyan Premium Theme

A sophisticated dark theme featuring deep slate backgrounds with vibrant cyan and purple accents. This theme creates a premium, modern aesthetic perfect for professional applications.

## Color Palette

### Background Colors
```
Main Background: bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900
Card Background: bg-gray-900/50 backdrop-blur-sm
Card Alternative: bg-gray-800/50 backdrop-blur-sm
Hover States: hover:bg-gray-700
Input Fields: bg-gray-800
```

### Border Colors
```
Primary Border: border-purple-500/30
Active Border: border-cyan-400
Hover Border: hover:border-purple-500/50
Input Border: border-gray-700
```

### Accent Colors
```
Primary Accent: Cyan (#06B6D4)
  - from-cyan-400, to-cyan-600
  - text-cyan-400
  - ring-cyan-500
  - shadow-cyan-500/50

Secondary Accent: Blue (#3B82F6)
  - from-blue-400, to-blue-600
  - text-blue-400

Tertiary Accent: Purple (#A855F7)
  - from-purple-400, to-purple-600
  - text-purple-400
  - via-purple-900

Success: Green (#10B981)
  - text-green-400
  - bg-green-500/20
  - border-green-500/30

Warning/Alert: Orange (#F59E0B)
  - text-orange-400
  - bg-orange-500/20

Error/Urgent: Red (#EF4444)
  - text-red-400
  - bg-red-500/20
  - border-red-500/50

Info: Yellow (#FACC15)
  - text-yellow-400
  - bg-yellow-500/20
```

### Text Colors
```
Primary Text: text-white
Secondary Text: text-gray-300
Tertiary Text: text-gray-400
Muted Text: text-gray-500
Disabled Text: text-gray-600
```

## Gradients

### Button Gradients
```
Primary Button: bg-gradient-to-r from-cyan-500 to-blue-600
Primary Button Hover: hover:from-cyan-600 hover:to-blue-700

Full Gradient Button: bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600
Full Gradient Hover: hover:from-cyan-600 hover:via-blue-700 hover:to-purple-700

Text Gradient (Headings): bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent
```

### Background Gradients
```
Main App Background: bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900
Loading Screen: bg-gradient-to-br from-violet-900 via-purple-900 to-fuchsia-900
Error State: bg-gradient-to-br from-red-900 via-orange-900 to-pink-900
```

## Component Styles

### Cards
```css
Standard Card:
  - bg-gray-900/50 backdrop-blur-sm
  - rounded-xl
  - border border-purple-500/30
  - p-6

Hover Card:
  - hover:shadow-lg
  - transition-all
  - hover:border-purple-500/50

Nested Card:
  - bg-gray-800/50 backdrop-blur-sm
  - rounded-lg
  - border border-purple-500/30
  - p-4
```

### Buttons

#### Primary Button
```css
px-4 py-2
bg-gradient-to-r from-cyan-500 to-blue-600
text-white
rounded-lg
hover:shadow-lg hover:shadow-cyan-500/50
transition-all
font-medium
disabled:opacity-50
```

#### Full Gradient Button
```css
px-4 py-2
bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600
text-white
rounded-lg
hover:shadow-lg hover:shadow-blue-500/50
transition-all
font-medium
```

#### Secondary Button
```css
px-4 py-2
bg-gray-800
text-white
rounded-lg
hover:bg-gray-700
transition-all
border border-gray-700
```

#### Icon Button
```css
p-2
text-gray-400
hover:text-white
hover:bg-gray-800
rounded-lg
transition-colors
```

### Tabs Navigation
```css
Active Tab:
  - text-cyan-400 (or text-purple-400, text-blue-400, text-green-400, text-orange-400)
  - border-b-2 border-cyan-400
  - shadow-lg shadow-cyan-500/20

Inactive Tab:
  - text-gray-400
  - hover:text-white
```

### Form Inputs
```css
Input Field:
  - w-full
  - px-4 py-2 (or py-3 for larger)
  - bg-gray-800
  - border border-gray-700
  - text-white
  - rounded-lg
  - focus:ring-2 focus:ring-cyan-500 (or purple-500)
  - focus:border-transparent
  - placeholder-gray-500

Textarea:
  - Same as input
  - resize-none (optional)
  - min-h-[100px] or similar
```

### Badges/Tags
```css
Status Badge:
  - px-2 py-1
  - rounded
  - font-medium
  - text-xs
  - bg-{color}-500/20
  - text-{color}-400
```

### Shadows
```css
Standard Shadow: shadow-2xl
Card Hover: hover:shadow-lg
Button Hover: hover:shadow-lg hover:shadow-cyan-500/50
Glow Effect: shadow-lg shadow-cyan-500/20 (for active states)
```

### Backdrop Effects
```css
backdrop-blur-sm (for cards)
backdrop-blur-xl (for modals)
```

### Modal Overlay
```css
Overlay:
  - fixed inset-0
  - bg-black bg-opacity-50
  - z-50

Modal Container:
  - bg-gray-900
  - rounded-xl
  - shadow-2xl
  - border border-purple-500/30
```

## Typography

### Headings
```css
H1 (Page Title):
  - text-2xl sm:text-3xl
  - font-bold
  - text-white or gradient text
  - bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent

H2 (Section Title / Dashboard Title):
  - text-xl sm:text-2xl (responsive sizing)
  - font-bold
  - text-white (NEVER use text-gray-900 on dark backgrounds)
  - Pattern: <h2 className="text-xl sm:text-2xl font-bold text-white">Title</h2>

H3 (Card Title):
  - text-lg sm:text-xl
  - font-semibold
  - text-white

H4 (Item Title):
  - text-base
  - font-medium
  - text-white

Page Header with Subtitle (Standard Pattern):
  Structure:
    <div>
      <h2 className="text-xl sm:text-2xl font-bold text-white">Dashboard Title</h2>
      <p className="text-gray-300">Descriptive subtitle text</p>
    </div>

  Subtitle Rules:
    - ALWAYS use text-gray-300 (NEVER text-gray-600)
    - No text-sm class (use default size)
    - No mt-1 spacing (handled by parent layout)
    - Examples: "Real-time field operations overview", "Track your performance"
```

### Body Text
```css
Regular: text-gray-300
Small: text-sm text-gray-400
Extra Small: text-xs text-gray-500
```

## Spacing

```
Container Padding: px-4 sm:px-6 lg:px-8 py-4 sm:py-8
Card Padding: p-4 sm:p-6
Section Spacing: space-y-4 (or space-y-6)
Element Spacing: gap-2, gap-3, gap-4
```

## Border Radius

```
Small: rounded-lg (8px)
Medium: rounded-xl (12px)
Large: rounded-2xl (16px)
Full: rounded-full
```

## Transitions

```
Standard: transition-all
Colors Only: transition-colors
Duration: (default 150ms is fine)
```

## Usage Examples

### Full Page Layout
```jsx
<div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
  <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
    {/* Content */}
  </main>
</div>
```

### Card Component
```jsx
<div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/30 hover:shadow-lg hover:border-purple-500/50 transition-all">
  {/* Card content */}
</div>
```

### Primary Action Button
```jsx
<button className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all font-medium">
  Click Me
</button>
```

### Form Input
```jsx
<input
  type="text"
  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent placeholder-gray-500"
  placeholder="Enter value..."
/>
```

### Tab Navigation
```jsx
<button className={`px-4 py-3 font-medium transition-all ${
  isActive
    ? 'text-cyan-400 border-b-2 border-cyan-400 shadow-lg shadow-cyan-500/20'
    : 'text-gray-400 hover:text-white'
}`}>
  Tab Name
</button>
```

## Tailwind Config Extension

Add this to your `tailwind.config.js` for custom colors:

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0f172a',
          card: '#1e293b',
          hover: '#334155',
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      }
    }
  }
}
```

## Notes

- Always use backdrop-blur for card elements to create depth
- Use opacity values (/20, /30, /50) for subtle overlays and borders
- Combine shadows with color for glow effects (shadow-cyan-500/50)
- Use gradient text for special headings and branding
- Maintain consistent border-radius across similar components
- Apply transitions to all interactive elements
- Use semitransparent backgrounds for layered effects

## Critical Readability Rules

**NEVER use these text colors on dark backgrounds:**
- ❌ `text-gray-900` - Completely unreadable
- ❌ `text-gray-800` - Too dark
- ❌ `text-gray-700` - Too dark
- ❌ `text-gray-600` - Not readable for important text

**ALWAYS use these text colors for headings and important text:**
- ✅ `text-white` - For all dashboard titles and H2 headings
- ✅ `text-gray-300` - For subtitles and descriptive text
- ✅ `text-gray-400` - For secondary labels and metadata
- ✅ Accent colors (`text-cyan-400`, `text-blue-400`, etc.) for emphasis

**Example of correct vs incorrect:**
```jsx
// ❌ INCORRECT - Unreadable on dark background
<h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
<p className="text-gray-600">Real-time overview</p>

// ✅ CORRECT - Readable on dark background
<h2 className="text-2xl font-bold text-white">Dashboard</h2>
<p className="text-gray-300">Real-time overview</p>
```
