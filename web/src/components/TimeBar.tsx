// Bottom time bar: play/pause, the current moment, and a draggable strip of the mission's
// sunlight and Earth contact (like a video scrubber).
import { useRef } from "react";
import { HOUR, SUNLIT, Site, Visibility, fmtCountdown, hoursUntilChange } from "../model";
import Icon from "./Icon";
import { SPEEDS } from "./Terrain3D";

type Props = {
  site: Site;
  vis: Visibility;
  i0: number;
  hours: number;
  cursor: number;
  onCursor: (i: number) => void;
  playing: boolean;
  onPlaying: (p: boolean) => void;
  speed: number;
  onSpeed: (s: number) => void;
};

const W = 1000;

function runs(n: number, val: (h: number) => number) {
  const out: { s: number; e: number; v: number }[] = [];
  for (let h = 0; h < n; h++) {
    const v = val(h);
    const last = out[out.length - 1];
    if (last && last.v === v) last.e = h + 1;
    else out.push({ s: h, e: h + 1, v });
  }
  return out;
}

export default function TimeBar({ site, vis, i0, hours, cursor, onCursor, playing, onPlaying, speed, onSpeed }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const c = Math.min(Math.max(cursor, i0), i0 + hours - 1);
  const x = (h: number) => (h / hours) * W;
  const sun = runs(hours, (h) => (vis.sunFrac[i0 + h] >= SUNLIT ? 2 : vis.sunFrac[i0 + h] > 0 ? 1 : 0));
  const earth = runs(hours, (h) => vis.earth[i0 + h]);
  const days = Math.round(hours / 24);
  const t = new Date(site.t0 + c * HOUR).toISOString().slice(0, 16).replace("T", " ");
  const lit = vis.sunFrac[c] >= SUNLIT;
  // Countdowns the challenge asks for: time left before sunset or Earthset (or until they rise).
  const sunNext = hoursUntilChange(site.n, c, (k) => vis.sunFrac[k] >= SUNLIT);
  const earthNext = hoursUntilChange(site.n, c, (k) => vis.earth[k] === 1);

  function seek(clientX: number) {
    const r = svg.current!.getBoundingClientRect();
    const f = Math.min(Math.max((clientX - r.left) / r.width, 0), 0.9999);
    onCursor(i0 + Math.floor(f * hours));
  }

  return (
    <div className="timebar">
      <button className="play" onClick={() => onPlaying(!playing)} aria-label={playing ? "Pause" : "Play the mission"}>
        <Icon name={playing ? "pause" : "play"} size={18} />
      </button>
      <div className="tb-main">
        <div className="tb-status">
          <strong>Day {Math.floor((c - i0) / 24) + 1} of {days}</strong>
          <span className="muted">{t} UTC</span>
          <span className={lit ? "pill sun" : "pill off"}>
            <i className="pdot" />{lit ? "Sun up" : vis.sunFrac[c] > 0 ? "Sun partly hidden" : "Sun down"}
            {sunNext !== null && <em>{lit ? "sets" : "rises"} in {fmtCountdown(sunNext)}</em>}
          </span>
          <span className={vis.earth[c] ? "pill earth" : "pill off"}>
            <i className="pdot" />{vis.earth[c] ? "Earth in view" : "No Earth contact"}
            {earthNext !== null && <em>{vis.earth[c] ? "sets" : "rises"} in {fmtCountdown(earthNext)}</em>}
          </span>
        </div>
        <svg ref={svg} viewBox={`0 0 ${W} 30`} preserveAspectRatio="none" className="tb-strip" role="slider"
          aria-label="Mission time" aria-valuemin={0} aria-valuemax={hours} aria-valuenow={c - i0}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onPlaying(false); seek(e.clientX); }}
          onPointerMove={(e) => { if (e.buttons) seek(e.clientX); }}>
          {sun.map((s) => <rect key={`s${s.s}`} x={x(s.s)} y={2} width={x(s.e) - x(s.s)} height={12} className={s.v === 2 ? "seg sun" : s.v === 1 ? "seg sun part" : "seg dark"} />)}
          {earth.map((s) => <rect key={`e${s.s}`} x={x(s.s)} y={16} width={x(s.e) - x(s.s)} height={12} className={s.v ? "seg earth" : "seg dark"} />)}
          {Array.from({ length: days - 1 }, (_, k) => <line key={k} x1={x((k + 1) * 24)} x2={x((k + 1) * 24)} y1={0} y2={30} className="tb-day" />)}
          <line x1={x(c - i0)} x2={x(c - i0)} y1={0} y2={30} className="tb-cursor" />
        </svg>
        <div className="tb-scale muted"><span>Landing</span><span>Top: Sun · Bottom: Earth · Drag to scrub</span><span>Day {days}</span></div>
      </div>
      <select className="tb-speed" value={speed} onChange={(e) => onSpeed(+e.target.value)} aria-label="Playback speed">
        {SPEEDS.map((v) => <option key={v} value={v}>{v === 24 ? "1 day/s" : v === 72 ? "3 days/s" : "6 h/s"}</option>)}
      </select>
    </div>
  );
}
