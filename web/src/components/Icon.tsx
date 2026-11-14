// Google Material Symbols (Outlined), loaded in index.html. Our short names map to the symbol names.
const NAMES = {
  sun: "light_mode",
  signal: "satellite_alt",
  battery: "battery_full",
  clock: "schedule",
  map: "layers",
  link: "share",
  print: "print",
  check: "check_circle",
  close: "close",
  nogo: "cancel",
  search: "search",
  settings: "tune",
  person: "person",
  orbit: "3d_rotation",
  calendar: "calendar_month",
  pin: "location_on",
  play: "play_arrow",
  pause: "pause",
  arrow: "arrow_forward",
  info: "info",
  rocket: "rocket_launch",
  compare: "compare_arrows",
  landscape: "landscape",
  verified: "verified",
  coords: "my_location",
  pick: "pin_drop",
  expand: "expand_more",
  delay: "schedule",
  ice: "water_drop",
  lowsun: "wb_twilight",
  grow: "open_in_full",
  shrink: "close_fullscreen",
} as const;

export type IconName = keyof typeof NAMES;

export default function Icon({ name, size = 20, className, fill }: { name: IconName; size?: number; className?: string; fill?: boolean }) {
  return (
    <span className={`msym ${fill ? "fill" : ""} ${className ?? ""}`} style={{ fontSize: size }} aria-hidden>
      {NAMES[name]}
    </span>
  );
}
