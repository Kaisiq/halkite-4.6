---
name: design-clone-tech-enterprise
description: Clone modern tech/defense/enterprise website designs with sophisticated, minimal aesthetics. Recreates bold typography, cinematic imagery, and clean layouts from screenshots.
license: MIT
---

# Design Cloning Skill - Tech/Enterprise Edition

This skill enables Claude to analyze modern tech/defense/enterprise website screenshots and recreate them with high visual fidelity. Focused on bold typography, cinematic imagery, minimal UI, and sophisticated interactions.

## Primary Objective

**Recreate exact visual designs from screenshots** for modern tech companies, focusing on:
- Bold, large-scale typography
- Cinematic full-screen imagery
- Minimal, clean navigation
- Grid-based content layouts
- Sophisticated color palettes
- Premium, polished aesthetic

## Analysis Framework

When screenshots are provided, Claude must perform **comprehensive visual analysis** before writing code:

### 1. Color Extraction - Complete Palette

**Based on the provided screenshots, use these EXACT color schemes:**

#### Color Palette A: Dark/Cinematic Theme (Anduril-style)

```css
:root {
  /* Backgrounds */
  --bg-primary: #000000;        /* Pure black background */
  --bg-secondary: #0a0a0a;      /* Near-black for panels */
  --bg-elevated: #1a1a1a;       /* Elevated surfaces */
  --bg-overlay: rgba(0,0,0,0.8); /* Modal/overlay backgrounds */

  /* Text Colors */
  --text-primary: #ffffff;      /* Pure white - headlines */
  --text-secondary: #cccccc;    /* Light gray - body text */
  --text-muted: #999999;        /* Medium gray - labels */
  --text-accent: #C55636;       /* Accent color for highlights */

  /* Accent Colors */
  --accent-primary: #C55636;    /* Primary brand accent */
  --accent-yellow: #FFD700;     /* Yellow accents (seen in imagery) */
  --accent-blue: #4A90E2;       /* Blue accents */

  /* UI Elements */
  --border-color: #333333;      /* Subtle borders */
  --border-light: rgba(255,255,255,0.1); /* Very subtle dividers */

  /* Interactive States */
  --hover-overlay: rgba(255,255,255,0.05);
  --active-overlay: rgba(255,255,255,0.1);
}
```

#### Color Palette B: Light/Enterprise Theme (Palantir-style)

```css
:root {
  /* Backgrounds */
  --bg-primary: #ffffff;        /* Pure white background */
  --bg-secondary: #f8f8f8;      /* Off-white for sections */
  --bg-elevated: #f0f0f0;       /* Subtle elevation */
  --bg-dark-section: #1a1a2e;   /* Dark purple/navy sections */

  /* Text Colors */
  --text-primary: #000000;      /* Pure black - headlines */
  --text-secondary: #333333;    /* Dark gray - body */
  --text-muted: #666666;        /* Medium gray - labels */
  --text-light: #cccccc;        /* Light gray on dark backgrounds */

  /* Accent Colors */
  --accent-primary: #C55636;    /* Primary brand accent */
  --accent-purple: #5B21B6;     /* Purple (Palantir brand) */
  --accent-blue: #2563EB;       /* Blue accents */

  /* UI Elements */
  --border-color: #e5e5e5;      /* Light borders */
  --border-dark: #333333;       /* Dark borders on light backgrounds */
}
```

#### Tailwind Configuration

```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        // Dark theme
        'tech-dark': {
          'bg': '#000000',
          'surface': '#1a1a1a',
          'border': '#333333',
        },
        // Light theme
        'tech-light': {
          'bg': '#ffffff',
          'surface': '#f8f8f8',
          'border': '#e5e5e5',
        },
        // Shared accents
        'accent': {
          DEFAULT: '#C55636',
          'purple': '#5B21B6',
          'blue': '#2563EB',
          'yellow': '#FFD700',
        }
      },
      fontFamily: {
        'sans': ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],
        'display': ['Space Grotesk', 'Inter', '-apple-system', 'sans-serif'],
      }
    }
  }
}
```

### 2. Typography Analysis

**Font Characteristics:**

**Display/Headline Font:**
- Modern geometric sans-serif (Space Grotesk, Inter, Helvetica Neue)
- Weight: 400-700 (medium to bold)
- Letter-spacing: Tight to normal (-0.02em to 0)
- Line-height: Tight (1.1 to 1.3)

**Body Font:**
- System font stack for performance
- Weight: 400-500 (regular to medium)
- Letter-spacing: Normal
- Line-height: Relaxed (1.6 to 1.8)

**Font Sizes (Mobile-first):**

```css
/* Hero/Main Headlines */
--text-hero: clamp(2.5rem, 8vw, 6rem);     /* 40px - 96px */
--text-h1: clamp(2rem, 6vw, 4.5rem);       /* 32px - 72px */
--text-h2: clamp(1.75rem, 4vw, 3rem);      /* 28px - 48px */
--text-h3: clamp(1.5rem, 3vw, 2.25rem);    /* 24px - 36px */

/* Body Text */
--text-large: 1.25rem;    /* 20px - important body */
--text-base: 1rem;        /* 16px - standard body */
--text-small: 0.875rem;   /* 14px - secondary text */
--text-tiny: 0.75rem;     /* 12px - labels/captions */

/* Navigation */
--text-nav: 0.875rem;     /* 14px - nav links */
```

**Typography Patterns:**

```css
/* Hero headline style */
.hero-headline {
  font-size: clamp(2.5rem, 8vw, 6rem);
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

/* Large paragraph intro */
.intro-text {
  font-size: 1.25rem;
  font-weight: 400;
  line-height: 1.6;
  color: var(--text-secondary);
}

/* Product name / title */
.product-title {
  font-size: clamp(1.75rem, 4vw, 3rem);
  font-weight: 500;
  letter-spacing: -0.01em;
}
```

### 3. Layout Structure

**Grid Systems:**

**Hero Section:**
- Full viewport height (100vh)
- Centered content OR full-bleed image with overlay text
- Minimal padding on mobile, generous on desktop

**Content Grid:**
- 12-column grid on desktop
- 2-3 column layouts for product/feature grids
- Asymmetric layouts for visual interest
- Full-bleed images breaking the grid

**Spacing System:**

```css
/* Container widths */
--container-narrow: 640px;   /* Text-focused content */
--container-medium: 960px;   /* Standard content */
--container-wide: 1280px;    /* Full layouts */
--container-full: 100%;      /* Full-bleed sections */

/* Vertical spacing */
--space-section: clamp(4rem, 10vw, 10rem);    /* Between sections */
--space-subsection: clamp(2rem, 5vw, 5rem);   /* Within sections */
--space-element: clamp(1rem, 3vw, 3rem);      /* Between elements */
```

**Border Radius:**
- Buttons: 0px (sharp) or 4px (subtle)
- Cards: 0px (sharp) or 8px (subtle)
- Images: Usually 0px (sharp corners) or minimal
- Modals: 0px or 12px

### 4. Component Patterns

#### Navigation Bar

```
Structure:
├── Logo (left, ~32px height)
├── Navigation Links (center or right)
│   ├── Category links (simple text)
│   └── Hover: Underline or subtle highlight
└── CTA Buttons (right)
    ├── Search icon
    └── Menu/Company dropdown

Styling:
- Background: Transparent on dark hero, white on light
- Fixed/sticky positioning
- Minimal height: 60-80px
- Border: None or 1px bottom border
- Backdrop blur on scroll (optional)
```

```jsx
// Example Navigation
<nav className="fixed top-0 w-full z-50 bg-black/80 backdrop-blur-sm">
  <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
    {/* Logo */}
    <div className="text-white text-xl font-bold flex items-center gap-2">
      <Logo />
      <span>ANDURIL</span>
    </div>

    {/* Nav Links */}
    <div className="hidden md:flex items-center gap-8 text-sm">
      <a href="#" className="text-white hover:text-gray-300 transition-colors">
        Subterranean
      </a>
      <a href="#" className="text-white hover:text-gray-300 transition-colors">
        Sea
      </a>
      <a href="#" className="text-white hover:text-gray-300 transition-colors">
        Land
      </a>
      <a href="#" className="text-white hover:text-gray-300 transition-colors">
        Air
      </a>
      <a href="#" className="text-white hover:text-gray-300 transition-colors">
        Space
      </a>
    </div>

    {/* Right Actions */}
    <div className="flex items-center gap-4">
      <button className="text-white hover:text-gray-300">Search</button>
      <button className="text-white hover:text-gray-300">Company +</button>
    </div>
  </div>
</nav>
```

#### Hero Section

```
Full-viewport hero with:
├── Background: Full-bleed image or video
├── Overlay: Dark gradient (optional)
├── Content: Centered or left-aligned
│   ├── Large headline (60-96px)
│   ├── Subheadline or description (18-24px)
│   └── CTA buttons (optional)
└── Scroll indicator (optional)

Styling:
- Height: 100vh or min-h-screen
- Background: Cover, center positioning
- Text: White on dark images, dark on light
- Padding: Large on all sides
```

```jsx
// Full-bleed hero with image
<section className="relative h-screen w-full">
  {/* Background Image */}
  <img
    src="/hero-image.jpg"
    alt=""
    className="absolute inset-0 w-full h-full object-cover"
  />

  {/* Optional dark overlay */}
  <div className="absolute inset-0 bg-black/30" />

  {/* Content */}
  <div className="relative h-full flex items-center justify-center px-6">
    <div className="max-w-4xl text-center">
      <h1 className="text-white text-6xl md:text-8xl font-normal leading-tight mb-6">
        Defending Tomorrow
      </h1>
      <p className="text-white/90 text-xl md:text-2xl">
        Advanced autonomous systems for national security
      </p>
    </div>
  </div>
</section>

// Text-focused hero (Palantir style)
<section className="min-h-screen flex items-center justify-center px-6 bg-white">
  <div className="max-w-5xl">
    <h1 className="text-5xl md:text-7xl font-normal leading-tight">
      Our software powers real-time, <span className="text-gray-400">AI-driven</span> decisions in critical government and commercial enterprises in the West, from the factory floors to the front lines.
    </h1>
  </div>
</section>
```

#### Product/Feature Grid

```
Grid layout:
├── 2-3 column grid (desktop)
├── 1 column (mobile)
├── Cards with:
│   ├── Full-bleed image
│   ├── Title overlay (bottom-left)
│   ├── Hover: Subtle scale or overlay
│   └── Optional CTA arrow

Styling:
- Aspect ratio: 4:3 or 16:9
- Gap: 1rem to 2rem
- Hover: Transform scale(1.02) or brightness increase
```

```jsx
// Product Grid (Anduril style)
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
  {products.map(product => (
    <a
      href={product.url}
      className="group relative aspect-[4/3] overflow-hidden bg-black"
    >
      {/* Image */}
      <img
        src={product.image}
        alt={product.name}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 p-6 text-white">
        <h3 className="text-3xl font-medium mb-2">{product.name}</h3>
        <p className="text-sm text-white/80">{product.tagline}</p>
      </div>

      {/* Hover arrow */}
      <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor">
          <path d="M7 17L17 7M17 7H7M17 7V17" strokeWidth="2" />
        </svg>
      </div>
    </a>
  ))}
</div>
```

#### Text Sections

```jsx
// Large text section (Palantir style)
<section className="py-20 px-6 bg-white">
  <div className="max-w-4xl mx-auto">
    <h2 className="text-4xl md:text-6xl font-normal leading-tight mb-12">
      Our software powers real-time, AI-driven decisions in critical government and commercial enterprises
    </h2>

    <div className="text-lg text-gray-600 leading-relaxed">
      <p className="mb-6">
        From the factory floors to the front lines, our platforms enable organizations to make better decisions faster.
      </p>
    </div>
  </div>
</section>
```

#### Cards/Panels

```jsx
// Minimal card with hover effect
<div className="group border border-gray-200 hover:border-gray-400 transition-colors cursor-pointer">
  <div className="p-8">
    <h3 className="text-2xl font-medium mb-4">AIP</h3>
    <p className="text-gray-600 mb-6">
      Automate operations, from the factory floor to the front lines
    </p>
    <span className="text-sm text-gray-400 group-hover:text-black transition-colors">
      /0.1
    </span>
  </div>
</div>
```

### 5. Interactive States

**Hover Effects:**
- Images: Scale 1.05, brightness increase, or overlay fade
- Links: Underline appear, color change
- Buttons: Background darken/lighten, subtle scale
- Cards: Border color change, shadow appear

**Transitions:**
- Duration: 300-500ms for most interactions
- Easing: ease-out or cubic-bezier(0.4, 0, 0.2, 1)
- Transform: Use for scale, translate

**Scroll Animations:**
- Parallax on background images
- Fade-in on scroll for content
- Sticky navigation with backdrop blur

### 6. Responsive Breakpoints

```css
/* Mobile first approach */
--mobile: 0px;
--tablet: 768px;
--desktop: 1024px;
--wide: 1440px;

/* Example usage */
.hero-title {
  font-size: 2.5rem;  /* Mobile */
}

@media (min-width: 768px) {
  .hero-title {
    font-size: 4rem;  /* Tablet */
  }
}

@media (min-width: 1024px) {
  .hero-title {
    font-size: 6rem;  /* Desktop */
  }
}
```

## Technical Implementation Requirements

### Required Technologies

**Core Stack:**
- React (functional components with hooks)
- TypeScript (for type safety)
- Tailwind CSS (for styling)
- Framer Motion (for animations)

### Animation Patterns with Framer Motion

```jsx
import { motion } from 'framer-motion';

// Fade in on scroll
<motion.div
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.6 }}
  viewport={{ once: true }}
>
  {content}
</motion.div>

// Stagger children
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

<motion.div
  variants={containerVariants}
  initial="hidden"
  animate="visible"
>
  {items.map(item => (
    <motion.div key={item.id} variants={itemVariants}>
      {item.content}
    </motion.div>
  ))}
</motion.div>

// Parallax scroll effect
import { useScroll, useTransform } from 'framer-motion';

const { scrollY } = useScroll();
const y = useTransform(scrollY, [0, 500], [0, 150]);

<motion.div style={{ y }}>
  <img src="/background.jpg" />
</motion.div>
```

### Image Optimization

```jsx
// Next.js Image component (recommended)
import Image from 'next/image';

<Image
  src="/product.jpg"
  alt="Product name"
  width={1920}
  height={1080}
  className="object-cover"
  priority={isAboveFold}
  quality={90}
/>

// Lazy loading for below-fold images
<img
  src="/image.jpg"
  alt="Description"
  loading="lazy"
  className="w-full h-full object-cover"
/>
```

### Video Backgrounds

```jsx
// Auto-playing background video
<div className="relative h-screen overflow-hidden">
  <video
    autoPlay
    muted
    loop
    playsInline
    className="absolute inset-0 w-full h-full object-cover"
  >
    <source src="/hero-video.mp4" type="video/mp4" />
  </video>

  <div className="relative z-10">
    {/* Content over video */}
  </div>
</div>
```

## Complete Component Examples

### Full Navigation Component

```tsx
'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-black/90 backdrop-blur-md border-b border-white/10'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="text-white text-xl font-bold flex items-center gap-2">
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
            {/* Your logo SVG */}
          </svg>
          <span>COMPANY</span>
        </a>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8">
          {['Products', 'Solutions', 'Company', 'Careers'].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-white/80 hover:text-white text-sm transition-colors relative group"
            >
              {item}
              <span className="absolute bottom-0 left-0 w-0 h-px bg-white group-hover:w-full transition-all duration-300" />
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="flex items-center gap-4">
          <button className="text-white/80 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <button className="px-6 py-2 border border-white/20 text-white hover:bg-white hover:text-black transition-colors text-sm">
            Get Started
          </button>
        </div>
      </div>
    </motion.nav>
  );
}
```

### Hero Section Component

```tsx
'use client';

import { motion } from 'framer-motion';

export default function Hero() {
  return (
    <section className="relative h-screen w-full overflow-hidden">
      {/* Background Image with Parallax */}
      <motion.div
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 1.5 }}
        className="absolute inset-0"
      >
        <img
          src="/hero-background.jpg"
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/30" />
      </motion.div>

      {/* Content */}
      <div className="relative h-full flex items-center justify-center px-6">
        <div className="max-w-5xl text-center">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-white text-5xl md:text-7xl lg:text-8xl font-normal leading-tight mb-6"
          >
            Building the Future of Defense
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-white/90 text-lg md:text-xl lg:text-2xl max-w-3xl mx-auto"
          >
            Advanced autonomous systems powered by artificial intelligence
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mt-10 flex gap-4 justify-center"
          >
            <button className="px-8 py-3 bg-white text-black hover:bg-gray-200 transition-colors text-sm font-medium">
              Learn More
            </button>
            <button className="px-8 py-3 border border-white text-white hover:bg-white hover:text-black transition-colors text-sm font-medium">
              Watch Video
            </button>
          </motion.div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-6 h-10 border-2 border-white/50 rounded-full flex items-start justify-center p-2"
        >
          <div className="w-1.5 h-1.5 bg-white/50 rounded-full" />
        </motion.div>
      </motion.div>
    </section>
  );
}
```

### Product Grid Component

```tsx
'use client';

import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  tagline: string;
  image: string;
  url: string;
}

const products: Product[] = [
  {
    id: '1',
    name: 'Roadrunner',
    tagline: 'Autonomous Air Defense',
    image: '/products/roadrunner.jpg',
    url: '/products/roadrunner'
  },
  {
    id: '2',
    name: 'Fury',
    tagline: 'Fight Unfair',
    image: '/products/fury.jpg',
    url: '/products/fury'
  },
  // ... more products
];

export default function ProductGrid() {
  return (
    <section className="py-20 px-6 bg-black">
      <div className="max-w-[1400px] mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-white text-4xl md:text-6xl font-normal mb-12"
        >
          Our Systems
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product, index) => (
            <motion.a
              key={product.id}
              href={product.url}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="group relative aspect-[4/3] overflow-hidden bg-black"
            >
              {/* Image */}
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />

              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

              {/* Content */}
              <div className="absolute inset-0 p-6 flex flex-col justify-end">
                <h3 className="text-white text-3xl font-medium mb-2">
                  {product.name}
                </h3>
                <p className="text-white/80 text-sm">
                  {product.tagline}
                </p>
              </div>

              {/* Arrow Icon */}
              <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <ArrowUpRight className="w-6 h-6 text-white" />
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}
```

## Quality Checklist

Before delivering code, verify:

**Visual Accuracy:**
- [ ] Colors match exactly (black/white for dark theme, clean for light)
- [ ] Typography is bold and impactful
- [ ] Spacing creates breathing room
- [ ] Images are full-bleed where appropriate
- [ ] Hover states are subtle but noticeable

**Functionality:**
- [ ] Navigation is sticky/fixed
- [ ] Scroll animations work smoothly
- [ ] Images load with lazy loading
- [ ] Videos autoplay (muted) if used
- [ ] Links and CTAs are functional

**Code Quality:**
- [ ] TypeScript types defined
- [ ] Components are reusable
- [ ] Framer Motion animations are performant
- [ ] Images use Next.js Image or proper lazy loading
- [ ] No console errors

**Responsiveness:**
- [ ] Works on mobile (< 768px)
- [ ] Works on tablet (768-1024px)
- [ ] Works on desktop (> 1024px)
- [ ] Text is readable at all sizes
- [ ] Touch targets are 44x44px minimum

**Performance:**
- [ ] Images are optimized
- [ ] Animations use GPU acceleration (transform, opacity)
- [ ] No layout shift (CLS)
- [ ] Fast initial load

## Common Patterns

### Dark Theme Patterns

```css
/* Full black with subtle borders */
.dark-card {
  background: #000000;
  border: 1px solid rgba(255,255,255,0.1);
}

/* Text on dark */
.dark-text-primary { color: #ffffff; }
.dark-text-secondary { color: rgba(255,255,255,0.7); }
.dark-text-muted { color: rgba(255,255,255,0.5); }

/* Hover effects on dark */
.dark-hover:hover {
  background: rgba(255,255,255,0.05);
}
```

### Light Theme Patterns

```css
/* Clean white with subtle shadows */
.light-card {
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

/* Text on light */
.light-text-primary { color: #000000; }
.light-text-secondary { color: #333333; }
.light-text-muted { color: #666666; }

/* Hover effects on light */
.light-hover:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
```

## Final Notes

This skill creates **premium, sophisticated tech/enterprise websites** with:
- Bold, confident typography
- Cinematic, full-screen imagery
- Minimal, clean UI
- Smooth, professional animations
- Dark or light themes

Focus on **restraint and precision** rather than complexity. Every element should serve a purpose. White space is intentional, not wasteful.

When in doubt, **go bigger and bolder** with typography and imagery, and **cleaner and simpler** with UI chrome.
