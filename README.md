# HORIZON

**Your landing slipped. Here is what that does to your sunlight and your line to Earth.**

HORIZON shows, for lunar south-pole sites, when a lander has sunlight (power) and a line of sight to Earth (direct-to-Earth radio), using real terrain. Its **Slip Matrix** answers the question mission teams face when a launch moves: *if we land N days later, which sites still work?*

**Try it:** https://tiasella1802-alt.github.io/HORIZON/

Challenge: [Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/), 2026 NASA Space Apps Challenge.

## What it does

The layout works like a map app. The 3D Moon fills the screen. On the left, you **search for a site, pick a landing date, drag the launch-delay slider, and read the verdict**. Category chips along the top open the slip calendar, real landings, comparisons, the sky chart and the accuracy checks in a slide-up drawer. A time bar at the bottom plays or scrubs through the mission.

- **Verdict.** A large GO / NO-GO with two meters: sunlight (power) and Earth in view (radio). Each meter marks the mission's requirement. A plain-language reason explains the result. On NO-GO, **one-click fixes** appear: the nearest landing date that works, and other polar sites that work on the same date.
- **60-second tour.** Walks through the pitch on live data. A site is GO, the launch slips, it turns NO-GO, and HORIZON finds a site that still works. It also covers the slip calendar and the accuracy check.
- **Any spot, not just the list.** Type a latitude and longitude, or click the map, anywhere from 75°S to the pole. The browser traces that spot's skyline in about a second from 80 m LOLA tiles within 12 km (84–90°S) and a 480 m map out to 300 km, then gives the same answer, sky view and 3D terrain as the built-in sites.
- **Landing time and countdowns.** Pick the landing hour (UTC) as well as the day. The answer card and the time bar say how long until the Sun and Earth set (or rise) after touchdown.
- **Why it matters.** A short plain-language page for students and the public: why the south pole, why the low Sun and Earth make it hard, and who the tool is for.
- **Share this plan.** Site, date, hour and delay (and your own spot) are kept in the URL.
- **3D terrain (three.js).** A 300 km-wide disk of LOLA terrain on a polar mesh: about 60 m detail near the site, coarser farther out, with the Moon's curvature included and the edge fading into space. It is lit by the Sun at its true position, with cascaded shadow maps for sharp near and long far shadows. Earth is shown at its true size and phase, and the ground has fine regolith texture. **Play the mission** runs through the landing window. **Stand on the Moon** puts you at mast height; beyond the disk, the full 300 km ray-marched skyline is drawn as a silhouette. The ground uses Lommel–Seeliger shading (how lunar soil really reflects light), so lit terrain stays bright under a 2° Sun instead of going black. Because polar skylines rise only 1–3°, the stand view stretches the picture vertically ×2.5 by default; it is a projection change, so the terrain, Sun and Earth stretch together and what hides behind what stays exactly as in the data. A button switches back to true scale. Sub-DEM ground roughness is added for texture, kept below 0.15° so it can never hide a Sun the data says is up.
- **Skyline panorama.** The 360° terrain horizon from LOLA laser altimetry, with the Sun's and Earth's paths over the mission window. Hovering shows how far away the blocking terrain is.
- **Site comparison.** For up to 4 sites: percent of time sunlit, Earth in view, both at once, hours of sun until first darkness, longest dark period, longest Earth blackout, and a relative power index. Each site gets a GO / NO-GO against your thresholds.
- **Timeline.** Hour-by-hour sunlight and Earth visibility for each compared site.
- **Slip Matrix.** Every site × every landing day from −30 to +30 days. Green means the site meets your mission's sunlight and Earth-contact thresholds.
- **Mast height.** Recomputes everything for equipment 0, 2 or 10 m above the ground.
- **Validation.** Sun and Earth positions are compared with JPL Horizons, and the differences are shown in the app.

## Run it

Requires Python 3.11+ and Node 18+.

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r pipeline/requirements.txt   # macOS/Linux: .venv/bin/python
cd pipeline
../.venv/Scripts/python download.py          # ~340 MB: LOLA DEMs + SPICE kernels (add --fine for the 20 m DEM)
../.venv/Scripts/python build.py             # all sites, 2027-01-01 + 730 days, writes web/public/data
../.venv/Scripts/python validate_horizons.py # cross-check vs JPL Horizons (needs internet)
../.venv/Scripts/python download.py --illumination && ../.venv/Scripts/python validate_illumination.py  # vs NASA GSFC maps (+334 MB)
cd ../web
npm install
npm run dev                                   # or: npm run build -> static site in web/dist
```

`build.py --sites mons-mouton,south-pole --days 90 --az-step 1` gives a fast partial rebuild.

## Method

1. **Sites.** Feature centers come from the USGS Gazetteer of Planetary Nomenclature (`pipeline/sites.json`). Each site is moved to the highest LOLA point on the feature: a mountain's summit, or a crater's rim ring. These coordinates are illustrative. They are not NASA's official landing-site coordinates.
2. **Terrain horizon** (`horizon.py`). From the site, 720 rays (every 0.5°) march outward along great circles from 2 DEM pixels out to 300 km. Each ray samples the finest available LOLA polar DEM: 20 m (optional), 40 m, 80 m, then 240 m. For each azimuth, the horizon is the largest elevation angle of terrain, accounting for the Moon's curvature: `atan2(r2·cos δ − r1, r2·sin δ)`.
3. **Ephemerides** (`ephem.py`). The Sun and Earth are taken from DE440 via NAIF SPICE (spiceypy), in the MOON_ME frame (the frame of the LOLA DEMs), with light-time and aberration corrections. They are then converted to local azimuth and elevation at the site, hourly.
4. **Visibility** (browser, `web/src/model.ts`). The fraction of the solar disk above the horizon at the Sun's azimuth is computed from the true disk radius. "Sunlit" means at least 50% of the disk is visible. Earth counts as in view when its center is above the horizon. Solar output is the visible fraction of the solar disk times the array rating (a Sun-tracking array); an hour-by-hour battery model (array W, load W, battery Wh) flags plans where the battery runs flat.
5. **Slip Matrix.** Prefix sums make each site × date cell a constant-time lookup, so the full 11 × 61 matrix updates instantly when thresholds or mast height change.

## Real landings, replayed

`pipeline/missions.json` lists three real south-polar landings, with sources: Chandrayaan-3, IM-1 and IM-2. `build.py` replays each one at its published coordinates, over its own 32-day historical window. The app shows HORIZON's sunsets and sunrises next to what really happened. For example, Chandrayaan-3's terrain sunset falls on 4 Sep 2023, the day ISRO put the lander to sleep. The site terrain heights also match NASA LROC's published elevations to within 2–14 m. Japan's SLIM is left out because its story (solar-panel orientation) is outside HORIZON's model.

## Validation

`validate_horizons.py` queries the JPL Horizons API for Sun and Earth azimuth and elevation at three built sites. It runs every 6 hours over 3 days and writes the differences to `web/public/data/validation.json`, which the app displays.

`validate_illumination.py` (after `download.py --illumination`) compares HORIZON with NASA GSFC's [Lunar Polar Illumination maps](https://pgda.gsfc.nasa.gov/products/69) (Mazarico et al., 2011). It uses the same definition: the fraction of time any part of the Sun's or Earth's disk is above the horizon, every 2 h over 18.6 years. The comparison covers the 10 polar sites plus 150 random points: sunlight r = 0.992 (median difference 0.24 percentage points), Earth r = 0.993 (0.11 points). At sharp summits HORIZON reads a few points higher, because it evaluates the exact peak while NASA's 60–120 m pixels average the slopes around it.

**Your own spot.** The in-browser calculation was run at the built-in sites and compared with the full-resolution pipeline over 2027–2028 (`web/public/data/validation_custom.json`). At the 9 sites inside the 80 m tiles: median difference 3.0 percentage points of sunlight and 0.8 of Earth contact; the hour-by-hour good/not-good answer agrees 97.7% of the time (worst site 93.5%). Mons Cabeus, outside the tiles, agrees 87.6%. The largest Earth error is at the pole itself (4.1% vs 30.4%), where Earth grazes the horizon and a few metres of skyline decide it.

## Limits

- DEM resolution is 20–240 m per pixel, so boulders and small features are not in the horizon.
- Rays stop at 300 km or the edge of DEM coverage (about 75°S).
- Your own spots use coarser terrain than the built-in sites: rough north of 84°S, and weakest for Earth contact right at the pole.
- The power index is relative. It is not watts.
- The 2027–2028 period is precomputed. To change it, rebuild with `--start` and `--days`.
- The Apollo 11 site lies outside the polar DEMs, so it uses a smooth-sphere horizon and is included only for contrast.

## Data and credits

- LRO Lunar Orbiter Laser Altimeter (LOLA) polar gridded DEMs, PDS Geosciences / [MIT LOLA node](https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/). Smith et al., LRO LOLA team, NASA GSFC.
- NAIF SPICE [generic kernels](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/): `de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `naif0012.tls`.
- [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) API, used for validation.
- [USGS Gazetteer of Planetary Nomenclature](https://planetarynames.wr.usgs.gov/), used for feature locations.
- Interface font and icons from [Google Fonts](https://fonts.google.com/): Public Sans and [Material Symbols](https://fonts.google.com/icons) (open licences).

## Use of Super Intelligence (SI)

The NASA Space Apps rules require SI-generated code and data to be acknowledged. **Most of the code and text in this
repository was generated with Claude (Anthropic), an SI assistant.** That includes the Python pipeline (`pipeline/`), the web app
(`web/src/`), the validation scripts, this README and `SUBMISSION.md`. Claude also proposed the project concept and
researched the mission facts. All data is real NASA and public data (listed above), and no SI-generated images, audio or video
are used.

Team contribution: TODO, in the team's own words.
