# ChurnSaver - Project Documentation

## Overview

ChurnSaver is an automated payment recovery platform built for Whop businesses. It helps recover failed subscription payments through intelligent notifications, personalized outreach, and strategic incentives.

## Tech Stack

- **Framework**: Next.js 16 with React 19
- **Styling**: Tailwind CSS 4 with custom design system
- **UI Components**: shadcn/ui with custom extensions
- **Animation**: Framer Motion for micro-interactions
- **Backend**: Supabase (PostgreSQL) with Row Level Security
- **Deployment**: Vercel
- **Authentication**: Whop OAuth integration

## Design System (Updated December 2025)

### Design Principles

The UI follows **Miller's Law** (cognitive load limited to 7±2 items) throughout:
- Sections are chunked into 3-4 main groups
- Complex options are progressively disclosed
- Timeline-based visualizations for sequential steps
- Tab interfaces to separate concerns

### Typography

Premium font pairing defined in `src/app/layout.tsx`:
- **Body Text**: Inter - clean, readable sans-serif
- **Headings**: Space Grotesk - modern, premium feel with tighter letter-spacing

CSS Variables:
```css
--font-inter: /* body font */
--font-space-grotesk: /* heading font */
```

### Premium Visual Identity

The frontend features a sophisticated dark theme optimized for the Whop ecosystem:

#### Color Palette
- **Primary**: `#ea580c` (Red-Orange)
- **Background**: `#09090b` (Near Black)
- **Foreground**: `#fafafa` (Near White)
- **Muted**: `#27272a` (Dark Gray)

#### Color-Coded Timeline States
- Immediate: `text-red-400` / `bg-red-500/20`
- Day 1-2: `text-orange-400` / `bg-orange-500/20`
- Day 3-4: `text-amber-400` / `bg-amber-500/20`
- Day 7+: `text-green-400` / `bg-green-500/20`

#### Premium Effects
Located in `src/styles/backgrounds.css`:

1. **Glassmorphism** - `.glass`, `.glass-strong`, `.glass-subtle`
2. **Premium Cards** - `.card-premium`, `.card-featured`
3. **Gradient Backgrounds** - `.bg-hero-gradient`, `.bg-mesh-gradient`
4. **Glow Effects** - `.glow-primary`, `.glow-primary-sm`, `.text-glow`
5. **Animations** - `.animate-float`, `.animate-pulse-glow`, `.animate-slide-up`
6. **Gradient Text** - `.text-gradient`

#### UI Components (shadcn/ui)
Installed components in `src/components/ui/`:
- `accordion.tsx` - Collapsible FAQ sections
- `tabs.tsx` - Tabbed navigation
- `switch.tsx` - Toggle controls
- `separator.tsx` - Visual dividers
- `progress.tsx` - Progress indicators
- `avatar.tsx` - User avatars
- `tooltip.tsx` - Hover tooltips
- `dialog.tsx` - Modal dialogs

### Page Designs

#### Landing Page (`/`)
- Premium hero with animated gradient background
- Glassmorphism badge and buttons
- Stats section with hover animations
- **Recovery Flow Animation** - Interactive dashboard mockup showing:
  - Live notification feed with animated cards
  - Recovery rate progress bar
  - Revenue counter animation
  - Celebration particles on recovery completion
- Feature cards with group headers
- Premium CTA section with social proof

#### Messages Page (`/messages`)
- **Hero Header** with gradient mesh background
- **Premium Tab Switcher** (Push/DM) with glassmorphism
- **Interactive Timeline** with:
  - Vertical gradient line connecting steps
  - Color-coded stages (Immediate → Day 2 → Day 4 → Manual)
  - Animated selection indicators with spring physics
  - Hover micro-interactions
- **iPhone Mockup Preview** showing:
  - Dynamic Island styling
  - Realistic notification cards
  - DM chat bubble interface
  - Glow effect behind phone
- **Premium Upgrade Modal** with:
  - Animated gradient glow border
  - Staggered entrance animations
  - Crown icon and gradient pricing

#### Configuration Page (`/settings`)
- **Hero Header** with subscription status badge
- **Step Progress Indicator** (Channels → Incentives → Schedule)
- **Section Cards** with:
  - Color-coded icons (blue, orange, green)
  - Step badges
  - Active section highlighting with ring effect
- **Communication Channels**:
  - Animated toggle switches with spring physics
  - Status indicators (Active/Disabled)
- **Incentive Grid**:
  - 6-option selectable grid
  - Visual feedback on selection
- **Reminder Schedule**:
  - Time/timezone dropdowns
  - 7-day visual day selector with color coding
- **Animated Save Button** with:
  - Loading spinner animation
  - Success state transition

#### Pricing Page (`/pricing`)
- Three-tier pricing cards (Free, Pro, Max)
- Monthly/Annual toggle with glass effect
- Featured tier highlight with glow animation
- FAQ accordion section
- Contact support CTA

#### Navigation
- Glassmorphism navbar (`.glass-strong`)
- Logo with shadow effects
- Responsive mobile menu

#### Footer
- Multi-column layout
- Navigation and resource links
- Gradient accent line

## Animation Patterns

Using Framer Motion throughout:

```tsx
// Staggered entrance
initial={{ opacity: 0, y: 20 }}
animate={{ opacity: 1, y: 0 }}
transition={{ delay: 0.1 * index }}

// Spring physics for toggles
transition={{ type: 'spring', stiffness: 700, damping: 30 }}

// Layout animations
<motion.div layoutId="activeIndicator" />

// Hover interactions
whileHover={{ x: 4 }}
whileTap={{ scale: 0.98 }}
```

## Project Structure

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx           # Landing page
│   │   ├── pricing/           # Pricing page
│   │   ├── dashboard/         # Dashboard (auth required)
│   │   ├── settings/          # Configuration page
│   │   └── messages/          # Message templates
│   ├── components/
│   │   ├── ui/                # Base UI components
│   │   ├── layouts/           # Layout components
│   │   ├── pricing/           # Pricing-specific components
│   │   ├── messages/          # Message-specific components
│   │   └── landing/           # Landing page components
│   ├── styles/
│   │   └── backgrounds.css    # Premium CSS effects
│   └── lib/                   # Utilities and helpers
├── components.json            # shadcn/ui configuration
└── tailwind.config.ts         # Tailwind configuration
```

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Deploy to Vercel
vercel --prod
```

## Production URLs

- Main: https://web-4jdhb8ly0-dannys-projects-de68569e.vercel.app
- Alternative: https://web-dannys-projects-de68569e.vercel.app

## Key Files for Styling

When making design changes, focus on:

1. `src/styles/backgrounds.css` - Premium CSS effects and utilities
2. `src/app/globals.css` - CSS variables, fonts, and global styles
3. `src/app/layout.tsx` - Font configuration (Inter + Space Grotesk)
4. `tailwind.config.ts` - Color palette and theme extensions
5. `src/components/ui/*.tsx` - Base UI component styling

## Accessibility

- WCAG 2.1 AA compliant
- Skip-to-content link
- Focus-visible styles with ring effect
- Reduced motion support (`prefers-reduced-motion`)
- Semantic HTML throughout
- ARIA labels on interactive elements
- Role attributes for custom controls (switches, tabs)
