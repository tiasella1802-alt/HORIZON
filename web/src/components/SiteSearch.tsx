// Map-style search box for landing sites and real-mission replays, with a GO/NO-GO dot per site,
// plus "your own spot": type coordinates or pick a point on the map.
import { useEffect, useRef, useState } from "react";
import { MissionMeta, SiteSummary } from "../model";
import Icon from "./Icon";

type Props = {
  sites: SiteSummary[];
  missions: MissionMeta[];
  current: string;
  currentName: string;
  status: (id: string) => "go" | "nogo" | null;
  onPick: (id: string) => void;
  onPoint: (lat: number, lon: number) => void;
  onOpenMap: () => void;
  busy: boolean;
};

const short = (n: string) => n.replace(/ (summit|rim high point)$/, "");

export default function SiteSearch({ sites, missions, current, currentName, status, onPick, onPoint, onOpenMap, busy }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [lat, setLat] = useState("-85.5");
  const [lon, setLon] = useState("30");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  const match = (s: { name: string; about?: string }) => !q || `${s.name} ${s.about ?? ""}`.toLowerCase().includes(q.toLowerCase());
  const pick = (id: string) => { onPick(id); setOpen(false); setQ(""); };
  const la = parseFloat(lat), lo = parseFloat(lon);
  const valid = Number.isFinite(la) && Number.isFinite(lo) && la <= -75 && la >= -90 && lo >= -180 && lo <= 360;

  return (
    <div className="search" ref={box}>
      <span className="search-icon"><Icon name="search" /></span>
      <input
        value={open ? q : currentName}
        placeholder="Search landing sites"
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        aria-label="Landing site"
      />
      {open && (
        <div className="search-list" role="listbox">
          <div className="search-group">Landing sites</div>
          {sites.filter(match).map((s) => {
            const st = status(s.id);
            return (
              <button key={s.id} role="option" aria-selected={s.id === current} className={s.id === current ? "on" : ""} onClick={() => pick(s.id)}>
                <span className={`dot ${st ?? ""}`} title={st === "go" ? "Good on this date" : st === "nogo" ? "Not good on this date" : ""} />
                <span><strong>{short(s.name)}</strong><small>{Math.abs(s.lat).toFixed(2)}°S {s.lon.toFixed(1)}°E</small></span>
              </button>
            );
          })}
          {missions.filter(match).length > 0 && <div className="search-group">Past landings</div>}
          {missions.filter(match).map((m) => (
            <button key={m.id} role="option" aria-selected={m.id === current} className={m.id === current ? "on" : ""} onClick={() => pick(m.id)}>
              <span className="dot mission" />
              <span><strong>{m.name}</strong><small>{m.agency} · {m.landed.slice(0, 10)}</small></span>
            </button>
          ))}
          <div className="search-group">Coordinates</div>
          <form className="coord-form" onSubmit={(e) => { e.preventDefault(); if (valid) { onPoint(la, lo); setOpen(false); } }}>
            <label>
              <span>Latitude</span>
              <input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} aria-label="Latitude in degrees" />
            </label>
            <label>
              <span>Longitude</span>
              <input inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} aria-label="Longitude in degrees east" />
            </label>
            <button className="btn" type="submit" disabled={!valid || busy}>{busy ? "Working" : "Check"}</button>
          </form>
          <div className={`coord-help ${valid ? "" : "bad"}`}>
            <span>Latitude −75 to −90.</span>
            <button className="link" type="button" onClick={() => { onOpenMap(); setOpen(false); }}>Pick on map</button>
          </div>
        </div>
      )}
    </div>
  );
}
