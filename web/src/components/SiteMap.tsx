import { IndexFile, SiteSummary } from "../model";
import { polarToLatLon } from "../custom";

const R_MOON_KM = 1737.4;
const VIEW_KM = 215;

function ringRadiusKm(latDeg: number) {
  return 2 * R_MOON_KM * Math.tan(((90 + latDeg) * Math.PI) / 360);
}

type Props = {
  index: IndexFile;
  selected: string[];
  focus: string;
  onToggle: (id: string) => void;
  onPoint: (lat: number, lon: number) => void; // click on empty ground: check that spot
  custom: SiteSummary | null; // the user's own spot, if one is selected
};

export default function SiteMap({ index, selected, focus, onToggle, onPoint, custom }: Props) {
  const m = index.map;
  const onMap = index.sites.filter((s) => Math.abs(s.x_km) < VIEW_KM && Math.abs(s.y_km) < VIEW_KM);

  function onGroundClick(e: React.MouseEvent<SVGSVGElement>) {
    if ((e.target as Element).closest(".site")) return;
    const svg = e.currentTarget;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const q = p.matrixTransform(ctm.inverse());
    const [lat, lon] = polarToLatLon(q.x, -q.y); // map y points down; LOLA y points toward longitude 0 (up)
    onPoint(lat, lon);
  }

  return (
    <figure className="panel map">
      <figcaption className="muted small">Lunar south pole, Earth-facing side up. Click a dot, or anywhere on the ground to check that spot.</figcaption>
      <svg viewBox={`${-VIEW_KM} ${-VIEW_KM} ${2 * VIEW_KM} ${2 * VIEW_KM}`} className="mapsvg pickable" onClick={onGroundClick}>
        {m && (
          <image href={`data/${m.image}`} x={-m.half_width_km} y={-m.half_width_km}
            width={2 * m.half_width_km} height={2 * m.half_width_km} preserveAspectRatio="none" />
        )}
        {[-88, -86, -84].map((lat) => (
          <g key={lat}>
            <circle r={ringRadiusKm(lat)} className="ring" />
            <text x={3} y={-ringRadiusKm(lat) - 3} className="ring-label">{Math.abs(lat)}°S</text>
          </g>
        ))}
        {onMap.map((s) => {
          const sel = selected.includes(s.id);
          return (
            <g key={s.id} transform={`translate(${s.x_km},${-s.y_km})`} onClick={() => onToggle(s.id)} className="site">
              <title>{`${s.name}\n${s.lat.toFixed(3)}°, ${s.lon.toFixed(3)}°E`}</title>
              {s.id === focus && <circle r={9} className="focus-ring" />}
              <circle r={5} className={sel ? "pin sel" : "pin"} />
              <text x={8} y={4} className={sel ? "pin-label sel" : "pin-label"}>{s.name.replace(/ (summit|rim high point)$/, "")}</text>
            </g>
          );
        })}
        {custom && Math.abs(custom.x_km) < VIEW_KM && Math.abs(custom.y_km) < VIEW_KM && (
          <g transform={`translate(${custom.x_km},${-custom.y_km})`} className="site custom" pointerEvents="none">
            <circle r={9} className="focus-ring" />
            <path d="M0,-7 L5,0 L0,7 L-5,0 Z" className="pin sel" />
            <text x={10} y={4} className="pin-label sel">Your spot</text>
          </g>
        )}
      </svg>
      {m && <div className="muted small">Hillshade from {m.source} (LRO LOLA).</div>}
    </figure>
  );
}
