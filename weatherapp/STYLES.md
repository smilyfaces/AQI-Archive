# STYLES.md — US City AQI & Weather Tracker

This file defines **how the website looks and reads**. Behavior lives in `FUNCTIONALITY.md`.

**Direction in one line:** a cold, airy, light-blue interface with generously rounded components, where the **AQI value** is the single most prominent element on every screen.

---

## 1. Reference sites (sampled)

Notes from similar air-quality / weather products. Borrow the *ideas*, not the layouts. (Sampled from public product descriptions and documentation, not pixel-level inspection; the agent should look at the live sites for further detail.)

| Reference | What to borrow |
|---|---|
| **EPA AirNow** | The official six-level AQI color scale and category names. Users already know these colors; do not invent a new scale. |
| **IQAir / AirVisual & Apple Weather** | A large AQI numeral with plain-language category beside it; one dominant number per card; simple, rounded cards. |
| **Breeze-style AQI cards** | Circular progress ring showing AQI on a 0–500 scale, colored by category. Good for the city page hero. |
| **Smog Report** | Background tint/gradient subtly shifts with air quality level. Use *sparingly*: tint the card accent, not the whole page. |
| **AQI Me** | An at-a-glance **scale bar** (marker on the 0–500 gradient) makes cities easy to compare. Use on cards and on the Saved page. |
| **Home Assistant AQI gauges** | Segmented color thresholds at 0 / 51 / 101 / 151 / 201 / 301, a clean chart convention to reuse for time-series bands. |

---

## 2. Design principles
1. **One star per screen.** The AQI number. Everything else is quiet.
2. **Cold and calm.** Pale blue surfaces, deep navy text, restrained accents. The only saturated colors are the AQI category colors, so they carry meaning.
3. **Round everything that is a container or control.** Cards, inputs, buttons, chips, tooltips, chart bars. Data lines and gridlines stay sharp and thin.
4. **Color is never the only signal.** Always pair AQI color with the category label (and ring/scale position).
5. **Data first, decoration last.** No stock illustrations, no gradient washes as filler.
6. **Honest empty states.** "N/A" and "Not enough data yet" are designed states, not errors.

---

## 3. Color tokens

### 3.1 Light theme (default)
```css
:root {
  /* Surfaces (cold, light blues) */
  --bg:            #EAF3FB;  /* page background */
  --surface:       #F8FBFE;  /* cards, header */
  --surface-2:     #E1EEF8;  /* subtle panels, table zebra, inputs */
  --border:        #C9DEEE;  /* 1px outlines */
  --border-strong: #A9C8E2;

  /* Brand (light blue family) */
  --sky-300: #A5CDEC;
  --sky-400: #7DB5E0;  /* primary brand tint, rings, highlights */
  --sky-500: #4F96CF;  /* large UI accents, icons, chart lines */
  --blue-600: #2B6CA3; /* buttons & links (white text = 5.5:1) */
  --blue-700: #21557F; /* hover / pressed */

  /* Text */
  --ink:       #17324A; /* primary text */
  --ink-muted: #4F6A82; /* secondary text (5.3:1 on --bg) */
  --ink-faint: #7C93A8; /* placeholders, disabled — never for essential info */

  /* Feedback */
  --focus: #1F6FEB;
  --danger: #B3363F;
  --success: #1F8A70;
  --warning-bg: #FFF4D6;
}
```

### 3.2 Dark theme (follows system; also toggleable)
```css
:root[data-theme="dark"] {
  --bg: #0E1A26;  --surface: #15283A;  --surface-2: #1B3349;
  --border: #284A66;  --border-strong: #36607F;
  --sky-300: #5C8FB8;  --sky-400: #6FA8D6;  --sky-500: #8CC0EA;
  --blue-600: #7DB5E0; --blue-700: #A5CDEC;   /* buttons use dark text in dark mode */
  --ink: #E6F1FA;  --ink-muted: #A3BBD0;  --ink-faint: #6F8CA5;
}
```
Dark mode keeps the cold palette (navy, not black or grey).

### 3.3 AQI scale (US EPA — fixed in both themes)
| Range | Category | Color | Text on color |
|---|---|---|---|
| 0–50 | Good | `#00E400` | ink `#17324A` |
| 51–100 | Moderate | `#FFFF00` | ink |
| 101–150 | Unhealthy for Sensitive Groups | `#FF7E00` | ink |
| 151–200 | Unhealthy | `#FF0000` | white |
| 201–300 | Very Unhealthy | `#8F3F97` | white |
| 301–500 | Hazardous | `#7E0023` | white |

Rules:
- Expose as `--aqi-good … --aqi-hazardous` plus soft tints (`color-mix(in srgb, var(--aqi-x) 18%, var(--surface))`) for card accents and chart bands.
- Pure EPA yellow/green on light backgrounds can vanish: always place the AQI color on a **filled chip/ring** with a 1.5px `--ink` at 25 % outline when used on light surfaces; never as thin text on white.
- Category names are always written out; "USG" may be used only as a tooltip abbreviation.

### 3.4 Chart palette (cities and series)
Eight cold, colorblind-distinguishable colors, used in order; add line dash patterns / marker shapes after the 4th series.
`#2B6CA3` · `#2FB5C9` · `#7C8FD6` · `#3FA7A0` · `#F2A541` · `#D96C8C` · `#6B7F95` · `#8E6BC9`
Gridlines `--border` at 60 %; axis text `--ink-muted`.

---

## 4. Typography
Load via `next/font/google` (no render-blocking `<link>`).

| Role | Font | Notes |
|---|---|---|
| Headings, AQI numerals, nav | **Outfit** (500, 600, 700) | Rounded geometric forms echo the rounded UI |
| Body, tables, labels, tooltips | **Figtree** (400, 500, 600) | Highly legible at small sizes |
| Tabular data | Figtree with `font-variant-numeric: tabular-nums` | Numbers must align in columns |

Fallback stack: `system-ui, -apple-system, "Segoe UI", sans-serif`.

**Scale (rem, 1.25 ratio, base 16px):** 0.8 · 0.875 · 1 · 1.25 · 1.563 · 1.953 · 2.441 · 3.052 · **AQI hero 5rem (card: 3rem)**
- Body line-height 1.5; headings 1.15; line length ≤ 70 characters in prose.
- Sentence case everywhere. **No all-caps labels, no tracked-out eyebrow text.**
- Weights: AQI numerals 700; headings 600; body 400; emphasis 600.

---

## 5. Shape, spacing, elevation

**Radius scale**
| Token | Value | Use |
|---|---|---|
| `--r-sm` | 8px | tags, small inputs, table cell highlights |
| `--r-md` | 12px | buttons (non-pill), dropdown items, tooltips |
| `--r-lg` | 20px | **cards**, panels, chart containers |
| `--r-xl` | 28px | hero/summary panel on city page, modals |
| `--r-pill` | 999px | search bar, nav buttons, chips, save toggles, AQI badges |

Rules: nested elements use a smaller radius than their parent (inner = outer − padding). Tables sit inside a rounded `--r-lg` container with `overflow: hidden`; individual rows are not rounded.

**Spacing:** 4px base — 4, 8, 12, 16, 24, 32, 48, 64. Card padding 20–24px. Page gutters 16px (mobile), 24px (tablet), 32px (desktop). Max content width **1200px**.

**Elevation (cool-tinted, soft):**
```css
--shadow-1: 0 1px 2px rgba(23, 50, 74, .06), 0 2px 8px rgba(23, 50, 74, .06);
--shadow-2: 0 4px 16px rgba(23, 50, 74, .10);   /* dropdowns, hovered cards */
--shadow-3: 0 12px 32px rgba(23, 50, 74, .16);  /* modals */
```
Prefer 1px borders + shadow-1. Never pure-black shadows.

---

## 6. Components

### 6.1 Header
- Sticky, `--surface` at 92 % opacity with backdrop blur, 1px bottom border, bottom corners radius `--r-lg` on desktop.
- Left: **logo placeholder** (rounded square, 40px, `--sky-400` fill) + site name in Outfit 600.
- Center: **search** — pill, 44px tall, `--surface-2` fill, 1px border, magnifier icon at left. Focus: 2px `--focus` ring. Results dropdown: `--r-lg`, `--shadow-2`, highlighted row `--surface-2`.
- Right: **Home** and **Saved** as pill buttons (ghost style, icon + label). Saved shows a count badge (pill, `--blue-600` bg, white text). Active page: filled `--sky-300` pill.
- Mobile (< 640px): logo + search icon (expands to full-width bar) + icon-only Home/Saved.

### 6.2 City card
- `--surface`, 1px `--border`, `--r-lg`, `--shadow-1`, padding 20px. Hover: `--shadow-2` and border `--sky-300` (no movement/scaling).
- Left accent: 6px vertical strip on the card's inner left edge in the AQI category color (inset, rounded).
- Layout:
  ```
  ┌──────────────────────────────────────────┐
  │ Columbia, SC                       [☆]   │  name (Outfit 600, 1.25rem) · save toggle
  │                                          │
  │  ┌──────┐   Moderate                     │  AQI chip: rounded 16px, category color fill,
  │  │  54  │   PM2.5 · 10.6 µg/m³           │  numeral Outfit 700 3rem
  │  └──────┘                                │  category + pollutant/concentration (Figtree)
  │  ▬▬▬▬▬▬▬▬▬▬●▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬         │  scale bar with marker (optional)
  │ ───────────────────────────────────────  │
  │ ☁ Mostly cloudy · 68°F      Updated 12m  │  last weather recording
  └──────────────────────────────────────────┘
  ```
- Missing values show `N/A` in `--ink-muted`. Stale (> 3 h): "Last updated …" in `--warning-bg` pill.
- Grid: 1 col < 640px, 2 cols ≥ 640, 3 cols ≥ 1024, 4 cols ≥ 1360; gap 16–24px.

### 6.3 Save toggle
44×44px hit area, circular (pill), outline star → filled star in `--sky-500` (with `--blue-700` outline) when saved. Announces state via `aria-pressed`. Brief toast: "Columbia saved" / "Removed from saved" (pill toast, bottom-center).

### 6.4 AQI badge / ring / scale bar
- **Badge:** pill with category color fill + category text.
- **Ring (city page hero):** 180px circular progress ring, 12px stroke, rounded caps, track `--surface-2`, arc in category color, AQI numeral (Outfit 700, 5rem) centered, category beneath.
- **Scale bar:** 8px-tall pill gradient/segmented across the six EPA colors with a circular marker (12px, white fill, `--ink` outline) at the AQI position (capped at 300 visually, with an arrow beyond).

### 6.5 Buttons
| Type | Style |
|---|---|
| Primary | `--blue-600` bg, white text, pill, 44px tall, 600 weight; hover `--blue-700` |
| Secondary | `--surface` bg, 1px `--border-strong`, `--ink` text, pill |
| Ghost | transparent, `--ink` text; hover `--surface-2` |
| Icon | 44px circle |

Labels are verbs and consistent: **Save city**, **Remove**, **View archive**, **Download PDF**, **Load more**, **Clear filters**. Disabled: 50 % opacity + `not-allowed`. Loading: inline spinner replaces icon, label stays.

### 6.6 Inputs, dropdowns, filters
- 44px tall, `--r-md` (search is pill), `--surface-2` fill, 1px `--border`; focus ring 2px `--focus` with 2px offset.
- **Filter dropdown:** panel `--r-lg`, `--shadow-2`, sections separated by 1px `--border`; calendar range uses pill-shaped selected range with `--sky-300` fill and `--blue-600` endpoints; pollutant checkboxes are rounded squares (6px); concentration range uses a dual-handle slider with circular handles.
- Active filters appear as removable pill chips under the toolbar.

### 6.7 Segmented control (time range: 24 h · 7 d · 30 d · All)
Pill container `--surface-2`; selected segment is a `--surface` pill with `--shadow-1` and `--ink` text.

### 6.8 Stat tiles (mean, median, SD …)
`--surface`, `--r-lg`, label in `--ink-muted` (0.875rem), value in Outfit 600 (1.563rem), small sublabel for `n`. Group in an auto-fit grid (min 160px).

### 6.9 Tables (summary & archive)
- Rounded container, header row `--surface-2` with 600 weight, 48px row height, zebra `--surface`/`color-mix(--surface-2 40%)`, sticky header, tabular numerals right-aligned, text left-aligned.
- Archive grouped rows: day row with chevron; expands with a 200 ms height transition to hourly rows indented 16px with a 2px `--sky-300` left rule.
- Manual entries get a small pill tag "Manual entry" (`--surface-2`, `--ink-muted`).
- Mobile: tables become stacked label/value cards.

### 6.10 Charts
- Container: `--surface`, `--r-lg`, padding 20px, title (Outfit 600) + one-line plain-language takeaway beneath.
- Lines 2px with rounded joins; bars have top corners rounded (radius 6px); points 4px circles; area fills at 12 % opacity.
- AQI time series uses horizontal bands in the six category colors at 12 % opacity.
- Correlation heatmap: diverging **blue (negative) → white → deep teal/navy (positive)**; cells rounded 6px; values printed in cells; legend as a rounded gradient bar.
- Box plots: rounded 8px boxes, median line 2px, whiskers thin.
- Tooltips: `--surface`, `--r-md`, `--shadow-2`, 12px padding, tabular numerals.
- Every chart has a "View as table" toggle and a text alt summary.
- Insufficient data: centered `--surface-2` rounded panel — "Not enough data yet (n = 4, need 10)".

### 6.11 Loading, empty, error
- **Skeletons** (not spinners) for cards, charts, tables: `--surface-2` rounded blocks with a gentle shimmer (disabled under `prefers-reduced-motion`).
- Empty/error panels: rounded `--surface-2` container, one-line explanation, one action button. Errors state what happened and how to fix it; no apologies, no jokes.

### 6.12 Toasts & tooltips
Pill toasts (bottom-center, 4 s). Tooltips `--ink` background, `--surface` text, `--r-md`, 8px 12px padding, shown on focus as well as hover.

---

## 7. Page layouts

### 7.1 Home
1. Header
2. Page title "Air quality across US cities" + one-line subtext with last update time
3. **Worst air quality** — section heading, card grid (4), full-width **Load more** secondary button (pill)
4. **Best air quality** — same
5. **All cities** — toolbar (sort segmented control, state dropdown) + grid
6. Footer (attribution, disclaimer)

Section headings: Outfit 600, 1.953rem. Sections separated by 48px; no divider lines.

### 7.2 City page
- **Summary panel** (`--r-xl`, `--surface`, `--shadow-1`): left = ring + category + city name + save button; right = current pollutant, concentration, weather tiles (temp, humidity, cloud, precipitation, wind), source note, **View archive** primary button.
- Time-range segmented control (sticky below header on scroll).
- Statistics sections in a 12-column grid; charts span 6 or 12 columns; each section has an Outfit 600 heading and a one-sentence plain-English description.

### 7.3 Archive
- Toolbar row: Back (ghost), Filter (secondary, with active-count badge), view toggle (grouped/table), **Download PDF** (primary, right-aligned).
- Result count + active filter chips.
- Table/accordion in a rounded container; pagination as pill buttons.

### 7.4 Saved cities
- Page title + count; saved cards grid (with Remove).
- Comparison toolbar: metric dropdown, time-range control, city multi-select chips (each chip tinted with its chart color).
- Comparison charts in a responsive grid; side-by-side stats table with best value highlighted (`--sky-300` pill behind the number, plus a text marker for accessibility).

---

## 8. Motion
- Motion only responds to user action or communicates state change: expand/collapse (200 ms ease-out), dropdown open (120 ms fade/scale from 98 %), toast in/out, ring/bar draw on first paint (600 ms, once).
- **No** entrance animations on every section, no parallax, no continuous animation.
- Honor `prefers-reduced-motion: reduce` (disable shimmer, ring draw, transitions).

## 9. Iconography
Lucide icons, 20px, 1.75px stroke, rounded caps/joins. Weather icons: use NWS icon codes mapped to a Lucide set (sun, cloud-sun, cloud, cloud-rain, snowflake, cloud-fog, wind). Icons never replace text on primary actions.

## 10. Content & copy
- Plain, specific, sentence case. Name things how users think: "Air quality", "Primary pollutant", "Saved cities", not internal terms.
- Missing data → `N/A`. Unknown/untracked → "Not available".
- Relative times ("Updated 12 min ago") with the exact local time in a tooltip.
- Dates in city-local time with a timezone label (e.g. "Oct 22, 9:57 AM EDT").
- Units shown beside every concentration (µg/m³, mg/m³); temperature °F by default with a °C/°F toggle in the footer/settings.
- Explain statistics in a one-line plain-language caption (e.g. "Standard deviation: how much readings typically vary from the average.").
- Buttons: verb + object ("Download PDF"). Same action = same name everywhere.

## 11. Accessibility
- WCAG 2.2 AA minimum: text contrast ≥ 4.5:1, UI components/graphics ≥ 3:1.
- Visible focus ring on every interactive element (2px `--focus`, 2px offset), never removed.
- Hit targets ≥ 44×44px.
- AQI color always accompanied by text category; charts use patterns/markers beyond the 4th series.
- Semantic landmarks (`header`, `nav`, `main`, `footer`), logical heading order, `aria-live` for toasts and search results count.
- Respect `prefers-color-scheme` and `prefers-reduced-motion`.

## 12. Responsive
| Breakpoint | Behavior |
|---|---|
| < 640px | 1-column cards, icon-only nav, full-width buttons, stacked table cards, charts full-bleed within 16px gutters |
| 640–1023px | 2-column cards, condensed header |
| 1024–1359px | 3-column cards, full header |
| ≥ 1360px | 4-column cards, max width 1200px content centered |
No horizontal page scroll at 360px; wide tables/charts scroll inside their own rounded container.

## 13. PDF export styling
- Page: US Letter, **landscape**, 0.6in margins, white background (print-friendly; no dark theme).
- Header band: pale blue `#EAF3FB` rounded rectangle containing title "Air quality archive — {City, ST}", generation date, filters, record count.
- Fonts: Outfit (title/numbers) and Figtree (body), embedded; fallback Helvetica.
- Summary stats in a 2-row tile strip; AQI chart image (rounded border) when available.
- Table: header row `#2B6CA3` with white text, zebra rows `#F2F8FD`/white, 9pt Figtree, repeating header on each page, AQI cells tinted with the category color (text always printed too), "N/A" for blanks, "Manual" tag column.
- Footer on every page: "Page X of Y" · data sources (NWS, EPA AirNow, OpenAQ) · "AirNow data are preliminary."

## 14. Do / Don't
**Do:** let the AQI numeral dominate; keep surfaces pale blue and text deep navy; round containers and controls; use whitespace; show `n` and N/A honestly.
**Don't:** use warm cream/beige backgrounds, all-caps eyebrow labels, hover-lift animations on every card, identical gradient washes, drop shadows in neutral black, thin AQI-colored text on light backgrounds, or color-only status.
