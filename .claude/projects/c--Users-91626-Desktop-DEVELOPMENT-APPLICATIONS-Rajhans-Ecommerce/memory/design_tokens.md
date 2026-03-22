---
name: design_tokens
description: Frontend design token color palette and UI tokenization for RnD Ecommerce
type: project
---

## Color Palette & Design Tokens

### Brand Colors
- **Primary:** #CC5803 (Bronze Spice) — main CTA, buttons, links, brand identity
- **Secondary:** #57886C (Jungle Teal) — secondary actions, success states, accents

### Neutral / Background
- **Background Primary:** #FCFFF7 (Porcelain) — main page background, cards
- **Background Secondary:** #F5F8F2 — subtle sections, alternating rows
- **Surface:** #FFFFFF — elevated cards, modals, dropdowns

### Text / Font Colors
- **Text Primary:** #3A2D32 (Shadow Grey) — headings, body text
- **Text Secondary:** #5C4F53 — subtitles, descriptions, muted text
- **Text Tertiary:** #8A7D81 — placeholders, disabled text
- **Text Inverse:** #FCFFF7 — text on dark/primary backgrounds

### Accent
- **Accent:** #A27E8E (Dusty Mauve) — highlights, badges, tags, decorative elements

### Semantic Colors
- **Success:** #57886C (Jungle Teal) — reuses secondary
- **Warning:** #CC5803 (Bronze Spice) — reuses primary (earthy warmth)
- **Error:** #C0392B — destructive actions, form errors
- **Info:** #A27E8E (Dusty Mauve) — reuses accent

### Border / Dividers
- **Border Default:** #E0DCD8
- **Border Focus:** #CC5803 — input focus rings (primary)

### Button Tokens
- **Button Primary BG:** #CC5803 / Text: #FCFFF7
- **Button Primary Hover:** #B34E03
- **Button Secondary BG:** #57886C / Text: #FCFFF7
- **Button Secondary Hover:** #4A7560
- **Button Outline Border:** #CC5803 / Text: #CC5803
- **Button Disabled BG:** #E0DCD8 / Text: #8A7D81

**Why:** User-selected palette from a color tool. These are the definitive brand colors for the frontend.
**How to apply:** Use these tokens when building any Angular frontend components, theme config, or CSS variables.
