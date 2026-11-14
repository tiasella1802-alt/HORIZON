# Space Apps 2026 submission: HORIZON

Challenge: **Lunar Landing Site Navigator**. One section per field of the official Project page form
(Project Submission Guide, Nov 13 2026). Copy each section into the matching field. All content must be in English.

## Before you submit: settle these first

1. **The SI rule on ideas.** The official guide says SI "should not be used to come up with your idea of how to solve the
   challenge." HORIZON's concept was proposed by an SI assistant (Claude), and most of its code was written by it.
2. **Timing.** Most of this project was built in late October 2026, before the hackathon began on November 14. The rules say
   not to start before then, and git history shows the dates.
3. **The "Confirm All Work is Original" box** must be ticked to submit.

Talk to your Local Lead before submitting. Explain both points honestly and follow their decision. The
"Use of Super Intelligence (SI)" field below states the facts; don't remove them.

---

## Project Name

HORIZON: Lunar Landing Windows

(Tagline for the demo and page: *Will a Moon lander have sunlight and a way to call home, even when launch is late?*)

## High-Level Project Summary

(188 words; the form suggests 50-200.)

HORIZON is a web app that answers one question for any spot near the Moon's south pole: will a lander there have sunlight for power and a clear line to Earth for radio? At the pole the Sun never rises high. It circles the horizon, so a ridge tens of kilometres away can block it for days. The challenge asks for a quick way to compare landing sites and times, and to re-check them when schedules change.

You pick a site or type any coordinates, then a landing date and hour. HORIZON checks every hour of the mission against NASA LRO laser-altimeter terrain and JPL Sun and Earth positions. It answers "Good to land" or "Not good on this date", shows the time left before sunset and Earthset, and suggests days or sites that work instead. A launch-delay slider, a calendar of every site on every day, and a 3D view of the real terrain show the trade-offs.

Its results match NASA Goddard's south-pole sunlight maps (correlation 0.99 at 160 points), and a replay of India's Chandrayaan-3 puts sunset on the day ISRO put the lander to sleep.

## Link to Project Demo

Required: a video of **30 seconds or less**, or a slide deck of **at most 7 slides**. Longer demos are not eligible for Global
Judging. Host it publicly (YouTube unlisted, Google Drive "anyone with the link", or GitHub) and test the link in a private
window. The two options are drafted at the end of this file.

Video (30 s, YouTube, Unlisted): paste the link here after uploading.

## Link to Final Project

- Live app: https://tiasella1802-alt.github.io/HORIZON/
- Code: https://github.com/tiasella1802-alt/HORIZON

Paste the live app link in the form's Project field. Test both logged out.

## Detailed Project Description

**What it does.** You pick a place near the lunar south pole and a landing day, and HORIZON gives a plain answer with three
simple rows:

- **Sunlight on solar panels**: the percent of the mission the Sun is above the local hills.
- **Can talk to Earth**: the percent of the mission Earth is above the horizon, for direct radio.
- **Battery**: whether a simple lander battery survives the longest dark spell.

It also says how long after touchdown the Sun and Earth set (or rise). If the answer is no, "Try instead" buttons offer the
nearest day or another place that works. Other views:

- **Your own spot**: type coordinates or click the map anywhere from 75°S to the pole; the skyline is traced in your browser in about a second.
- **Landing time**: choose the hour (UTC) as well as the day.
- **Why it matters**: a plain-language page for students and the public on why the south pole is hard.

- **Best days to land**: every site against every day, a month either way. The challenge itself says schedules change.
- **Real missions**: three real landers replayed (below).
- **Compare places**, **Sky view** (Sun and Earth paths over the real skyline), and **How we know** (validation).
- **3D view**: the real terrain, lit by the Sun at its true position, from above or standing at the site; plays through the mission hour by hour.
- **Share** and **Print**: a link to the exact plan, and a one-page summary.

**How it works.**

1. Ten polar sites come from the USGS planetary names database; each is moved to the highest real terrain point on that summit or crater rim.
2. For each site, the skyline is traced in 720 directions out to 300 km over NASA LOLA terrain maps (40–240 m per pixel), including the Moon's curvature.
3. Sun and Earth positions come from JPL's DE440 ephemeris via NASA NAIF SPICE, every hour for 2027–2028.
4. The browser combines them: how much of the Sun's disk clears the skyline, whether Earth does, and an hour-by-hour battery balance.

**Real missions, replayed** at their published coordinates and landing times:

- **Chandrayaan-3** (ISRO, 69.37°S): sunset at the site on 4 Sep 2023, the same day ISRO put the lander to sleep. Night lasted 15.8 days; it never woke.
- **IM-1 Odysseus** (80.13°S): terrain sunset on 2 Mar 2024. Last contact came 2 days earlier from a lander lying on its side; HORIZON doesn't model lander tilt, and says so.
- **IM-2 Athena** (84.79°S): the Sun stayed only 2.5–3° high, low enough that a wall 1 m tall, 20 m away, hides it. Athena lay in a 20 m crater, smaller than HORIZON's terrain detail.

**How we know it's right.**

- Long-run sunlight and Earth visibility match NASA Goddard's south-pole illumination maps (Mazarico et al. 2011): correlation 0.992 and 0.993, median differences of 0.24 and 0.11 percentage points, at 160 locations.
- Sun and Earth positions match JPL Horizons to within 0.000025°.
- Terrain heights at the landing sites match NASA LROC's published elevations: 530 vs 532 m (Chandrayaan-3) and 2,593 vs 2,579 m (IM-1).
- Your-own-spot results, checked at the built-in sites against the full pipeline: median difference 3.0 points of sunlight and 0.8 of Earth contact, same answer 97.7% of the time.

**Benefits and goals.** A one-screen answer to a question that otherwise needs an expert and several tools, at exactly the
moment schedules slip. It also shows students and the public why the south pole is hard. Next steps: the north pole, sunlit rover routes, and lander tilt.

**Limits.** Terrain detail is 40 m or coarser, so boulders and small craters are missed. Sites are illustrative, not official.
Your own spots use coarser terrain: rough north of 84°S, and weakest for Earth contact right at the pole.
The battery model is deliberately simple.

**Tools.** Python (NumPy, SpiceyPy, Pillow) for the precomputation; TypeScript, React, three.js and Vite for the web app;
GitHub Pages for hosting.

## Use of Super Intelligence (SI)

*(Not shown to judges, but required and must be accurate. Edit the team part to describe what you actually did.)*

Yes. We used Claude (Anthropic), an SI assistant, extensively:

- **Idea and research:** Claude researched the challenge and past winners and proposed the HORIZON concept.
- **Code:** Claude wrote most of the Python data pipeline and the web application, and ran and debugged them.
- **Data checks:** Claude ran the validation against NASA Goddard's maps and JPL Horizons, and researched the real-mission facts from public sources.
- **Text:** Claude drafted the documentation and this submission text.

Team contribution: TODO, in your own words. What you decided, tested, checked and changed, and what you can explain yourselves.

The code is acknowledged as SI-generated in the repository README and in the app. No SI-generated images, video or audio are
used, and no NASA logos or branding.

## NASA Data

One row per "Add New Link" in the form. All links checked and public.

| Link Text | Link Url |
|---|---|
| NASA LRO LOLA polar terrain maps (PDS Geosciences) | https://pds-geosciences.wustl.edu/missions/lro/lola.htm |
| LOLA polar DEM files LDEM_85S_40M, 80S_80M, 75S_240M, 60S_240M (MIT LOLA node) | https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/ |
| NASA GSFC Lunar Polar Illumination maps (PGDA), used for validation | https://pgda.gsfc.nasa.gov/products/69 |
| NASA NAIF SPICE generic kernels (JPL DE440 ephemeris, Moon frames, leap seconds) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ |
| NASA NAIF SPICE Toolkit (CSPICE) | https://naif.jpl.nasa.gov/naif/toolkit.html |
| NASA JPL Horizons System, used for validation | https://ssd.jpl.nasa.gov/horizons/ |
| NASA LRO Camera (LROC) | https://www.lroc.asu.edu/ |
| LROC image: Chandrayaan-3 landing site | https://lroc.im-ldi.com/images/1314 |
| LROC image: IM-2 Athena resting place | https://lroc.im-ldi.com/images/1408 |

## Space Agency Partner Data and Other References

| Link Text | Link Url |
|---|---|
| ISRO Chandrayaan-3 mission page | https://www.isro.gov.in/Chandrayaan3.html |
| Chandrayaan-3 landing time (Wikipedia) | https://en.wikipedia.org/wiki/Chandrayaan-3 |
| Chandrayaan-3 wake-up attempt (The Tribune) | https://www.tribuneindia.com/news/india/isro-makes-attempt-to-wake-up-chandrayaan-3s-lander-rover-no-signals-from-them-so-far-546808 |
| IM-1 Odysseus site, landing and last contact (Wikipedia) | https://en.wikipedia.org/wiki/IM-1 |
| IM-1 radio silence after night (Leonard David) | https://www.leonarddavid.com/commercial-moon-lander-odysseus-radio-silence-no-call-home/ |
| IM-2 Athena landing time (Wikipedia) | https://en.wikipedia.org/wiki/IM-2 |
| IM-2 mission end (Spaceflight Now) | https://spaceflightnow.com/2025/03/07/intuitive-machines-im-2-mission-ends-with-lander-on-its-side-on-the-moon/ |
| USGS Gazetteer of Planetary Nomenclature | https://planetarynames.wr.usgs.gov/ |
| Mazarico et al. 2011, Illumination conditions of the lunar polar regions (Icarus) | https://doi.org/10.1016/j.icarus.2010.10.030 |
| NumPy | https://numpy.org/ |
| SpiceyPy | https://github.com/AndrewAnnex/SpiceyPy |
| Pillow | https://python-pillow.org/ |
| React | https://react.dev/ |
| three.js | https://threejs.org/ |
| Vite | https://vitejs.dev/ |
| TypeScript | https://www.typescriptlang.org/ |
| Public Sans font (Google Fonts) | https://fonts.google.com/specimen/Public+Sans |
| Material Symbols icons (Google Fonts) | https://fonts.google.com/icons |
| Claude by Anthropic (SI assistant used for code and text) | https://www.anthropic.com/claude |

---

## Demo option A: 30-second video (chosen)

Keep it at 30 seconds or less. Add English captions (YouTube can generate them; check the wording).

| Time | On screen | Say / caption |
|---|---|---|
| 0:00–0:04 | Shackleton rim, **Stand there** view, Sun low on the skyline | "At the Moon's south pole the Sun barely rises. A hill far away can block it for days." |
| 0:04–0:09 | **View from above**, Mons Mouton showing **Good to land** | "HORIZON tells you if a lander will have sunlight for power and a radio link to Earth." |
| 0:09–0:16 | Drag **What if launch is late?** until it says **Not good on this date**, then click a row under **Try instead** | "Pick a place and a time. If the launch slips, it finds a day or a site that still works." |
| 0:16–0:21 | Search box: type coordinates (for example −88.7, −60), press **Check**; show the sunset and Earthset countdown | "It works for any spot near the pole, and shows the time left before sunset and Earthset." |
| 0:21–0:26 | **Real missions**: Chandrayaan-3 row "Sunset … (same day)" | "Replaying Chandrayaan-3, it puts sunset on the day the lander went to sleep." |
| 0:26–0:30 | **Accuracy** chart, then a card with "HORIZON", team name and site link | "Built on NASA data, checked against NASA. HORIZON, by team [name]." |

### How to record and upload (Windows)

1. Open the app in Chrome and press F11 for full screen. Close the welcome box first.
2. Press **Win + Alt + R** to start and stop recording (Xbox Game Bar). The file goes to Videos > Captures.
3. Trim to 30 seconds and add the title and end cards in **Clipchamp** (built into Windows), then export at 1080p.
4. Upload to YouTube and set visibility to **Unlisted** (anyone with the link can watch, no sign-in). Do not choose Private.
5. Open the link in a private browser window to check it plays, then paste the full URL (https://www.youtube.com/watch?v=...) into the form.

## Demo option B: 7 slides

1. **Title:** HORIZON, the tagline, team name, member names, and the challenge (Lunar Landing Site Navigator).
2. **The problem:** a 3D screenshot of the low Sun over the polar terrain. "At the pole, hills block the Sun for days. Late launches change everything."
3. **The answer:** the answer card. Pick a place, pick a day, get "Good place to land" or "Not a good time here".
4. **What if launch is late?** ✓ → slider → ✕ → "Try instead" → ✓, with three screenshots.
5. **It already happened:** Chandrayaan-3, with HORIZON's sunset on the same day ISRO put it to sleep.
6. **Built on NASA data, checked against NASA:** LOLA terrain, JPL ephemeris, and the 0.99 match chart.
7. **The future:** any point on the Moon, rover routes, the north pole. Closing line.
