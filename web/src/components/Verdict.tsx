// The answer card: one plain verdict, three rows, and one-click alternatives.
import {
  Criteria, DAY, HOUR, SUNLIT, Site, Visibility, batteryRun, fmtCountdown, fmtDay, goodSitesAt, hourIndex, hoursUntilChange,
  nearestGoodShift, windowStats,
} from "../model";
import Icon, { IconName } from "./Icon";

type Props = {
  site: Site;
  sites: Site[];
  vis: Record<string, Visibility>;
  landing: number;
  crit: Criteria;
  onShift: (days: number) => void;
  onSite: (id: string) => void;
};

const short = (n: string) => n.replace(/ (summit|rim high point)$/, "");

// "14 hours", "2 days", "2.5 days".
function plainDuration(h: number) {
  if (h < 36) return `${Math.max(1, Math.round(h))} hour${Math.round(h) === 1 ? "" : "s"}`;
  const d = Math.round((h / 24) * 2) / 2;
  return `${d % 1 ? d.toFixed(1) : d.toFixed(0)} days`;
}

function Row({ icon, label, value, pct, need, ok, kind }: {
  icon: IconName; label: string; value: string; pct: number; need?: string; ok: boolean; kind: "sun" | "earth" | "battery";
}) {
  return (
    <div className="row">
      <Icon name={icon} className={`row-icon ${kind}`} />
      <div className="row-main">
        <div className="metric-top">
          <span>{label}</span>
          <strong className={ok ? "good" : "bad"}>{value}</strong>
        </div>
        <div className="abar"><div className={`abar-fill ${kind} ${ok ? "" : "low"}`} style={{ width: `${Math.max(2, pct)}%` }} /></div>
        {need && <div className="row-sub">{need}</div>}
      </div>
    </div>
  );
}

export default function Verdict({ site, sites, vis, landing, crit, onShift, onSite }: Props) {
  const v = vis[site.id];
  const hours = crit.durationDays * 24;
  const i0 = hourIndex(site, landing);
  if (i0 < 0 || i0 + hours > site.n) {
    return <section className="result"><p className="result-text">No data for this date. Pick another landing date.</p></section>;
  }
  const s = windowStats(v, i0, hours);
  const bat = batteryRun(v, i0, hours, crit.power);
  const flat = bat.emptyH !== null;
  const sunOk = s.sunPct >= crit.minSunPct;
  const earthOk = s.earthPct >= crit.minEarthPct;
  const ok = sunOk && earthOk && !flat;

  // Time from touchdown until sunset / Earthset (or until they rise, if landing in the dark).
  const sunUp = v.sunFrac[i0] >= SUNLIT;
  const earthUp = v.earth[i0] === 1;
  const sunNext = hoursUntilChange(site.n, i0, (k) => v.sunFrac[k] >= SUNLIT);
  const earthNext = hoursUntilChange(site.n, i0, (k) => v.earth[k] === 1);
  const within = (h: number | null) => h !== null && h < hours;
  const sunText = within(sunNext) ? `${sunUp ? "Sunset" : "Sunrise"} in ${fmtCountdown(sunNext!)}` : sunUp ? "Sun up all mission" : "No sun all mission";
  const earthText = within(earthNext) ? `${earthUp ? "Earthset" : "Earthrise"} in ${fmtCountdown(earthNext!)}` : earthUp ? "Earth in view all mission" : "Earth out of view all mission";

  let sentence: string;
  if (ok) {
    sentence = s.sunPct >= 99.5 && s.earthPct >= 99.5
      ? `Sunlight and Earth contact for all ${crit.durationDays} days.`
      : "Enough sunlight, and Earth is in view most of the time.";
  } else if (flat) {
    const when = new Date(site.t0 + (i0 + bat.emptyH!) * HOUR);
    sentence = `The Sun is blocked for ${plainDuration(s.longestDarkH)} straight. The battery runs out on ${fmtDay(when.getTime())}.`;
  } else if (!sunOk) {
    sentence = `Terrain blocks the Sun for ${plainDuration((hours * (100 - s.sunPct)) / 100)} of the ${crit.durationDays} days.`;
  } else {
    sentence = `Earth is out of view ${(100 - s.earthPct).toFixed(0)}% of the time, so radio contact is patchy.`;
  }

  const shift = ok ? null : nearestGoodShift(site, v, landing, crit);
  const others = ok ? [] : goodSitesAt(sites.filter((x) => x.id !== site.id), vis, landing, crit).slice(0, 2);

  return (
    <section className="result" id="verdict">
      <div className="result-head">
        <Icon name={ok ? "check" : "nogo"} fill size={28} className={ok ? "good" : "bad"} />
        <div>
          <div className={`result-title ${ok ? "good" : "bad"}`}>{ok ? "Good to land" : "Not good on this date"}</div>
          <div className="result-sub">{fmtDay(landing)} · {crit.durationDays}-day mission</div>
        </div>
      </div>
      <p className="result-text">{sentence}</p>
      <div className="rows">
        <Row icon="sun" label="Sunlight" value={`${s.sunPct.toFixed(0)}%`} pct={s.sunPct}
          need={`Needs ${crit.minSunPct}%`} ok={sunOk} kind="sun" />
        <Row icon="signal" label="Earth contact" value={`${s.earthPct.toFixed(0)}%`} pct={s.earthPct}
          need={`Needs ${crit.minEarthPct}%`} ok={earthOk} kind="earth" />
        <Row icon="battery" label="Battery" value={flat ? `Empty on day ${Math.floor(bat.emptyH! / 24) + 1}` : "Lasts"}
          pct={bat.minPct} ok={!flat} kind="battery" />
        <div className="row">
          <Icon name="clock" className="row-icon" />
          <div className="row-main">
            <div>{sunText}</div>
            <div className="row-sub">{earthText}</div>
          </div>
        </div>
      </div>
      {!ok && (shift !== null || others.length > 0) && (
        <div className="alts">
          <h2 className="sec-title">Try instead</h2>
          {shift !== null && (
            <button className="alt" onClick={() => onShift(shift)}>
              <Icon name="calendar" className="row-icon" />
              <span className="alt-main">
                <span>Land {Math.abs(shift)} day{Math.abs(shift) > 1 ? "s" : ""} {shift > 0 ? "later" : "earlier"}</span>
                <small>{fmtDay(landing + shift * DAY)}</small>
              </span>
              <Icon name="arrow" className="alt-go" />
            </button>
          )}
          {others.map(({ site: o }) => (
            <button key={o.id} className="alt" onClick={() => onSite(o.id)}>
              <Icon name="pin" className="row-icon" />
              <span className="alt-main">
                <span>{short(o.name)}</span>
                <small>Good on the same date</small>
              </span>
              <Icon name="arrow" className="alt-go" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
