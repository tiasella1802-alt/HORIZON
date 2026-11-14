// 3D view of the terrain around a site, lit by the Sun at its true direction for the cursor hour.
// Units are km. Axes: +x east, +y up, -z north (three.js cameras look down -z, i.e. north).
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CSM } from "three/examples/jsm/csm/CSM.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SUNLIT, Site, Visibility, decode } from "../model";

export type ViewMode = "overview" | "stand";
export type Terrain = { spokes: number; r: Float32Array; z: Float32Array };

const D2R = Math.PI / 180;
const SKY_KM = 800; // where the Sun and Earth are drawn
const WALL_KM = 260; // skyline silhouette beyond the 150 km terrain disk (stand view)
const MAST_KM: Record<string, number> = { "0 m": 0.0005, "2 m": 0.002, "10 m": 0.01 };
const EYE_KM = 0.0017; // stand view: at least an astronaut's eye height above the ground
const EXPOSURE = { overview: 1.5, stand: 1.0 };
const STAND_FOV = 32; // vertical, degrees
// Polar skylines rise only 1-3 deg, a thin strip at any normal lens. The stand view can stretch the
// picture vertically (a projection change, so terrain, Sun and Earth stretch together and what hides
// behind what is exactly as in the data). Shown on screen, with a switch back to true scale.
const RELIEF = 2.5;
export const SPEEDS = [6, 24, 72]; // simulated hours per second
const SUN_INTENSITY = 3.2;

const terrainCache = new Map<string, Promise<Terrain | null>>();

// Terrain computed in the browser (points the user picks) instead of loaded from a file.
export function registerTerrain(id: string, t: Terrain) {
  terrainCache.set(id, Promise.resolve(t));
}

function loadTerrain(id: string) {
  if (!terrainCache.has(id)) {
    // Sites outside the polar DEMs have no terrain file; dev servers answer that with index.html (200),
    // so check the content type and treat any failure as "no terrain".
    terrainCache.set(id, fetch(`data/terrain_${id}.json`)
      .then((r) => (r.ok && r.headers.get("content-type")?.includes("json") ? r.json() : null))
      .then((f) => {
        if (!f) return null;
        const r = Float32Array.from(f.r_km);
        const z = decode(f.z, 1000); // stored meters -> km
        // Rings near the site are stored in finer steps (near_step_m, e.g. 0.1 m) to avoid terraces.
        const near = f.near_rings ?? 0;
        for (let i = 0; i < f.spokes; i++) for (let j = 0; j < near; j++) z[i * r.length + j] *= f.near_step_m;
        smoothFar(f.spokes, r.length, z, 1);
        return { spokes: f.spokes, r, z };
      })
      .catch(() => null));
  }
  return terrainCache.get(id)!;
}

// Heights are stored in steps (0.1 m near the site, 1 m beyond). Under a 2-deg Sun every step on a gentle
// slope catches the light as a stripe, so blur those rings a little (1-2-1 along and across spokes, 3
// passes). Display only: the verdicts use the full-precision skyline, not this mesh.
function smoothFar(spokes: number, nr: number, z: Float32Array, from: number) {
  const tmp = new Float32Array(z.length);
  for (let pass = 0; pass < 3; pass++) {
    tmp.set(z);
    for (let i = 0; i < spokes; i++) {
      const a = ((i + spokes - 1) % spokes) * nr, b = i * nr, c = ((i + 1) % spokes) * nr;
      for (let j = Math.max(from, 1); j < nr - 1; j++) {
        const radial = tmp[b + j - 1] + 2 * tmp[b + j] + tmp[b + j + 1];
        const across = tmp[a + j] + 2 * tmp[b + j] + tmp[c + j];
        z[b + j] = (radial + across) / 8;
      }
    }
  }
}

function direction(azDeg: number, elDeg: number) {
  const a = azDeg * D2R;
  const e = elDeg * D2R;
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a));
}

// Polar terrain disk: a center vertex plus spokes x rings. Edge vertices fade to black so the disk
// dissolves into space instead of ending in a hard rim.
// Smooth 2D value noise in [-1, 1] (fbm), used for ground roughness below the DEM's resolution.
function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0), b = hash2(x0 + 1, y0), c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
function roughness(xm: number, ym: number) {
  let s = 0, amp = 0.5, f = 1 / 400, norm = 0;
  for (let o = 0; o < 5; o++, amp *= 0.5, f *= 2.3) {
    // Ridged octaves read like crater rims and lumps rather than smooth hills.
    s += amp * (1 - 2 * Math.abs(vnoise(xm * f + o * 17.3, ym * f - o * 9.1) - 0.5) * 2) * (o < 2 ? 1 : 0.8);
    norm += amp;
  }
  return s / norm;
}

// LOLA terrain has no detail below ~30-240 m, so the ground right around the viewer is smooth. Add
// finer rings near the center, plus roughness whose height grows with distance (0.25% of range, at most
// 2 m) so a bump never subtends more than ~0.15 deg and can't hide a Sun the terrain data says is up.
function refine(t: Terrain): Terrain {
  const { spokes, r, z } = t;
  const inner: number[] = [];
  for (let x = 0.002; x < r[0] * 0.97; x *= 1.06) inner.push(x);
  const nr0 = r.length;
  const nr = inner.length + nr0;
  const R = new Float32Array(nr);
  R.set(inner, 0);
  R.set(r, inner.length);
  const Z = new Float32Array(spokes * nr);
  // Round the ground off toward the center (a straight line from every spoke to one center point makes a
  // cone, and a cone facet that faces the Sun shows up as a bright bar).
  let mean0 = 0;
  for (let i = 0; i < spokes; i++) mean0 += z[i * nr0] / spokes;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * 2 * Math.PI, sa = Math.sin(a), ca = Math.cos(a);
    for (let j = 0; j < nr; j++) {
      const rr = R[j];
      let h = j < inner.length ? mean0 + (z[i * nr0] - mean0) * (rr / r[0]) ** 2 : z[i * nr0 + j - inner.length];
      const rm = rr * 1000;
      const fade = rm < 2500 ? 1 : rm > 5000 ? 0 : 1 - (rm - 2500) / 2500;
      if (fade > 0) h += (Math.min(0.0025 * rm, 2) * fade * roughness(rm * sa, -rm * ca)) / 1000;
      Z[i * nr + j] = h - mean0; // ground under the viewer at height 0
    }
  }
  return { spokes, r: R, z: Z };
}

function terrainGeometry(t0: Terrain) {
  const t = refine(t0);
  const { spokes, r, z } = t;
  const nr = r.length;
  const rMax = r[nr - 1];
  const count = 1 + spokes * nr;
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const col = new Float32Array(count * 3).fill(1);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * 2 * Math.PI;
    const sa = Math.sin(a);
    const ca = Math.cos(a);
    for (let j = 0; j < nr; j++) {
      const k = 1 + i * nr + j;
      const x = r[j] * sa;
      const zz = -r[j] * ca;
      pos.set([x, z[i * nr + j], zz], 3 * k);
      uv.set([x / 0.6, zz / 0.6], 2 * k); // detail texture repeats every 600 m
      const fade = Math.min(1, Math.max(0, (rMax - r[j]) / (0.3 * rMax)));
      col.fill(fade * fade, 3 * k, 3 * k + 3);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < spokes; i++) {
    const i2 = (i + 1) % spokes;
    idx.push(0, 1 + i2 * nr, 1 + i * nr);
    for (let j = 0; j < nr - 1; j++) {
      const a = 1 + i * nr + j;
      const b = 1 + i2 * nr + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if ((geo.attributes.normal as THREE.BufferAttribute).getY(0) < 0) {
    // wound the wrong way: flip so faces point up
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  return geo;
}

// Fine-scale regolith texture (albedo speckle + bumps) so close-up ground doesn't look like plastic.
function regolithTextures() {
  const N = 256;
  const h = new Float32Array(N * N);
  const rand = (x: number, y: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let o = 0, amp = 1; o < 5; o++, amp *= 0.55) {
    const cell = N >> (o + 2);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy);
        const fx = gx - x0, fy = gy - y0, m = N / cell;
        const v = (a: number, b: number) => rand(((a % m) + m) % m + o * 31, ((b % m) + m) % m);
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const top = v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx;
        const bot = v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx;
        h[y * N + x] += amp * (top * (1 - sy) + bot * sy);
      }
    }
  }
  const make = (fill: (d: Uint8ClampedArray, i: number, x: number, y: number) => void) => {
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d")!;
    const img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) fill(img.data, (y * N + x) * 4, x, y);
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  const at = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)];
  const albedo = make((d, i, x, y) => {
    const v = 205 + (at(x, y) - 1.1) * 35;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  });
  albedo.colorSpace = THREE.SRGBColorSpace;
  const normal = make((d, i, x, y) => {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 2.5;
    const dy = (at(x, y + 1) - at(x, y - 1)) * 2.5;
    const l = Math.hypot(dx, dy, 1);
    d[i] = (-dx / l * 0.5 + 0.5) * 255;
    d[i + 1] = (-dy / l * 0.5 + 0.5) * 255;
    d[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    d[i + 3] = 255;
  });
  return { albedo, normal };
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,248,225,1)");
  grad.addColorStop(0.12, "rgba(255,236,190,0.85)");
  grad.addColorStop(0.35, "rgba(255,210,140,0.18)");
  grad.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Earth with its true phase: lit from the Sun's direction, with procedural oceans, land and clouds.
function earthMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vN; varying vec3 vP;
      void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        vP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 sunDir; varying vec3 vN; varying vec3 vP;
      float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n3(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { s += a * n3(p); p *= 2.1; a *= 0.5; } return s; }
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vN);
        vec3 p = normalize(vP);
        float land = smoothstep(0.52, 0.56, fbm(p * 2.2 + 3.0));
        float cloud = smoothstep(0.5, 0.72, fbm(p * 4.0 + 11.0));
        vec3 col = mix(vec3(0.03, 0.12, 0.35), vec3(0.22, 0.3, 0.14), land);
        col = mix(col, vec3(0.95), cloud * 0.85);
        float day = smoothstep(-0.08, 0.12, dot(n, normalize(sunDir)));
        gl_FragColor = vec4(col * day * 1.6 + vec3(0.0, 0.004, 0.012), 1.0);
      }`,
  });
}

function compassLabel(text: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f5b942";
  g.font = "bold 40px system-ui";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 32, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(12, 12, 1);
  return s;
}

// Distant skyline: slopes facing away from the Sun (i.e. toward a viewer with the Sun behind) are lit,
// the rest stay dark. Bottom vertices are near black so the ridge line reads as a lit crest.
function shadeWall(s: Scene, site: Site, c: number) {
  const w = s.wall;
  if (!w) return;
  const col = w.geometry.getAttribute("color") as THREE.BufferAttribute;
  const k = Math.min(Math.max(c, 0), site.n - 1);
  const sunAz = site.sunAz[k];
  const up = site.sunEl[k] > -0.3 ? 1 : 0.15;
  const n = col.count / 2;
  for (let i = 0; i < n; i++) {
    const d = (i * site.az_step - sunAz - 180) * D2R;
    const lit = 0.035 + 0.3 * up * Math.max(0, Math.cos(d)) ** 1.5;
    col.setXYZ(2 * i, 0.01, 0.01, 0.012);
    col.setXYZ(2 * i + 1, lit, lit * 0.97, lit * 0.93);
  }
  col.needsUpdate = true;
}

function applyLens(s: Scene, stand: boolean, k: number, lift = 0) {
  const kk = stand ? k : 1;
  s.camera.fov = stand ? STAND_FOV : 50;
  // Shift the picture up (a view offset, no camera move) when a sheet covers the bottom of the stage.
  const el = s.renderer.domElement;
  const w = el.clientWidth || 1, h = el.clientHeight || 1;
  if (lift > 0) s.camera.setViewOffset(w, h, 0, lift * h, w, h);
  else s.camera.clearViewOffset();
  s.camera.updateProjectionMatrix();
  s.csm.updateFrustums(); // resets the projection, so stretch after it (its frustums stay a superset of the view)
  if (kk !== 1) {
    s.camera.projectionMatrix.elements[5] *= kk;
    s.camera.projectionMatrixInverse.copy(s.camera.projectionMatrix).invert();
  }
  // Keep the Sun, Earth and labels round under the stretch.
  s.sun.scale.set(1, 1 / kk, 1);
  s.earth.scale.set(1, 1 / kk, 1);
  s.glow.scale.set(140, 140 / kk, 1);
  s.compass.children.forEach((c) => c.scale.set(12, 12 / kk, 1));
}

type Scene = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  csm: CSM;
  material: THREE.MeshStandardMaterial;
  sun: THREE.Mesh;
  glow: THREE.Sprite;
  earth: THREE.Mesh;
  marker: THREE.Group;
  compass: THREE.Group;
  terrain?: THREE.Mesh;
  wall?: THREE.Mesh;
  look: { yaw: number; pitch: number };
  fill: THREE.HemisphereLight;
};

type Props = {
  site: Site;
  vis: Visibility;
  mast: string;
  i0: number;
  hours: number;
  cursor: number;
  onCursor: (i: number) => void;
  mode: ViewMode;
  playing: boolean;
  speed: number; // simulated hours per second
  exag: number; // vertical exaggeration in the overview
  lift?: number; // fraction of the stage height to shift the picture up (a sheet covers the bottom)
};

export default function Terrain3D({ site, vis, mast, i0, hours, cursor, onCursor, mode, playing, speed, exag, lift = 0 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const S = useRef<Scene | null>(null);
  const [terrain, setTerrain] = useState<Terrain | null | undefined>(undefined);
  const [relief, setRelief] = useState(true);
  const lens = useRef({ stand: false, k: RELIEF, lift: 0 });
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const i0Ref = useRef(i0);
  i0Ref.current = i0;

  // One-time scene setup.
  useEffect(() => {
    const el = box.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = EXPOSURE.overview;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#000000");
    const camera = new THREE.PerspectiveCamera(50, 1, 0.0005, 5000);
    camera.rotation.order = "YXZ";
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 1;
    controls.maxDistance = 400;

    // No atmosphere: shadows are nearly black. A faint earthshine fill keeps unlit terrain readable.
    const fill = new THREE.HemisphereLight("#6f86b8", "#000000", 0.05);
    scene.add(fill);

    // Cascaded shadow maps: sharp shadows near the camera, long shadows out to 400 km.
    const csm = new CSM({
      camera, parent: scene, cascades: 3, maxFar: 400, mode: "practical", shadowMapSize: 2048,
      lightDirection: new THREE.Vector3(0, -1, 0), lightIntensity: SUN_INTENSITY,
      lightNear: 1, lightFar: 2000, lightMargin: 300,
    });
    csm.fade = true;
    csm.lights.forEach((l) => { l.shadow.bias = -0.0003; l.shadow.normalBias = 0.08; l.color.set("#fff4e2"); });

    const { albedo, normal } = regolithTextures();
    const material = new THREE.MeshStandardMaterial({
      color: "#8c8882", map: albedo, normalMap: normal, normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 1, metalness: 0, vertexColors: true,
    });
    csm.setupMaterial(material);
    // Lunar soil is not Lambertian: it follows Lommel-Seeliger, brightness ~ cos(i) / (cos(i) + cos(e)).
    // Lit ground seen at a low angle under a low Sun stays bright (why the Moon has no dark limb), where
    // Lambert shading would render it nearly black. Looking straight down it matches Lambert's cos(i).
    const csmCompile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, r) => {
      csmCompile.call(material, shader, r);
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <lights_physical_pars_fragment>",
        THREE.ShaderChunk.lights_physical_pars_fragment.replace(
          "vec3 irradiance = dotNL * directLight.color;",
          "float dotNVls = saturate( dot( geometryNormal, geometryViewDir ) );\n" +
          "vec3 irradiance = ( dotNL / ( dotNL + dotNVls + 0.02 ) ) * directLight.color;",
        ),
      );
    };

    const starPos = new Float32Array(4000 * 3);
    const starCol = new Float32Array(4000 * 3);
    for (let i = 0; i < 4000; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(3000);
      starPos.set([v.x, v.y, v.z], i * 3);
      const b = 0.35 + Math.random() ** 3 * 0.65;
      starCol.set([b, b, b * (0.9 + Math.random() * 0.2)], i * 3);
    }
    const stars = new THREE.BufferGeometry();
    stars.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    stars.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
    scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ size: 1.3, sizeAttenuation: false, vertexColors: true })));

    // Earth at true angular size (~1.9 deg); Sun drawn at 2x its true 0.53 deg so it reads on screen.
    const sun = new THREE.Mesh(new THREE.SphereGeometry(SKY_KM * Math.tan(0.53 * D2R), 32, 16),
      new THREE.MeshBasicMaterial({ color: "#fff6dc", toneMapped: false }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false,
    }));
    glow.scale.set(140, 140, 1);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(SKY_KM * Math.tan(0.95 * D2R), 48, 24), earthMaterial());
    scene.add(sun, glow, earth);

    const marker = new THREE.Group();
    const markMat = new THREE.MeshBasicMaterial({ color: "#f5b942", toneMapped: false });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3), markMat);
    pole.position.y = 1.5;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.35), markMat);
    tip.position.y = 3;
    marker.add(pole, tip);
    scene.add(marker);

    const compass = new THREE.Group();
    ([["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const).forEach(([t, az]) => {
      const s = compassLabel(t);
      s.position.copy(direction(az, 0).multiplyScalar(WALL_KM * 0.8)).setY(14);
      compass.add(s);
    });
    scene.add(compass);

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      if (S.current) applyLens(S.current, lens.current.stand, lens.current.k, lens.current.lift);
      else { camera.updateProjectionMatrix(); csm.updateFrustums(); }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const s: Scene = { renderer, scene, camera, controls, csm, material, sun, glow, earth, marker, compass, fill, look: { yaw: 0, pitch: 0.05 } };
    S.current = s;
    if (import.meta.env.DEV) (window as unknown as { __horizon3d: Scene }).__horizon3d = s;
    renderer.setAnimationLoop(() => {
      if (controls.enabled) controls.update();
      csm.update();
      renderer.render(scene, camera);
    });

    // Drag to look around in the stand-at-site view.
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => { if (!controls.enabled) drag = { x: e.clientX, y: e.clientY }; };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      s.look.yaw += (e.clientX - drag.x) * 0.004;
      s.look.pitch = Math.max(-0.6, Math.min(1.2, s.look.pitch + (e.clientY - drag.y) * 0.004));
      drag = { x: e.clientX, y: e.clientY };
      camera.rotation.set(s.look.pitch, s.look.yaw, 0);
    };
    const up = () => { drag = null; };
    renderer.domElement.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);

    return () => {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      controls.dispose();
      csm.remove();
      csm.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      S.current = null;
    };
  }, []);

  // Load the focused site's terrain.
  useEffect(() => {
    let live = true;
    setTerrain(undefined);
    loadTerrain(site.id).then((t) => live && setTerrain(t));
    return () => { live = false; };
  }, [site.id]);

  // Terrain mesh.
  useEffect(() => {
    const s = S.current;
    if (!s) return;
    if (s.terrain) {
      s.scene.remove(s.terrain);
      s.terrain.geometry.dispose();
      s.terrain = undefined;
    }
    if (!terrain) return;
    const mesh = new THREE.Mesh(terrainGeometry(terrain), s.material);
    mesh.castShadow = mesh.receiveShadow = true;
    s.terrain = mesh;
    s.scene.add(mesh);
  }, [terrain]);

  // Skyline from the ray-marched 300 km horizon, drawn as a silhouette ring beyond the disk (stand view).
  useEffect(() => {
    const s = S.current;
    if (!s) return;
    if (s.wall) {
      s.scene.remove(s.wall);
      s.wall.geometry.dispose();
    }
    const prof = site.horizon[mast];
    const eye = Math.max(MAST_KM[mast] ?? 0.002, EYE_KM);
    const verts: number[] = [];
    const idx: number[] = [];
    prof.forEach((el, k) => {
      const d = direction(k * site.az_step, 0).multiplyScalar(WALL_KM);
      verts.push(d.x, eye - 40, d.z, d.x, eye + WALL_KM * Math.tan(el * D2R), d.z);
      const a = 2 * k;
      const b = (2 * (k + 1)) % (2 * prof.length);
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(verts.length), 3));
    geo.setIndex(idx);
    s.wall = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    s.wall.visible = mode === "stand";
    s.scene.add(s.wall);
    shadeWall(s, site, cursorRef.current);
  }, [site, mast]);

  // What each mode shows, and vertical exaggeration (overview only).
  useEffect(() => {
    const s = S.current;
    if (!s) return;
    const stand = mode === "stand";
    if (s.terrain) s.terrain.scale.y = stand ? 1 : exag;
    if (s.wall) s.wall.visible = stand;
    s.compass.visible = stand;
    s.marker.visible = !stand;
    s.marker.scale.y = exag;
  }, [mode, exag, mast, terrain]);

  // Reset the camera when the view mode or site changes (not on every slider move).
  useEffect(() => {
    const s = S.current;
    if (!s) return;
    const stand = mode === "stand";
    s.controls.enabled = !stand;
    s.renderer.toneMappingExposure = stand ? EXPOSURE.stand : EXPOSURE.overview;
    s.fill.intensity = stand ? 0.14 : 0.05; // earthshine; a bit more when standing so shaded ground isn't a void
    // Aim from the cursor if it's inside this mission, else from touchdown (the cursor may not be synced yet).
    const cur = cursorRef.current;
    const c = Math.min(Math.max(cur >= i0Ref.current && cur < i0Ref.current + hours ? cur : i0Ref.current, 0), site.n - 1);
    // A normal-lens view when standing (a wide angle squashes distant hills into a thin strip).
    // Shadow cascades: from eye height the default split puts 0-67 km in the first map (~33 m texels,
    // smeared ~30x along the ground by a 2-deg Sun). Standing, use 1.5 km / 20 km / 400 km instead.
    if (stand) {
      s.csm.mode = "custom";
      s.csm.customSplitsCallback = (_n: number, _near: number, far: number, b: number[]) => { b.push(1.5 / far, 20 / far, 1); };
    } else {
      s.csm.mode = "practical";
    }
    const bias = stand ? [[-0.00002, 0.004], [-0.0001, 0.03], [-0.0003, 0.08]] : [[-0.0003, 0.08], [-0.0003, 0.08], [-0.0003, 0.08]];
    s.csm.lights.forEach((l, k) => { l.shadow.bias = bias[k][0]; l.shadow.normalBias = bias[k][1]; });
    lens.current = { stand, k: relief ? RELIEF : 1, lift };
    applyLens(s, stand, lens.current.k, lift);
    if (stand) {
      s.camera.position.set(0, Math.max(MAST_KM[mast] ?? 0.002, EYE_KM), 0);
      // Face 120 deg from the Sun: low side light shows the relief. Looking into a 2-deg Sun is all backlit shadow.
      s.look.yaw = -(site.sunAz[c] + 120) * D2R;
      s.look.pitch = 0.01;
      s.camera.rotation.set(s.look.pitch, s.look.yaw, 0);
    } else {
      // Stand back so the Sun is ~30 deg off to one side: it stays in frame, sunlit slopes face the
      // viewer, and shadows stretch across the view.
      const back = direction(site.sunAz[c] + 150, 0).multiplyScalar(50);
      s.camera.position.set(back.x, 12, back.z);
      s.controls.target.set(0, 0, 0);
      s.controls.update();
    }
  }, [mode, site, mast]);

  // Relief stretch on/off without moving the camera.
  useEffect(() => {
    const s = S.current;
    if (!s) return;
    lens.current = { stand: mode === "stand", k: relief ? RELIEF : 1, lift };
    applyLens(s, lens.current.stand, lens.current.k, lift);
  }, [relief, mode, lift]);

  // Sun, Earth and lighting for the cursor hour.
  useEffect(() => {
    const s = S.current;
    if (!s) return;
    const c = Math.min(Math.max(cursor, 0), site.n - 1);
    const sd = direction(site.sunAz[c], site.sunEl[c]);
    s.csm.lightDirection.copy(sd).negate();
    s.csm.lights.forEach((l) => { l.intensity = SUN_INTENSITY * vis.sunFrac[c]; });
    const lit = vis.sunFrac[c] >= SUNLIT;
    s.sun.position.copy(sd).multiplyScalar(SKY_KM);
    s.glow.position.copy(s.sun.position);
    s.glow.material.opacity = 0.25 + 0.75 * vis.sunFrac[c];
    (s.sun.material as THREE.MeshBasicMaterial).color.set(lit ? "#fff6dc" : "#8a7442");
    s.earth.position.copy(direction(site.earthAz[c], site.earthEl[c])).multiplyScalar(SKY_KM);
    ((s.earth.material as THREE.ShaderMaterial).uniforms.sunDir.value as THREE.Vector3).copy(sd);
    shadeWall(s, site, c);
  }, [cursor, site, vis]);

  // Playback through the mission window (a timer, so it keeps running when the tab is in the background).
  useEffect(() => {
    if (!playing) return;
    let acc = 0;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      acc += ((now - last) / 1000) * speed;
      last = now;
      if (acc < 1) return;
      const step = Math.floor(acc);
      acc -= step;
      let next = cursorRef.current + step;
      if (next >= i0 + hours || next < i0) next = i0;
      onCursor(next);
    }, 40);
    return () => window.clearInterval(id);
  }, [playing, speed, i0, hours, onCursor]);

  // Full-bleed stage: the page lays its panels, time bar and controls on top of it.
  return (
    <div className="stage3d" id="view3d">
      <div ref={box} className="three" />
      {mode === "stand" && terrain && (
        <button className="relief-toggle" onClick={() => setRelief(!relief)}
          title="Hills near the pole rise only 1-3 degrees. Stretching the picture makes them readable; what blocks the Sun is unchanged.">
          {relief ? `Heights ×${RELIEF}` : "True scale"}<span>{relief ? "Show true scale" : "Stretch heights"}</span>
        </button>
      )}
      {terrain === null && <div className="three-msg">No 3D terrain for this site: it lies outside the polar terrain maps.</div>}
      {terrain === undefined && <div className="three-msg">Loading terrain…</div>}
    </div>
  );
}
