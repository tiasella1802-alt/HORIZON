import { useCallback, useEffect, useMemo, useState } from "react";
import Brief from "./components/Brief";
import CompareCards from "./components/CompareCards";
import Panorama from "./components/Panorama";
import RealMissions from "./components/RealMissions";
import SiteMap from "./components/SiteMap";
import SiteSearch from "./components/SiteSearch";
import SlipMatrix from "./components/SlipMatrix";
import Terrain3D, { SPEEDS, ViewMode, registerTerrain } from "./components/Terrain3D";
import TimeBar from "./components/TimeBar";
import Timeline from "./components/Timeline";
import Validation from "./components/Validation";
import Verdict from "./components/Verdict";
import Icon, { IconName } from "./components/Icon";
import WhyItMatters from "./components/WhyItMatters";
import { buildCustomSite, parseCustomId } from "./custom";
import {
  Criteria, DAY, HOUR, IndexFile, Site, Visibility, computeVisibility, evaluate, firstGoodDay, fmtDate, fmtDay,
  goodSitesAt, hourIndex, loadIndex, loadSite, nearestGoodShift,
} from "./model";

// Map-style layout: the 3D Moon fills the screen; a search panel floats on the left, a minimap and view
// controls on the right, a time bar at the bottom, and the detailed views slide up in a drawer.
type Tab = "why" | "calendar" | "missions" | "compare" | "sky" | "accuracy";
const TABS: { id: Tab; label: string; icon: IconName; hint: string }[] = [
  { id: "why", label: "Why it matters", icon: "info", hint: "Why the south pole is hard" },
  { id: "calendar", label: "Best days", icon: "calendar", hint: "Every site on every day" },
  { id: "missions", label: "Real missions", icon: "rocket", hint: "What happened to real landers" },
  { id: "compare", label: "Compare", icon: "compare", hint: "Sites side by side" },
  { id: "sky", label: "Sky view", icon: "landscape", hint: "Sun and Earth paths over the skyline" },
  { id: "accuracy", label: "Accuracy", icon: "verified", hint: "Checked against NASA data" },
];
const WELCOME_KEY = "horizon-welcomed";
const DEFAULT_SITE = "mons-mouton";
const DEFAULT_COMPARE = ["mons-mouton", "shackleton-rim", "mons-malapert"];
const MAX_COMPARE = 4;

type TourStep = { title: string; text: string; apply: () => void };

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  return { site: p.get("site"), date: p.get("date"), slip: p.get("slip"), hour: p.get("hour") };
}

export default function App() {
  const [index, setIndex] = useState<IndexFile | null>(null);
  const [sites, setSites] = useState<Record<string, Site>>({});
  const [error, setError] = useState<string | null>(null);
  const [mast, setMast] = useState("0 m");
  const [focus, setFocus] = useState("");
  const [compare, setCompare] = useState<string[]>([]);
  const [baseDate, setBaseDate] = useState(0);
  const [slip, setSlip] = useState(0);
  const [landingHour, setLandingHour] = useState(0); // UTC hour of touchdown
  const [pointBusy, setPointBusy] = useState(false);
  const [pointError, setPointError] = useState<string | null>(null);
  const [crit, setCrit] = useState<Criteria>({
    durationDays: 6, minSunPct: 90, minEarthPct: 50,
    power: { arrayW: 400, loadW: 150, batteryWh: 2000 }, // illustrative small lander: ~13 h of darkness on battery
  });
  const [cursor, setCursor] = useState(0);
  const [drawer, setDrawer] = useState<Tab | null>(null);
  const [sheetFull, setSheetFull] = useState(false); // detail sheet: half height (3D stays visible) or full
  const [mode, setMode] = useState<ViewMode>("overview");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(SPEEDS[1]);
  const [mapOpen, setMapOpen] = useState(false);
  const [welcome, setWelcome] = useState(() => {
    try { return !localStorage.getItem(WELCOME_KEY); } catch { return true; }
  });
  const [tour, setTour] = useState<{ steps: TourStep[]; k: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadIndex()
      .then(async (ix) => {
        setIndex(ix);
        // Planner sites plus the real-mission replays (each with its own historical time window).
        const missions = ix.missions ?? [];
        const loaded = await Promise.all([...ix.sites.map((s) => s.id), ...missions.map((m) => m.id)].map(loadSite));
        const byId: Record<string, Site> = Object.fromEntries(loaded.map((s) => [s.id, s]));
        const ids = ix.sites.map((s) => s.id);
        const h = readHash();
        // A shared link may point at a spot someone picked: recompute it here.
        const point = h.site ? parseCustomId(h.site) : null;
        if (point) {
          try {
            const { site: cs, terrain } = await buildCustomSite(ix, point[0], point[1]);
            registerTerrain(cs.id, terrain);
            byId[cs.id] = cs;
          } catch { /* fall back to the default site */ }
        }
        setSites(byId);
        const first = h.site && byId[h.site] ? h.site : ids.includes(DEFAULT_SITE) ? DEFAULT_SITE : ids[0];
        setFocus(first);
        setCompare(Array.from(new Set([first, ...DEFAULT_COMPARE].filter((id) => ids.includes(id)))).slice(0, MAX_COMPARE));
        const mission = missions.find((m) => m.id === first);
        const fromHash = h.date ? Date.parse(h.date + "T00:00:00Z") : NaN;
        const ref = byId[ids.includes(DEFAULT_SITE) ? DEFAULT_SITE : ids[0]];
        setBaseDate(mission ? Date.parse(mission.landed)
          : Number.isFinite(fromHash) ? fromHash : firstGoodDay(ref, computeVisibility(ref, "0 m"), crit));
        if (h.slip && Number.isFinite(+h.slip)) setSlip(Math.max(-30, Math.min(30, +h.slip)));
        if (!mission && h.hour && Number.isFinite(+h.hour)) setLandingHour(Math.max(0, Math.min(23, Math.round(+h.hour))));
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  const vis = useMemo(() => {
    const out: Record<string, Visibility> = {};
    for (const [id, s] of Object.entries(sites)) out[id] = computeVisibility(s, mast);
    return out;
  }, [sites, mast]);

  const landing = baseDate + slip * DAY + landingHour * HOUR;
  const hours = crit.durationDays * 24;
  const site = sites[focus];
  const i0 = site ? hourIndex(site, landing) : 0;
  useEffect(() => setCursor(i0), [i0]);
  // Past landings replay their whole story window (Chandrayaan-3: 32 days, so its sunset on day 12 shows);
  // planning uses the mission length from Lander settings.
  const replay = index?.missions?.find((m) => m.id === focus);
  const playHours = replay && site ? Math.max(24, Math.min(replay.view_days * 24, site.n - i0)) : hours;

  // Keep the current plan in the URL so it can be shared.
  useEffect(() => {
    if (!focus || !baseDate) return;
    history.replaceState(null, "", `#site=${focus}&date=${fmtDate(baseDate)}&slip=${slip}&hour=${landingHour}`);
  }, [focus, baseDate, slip, landingHour]);

  const pickSite = useCallback((id: string) => {
    setFocus(id);
    setCompare((cur) => (cur.includes(id) ? cur : [id, ...cur].slice(0, MAX_COMPARE)));
  }, []);

  const allSites = index ? index.sites.map((s) => sites[s.id]).filter(Boolean) : [];
  const isMission = (id: string) => !!index?.missions?.some((m) => m.id === id);
  const isCustom = (id: string) => parseCustomId(id) !== null;

  // Evaluate any spot the user types in or clicks on the map (computed in the browser).
  async function pickPoint(lat: number, lon: number) {
    if (!index) return;
    setPointError(null);
    setPointBusy(true);
    try {
      const { site: cs, terrain } = await buildCustomSite(index, lat, lon);
      registerTerrain(cs.id, terrain);
      setSites((cur) => ({ ...cur, [cs.id]: cs }));
      setFocus(cs.id);
      if (isMission(focus)) {
        const ref = sites[DEFAULT_SITE];
        if (ref) setBaseDate(firstGoodDay(ref, computeVisibility(ref, "0 m"), crit));
        setSlip(0);
      }
    } catch (e) {
      setPointError(e instanceof Error ? e.message : String(e));
    } finally {
      setPointBusy(false);
    }
  }

  // Load a real mission's landing into the planner and play it in 3D.
  function watchMission(id: string) {
    const m = index?.missions?.find((x) => x.id === id);
    if (!m) return;
    setFocus(id);
    setBaseDate(Date.parse(m.landed));
    setLandingHour(0);
    setSlip(0);
    setMast("0 m");
    setMode("overview");
    setDrawer(null);
    setPlaying(true);
  }

  // HORIZON's first sunset after Chandrayaan-3's landing, for the tour.
  function chandrayaanSunset(): number | null {
    const s = sites["chandrayaan-3"];
    if (!s) return null;
    const v = computeVisibility(s, "0 m");
    for (let i = 1; i < s.n; i++) if (v.sunFrac[i] < 0.5 && v.sunFrac[i - 1] >= 0.5) return s.t0 + i * 3600_000;
    return null;
  }

  function startTour() {
    const m = sites[DEFAULT_SITE] ?? site;
    const v = computeVisibility(m, "0 m");
    const base = firstGoodDay(m, v, crit);
    const good = evaluate(m, v, base, crit)!;
    // The story needs a delay that breaks this site while another polar site still works.
    const others = allSites.filter((x) => x.id !== m.id);
    const fails = (d: number) => evaluate(m, v, base + d * DAY, crit)?.ok === false;
    let s = 1;
    while (s < 30 && !(fails(s) && goodSitesAt(others, vis, base + s * DAY, crit).length)) s++;
    if (s >= 30) { s = 1; while (s < 30 && !fails(s)) s++; }
    const bad = evaluate(m, v, base + s * DAY, crit);
    const alt = goodSitesAt(others, vis, base + s * DAY, crit)[0];
    const shift = nearestGoodShift(m, v, base + s * DAY, crit);
    const short = (n: string) => n.replace(/ (summit|rim high point)$/, "");
    const c3Sunset = chandrayaanSunset();
    const steps: TourStep[] = [
      {
        title: "The problem",
        text: "At the south pole the Sun stays low and circles the horizon. A ridge far away can cut a lander's solar power. Earth dips in and out of view too, and so does the radio link.",
        apply: () => { setMast("0 m"); pickSite(m.id); setBaseDate(base); setSlip(0); setDrawer(null); setMode("stand"); setPlaying(true); },
      },
      ...(c3Sunset ? [{
        title: "This already happened",
        text: `India's Chandrayaan-3 landed near 69°S in 2023. At its real coordinates, HORIZON puts sunset on ${fmtDay(c3Sunset)}, the day ISRO put the lander to sleep. It never woke up.`,
        apply: () => { setPlaying(false); setDrawer("missions"); },
      }] : []),
      {
        title: "Plan a landing",
        text: `Land on ${short(m.name)} on ${fmtDay(base)}. Over the ${crit.durationDays}-day mission: sunlight ${good.sunPct.toFixed(0)}% of the time, Earth contact ${good.earthPct.toFixed(0)}%. Good to land.`,
        apply: () => { setDrawer(null); setMode("overview"); setSlip(0); },
      },
      {
        title: "Then the launch slips",
        text: `Now the launch slips ${s} day${s > 1 ? "s" : ""}. Same spot: sunlight ${bad ? bad.sunPct.toFixed(0) : "?"}%, Earth contact ${bad ? bad.earthPct.toFixed(0) : "?"}%. Not good any more.`,
        apply: () => setSlip(s),
      },
      {
        title: "Find another option",
        text: alt
          ? `On the new date, ${short(alt.site.name)} still works: sunlight ${alt.e!.sunPct.toFixed(0)}%, Earth contact ${alt.e!.earthPct.toFixed(0)}%.`
          : shift !== null
            ? `Landing ${Math.abs(shift)} day${Math.abs(shift) > 1 ? "s" : ""} ${shift > 0 ? "later still" : "earlier"} makes ${short(m.name)} work again.`
            : "The suggestions under the answer show the nearest days and sites that work.",
        apply: () => { if (alt) pickSite(alt.site.id); else if (shift !== null) setSlip(s + shift); },
      },
      {
        title: "Every day, every site",
        text: "Best days shows each site for a month either side. Green means good. Click a square to try it.",
        apply: () => setDrawer("calendar"),
      },
      {
        title: "Checked against NASA",
        text: "Terrain is from LRO's laser altimeter; Sun and Earth positions are from JPL. Our sunlight figures match NASA Goddard's maps (r = 0.99 at 160 points) and our angles match JPL Horizons to 0.00003°.",
        apply: () => setDrawer("accuracy"),
      },
    ];
    goTour(steps, 0);
  }

  function goTour(steps: TourStep[], k: number) {
    if (k < 0 || k >= steps.length) {
      setTour(null);
      setPlaying(false);
      setDrawer(null);
      return;
    }
    steps[k].apply();
    setTour({ steps, k });
  }

  function closeWelcome(tourNow: boolean) {
    setWelcome(false);
    try { localStorage.setItem(WELCOME_KEY, "1"); } catch { /* private mode: show again next time */ }
    if (tourNow) startTour();
  }

  function share() {
    navigator.clipboard?.writeText(location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (error) {
    return <main className="empty"><h1>HORIZON</h1><p>{error}</p></main>;
  }
  if (!index || !site) return <main className="empty"><h1>HORIZON</h1><p>Loading lunar terrain and Sun and Earth positions…</p></main>;

  const periodStart = Date.parse(index.period.start);
  const periodEnd = periodStart + index.period.days * DAY;
  const rows = (isCustom(focus) ? [focus, ...compare].slice(0, MAX_COMPARE) : compare)
    .filter((id) => sites[id]).map((id) => ({ site: sites[id], vis: vis[id] }));
  const inRange = i0 >= 0 && i0 + hours <= site.n;
  const status = (id: string) => {
    const e = sites[id] && evaluate(sites[id], vis[id], landing, crit);
    return e ? (e.ok ? "go" : "nogo") : null;
  };

  return (
    <div className={`app map-ui ${drawer ? "drawer-open" : ""} ${tour ? "touring" : ""}`}>
      {inRange ? (
        <Terrain3D site={site} vis={vis[focus]} mast={mast} i0={i0} hours={playHours} cursor={cursor} onCursor={setCursor}
          mode={mode} playing={playing} speed={speed} exag={1} lift={drawer && !sheetFull ? 0.2 : 0} />
      ) : (
        <div className="stage3d"><div className="three-msg">We don't have data for this date. Pick another landing date.</div></div>
      )}

      <aside className="side" aria-label="Plan a landing">
        <div className="brand">
          <span className="logo"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M5 15a7 7 0 0 1 14 0" fill="#e3a21a" /><path d="M2 15.5h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M7 19h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" /></svg>HORIZON</span>
          <button className="text-btn" onClick={startTour}>How it works</button>
        </div>

        <SiteSearch sites={index.sites} missions={index.missions ?? []} current={focus} currentName={site.name} status={status}
          onPick={(id) => (isMission(id) ? watchMission(id) : pickSite(id))} onPoint={pickPoint} busy={pointBusy}
          onOpenMap={() => setMapOpen(true)} />
        {pointBusy && <div className="point-note">Calculating the skyline…</div>}
        {pointError && <div className="point-note bad">{pointError}</div>}

        <div className="place">
          <h1 className="place-title">{site.name}</h1>
          <div className="place-sub">
            {isMission(focus) ? "Past landing" : isCustom(focus) ? "Custom spot" : "Candidate landing site"}
            {" · "}{Math.abs(site.lat).toFixed(2)}°S, {site.lon.toFixed(1)}°E
            {site.height_m !== null && <> · {Math.round(site.height_m).toLocaleString("en-US")} m elevation</>}
          </div>
        </div>

        <div className="actions">
          <button className="action primary" onClick={() => setMode(mode === "overview" ? "stand" : "overview")}>
            <span className="action-icon"><Icon name={mode === "overview" ? "person" : "orbit"} /></span>
            {mode === "overview" ? "Stand there" : "From above"}
          </button>
          <button className="action" onClick={() => setDrawer(drawer === "calendar" ? null : "calendar")}>
            <span className="action-icon"><Icon name="calendar" /></span>Best days
          </button>
          <button className="action" onClick={() => setDrawer(drawer === "compare" ? null : "compare")}>
            <span className="action-icon"><Icon name="compare" /></span>Compare
          </button>
          <button className="action" onClick={share}>
            <span className="action-icon"><Icon name={copied ? "check" : "link"} /></span>{copied ? "Copied" : "Share"}
          </button>
          <button className="action" onClick={() => window.print()}>
            <span className="action-icon"><Icon name="print" /></span>Print
          </button>
        </div>

        <div className="rows">
          <div className="row">
            <Icon name="calendar" className="row-icon" />
            <div className="row-main">
              {isMission(focus) ? (
                <div className="mission-when">Landed {new Date(landing).toISOString().slice(0, 16).replace("T", " ")} UTC</div>
              ) : (
                <div className="date-time">
                  <input type="date" value={fmtDate(baseDate)} min={fmtDate(periodStart)} max={fmtDate(periodEnd - hours * 3600_000)}
                    aria-label="Landing date"
                    onChange={(e) => { if (e.target.value) { setBaseDate(Date.parse(e.target.value + "T00:00:00Z")); setSlip(0); } }} />
                  <select value={landingHour} onChange={(e) => setLandingHour(+e.target.value)} aria-label="Landing time (UTC)">
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00 UTC</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
          <div className="row">
            <Icon name="delay" className="row-icon" />
            <div className="row-main">
              <div className="delay-top">
                <span>What if launch is late?</span>
                <strong className={slip ? "warn" : ""}>{slip === 0 ? "On time" : `${Math.abs(slip)} day${Math.abs(slip) > 1 ? "s" : ""} ${slip > 0 ? "late" : "early"}`}</strong>
              </div>
              <input type="range" min={-30} max={30} value={slip} onChange={(e) => setSlip(+e.target.value)} aria-label="Launch delay in days" />
            </div>
          </div>
        </div>

        <Verdict site={site} sites={allSites} vis={vis} landing={landing} crit={crit}
          onShift={(d) => setSlip((x) => Math.max(-30, Math.min(30, x + d)))} onSite={pickSite} />

        <details className="settings">
          <summary><Icon name="settings" className="row-icon" /><span>Lander settings</span><Icon name="expand" className="chev" /></summary>
          <div className="settings-grid">
            <label>Days on the Moon
              <input type="number" min={1} max={30} value={crit.durationDays}
                onChange={(e) => setCrit({ ...crit, durationDays: Math.max(1, Math.min(30, +e.target.value || 1)) })} />
            </label>
            <label>Sunlight it needs (%)
              <input type="number" min={0} max={100} value={crit.minSunPct}
                onChange={(e) => setCrit({ ...crit, minSunPct: Math.max(0, Math.min(100, +e.target.value)) })} />
            </label>
            <label>Earth contact it needs (%)
              <input type="number" min={0} max={100} value={crit.minEarthPct}
                onChange={(e) => setCrit({ ...crit, minEarthPct: Math.max(0, Math.min(100, +e.target.value)) })} />
            </label>
            <label>Solar panel height
              <select value={mast} onChange={(e) => setMast(e.target.value)}>
                {site.masts.map((m) => <option key={m} value={m}>{m === "0 m" ? "On the lander" : `On a ${m} pole`}</option>)}
              </select>
            </label>
            {([["arrayW", "Solar panel power (W)", 10, 5000], ["loadW", "Power it uses (W)", 1, 5000], ["batteryWh", "Battery size (Wh)", 10, 100000]] as const).map(([k, label, lo, hi]) => (
              <label key={k}>{label}
                <input type="number" min={lo} max={hi} value={crit.power[k]}
                  onChange={(e) => setCrit({ ...crit, power: { ...crit.power, [k]: Math.max(lo, Math.min(hi, +e.target.value || lo)) } })} />
              </label>
            ))}
          </div>
        </details>

        <p className="credits">
          Terrain: NASA LRO laser altimeter. Sun and Earth positions: NASA JPL. Code written with the help of an SI
          assistant (Claude); see the README.
        </p>
      </aside>

      <nav className="chips" aria-label="Explore">
        {TABS.map((t) => (
          <button key={t.id} className={drawer === t.id ? "on" : ""} title={t.hint} onClick={() => setDrawer(drawer === t.id ? null : t.id)}>
            <Icon name={t.icon} size={18} />{t.label}
          </button>
        ))}
      </nav>

      <div className="layers">
        {mapOpen && (
          <div className="minimap">
            <SiteMap index={index} selected={[focus]} focus={focus} onToggle={pickSite} onPoint={pickPoint}
              custom={isCustom(focus) ? site : null} />
          </div>
        )}
        <button className={`layers-tile ${mapOpen ? "on" : ""}`} onClick={() => setMapOpen(!mapOpen)} title="Map of the south pole">
          <img src="data/hillshade.png" alt="" />
          <span><Icon name="map" size={16} />Map</span>
        </button>
      </div>
      <div className="view-tip">{mode === "overview" ? "Drag to turn · scroll to zoom" : "Drag to look around"}</div>

      {inRange && (
        <TimeBar site={site} vis={vis[focus]} i0={i0} hours={playHours} cursor={cursor} onCursor={setCursor}
          playing={playing} onPlaying={setPlaying} speed={speed} onSpeed={setSpeed} />
      )}

      {drawer && (
        <section className={`drawer ${sheetFull ? "full" : ""}`} id="tabs" aria-label={TABS.find((t) => t.id === drawer)?.label}>
          <div className="drawer-head">
            <div className="drawer-title">{TABS.find((t) => t.id === drawer)?.label}</div>
            <div className="tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={drawer === t.id} className={drawer === t.id ? "on" : ""} onClick={() => setDrawer(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="drawer-btns">
              <button className="drawer-close" onClick={() => setSheetFull(!sheetFull)} aria-label={sheetFull ? "Shrink" : "Expand"}
                title={sheetFull ? "Shrink so the 3D view shows" : "Expand to full height"}>
                <Icon name={sheetFull ? "shrink" : "grow"} size={18} />
              </button>
              <button className="drawer-close" onClick={() => setDrawer(null)} aria-label="Close"><Icon name="close" size={18} /></button>
            </div>
          </div>
          <div className="drawer-body">
            {drawer === "why" && <WhyItMatters />}
            {drawer === "calendar" && (
              <SlipMatrix sites={isCustom(focus) ? [site, ...allSites] : allSites} vis={vis} baseDate={baseDate + landingHour * HOUR}
                slip={slip} focus={focus} crit={crit}
                onPick={(id, d) => { setSlip(d); if (isCustom(id)) setFocus(id); else pickSite(id); }} />
            )}
            {drawer === "missions" && (
              <RealMissions missions={index.missions ?? []} sites={sites} vis={vis} power={crit.power} onWatch={watchMission} />
            )}
            {drawer === "compare" && (
              <>
                <div className="compare-pick">
                  <span className="muted small">Compare up to {MAX_COMPARE}:</span>
                  {index.sites.map((s) => (
                    <label key={s.id} className={compare.includes(s.id) ? "chip on" : "chip"}>
                      <input type="checkbox" checked={compare.includes(s.id)}
                        disabled={!compare.includes(s.id) && compare.length >= MAX_COMPARE}
                        onChange={(e) => setCompare((cur) => e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id))} />
                      {s.name.replace(/ (summit|rim high point)$/, "")}
                    </label>
                  ))}
                </div>
                {inRange && !isMission(focus) && (
                  <>
                    <CompareCards rows={rows} i0={i0} crit={crit} focus={focus} onFocus={pickSite} />
                    <Timeline rows={rows} i0={i0} hours={hours} cursor={cursor} landing={landing} onCursor={setCursor} />
                  </>
                )}
                {isMission(focus) && <p className="muted">Comparisons use the candidate sites; pick one in the search box first.</p>}
              </>
            )}
            {drawer === "sky" && inRange && <Panorama site={site} vis={vis[focus]} mast={mast} i0={i0} hours={playHours} cursor={cursor} />}
            {drawer === "accuracy" && <Validation />}
          </div>
        </section>
      )}

      <Brief site={site} sites={allSites} vis={vis} landing={landing} crit={crit} mast={mast} frame={index.frame} />

      {welcome && !tour && (
        <div className="welcome-backdrop">
          <div className="welcome" role="dialog" aria-label="Welcome to HORIZON">
            <div className="logo">HORIZON</div>
            <h2>Will a Moon lander have sunlight and a way to call home?</h2>
            <p>
              At the Moon's south pole the Sun stays low, so hills can block it for days. HORIZON checks any landing spot
              and date against NASA terrain data.
            </p>
            <ol>
              <li><strong>Pick a place</strong> near the south pole</li>
              <li><strong>Pick a day</strong>, and see what a late launch does</li>
              <li><strong>Get an answer</strong>, with alternatives if it's a no</li>
            </ol>
            <div className="welcome-actions">
              <button className="btn big" onClick={() => closeWelcome(true)}>Take the 1-minute tour</button>
              <button className="btn ghost" onClick={() => closeWelcome(false)}>Explore on my own</button>
            </div>
          </div>
        </div>
      )}

      {tour && (
        <div className="tour" role="dialog" aria-label="Guided tour">
          <div className="tour-step">Step {tour.k + 1} of {tour.steps.length}</div>
          <div className="tour-title">{tour.steps[tour.k].title}</div>
          <p>{tour.steps[tour.k].text}</p>
          <div className="tour-actions">
            <button className="btn ghost" disabled={tour.k === 0} onClick={() => goTour(tour.steps, tour.k - 1)}>Back</button>
            <button className="btn" onClick={() => goTour(tour.steps, tour.k + 1)}>
              {tour.k === tour.steps.length - 1 ? "Finish" : "Next"}
            </button>
            <button className="link" onClick={() => { setTour(null); setPlaying(false); setDrawer(null); }}>Exit tour</button>
          </div>
        </div>
      )}
    </div>
  );
}
