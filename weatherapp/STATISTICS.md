# STATISTICS.md — Statistical Analysis Specification

This file **replaces and expands** the statistics requirements in `FUNCTIONALITY.md` (§7.4 city page statistics and §7.7 saved-city comparisons) and **adds a third statistics surface, the Insights page**, which is not described in `FUNCTIONALITY.md`. Where this file conflicts with those sections, **this file wins**. Visual presentation follows `STYLES.md`. Data fields and schema come from `FUNCTIONALITY.md`.

## Existing pages (important context)

The site already has three pages that present statistics. **This is an overhaul of existing pages, not a build from scratch.** Audit what each page does today, then bring it to this spec, reusing the existing routes, navigation, and components wherever they fit.

| Page | Scope of data it analyzes | Status |
|---|---|---|
| **Insights page** | **All data entries across all tracked cities, pooled** (the whole archive) | Exists. Overhaul per §7A. Confirm its actual route in the codebase (likely `/insights`); `FUNCTIONALITY.md` does not list it, so add it to the header navigation docs if missing. |
| **City page** (`/city/[slug]`) | **Only the entries for that one city** | Exists. Overhaul per §4–§6 and §10.1. |
| **Saved cities page** (`/saved`) | **Only the entries for the cities the user has saved**, with a focus on comparing them | Exists. Overhaul per §7 and §10.2. |

The three pages share one statistics module and one set of definitions (§3, §8). The same metric must give the same number on every page when the scope and filters are the same (for example, Columbia's mean AQI on the City page must equal Columbia's value in the Saved page comparison table and in its row on the Insights page).

**Goal:** go beyond descriptive numbers. Help users understand (1) how cities compare, (2) how weather conditions, alone and in combination, relate to AQI and to individual pollutant concentrations, and (3) how much to trust each finding.

> **Agent instructions:** Put all statistical logic in a single, pure, well-tested module (e.g. `lib/stats/`) with no UI or database code inside it. Pages and API routes call this module. Every result object must carry its sample size, method name, and any warnings so the UI can display them.

---

## 1. Principles

1. **Always show `n`.** Every statistic, chart, and test displays the number of observations used.
2. **Suppress rather than mislead.** Minimum sample rules (§2) are enforced in the module, not just the UI. Below the minimum, return `{ status: "insufficient", n, required }`.
3. **`NULL` is not zero.** Exclude `NULL`s. Correlations use pairwise-complete observations.
4. **Effect size before p-value.** Always report magnitude (r, slope, Cohen's d, difference in AQI points) alongside any p-value, and explain it in plain language.
5. **Exploratory labeling.** The site tests many relationships. Mark all hypothesis tests as exploratory, and apply multiple-comparison correction where a family of tests is displayed (§9).
6. **Correlation is not causation.** Include a visible caption wherever relationships are shown.
7. **No interpolation.** Never fill gaps. Irregular timestamps (the manual recordings) are used as-is.
8. **Plain-language captions.** Every chart and table has a one-sentence explanation of what it shows and a dynamically generated takeaway (e.g. "Ozone averages 14 µg/m³ higher when it is above 85°F").

---

## 1A. Analysis scopes

Every function in the statistics module takes an explicit **scope** and must never assume one.

| Scope | Used by | Rows included | Unit of analysis |
|---|---|---|---|
| `global` | Insights page | All entries for all active cities | Entries pooled, **and** cities as units (one summary per city) |
| `city` | City page | Entries for one city | Entries |
| `cities` | Saved cities page | Entries for the selected saved cities (2–10) | Entries per city, compared across cities |

Rules:
- Scope is a parameter of the cache key (§10.4): `(scope, city set, range, dataset, target)`.
- The Saved page's per-city sections reuse the `city` scope functions, and its comparison sections use the `cities` scope.
- Each page shows a scope label near the top ("All 61 cities · 18,402 entries", "Columbia, SC · 1,204 entries", "3 saved cities · 2,877 entries") so the user always knows what is being analyzed.
- **Which sections apply where:**

| Section | Insights | City | Saved |
|---|---|---|---|
| §4 Descriptive statistics | ✔ (pooled + per-city table) | ✔ | ✔ (side by side) |
| §5 Weather–air quality | ✔ (pooled, city-adjusted, §7A.3) | ✔ | ✔ (per-city sensitivity, §7.5) |
| §6 Temporal analysis | ✔ (pooled profiles) | ✔ | ✔ (overlaid) |
| §7 City comparison | ✔ (ranking and groups, §7A) | — | ✔ |
| §7A Insights-only analyses | ✔ | — | — |

---

## 2. Minimum sample sizes (enforced in code)

| Analysis | Minimum `n` | Behavior below minimum |
|---|---|---|
| Mean, median, min, max | 1 | Show value, flag `n` |
| Standard deviation, variance, percentiles, IQR | 5 | "Not enough data yet" |
| Histogram / box plot | 8 | Show data table instead |
| Correlation (r) and regression | 10 pairs | Suppress r, p-value, trend line |
| Group comparison (t-test, Mann–Whitney) | 8 per group | Suppress test; still show group means with `n` |
| ANOVA / Kruskal–Wallis | 8 per group, ≥ 3 groups | Suppress |
| Hour-of-day / day-of-week profiles | ≥ 3 observations per bin | Gray out bins below minimum |
| Binned grid cell (§5.4) | 5 per cell | Cell shown as "n < 5" with no value |
| Conditional probability | 20 total, 5 in condition | Suppress |
| Regression with interactions / random forest | 100 complete rows | Hide section with an explanation and an estimated date it will unlock |
| City included in an Insights ranking or group (§7A) | 10 entries for that city | City listed as "Not enough data" and excluded from the ranking |
| Pooled cross-city analysis (§7A.3, §7A.4) | ≥ 5 cities each meeting the per-city minimum | Suppress; show how many cities qualify |
| Per-city slopes compared across cities (§7A.3) | ≥ 3 cities with ≥ 30 paired weather/AQI rows each | Suppress |

Show a progress hint when data is insufficient: "Weather analysis unlocks after about 100 hourly records. Currently 37."

---

## 3. Data preparation (shared by all analyses)

### 3.1 Datasets
- `all` — every record.
- `automated` — hourly records only (`source = 'automated'`). **Weather and multi-pollutant analyses use this by default**, because manual recordings have no weather data.
- A toggle lets the user include manual recordings in AQI-only analyses.

### 3.2 Time-range filter
24 h · 7 d · 30 d · 90 d · All time. All analyses respect it.

### 3.3 Derived features (compute server-side, store or compute in a view)
| Feature | Definition |
|---|---|
| `local_hour`, `day_of_week`, `month`, `season` | In the **city's local timezone** |
| `is_daytime` | After local sunrise and before local sunset (use a sunrise/sunset library such as `suncalc`) |
| `precip_flag` | `precipitation_type != 'none'` or `precipitation_last_hour_mm > 0` |
| `hours_since_rain` | Hours since the last record with `precip_flag`; `NULL` if none in the window |
| `rain_last_24h_mm` | Sum of hourly precipitation over the previous 24 h (require ≥ 18 of 24 hours present) |
| `wind_dir_sector` | 8 sectors (N, NE, E, SE, S, SW, W, NW) from `wind_direction_deg`; `calm` when wind speed < 1 m/s |
| `temp_bin`, `wind_bin`, `rh_bin`, `cloud_bin`, `pressure_bin` | Bins defined in §3.4 |
| `pressure_change_3h` | Barometric pressure now minus 3 h ago (Pa) |
| `aqi_delta_vs_hour_mean` | AQI minus that city's mean AQI for the same local hour (removes the daily cycle; used to avoid false weather correlations — see §9) |
| `pollutant_delta_vs_hour_mean` | Same for each pollutant concentration |
| `daily_mean_*` | Daily means per metric (used for significance testing, §9) |

### 3.4 Default bins (configurable constants)
- Temperature (°F): `<32`, `32–50`, `50–65`, `65–80`, `80–90`, `>90`
- Wind speed (mph): `calm (<1)`, `1–5`, `5–10`, `10–15`, `>15`
- Relative humidity (%): `<30`, `30–50`, `50–70`, `70–90`, `>90`
- Cloud cover (%): `clear (0–10)`, `few/scattered (10–50)`, `broken (50–90)`, `overcast (>90)`
- Pressure (inHg): terciles of that city's own history (low / medium / high)

### 3.5 Outliers
Do not delete outliers. Flag values beyond 1.5×IQR in box plots and offer a "Hide outliers" toggle for charts only. Statistics use all valid values unless the user toggles "Robust mode" (which uses medians, Spearman, and Mann–Whitney).

---

## 4. Descriptive statistics (per city and per metric)

Metrics: AQI, each pollutant concentration, temperature, dew point, humidity, cloud coverage, precipitation, wind speed, pressure, visibility.

Return per metric: `n`, `n_missing`, mean, median, mode (categorical), min, max, range, standard deviation, variance, coefficient of variation, IQR, 5th/25th/75th/95th percentiles, skewness, 95 % confidence interval for the mean (t-based).

Categorical summaries: AQI category share (% of readings), primary pollutant share, precipitation type share, cloud label share, wind sector share.

Distributions: histogram (Freedman–Diaconis bin width, capped at 30 bins), box plot, and an optional kernel density overlay.

---

## 5. Weather–air quality analysis (new core feature)

All analyses in this section use the `automated` dataset. Each is computed **for AQI and for each pollutant concentration** (PM2.5, PM10, Ozone, NO2, SO2, CO) where `n` allows. Provide a **target selector** ("Explain: AQI | Ozone | PM2.5 | …").

### 5.1 Single-factor relationships
For each weather variable (temperature, dew point, humidity, cloud coverage, wind speed, pressure, pressure change, visibility, precipitation amount, hours since rain):
- Scatter plot with regression line and 95 % confidence band
- Pearson r and Spearman ρ, R², slope with plain-language units ("+1.8 µg/m³ ozone per +10°F"), p-value, `n`
- LOESS or binned-mean trend line (to reveal non-linear relationships)

Expected relationships shown as **hints, not conclusions** (collapsed "What to expect" note per chart):
- Ozone tends to rise with temperature and sunshine and fall with cloud cover.
- Wind tends to dilute pollutants; calm air lets them accumulate.
- Rain tends to lower PM2.5 and PM10 over following hours.
- Humidity can raise PM2.5 (particles absorb moisture).
- High pressure tends to trap pollutants near the ground.
- Visibility should be strongly negatively related to PM2.5 (data sanity check).

### 5.2 Correlation matrix
- Heatmap of Pearson (toggle Spearman) across all numeric metrics, pairwise-complete, with `n` per cell on hover and cells suppressed per §2.
- Option to show the matrix on the **hour-adjusted** variables (`*_delta_vs_hour_mean`) to remove the daily cycle.
- Highlight the top 5 strongest relationships with the AQI target in a ranked list.

### 5.3 Categorical weather groups
Compare the target across groups, with box plots, group means ± 95 % CI, `n` per group, and an omnibus test (Kruskal–Wallis by default, ANOVA in non-robust mode), plus post-hoc pairwise comparisons (Dunn or Tukey) only when the omnibus test is significant:
- Precipitation type (none, rain, drizzle, snow, …)
- Cloud coverage label
- Wind direction sector
- Daytime vs nighttime
- Season

### 5.4 Binned two-factor grids (combinations)
Heatmaps showing the **mean (and median toggle) of the target** for combinations of two binned variables. Each cell shows value and `n`; cells below the minimum are hatched.
Default grids:
1. Temperature × wind speed
2. Temperature × cloud cover
3. Humidity × wind speed
4. Humidity × temperature
5. Pressure × wind speed
6. Hours since rain × wind speed (rain recency)
User can pick any two variables from a dropdown.

### 5.5 Named weather scenarios
Predefined, editable combinations with automatic group comparison against "all other hours":

| Scenario | Definition (defaults) |
|---|---|
| Hot, sunny, calm | temp ≥ 85°F, cloud ≤ 25 %, wind < 5 mph, daytime |
| Cold, clear, calm night (inversion-prone) | temp ≤ 40°F, cloud ≤ 25 %, wind < 3 mph, nighttime |
| Humid and stagnant | RH ≥ 80 %, wind < 5 mph |
| Rainy and windy | precipitation present, wind ≥ 10 mph |
| After rain (24 h) | `hours_since_rain` ≤ 24 |
| High pressure, light wind | pressure in top tercile, wind < 5 mph |

For each scenario: `n`, mean/median target value inside vs outside, difference with 95 % CI, effect size (Cohen's d or rank-biserial), p-value (exploratory), and a plain-language sentence. Users can define a custom scenario with sliders (temp, wind, humidity, cloud, precipitation, time of day).

### 5.6 Conditional probabilities
"When **[conditions]**, how often is **[AQI ≥ threshold]**?" Show probability with a Wilson 95 % interval, `n` in the condition, and the baseline probability for comparison. Default thresholds: AQI > 50, > 100. Include the scenario builder from §5.5.

### 5.7 Multi-variable models (unlocks at ≥ 100 complete rows)
- **Multiple linear regression** of the target on standardized weather variables (temperature, wind speed, humidity, cloud cover, pressure, precipitation flag), optionally with interaction terms (temperature × wind speed, humidity × wind speed). Report coefficients with 95 % CIs, adjusted R², and residual diagnostics summary. Include `local_hour` (sin/cos encoding) as controls.
- **Feature importance** via permutation importance from a small random forest or gradient-boosted trees (run server-side or in a background job; cache the result). Show a ranked bar chart with "relative importance" and the model's cross-validated R².
- **Warnings** displayed beside every model: "Predictive association, not cause"; multicollinearity (VIF > 5) notice; small-sample notice.

### 5.8 Pollutant interplay
- Pairwise scatter and correlation among pollutants (e.g. Ozone vs NO2 — expected to be negatively related in fresh urban traffic).
- Primary-pollutant share by temperature bin, by season, and by daytime/nighttime (stacked 100 % bars).
- Co-occurrence table: how often two pollutants are simultaneously above a "moderate" level.

### 5.9 Wind-direction analysis
- Polar bar chart ("pollution rose"): average target value by 8 wind sectors, with `n` per sector (sectors below minimum faded).
- Wind sector × wind speed table.

---

## 6. Temporal analysis

1. **Hour-of-day profile**: mean and median target by local hour with 95 % CI band; overlay `n`.
2. **Day-of-week profile**: same, with weekday vs weekend test.
3. **Seasonal profile** (unlocks after ≥ 90 days): monthly mean with CI.
4. **Trend**: linear slope per week/month with 95 % CI and the Mann–Kendall test as a robust alternative; use daily means.
5. **Rolling averages**: 24 h and 7 d, shown over the time series.
6. **Autocorrelation**: ACF of hourly AQI (up to 48 lags) to show persistence; display a one-line interpretation ("AQI usually stays similar for ~X hours").
7. **Exceedance summary**: number and share of hours above AQI 50/100/150, longest consecutive run above 100, and number of distinct "events."
8. **Anomaly flags**: hours where `aqi_delta_vs_hour_mean` exceeds ±2 SD, listed with the weather at the time.

---

## 7. City comparison analysis (saved cities page)

This is the existing Saved cities page (scope `cities`). Applies to 2–10 saved cities. Default window: **overlapping observation period** (a toggle allows "all available data per city"). Show `n` per city.

### 7.1 Summary
- Side-by-side stats table (metrics × cities) with best/worst highlighting and a text marker (not color alone).
- Ranking list (cleanest → most polluted) by mean AQI, median AQI, 95th percentile, and % hours above AQI 100. Show rank stability: bootstrap 95 % interval on each city's rank.

### 7.2 Distribution comparisons
- Side-by-side box/violin plots and overlaid histograms/KDE per metric.
- Stacked 100 % AQI category breakdown per city.
- Primary pollutant mix per city.

### 7.3 Pairwise difference tests
For each selected pair and target metric:
- Difference in means/medians with 95 % CI (bootstrap), Cohen's d, Welch's t-test and Mann–Whitney p-values, `n` per city.
- **Paired analysis** on shared timestamps (paired t-test / Wilcoxon signed-rank) when ≥ 10 shared timestamps exist, since matching hours removes weather-time effects.
- Plain-language verdict: "On the 23 days both cities were recorded, Columbia's AQI was on average 12 points higher than Oakland's (95 % CI 6–18)."
- Pairwise p-values shown in a matrix with multiple-comparison correction (§9).

### 7.4 Co-movement
- Cross-city correlation matrix of AQI on **shared timestamps** (and of daily means).
- Scatter of city A vs city B AQI with r and a 1:1 reference line.
- Lagged cross-correlation (±6 h) when hourly data exists, to detect regional systems moving between cities.
- Interpretation text: strong positive correlation suggests shared regional influences; weak suggests local sources.

### 7.5 Weather sensitivity comparison
For each city, show the **same relationship** side by side (e.g. ozone vs temperature slope with CI per city), plus a test for whether slopes differ (interaction test). Include a small-multiples grid of the top weather drivers per city.

### 7.6 Variability and risk
- Standard deviation, coefficient of variation, and 95th percentile per city.
- Spike frequency (hours above city's own mean + 2 SD).
- Time-in-category chart per city.

### 7.7 Weather context comparison
Average temperature, humidity, cloud cover, precipitation frequency, and wind per city, so users can see whether differences in AQI coincide with differences in weather.

---

## 7A. Insights page analysis (all entries, all cities)

The Insights page answers: **what does the whole archive say?** It pools every entry from every tracked city and also treats each city as one unit. Every section follows the same rules as the other pages (§1, §2, §9) and respects the global controls in §10.1.

### 7A.1 Archive overview
- Totals: entries, cities with data, date range, automated vs manual entries, overall data coverage (% of expected hourly records present), and entries added in the last 24 h / 7 d.
- Pooled descriptive statistics (§4) for AQI and every pollutant concentration, with `n` and the number of contributing cities.
- Pooled distributions: AQI histogram and box plot, AQI category share, primary pollutant share, precipitation type share.
- **Coverage heatmap** (cities × time) showing where data is missing, so users can judge how much to trust pooled numbers.

### 7A.2 City rankings and groups
- Ranking table of **all cities** by mean AQI, median AQI, 95th percentile, % hours above AQI 100, and most common primary pollutant. Sortable, with `n` per city, bootstrap rank intervals (§7.1), and cities below the minimum shown separately.
- Distribution of city means (a histogram of the 61 city averages), with the three required cities (Columbia, Oakland, Lamont) marked and their percentile rank among all cities.
- **Group comparisons across cities** (Kruskal–Wallis plus post-hoc, §5.3 rules, using city-level summaries so big cities with more entries don't dominate): by **state, region** (Northeast, Southeast, Midwest, Southwest, West, Pacific, Non-contiguous), **climate type** (an optional city attribute: humid subtropical, semi-arid, Mediterranean, etc.), and **city size band** (an optional attribute from population).
- Where a grouping attribute doesn't exist in the `cities` table yet, add it as a nullable column with a seed, and hide the group comparison until populated.

### 7A.3 Weather and air quality, pooled
- Repeat the §5 analyses on the pooled automated dataset, **with the city effect removed**: use city-demeaned values (each value minus that city's mean) and hour-adjusted values (§3.3). Show the raw pooled result beside the adjusted one and flag when they disagree (a sign of cross-city confounding).
- **Slope by city:** for each pollutant-weather pair (for example ozone vs temperature), compute the slope within each qualifying city, then show a forest plot (slope and 95 % CI per city, plus a pooled estimate using random-effects meta-analysis, DerSimonian–Laird). Report heterogeneity (I²) and say in words whether the relationship is consistent across cities.
- Binned two-factor grids (§5.4) and named scenarios (§5.5) on the pooled data, with `n` and number of cities per cell.
- Show **which cities contribute to each cell or estimate**; no single city may contribute more than 30 % of a pooled cell's observations (otherwise show a "dominated by one city" warning).

### 7A.4 Cross-city structure
- City–city AQI correlation matrix (shared timestamps) for the top N cities by data coverage (default 20), clustered by similarity.
- **Regional synchrony:** average pairwise correlation within each region vs between regions, to show whether air quality moves regionally or locally.
- **Event detection:** hours where more than 25 % of qualifying cities are above AQI 100 simultaneously. List them with the affected cities and the pooled weather, as a way to spot smoke or regional ozone episodes.
- Map or tile-map of current and average AQI by city if a map component already exists. Do not add a map dependency just for this; use a sorted list otherwise.

### 7A.5 Pooled time patterns
- National hour-of-day and day-of-week profiles (using local time per city), with city-level spread bands.
- Month and season profiles once ≥ 90 days of data exist.
- Trend of the pooled daily mean (and of the share of cities in each AQI category) with confidence intervals and the Mann–Kendall test.

### 7A.6 Pollutants across cities
- Primary pollutant mix by region and by season (stacked 100 % bars).
- Distribution of each pollutant's concentration across cities, and which cities have the highest 95th percentile for each.
- Pollutant co-occurrence (§5.8), pooled.

### 7A.7 Your personal recordings
- A dedicated panel for the three personal-recording cities (Columbia, Oakland, Lamont): compare their manual recordings with the automated data for the same days when both exist (paired differences, Bland–Altman plot, correlation). This shows how well the manual readings match the official feeds. Suppress when fewer than 10 overlapping pairs exist.

### 7A.8 Insights-specific rules
- Compute every pooled statistic **two ways**: entry-weighted (all entries pooled) and city-weighted (mean of city means). Default display is **city-weighted**, with a toggle, because entry-weighting lets cities with more data dominate. Label which is shown.
- Never treat pooled entries as independent: observations from the same city are clustered. Use city-level summaries or cluster-robust methods (cluster bootstrap by city) for confidence intervals and p-values.
- Cities that have only manual entries are excluded from weather analyses and flagged in the coverage heatmap.

---

## 8. Statistical methods reference (what to implement)

| Need | Method / library |
|---|---|
| Descriptive stats, percentiles, skewness | `simple-statistics` |
| t-tests, ANOVA, F/χ² distributions, p-values | `jstat` |
| Mann–Whitney, Kruskal–Wallis, Wilcoxon, Mann–Kendall, Dunn post-hoc | Implement in the stats module, validated against a reference (see §11) |
| Bootstrap CIs (default 2,000 resamples, seeded RNG for reproducibility) | Implement |
| Spearman ρ | Rank transform + Pearson (average ranks for ties) |
| LOESS / binned trend | `ml-regression` or a small custom LOESS |
| Multiple regression, VIF | `ml-regression-multivariate-linear` or custom OLS (matrix solve) |
| Random forest / permutation importance | `ml-random-forest` (server-side, background job, cached) — or skip with a clear UI note if too heavy |
| KDE | Gaussian kernel, Silverman bandwidth |
| Wilson interval | Implement |
| Random-effects meta-analysis (DerSimonian–Laird), I² | Implement (Insights, §7A.3) |
| Cluster bootstrap by city, city-demeaning | Implement (Insights, §7A.8) |
| Bland–Altman agreement, hierarchical clustering of cities | Implement (Insights §7A.7, §7A.4) |
| Sunrise/sunset | `suncalc` |

If a method cannot be implemented reliably, leave it out and tell the user, rather than shipping an approximation.

---

## 9. Statistical caveats built into the product

1. **Daily cycle confounding.** Temperature, sunlight, and traffic all follow the clock, so raw correlations can be spurious. Show hour-adjusted results (`*_delta_vs_hour_mean`) alongside raw ones and note when they disagree.
2. **Non-independence.** Consecutive hourly readings are autocorrelated, which makes p-values look too small. Run significance tests on **daily means** by default (with a toggle to use hourly data plus an "optimistic p-values" warning). Report effective sample size when using hourly data (n_eff = n × (1 − ρ₁)/(1 + ρ₁), where ρ₁ is lag-1 autocorrelation).
3. **Multiple comparisons.** When a table or heatmap shows many tests, apply Benjamini–Hochberg false-discovery-rate correction and show adjusted p-values; label results "exploratory."
4. **Monitor and weather-station mismatch.** Show the distance between the air monitor and the weather station on the city page; warn when > 15 miles (always for Lamont).
5. **Data coverage.** Show a coverage bar (percent of expected hourly records present) per city. Warn when comparing cities with very different coverage.
6. **Manual entries.** Excluded from weather analyses (no weather data). In AQI-only analyses they're optionally included, and irregular timestamps mean they bias toward the times the user happened to record (typically daytime). Show a notice when included.
7. **Preliminary data.** AirNow values may be revised; recomputed statistics may change.
8. **Causation.** Every relationship panel carries: "These patterns show association, not cause."
9. **Pooling across cities (Insights page).** A pooled relationship can differ from or even reverse the relationship inside each city (Simpson's paradox), because cities differ in climate and pollution levels. Always show the city-adjusted result and the per-city slopes beside the pooled one, and note when they disagree.
10. **Uneven coverage across cities.** Cities with more entries or longer histories can dominate pooled results. Use city-weighted defaults (§7A.8), show the coverage heatmap, and warn when one city exceeds 30 % of a pooled estimate.
11. **Manual-only cities.** Cities whose only entries are the personal recordings can't contribute to weather analyses and have irregular sampling times; flag them wherever they appear in pooled results.
12. **Consistency across pages.** The same metric, scope, and filters must produce identical numbers on the Insights, City, and Saved pages. If they differ, there is a bug.

---

## 10. UI requirements

### 10.0 Insights page (all entries, all cities)
Sub-navigation (tabs or anchors, reusing the existing page structure where possible):
1. **Overview** — archive totals, pooled descriptive stats, distributions, coverage heatmap (§7A.1)
2. **City rankings** — ranking table, distribution of city means, state/region/climate/size groups (§7A.2)
3. **Weather & air quality** — city-adjusted pooled analyses, forest plots of per-city slopes, grids, scenarios (§7A.3)
4. **Across cities** — city correlation matrix, regional synchrony, multi-city events (§7A.4)
5. **Patterns over time** — pooled hour/day/season profiles and trend (§7A.5)
6. **Pollutants** — pollutant mix and concentrations across cities (§7A.6)
7. **Personal recordings** — manual vs automated agreement for Columbia, Oakland, Lamont (§7A.7)

Global controls (sticky): time range, dataset toggle (automated / include manual), target selector (AQI or a pollutant), **weighting toggle (city-weighted / entry-weighted)**, robust mode, hour-adjusted toggle, and a city filter (all cities, or a chosen state/region).

### 10.1 City page → "Statistics" section (tabbed or anchored sub-navigation)
Scope: only that city's entries.
1. **Overview** — descriptive stats table, distributions, time series, data-quality panel
2. **Weather & air quality** — target selector, single-factor scatter grid, correlation matrix, categorical groups, binned two-factor grids, scenarios, conditional probability, wind rose, pollutant interplay
3. **Patterns over time** — hour/day/season profiles, trend, rolling averages, ACF, exceedances, anomalies
4. **Models** — regression and feature importance (shown locked with progress until the minimum is met)

Global controls (sticky): time-range, dataset toggle (automated / include manual), target selector, robust mode, hour-adjusted toggle.

### 10.2 Saved cities → "Compare" section
Scope: only the user's saved cities. Per-city sections reuse City page components; the comparison sections are the focus of the page.
Sub-tabs: **Summary**, **Distributions**, **Differences**, **Co-movement**, **Weather sensitivity**, **Variability**. Controls: city chips (2–10), metric/target selector, window (overlap vs all), robust mode.

### 10.3 Result presentation rules
- Each result card: title, one-sentence description, the chart/table, the generated takeaway, a "Details" disclosure (method, `n`, CI, p-value, adjusted p-value, caveats), and "View as table".
- Show statistical significance in words and numbers: "Likely a real difference (p = 0.01, exploratory)" vs "No clear difference (p = 0.38)". Never use "proves."
- Insufficient-data cards follow `STYLES.md §6.10` and show the unlock hint from §2.
- Natural-language takeaways are generated from the numbers by templates, never hard-coded, and must not claim more than the stats support (use "tends to", "is associated with").
- Plain-language glossary tooltips for: standard deviation, correlation, p-value, confidence interval, effect size, R².

### 10.4 Performance
- Heavy computations (bootstrap, permutation importance, large correlation matrices, the Insights pooled analyses and city-by-city slope fits) run server-side, cached per `(scope, city set, range, dataset, target, weighting)`, and recomputed after each hourly ingest. Insights computations over the whole archive should be precomputed into summary tables or materialized views per city (counts, sums, sums of squares, cross-products) so pooled results don't rescan every row on each request.
- Return aggregated chart data only; never ship raw tables of thousands of rows to the browser except in the archive.
- Provide skeletons and a "Calculating…" state for any computation longer than 500 ms.

---

## 11. Testing requirements

1. **Unit tests against hand-calculated values** using the Columbia, Oakland, and Lamont seed data: mean, median, SD, percentiles, IQR for AQI per city.
2. **Cross-validate against a reference implementation** (e.g. generate expected values with Python `scipy`/`statsmodels` and commit them as fixtures) for: Pearson, Spearman, linear regression, t-test, Welch's t-test, Mann–Whitney, Kruskal–Wallis, Wilcoxon, Mann–Kendall, Benjamini–Hochberg, Wilson interval, bootstrap (seeded).
3. **Edge cases:** all-identical values (zero variance → correlation undefined, not NaN), ties in ranks, all NULL, single group, `n` exactly at and one below each minimum in §2, and non-overlapping city windows.
4. **Suppression tests:** the module returns `insufficient` below every minimum; the UI never renders r, p, or trend lines in that case.
5. **Derived-feature tests:** `hours_since_rain`, `wind_dir_sector` (including calm), timezone handling across daylight-saving transitions, `is_daytime`, hour-adjusted deltas.
6. **Synthetic-data integration test:** generate a dataset with a known relationship (e.g. ozone = 0.5 × temperature + noise, and a known city difference) and confirm the pipeline recovers it and the takeaway text is correct.
7. **Performance test:** the Overview and Weather tabs return in under 2 seconds on a city with 1 year of hourly data (~8,760 rows). The Insights Overview and City rankings tabs return in under 3 seconds with 60 cities × 1 year (~535k rows), using precomputed summaries.
8. **Cross-page consistency test:** for the same city, range, dataset, and filters, the City page, Saved page, and Insights ranking return identical values for mean, median, SD, and `n`.
9. **Pooling tests:** a synthetic dataset where the pooled correlation is positive but every within-city correlation is negative (Simpson's paradox) must show the city-adjusted result as negative and raise the disagreement flag. Test city-weighted vs entry-weighted means, the 30 % dominance warning, random-effects meta-analysis against a reference (`statsmodels` or `metafor` fixture), and cities below the minimum being excluded from rankings.
10. **Scope tests:** every statistics function rejects a missing scope, and results for scope `city` never include rows from other cities.

---

## 12. Acceptance criteria
1. Every statistic and chart displays `n`; none renders below the minimums in §2.
2. A user can select any pollutant or AQI and see how each weather variable relates to it (§5.1), with plain-language slope text.
3. The six default two-factor grids and six named scenarios work and show per-cell `n`.
4. Conditional probability tool returns a value with a Wilson interval and baseline.
5. The Saved page compares ≥ 3 cities with rankings, difference tests with CI and effect size, paired analysis on shared timestamps, co-movement, and weather sensitivity.
6. Hour-adjusted results and daily-mean significance testing are available and on by default for hypothesis tests.
7. Multiple-comparison correction is applied wherever a family of tests is displayed.
8. All caveats in §9 appear in the UI in the places specified.
9. All tests in §11 pass; fixtures are committed.
10. With only the 69 manual seed rows, the site shows AQI-only statistics correctly and clearly locks every weather-dependent analysis with an unlock hint (it must not error or show fabricated results). This holds on the Insights, City, and Saved pages.
11. The existing Insights, City, and Saved pages are overhauled in place (same routes and navigation); none is lost or duplicated.
12. Each page shows its scope label, and the same metric gives identical numbers across the three pages for the same scope and filters.
13. The Insights page provides the seven sections in §10.0, defaults to city-weighted results with a visible toggle, shows city-adjusted and per-city (forest plot) results beside any pooled weather relationship, and flags pooled results dominated by one city.

## 13. Build order
1. Derived-feature layer and data-preparation functions (§3), with tests.
2. Core statistical functions and reference fixtures (§8, §11.2).
3. Descriptive stats and distributions (§4).
4. Single-factor weather analysis, correlation matrix, groups (§5.1–5.3).
5. Binned grids, scenarios, conditional probability (§5.4–5.6).
6. Temporal analysis (§6).
7. City comparison analysis (§7) on the Saved page.
8. Insights page analyses (§7A), including per-city summary tables for fast pooled queries.
9. Models (§5.7), wind rose, pollutant interplay (§5.8–5.9).
10. UI integration on all three existing pages, takeaway templates, caveat display, scope labels, locked/unlock states (§10).
11. Cross-page consistency checks, performance, and caching pass.
