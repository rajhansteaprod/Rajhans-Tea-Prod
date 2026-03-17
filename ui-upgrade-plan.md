# UI Upgrade Plan — Premium Tea Brand (Apple-Level)
> Brand concept: "If Apple started selling tea." Minimal. Cinematic. Intentional.
> Every page should feel like a product launch, not a shop.
> Backend stays untouched. This is a pure frontend transformation.

---

## Brand Identity

**Name:** Rajhans Tea *(or rename when ready)*
**Tagline:** *"Steeped in silence."* / *"The art of doing nothing, beautifully."*

**Palette (already in tokens.scss — keep as-is):**
| Token | Hex | Use |
|---|---|---|
| `$color-primary` | `#CC5803` | CTAs, highlights, price |
| `$color-secondary` | `#57886C` | Accents, tags, nature |
| `$color-accent` | `#A27E8E` | Dusty rose — subtle UI |
| `$color-bg-primary` | `#FCFFF7` | Main background (cream) |
| `$color-bg-dark` | `#3A2D32` | Dark sections, footer |
| `$color-text-primary` | `#3A2D32` | Body text |

**Typography upgrade needed:**
- Display font: `Cormorant Garamond` (serif, editorial) — for headlines, hero text, product names
- Body font: `Inter` *(already in use)* — keep for body/UI
- Add to Google Fonts: `Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400`
- Add `$font-family-display` token pointing to Cormorant Garamond

**Motion principles:**
- Ease: `cubic-bezier(0.16, 1, 0.3, 1)` — smooth expo out (already close in tokens)
- Spring: `cubic-bezier(0.34, 1.56, 0.64, 1)` — already in tokens as `$transition-spring`
- Duration: 0.7s–1.2s for reveals, 0.2s for micro-interactions
- GSAP ScrollTrigger for all scroll-driven reveals
- No bounce on functional UI (forms, modals) — only on hero/editorial content

---

## Slice A — Design System & Brand Tokens
> Gate slice. Nothing else starts without this.

**What changes:**
- Add `Cormorant Garamond` to Google Fonts import in `styles.scss`
- Update `$font-family-display` in `tokens.scss` to Cormorant Garamond
- Add new tokens:
  - `$font-size-hero: 80px` (large editorial headlines)
  - `$font-size-mega: 120px` (full-bleed hero numbers/words)
  - `$letter-spacing-display: -0.04em` (tight for display serif)
  - `$color-bg-warm: #F7F2EE` (slightly warmer cream for alternating sections)
  - `$color-overlay: rgba(58, 45, 50, 0.45)` (dark overlay for image overlays)
- Add `mixins.scss` additions:
  - `@mixin display-text` — Cormorant, tight tracking, light weight
  - `@mixin section-reveal` — standard GSAP ScrollTrigger pattern placeholder
  - `@mixin fluid-type($min, $max)` — clamp-based responsive typography

**Files to touch:**
- `frontend/src/styles.scss`
- `frontend/src/app/core/design-tokens/tokens.scss`
- `frontend/src/app/core/design-tokens/mixins.scss`

---

## Slice B — Homepage
> The brand's front door. This page sells the *feeling*, not the product.

**Layout (top to bottom):**

### 1. Navbar
- Transparent on hero, white on scroll
- Logo: wordmark in Cormorant Garamond, light weight
- Nav links: Shop, Collections, Story, Brew Guide
- Right: search icon, cart icon (bag), account icon
- GSAP: slides down on load, fades in links with stagger
- Sticky with `backdrop-filter: blur(20px)` on scroll

### 2. Hero Section
- Full viewport height
- Background: high-res tea imagery (flat lay / steam / leaves)
- Large Cormorant Garamond headline: *"Every cup, a moment."*
- Subtext: one line, Inter light
- Two CTAs: primary (Shop Now) + ghost (Our Story)
- GSAP entry: headline words stagger up from y:60, image parallax on scroll

### 3. Brand Statement Band
- Dark background (`$color-bg-dark`)
- Single centered Cormorant line (italic): *"Sourced by hand. Steeped with intention."*
- Thin decorative rule on either side
- GSAP: scaleX reveal on the rules, fade in text

### 4. Featured Collections Grid
- 3-column editorial grid (large left card + 2 stacked right)
- Each card: full-bleed image, collection name over image, subtle overlay
- Hover: image scale 1.04, overlay darkens
- GSAP: stagger reveal from bottom on scroll

### 5. Product Spotlight
- Alternating left/right layout (2–3 featured products)
- Large product image one side, text + price + CTA other side
- Typographic hierarchy: category label (small caps) → product name (display serif) → tagline → price
- GSAP: image slides in from side, text staggered on scroll

### 6. Brand Story Teaser
- Full-bleed image section with text overlay
- *"From the mountains of Assam to your morning ritual."*
- Link: Read Our Story
- Parallax scroll effect on background image

### 7. Brew Guide Teaser
- Light background section
- Horizontal scrolling cards: Brewing methods (Gongfu, Western, Cold Brew)
- Each card: icon, name, time, temperature
- GSAP: horizontal scroll reveal

### 8. Testimonials / Social Proof
- Minimal quote cards
- Customer name, quote, star rating
- Cormorant italic for the quote text
- GSAP: fade + slight y movement on scroll

### 9. Footer
- Dark background (`$color-bg-dark`)
- 4 columns: Brand, Shop, Learn, Connect
- Bottom bar: copyright, policy links
- Newsletter signup inline input

**Files to create/modify:**
- `frontend/src/app/features/home/home.ts` (rewrite)
- `frontend/src/app/layouts/main-layout/main-layout.ts` (new navbar)
- `frontend/src/app/shared/components/footer/footer.ts` (new)

---

## Slice C — Catalog / Shop Page
> Feels like browsing an editorial magazine, not a grid of cards.

**Layout:**

### Filter Bar
- Sticky top bar below navbar
- Left: breadcrumb (Shop > Loose Leaf)
- Right: filter pills (Category, Collection, Price range, Sort)
- Active filters shown as dismissible tags
- Filter panel: slides in from right as a drawer
- GSAP: bar slides down into position

### Product Grid
- 3-column default, 2-column on tablet, 1-column on mobile
- Card design:
  - No border, no shadow — white space does the work
  - Image takes 75% of card height, square crop
  - Below: category label (small, uppercase, `$color-secondary`), product name (Cormorant), price
  - On hover: image zooms 1.03, quick-view icon appears with fade
- Empty state: beautiful illustration + message

### Collection Header (when filtering by collection)
- Full-width banner with collection image
- Collection name in Cormorant display size
- Short description below
- GSAP: parallax on scroll

### Pagination
- Simple numbered pagination, centered
- Or infinite scroll with intersection observer (decide at implementation)

**Files to create/modify:**
- `frontend/src/app/features/shop/shop-listing/shop-listing.ts` (new)
- `frontend/src/app/features/shop/shop.routes.ts` (new)

---

## Slice D — Product Detail Page (Public)
> Already built as admin preview — adapt for public with purchase flow added.

**Additions over current preview:**
- Add to Cart button (functional when cart slice is built — placeholder for now)
- Quantity selector
- Brew Guide section below main content
- Related Products horizontal scroll
- Breadcrumb navigation
- Share button
- Stock indicator (In Stock / Low Stock / Out of Stock)
- Tab switcher: Description | Tasting Notes | Brew Guide | Sourcing

**Keeps from current preview:**
- GSAP entry timeline (word stagger, price count-up)
- Sticky two-column layout
- ScrollTrigger reveals
- Magnetic CTA
- Image crossfade gallery

**Route:** `/shop/products/:slug` (public)

**Files to create:**
- `frontend/src/app/features/shop/product-detail/product-detail.ts` (new, adapted from admin preview)

---

## Slice E — Cart & Checkout
> Distraction-free. One goal: complete the purchase.

### Cart Drawer
- Slides in from right, 420px wide
- Backdrop blur on the page behind
- Each item: image thumbnail, name, quantity stepper, price, remove
- Bottom: subtotal, Checkout CTA (full-width, burnt orange)
- Empty state: clean illustration + "Your cart is empty" + Shop CTA
- GSAP: drawer slides in from right with ease-out, items stagger in

### Checkout Page (`/checkout`)
- Single page, no multi-step wizard
- Left column: order summary (sticky)
- Right column: form fields (contact, shipping, payment)
- Section headers in Cormorant
- Progress: Contact → Shipping → Payment shown as subtle step indicator
- No distracting navbar — minimal header with logo only

### Order Confirmation (`/order-confirmed`)
- Full screen brand moment
- Large checkmark animation (GSAP draw SVG)
- Order number, brief summary
- *"Your tea is on its way."* in Cormorant italic
- CTA: Continue Shopping

**Files to create:**
- `frontend/src/app/features/cart/cart-drawer/cart-drawer.ts`
- `frontend/src/app/features/checkout/checkout.ts`
- `frontend/src/app/features/checkout/order-confirmed/order-confirmed.ts`

---

## Slice F — Customer Account
> Clean, minimal — feels like an Apple ID dashboard.

**Pages:**

### `/account/dashboard`
- Greeting: *"Good morning, [name]."* in Cormorant
- Quick stats: total orders, last order date
- Recent orders list (last 3)
- Quick links: Orders, Profile, Addresses

### `/account/orders`
- Clean table: order number, date, status badge, total, View button
- Status badge colors: pending (amber), shipped (sage), delivered (green), cancelled (muted)

### `/account/orders/:id`
- Order detail: items, timeline (ordered → packed → shipped → delivered)
- Timeline is a vertical stepper with animated fill on load

### `/account/profile`
- Edit name, email, phone
- Change password section (separate toggle)

### `/account/addresses`
- Address cards, add new, set default

**Files to create:**
- `frontend/src/app/features/account/` (all pages)

---

## Slice G — Brand Content Pages
> The soul of the brand. These pages exist to make people fall in love.

### `/story` — Our Story
- Long-form editorial scroll
- Hero: founder portrait or tea garden, full bleed
- Sections: origin, philosophy, sourcing process
- Pull quotes in Cormorant italic
- Inline photography between text blocks
- GSAP: parallax images, text fade-ins

### `/sourcing` — Where Our Tea Comes From
- Interactive-feel map section (CSS-only regions, not a real map lib)
- Origin cards: Assam, Darjeeling, Nilgiris etc.
- Each card: region name, elevation, flavour profile, harvest season

### `/brew-guide` — How to Brew
- Hub page with method cards
- Each method links to a full guide: `/brew-guide/gongfu`, `/brew-guide/western` etc.
- Guide page: step-by-step with large photography, temperature, time, ratio

### `/journal` — Brand Blog (future)
- Editorial grid of articles
- Connects to Content & SEO Slice (Slice 13 in slicedoc)

**Files to create:**
- `frontend/src/app/features/brand/story/story.ts`
- `frontend/src/app/features/brand/sourcing/sourcing.ts`
- `frontend/src/app/features/brand/brew-guide/brew-guide.ts`

---

## Implementation Order

```
Slice A  →  Design system tokens + typography
Slice B  →  Homepage (most impactful, sets the tone)
Slice C  →  Shop listing page
Slice D  →  Public product detail page
Slice E  →  Cart drawer + checkout (needs cart backend first)
Slice F  →  Account pages (needs orders backend first)
Slice G  →  Brand content pages (can do anytime — no backend dependency)
```

**Can be done right now (no backend dependency):**
- Slice A, B, C, D (uses existing catalog API), G

**Needs backend first:**
- Slice E (needs Cart & Checkout — Slice 5 in slicedoc)
- Slice F (needs Orders — Slice 6 in slicedoc)

---

## Shared Components to Build (once, reuse everywhere)

| Component | Used in |
|---|---|
| `<app-navbar>` | All public pages |
| `<app-footer>` | All public pages |
| `<app-product-card>` | Homepage, Shop, Account |
| `<app-cart-drawer>` | All public pages |
| `<app-collection-banner>` | Shop, Collection pages |
| `<app-brew-badge>` | Product detail, Brew guide |
| `<app-section-reveal>` (directive) | All pages (GSAP wrapper) |

---

## Notes for Implementation

- All new components: standalone, OnPush, Angular signals
- GSAP + ScrollTrigger imported per-component (not global)
- All GSAP instances cleaned up in `ngOnDestroy`
- Images: use `loading="lazy"` on all below-fold images
- Fonts: preconnect to Google Fonts, preload display font
- No ng-zorro on public pages — custom components only (ng-zorro only in admin)
- Mobile-first responsive: design for 390px, enhance up
