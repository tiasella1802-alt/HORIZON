import { useState } from "react";
import { HOUR, SUNLIT, Site, Visibility, horizonAt } from "../model";

const W = 1000;
const H = 320;
const PAD = { l: 44, r: 12, t: 12, b: 30 };
const COMPASS: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };

type Props = { site: Site; vis: Visibility; mast: string; i0: number; hours: number; cursor: number };

export default function Panorama({ site, vis, mast, i0, hours, cursor }: Props) {
  const [hoverAz, setHoverAz] = useState<number | null>(null);
  const prof = site.horizon[mast];
  const i1 = Math.min(i0 + hours, site.n);

  let hi = Math.max(...prof);
  let lo = Math.min(...prof);
  for (let i = i0; i < i1; i++) {
    hi = Math.max(hi, site.sunEl[i], site.earthEl[i]);
    lo = Math.min(lo, site.sunEl[i], site.earthEl[i]);
  }
  hi = Math.ceil(hi + 0.5);
  lo = Math.floor(Math.min(lo, -1) - 0.5);

  const x = (az: number) => PAD.l + (az / 360) * (W - PAD.l - PAD.r);
  const y = (el: number) => PAD.t + ((hi - el) / (hi - lo)) * (H - PAD.t - PAD.b);

  const terrain =
    `M${x(0)},${y(lo)} ` +
    prof.map((e, k) => `L${x(k * site.az_step).toFixed(1)},${y(e).toFixed(1)}`).join(" ") +
    ` L${x(360)},${y(prof[0])} L${x(360)},${y(lo)} Z`;

  const elStep = hi - lo > 12 ? 2 : 1;
  const elTicks: number[] = [];
  for (let e = Math.ceil(lo / elStep) * elStep; e <= hi; e += elStep) elTicks.push(e);

  const dots = [];
  for (let i = i0; i < i1; i += 2) {
    dots.push(
      <circle key={`s${i}`} cx={x(site.sunAz[i])} cy={y(site.sunEl[i])} r={2.2}
        className={vis.sunFrac[i] >= SUNLIT ? "dot sun" : "dot sun off"} />,
      <circle key={`e${i}`} cx={x(site.earthAz[i])} cy={y(site.earthEl[i])} r={2.2}
        className={vis.earth[i] ? "dot earth" : "dot earth off"} />,
    );
  }

  const c = Math.min(Math.max(cursor, i0), i1 - 1);
  const sunRpx = Math.max(5, (site.sun_radius_deg / (hi - lo)) * (H - PAD.t - PAD.b));

  function onMove(ev: React.MouseEvent<SVGSVGElement>) {
    const r = ev.currentTarget.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const az = ((px - PAD.l) / (W - PAD.l - PAD.r)) * 360;
    setHoverAz(az >= 0 && az <= 360 ? az : null);
  }

  const k = hoverAz === null ? null : Math.round(hoverAz / site.az_step) % prof.length;
  const t = new Date(site.t0 + c * HOUR).toISOString().slice(0, 16).replace("T", " ");

  return (
    <figure className="panel">
      <figcaption>
        <strong>The sky from {site.name}</strong>
        <span className="muted"> · the full 360° skyline. Gray is terrain; dots are the Sun and Earth during the mission.</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="pano" onMouseMove={onMove} onMouseLeave={() => setHoverAz(null)}
        role="img" aria-label={`Horizon panorama for ${site.name}`}>
        <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} className="sky" />
        {elTicks.map((e) => (
          <g key={e}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(e)} y2={y(e)} className={e === 0 ? "grid zero" : "grid"} />
            <text x={PAD.l - 6} y={y(e) + 4} className="tick" textAnchor="end">{e}°</text>
          </g>
        ))}
        {[0, 45, 90, 135, 180, 225, 270, 315, 360].map((a) => (
          <text key={a} x={x(a)} y={H - 10} className="tick" textAnchor="middle">
            {COMPASS[a % 360] ?? `${a}°`}
          </text>
        ))}
        {dots}
        <path d={terrain} className="terrain" />
        <circle cx={x(site.earthAz[c])} cy={y(site.earthEl[c])} r={7}
          className={vis.earth[c] ? "marker earth" : "marker earth off"} />
        <circle cx={x(site.sunAz[c])} cy={y(site.sunEl[c])} r={sunRpx}
          className={vis.sunFrac[c] >= SUNLIT ? "marker sun" : "marker sun off"} />
        {hoverAz !== null && <line x1={x(hoverAz)} x2={x(hoverAz)} y1={PAD.t} y2={H - PAD.b} className="hover" />}
      </svg>
      <div className="pano-foot">
        <span><i className="sw sun" /> Sun (faded when hidden by hills)</span>
        <span><i className="sw earth" /> Earth</span>
        <span><i className="sw terrain" /> Hills (NASA laser map)</span>
        <span className="muted">
          {k !== null
            ? `Az ${hoverAz!.toFixed(1)}°: horizon ${horizonAt(prof, site.az_step, hoverAz!).toFixed(2)}°` +
              (site.block_km[k] != null ? `, set by terrain ${site.block_km[k]} km away` : "")
            : `Cursor ${t} UTC: Sun ${site.sunEl[c].toFixed(2)}°, ${(vis.sunFrac[c] * 100).toFixed(0)}% of disk visible; ` +
              `Earth ${site.earthEl[c].toFixed(2)}° ${vis.earth[c] ? "(in view)" : "(blocked)"}`}
        </span>
      </div>
    </figure>
  );
}
