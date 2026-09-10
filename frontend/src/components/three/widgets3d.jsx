import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { C, toneForScore } from "../../theme";
import { easeOutBack, easeOutExpo, useThreeScene } from "./useThreeScene";
import { usePrefersReducedMotion } from "../motion";

/**
 * 3D widgets.
 *
 * Each one encodes a real quantity — an arc that sweeps to a score, bars whose
 * height is a value, a shell whose density is risk. None is decoration with
 * numbers bolted on: read the geometry and you have read the data.
 *
 * They are built to look like objects rather than diagrams. Physical materials
 * with clearcoat pick up the shared room environment, everything sits on a
 * shadow-catching floor so it has weight, and edges are bevelled — a hard
 * 90-degree edge catches no highlight and is the single clearest tell that a
 * render is synthetic.
 */

/** A floor that receives shadows but is otherwise invisible. */
function addShadowFloor(scene, THREE, track, y = 0) {
  const floor = new THREE.Mesh(
    track(new THREE.PlaneGeometry(40, 40)),
    track(new THREE.ShadowMaterial({ opacity: 0.22 }))
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = y;
  floor.receiveShadow = true;
  scene.add(floor);
  return floor;
}

/** Key/fill/rim: the standard three-point setup, which is what reads as "lit". */
function addStudioLights(scene, THREE, { shadow = true, target = [0, 0, 0] } = {}) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1c2b38, 0.55));

  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(3.2, 5.4, 3.6);
  if (shadow) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 4;
    key.shadow.bias = -0.0012;
    const cam = key.shadow.camera;
    cam.left = -4;
    cam.right = 4;
    cam.top = 4;
    cam.bottom = -4;
    cam.near = 0.5;
    cam.far = 20;
    cam.updateProjectionMatrix();
  }
  key.target.position.set(...target);
  scene.add(key.target);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xdbeafe, 0.5);
  fill.position.set(-4, 1.5, 2.5);
  scene.add(fill);

  // Rim light from behind: separates the object from the background, the
  // difference between "a shape" and "a thing in a room".
  const rim = new THREE.DirectionalLight(0xffffff, 1.1);
  rim.position.set(-1.5, 2.5, -4);
  scene.add(rim);
}

/** Painted metal with a clear lacquer over it. */
function physical(THREE, track, colour, { emissive = 0.14, rough = 0.28, metal = 0.55 } = {}) {
  return track(
    new THREE.MeshPhysicalMaterial({
      color: colour,
      emissive: colour,
      emissiveIntensity: emissive,
      roughness: rough,
      metalness: metal,
      clearcoat: 0.9,
      clearcoatRoughness: 0.18,
      envMapIntensity: 1.15,
    })
  );
}

/* ------------------------------------------------------------------ */
/* Gauge3D — a torus arc that sweeps to a 0-100 score                  */
/* ------------------------------------------------------------------ */
export function Gauge3D({ score = 0, label, sub, height = 200, tone }) {
  const colour = tone || toneForScore(score);
  const reduced = usePrefersReducedMotion();
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  const size = Math.min(height - 12, 176);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - safeScore / 100);

  return (
    <div className="relative flex h-full w-full min-w-0 items-center justify-center overflow-hidden rounded-md" style={{ height }}>
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${label || "Score"}: ${safeScore} out of 100`}>
        <defs>
          <linearGradient id={`score-${colour.replace("#", "")}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor={colour} stopOpacity="0.72" />
            <stop offset="1" stopColor={colour} />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#E3E8E3" strokeWidth="7" />
        <circle cx="50" cy="50" r={radius} fill="none" stroke={`url(#score-${colour.replace("#", "")})`} strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 50 50)" style={{ transition: reduced ? "none" : "stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)" }} />
        <circle cx="50" cy="50" r="31" fill="#FFFFFF" stroke="#F0F4F1" />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="tabular-nums"
          style={{ fontSize: 30, fontWeight: 700, color: C.navy, fontFamily: "'Manrope', sans-serif" }}
        >
          {safeScore.toFixed(safeScore % 1 === 0 ? 0 : 1)}
        </span>
        {label && (
          <span className="mt-0.5 text-[11px] font-medium" style={{ color: C.slateSoft }}>
            {label}
          </span>
        )}
        {sub && (
          <span className="text-[10px]" style={{ color: C.slateFaint }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bars3D — bevelled bars, height proportional to value                */
/* ------------------------------------------------------------------ */
export function Bars3D({ data = [], height = 240, maxBars = 12 }) {
  const rows = data.slice(0, maxBars);
  const max = Math.max(...rows.map((row) => Number(row.value) || 0), 1);
  const scale = Math.ceil(max / 10) * 10;

  return (
    <div className="flex flex-col justify-center gap-2 overflow-y-auto pr-1" style={{ height }} aria-label="Ranked comparison chart">
      <div className="grid grid-cols-[minmax(84px,1.2fr)_minmax(110px,3fr)_46px] gap-3 text-[10px] font-medium uppercase tracking-wide" style={{ color: C.slateFaint }}>
        <span>Location</span><span>Score scale 0–{scale}</span><span className="text-right">Value</span>
      </div>
      {rows.map((row, index) => {
        const value = Number(row.value) || 0;
        const width = `${Math.max(2, Math.min(100, (value / scale) * 100))}%`;
        const colour = row.color || toneForScore((value / scale) * 100);
        return (
          <div key={`${row.label}-${index}`} className="grid grid-cols-[minmax(84px,1.2fr)_minmax(110px,3fr)_46px] items-center gap-3">
            <span className="truncate text-xs font-medium" title={row.label} style={{ color: C.slate }}>{index + 1}. {row.label}</span>
            <div className="h-7 overflow-hidden rounded-sm" style={{ background: "#EEF3F0" }}>
              <div className="nir-data-bar flex h-full items-center justify-end rounded-sm px-2 text-[10px] font-semibold text-white" style={{ width, minWidth: "2rem", background: colour, animationDelay: `${index * 55}ms` }}>
                {Math.round((value / scale) * 100)}%
              </div>
            </div>
            <span className="text-right text-xs font-semibold tabular-nums" style={{ color: C.navy }}>{value.toFixed(value % 1 === 0 ? 0 : 1)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* RiskShell3D — a caged core whose agitation reads as exposure        */
/* ------------------------------------------------------------------ */
export function RiskShell3D({ score = 0, height = 220, label = "composite risk" }) {
  const colour = score >= 65 ? C.red : score >= 40 ? C.amber : C.green;

  const { mountRef } = useThreeScene(
    ({ scene, camera, THREE, track, reduced }) => {
      // This widget commonly sits beside the score ring in a narrow two-up
      // layout. Keep the full shell in frame rather than filling the canvas.
      camera.position.set(0, 0.12, 4.7);
      camera.lookAt(0, 0, 0);

      addStudioLights(scene, THREE, { shadow: false });

      const core = new THREE.Mesh(
        track(new THREE.IcosahedronGeometry(0.58, 3)),
        track(
          new THREE.MeshPhysicalMaterial({
            color: colour,
            emissive: colour,
            emissiveIntensity: 0.28,
            roughness: 0.12,
            metalness: 0.35,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
            envMapIntensity: 1.4,
          })
        )
      );
      scene.add(core);

      // A glass shell over the core: transmission is what makes it read as a
      // physical enclosure rather than a wireframe overlay.
      const glass = new THREE.Mesh(
        track(new THREE.IcosahedronGeometry(0.9, 3)),
        track(
          new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            transmission: 0.92,
            thickness: 0.4,
            roughness: 0.08,
            metalness: 0,
            ior: 1.35,
            transparent: true,
            opacity: 0.55,
            envMapIntensity: 1.6,
          })
        )
      );
      scene.add(glass);

      // Cage density rises with the score: a calm site looks open, an exposed
      // one looks caged in.
      const detail = score >= 65 ? 3 : score >= 40 ? 2 : 1;
      const cage = new THREE.LineSegments(
        track(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.96, detail))),
        track(new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.55 }))
      );
      scene.add(cage);

      return (t) => {
        if (reduced) return;
        core.rotation.y = t * 0.3;
        core.rotation.x = Math.sin(t * 0.42) * 0.18;
        cage.rotation.y = -t * 0.2;
        cage.rotation.z = t * 0.09;
        glass.rotation.y = t * 0.06;
        // Amplitude scales with the score, so a high-risk site visibly
        // breathes harder than a low-risk one.
        const pulse = 1 + Math.sin(t * 1.5) * (score / 100) * 0.05;
        cage.scale.setScalar(pulse);
        core.material.emissiveIntensity = 0.24 + Math.sin(t * 1.5) * (score / 100) * 0.14;
      };
    },
    [score, colour],
    { height, shadows: false }
  );

  return (
    <div
      className="relative mx-auto h-full w-full min-w-0 max-w-[176px] overflow-hidden rounded-md"
      style={{ height: Math.min(height, 176), background: "#F8FBF9" }}
    >
      <div ref={mountRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="tabular-nums"
          style={{ fontSize: 26, fontWeight: 700, color: C.navy, fontFamily: "'Manrope', sans-serif" }}
        >
          {Math.round(score)}
        </span>
        <span className="text-[10px]" style={{ color: C.slateSoft }}>{label}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* HeroField3D — the landing page ambient city                         */
/* ------------------------------------------------------------------ */
export function HeroField3D({ height = 300, points = [] }) {
  const { mountRef } = useThreeScene(
    ({ scene, camera, THREE, track, reduced }) => {
      camera.position.set(0, 2.2, 4.9);
      camera.lookAt(0, 0.35, 0);

      scene.add(new THREE.HemisphereLight(0x9fd6ea, 0x06131c, 0.5));
      const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
      sun.position.set(3.5, 6, 3);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.radius = 5;
      sun.shadow.bias = -0.0015;
      Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 20 });
      sun.shadow.camera.updateProjectionMatrix();
      scene.add(sun);
      const rim = new THREE.DirectionalLight(0x7dd3fc, 1.4);
      rim.position.set(-3, 2, -4);
      scene.add(rim);

      const group = new THREE.Group();
      scene.add(group);

      // Dark plate the towers stand on, catching their shadows.
      const ground = new THREE.Mesh(
        track(new THREE.CircleGeometry(4.2, 64)),
        track(new THREE.MeshPhysicalMaterial({ color: 0x0a1c2b, roughness: 0.42, metalness: 0.35, clearcoat: 0.6 }))
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      group.add(ground);

      const grid = new THREE.GridHelper(8.4, 28, 0x2dd4bf, 0x14313f);
      grid.material.transparent = true;
      grid.material.opacity = 0.22;
      grid.position.y = 0.004;
      group.add(grid);

      // Towers rise where sites are; heights are real scores when supplied,
      // so even the ambient scene is showing something true.
      const values = points.length ? points : Array.from({ length: 26 }, () => 55 + Math.random() * 40);
      const geo = track(new RoundedBoxGeometry(0.16, 1, 0.16, 3, 0.035));
      const bars = values.slice(0, 34).map((v, i) => {
        const colour = new THREE.Color(toneForScore(v));
        const mesh = new THREE.Mesh(geo, physical(THREE, track, colour, { emissive: 0.4, metal: 0.65 }));
        const angle = (i / 34) * Math.PI * 2;
        const radius = 1.15 + (i % 5) * 0.44;
        mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.scale.y = 0.001;
        group.add(mesh);
        return { mesh, target: 0.3 + ((v - 45) / 55) * 1.6, order: i };
      });

      return (t) => {
        bars.forEach(({ mesh, target, order }) => {
          const p = reduced ? 1 : Math.max(0, Math.min(1, (t - order * 0.035) / 1.2));
          const bob = reduced ? 0 : Math.sin(t * 0.85 + order * 0.4) * 0.045;
          const h = Math.max(0.02, target * easeOutExpo(p) + bob);
          mesh.scale.y = h;
          mesh.position.y = h / 2;
        });
        if (!reduced) group.rotation.y = t * 0.085;
      };
    },
    [JSON.stringify(points.slice(0, 34))],
    { height }
  );

  return (
    <div style={{ height }}>
      <div ref={mountRef} className="h-full w-full" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Engine3D — the Copilot thinking core                                */
/* ------------------------------------------------------------------ */
export function Engine3D({ height = 190, active = false }) {
  const { mountRef } = useThreeScene(
    ({ scene, camera, THREE, track, reduced }) => {
      camera.position.set(0, 0.35, 3.5);
      camera.lookAt(0, 0, 0);

      addStudioLights(scene, THREE, { shadow: false });

      const core = new THREE.Mesh(
        track(new THREE.TorusKnotGeometry(0.6, 0.165, 220, 32)),
        track(
          new THREE.MeshPhysicalMaterial({
            color: C.teal,
            emissive: C.teal,
            emissiveIntensity: 0.22,
            roughness: 0.14,
            metalness: 0.85,
            clearcoat: 1,
            clearcoatRoughness: 0.1,
            envMapIntensity: 1.5,
          })
        )
      );
      scene.add(core);

      // Satellites stand for the engines the Copilot routes questions to.
      const ringGeo = track(new THREE.SphereGeometry(0.055, 20, 20));
      const ringMat = track(
        new THREE.MeshPhysicalMaterial({
          color: C.lime,
          emissive: C.lime,
          emissiveIntensity: 0.75,
          roughness: 0.2,
          metalness: 0.3,
          clearcoat: 1,
        })
      );
      const orbiters = Array.from({ length: 6 }, (_, i) => {
        const m = new THREE.Mesh(ringGeo, ringMat);
        scene.add(m);
        return { m, phase: (i / 6) * Math.PI * 2, tilt: (i % 3) * 0.5 };
      });

      let rate = active ? 1.6 : 0.45;
      return (t) => {
        if (reduced) return;
        // Ease between idle and working speed so activating a query spins the
        // core up rather than snapping it.
        const goal = active ? 1.7 : 0.45;
        rate += (goal - rate) * 0.04;
        core.rotation.x = t * rate * 0.5;
        core.rotation.y = t * rate;
        core.material.emissiveIntensity = 0.2 + (active ? 0.18 : 0.04) * (0.5 + 0.5 * Math.sin(t * 3));
        orbiters.forEach(({ m, phase, tilt }) => {
          const a = t * rate * 0.8 + phase;
          m.position.set(Math.cos(a) * 1.28, Math.sin(a * 0.7 + tilt) * 0.52, Math.sin(a) * 1.28);
        });
      };
    },
    [active],
    { height, shadows: false }
  );

  return (
    <div style={{ height }}>
      <div ref={mountRef} className="h-full w-full" />
    </div>
  );
}
