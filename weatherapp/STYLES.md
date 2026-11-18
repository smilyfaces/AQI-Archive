# Airwise design system

Airwise uses the Cotton Candy palette, Fraunces for editorial headings, and Instrument Sans for controls and reading text. Hairlines, horizontal spacing, and tabular numbers create hierarchy across city rows, tables, and charts.

## Theme

Edit the palette primitives at the top of [app/theme.css](app/theme.css) to change the scheme. Add a `[data-theme="name"]` block that overrides those primitives to make an alternate scheme, then set that attribute on the document root. Tailwind 4 utilities such as `bg-surface`, `text-ink`, `border-line`, and `ring-focus` resolve through the semantic tokens in the same file.

| Primitive | Color | Use |
| --- | --- | --- |
| Bubble Gum | `#F3A2BE` | Selected filter chips |
| Cotton Candy | `#FFD3DD` | Soft accents and notices |
| Candy Floss | `#F0F9F8` | Page background |
| Mint | `#C6E6E3` | Controls and gauge tracks |
| Wintergreen | `#81BFB7` | Accent fills |
| Ink | `#463C3F` | Headings and body text |

The deep teal and rose primitives are used for chart marks and interactive emphasis. The file also defines font families, the type scale, radii, shadows, card padding, and hairline width.

### AQI scale

The EPA category fills and their deeper gauge strokes live in a separate block. A palette change leaves category meanings and colors consistent. [lib/theme.ts](lib/theme.ts) maps AQI values to CSS variables at thresholds 50, 100, 150, 200, and 300 and exports the chart series color variables.

## Components

- **AqiRing** draws a clockwise, rounded SVG arc capped at 300 and labels the numeric AQI. Missing AQI shows N/A over the empty track. Reduced-motion users see the final arc immediately.
- **CityCard** includes the gauge, pollutant and units, weather, source note when available, local timestamp, and a separate Save control. Decorative local photos fade into the surface. See [city credits](public/cities/CREDITS.md) for attribution.
- **FilterBar** exposes a shareable directory search, sorting, and multi-select facets. On mobile, the advanced controls use a native modal sheet with Apply and Clear.
- **ChartPanel** manages the analysis workspace. Panels can be added, changed, duplicated, resized, reordered, and removed. Layout state lasts for the mounted workspace. The two default panels expose the existing time-series and distribution controls.

## Charts and tables

Use deep teal and deep rose for the first two series and the semantic series order for comparisons. Keep chart grids horizontal, use clear metric labels and units, and show tabular numbers for ticks and table cells. Time series can show two stacked variables along the same time domain. Preserve the effective sample sizes, suppression messages, and interpretation notes. Tables scroll horizontally on narrow screens.

## Layout and interaction

- Use editorial type, spacing, and dividers to establish hierarchy.
- Keep focus visible and preserve native keyboard behavior for dialogs, filters, and panel options.
- Keep each city row readable independent of its photo. Use the accent fills for surfaces and the deeper tones for small marks.
- Reserve pills and badges for meaningful state. Avoid decorative heroes, glowing borders, chart gradients, and identical icon tiles.
- Keep mobile content in one column when space is limited. Use horizontal section navigation for the analysis workspace on narrow screens.
