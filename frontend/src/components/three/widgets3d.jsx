import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { C, toneForScore } from "../../theme";
import { easeOutBack, easeOutExpo, useThreeScene } from "./useThreeScene";

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

  const { mountRef } = useThreeScene(
    ({ scene, camera, THREE, track, reduced }) => {
      camera.position.set(0, 0.9, 3.35);
      camera.lookAt(0, -0.02, 0);

      addStudioLights(scene, THREE, { target: [0, 0, 0] });
      addShadowFloor(scene, THREE, track, -1.35);

      const group = new THREE.Group();
      scene.add(group);

      // Unfilled remainder of the scale, in a satin finish so the lit value
      // arc reads against it.
      const trackRing = new THREE.Mesh(
        track(new THREE.TorusGeometry(1, 0.085, 24, 140, Math.PI * 1.5)),
        track(
          new THREE.MeshPhysicalMaterial({
            color: 0xdfe6e4,
            roughness: 0.62,
            metalness: 0.15,
            clearcoat: 0.4,
            envMapIntensity: 0.8,
          })
        )
      );
      trackRing.rotation.z = Math.PI * 0.75;
      trackRing.castShadow = true;
      trackRing.receiveShadow = true;
      group.add(trackRing);

      const valueMat = physical(THREE, track, colour, { emissive: 0.3, rough: 0.16, metal: 0.7 });

      // The arc is rebuilt as it grows; the tip cap rides its leading edge so
      // the sweep ends in a rounded terminal rather than a cut torus.
      let arc = null;
      const tip = new THREE.Mesh(track(new THREE.SphereGeometry(0.098, 24, 24)), valueMat);
      tip.castShadow = true;
      group.add(tip);

      const START = Math.PI * 0.75;
      const SWEEP = Math.PI * 1.5;
      const rebuild = (frac) => {
        const sweep = Math.max(0.0001, SWEEP * frac);
        if (arc) {
          group.remove(arc);
          arc.geometry.dispose();
        }
        arc = new THREE.Mesh(new THREE.TorusGeometry(1, 0.098, 24, 160, sweep), valueMat);
        arc.rotation.z = START;
        arc.castShadow = true;
        arc.receiveShadow = true;
        group.add(arc);
        const a = START + sweep;
        tip.position.set(Math.cos(a), Math.sin(a), 0);
      };
      rebuild(reduced ? score / 100 : 0);

      // A faint glow disc behind the arc, so the emissive colour spills the
      // way a real lit surface would.
      const glow = new THREE.Mesh(
        track(new THREE.CircleGeometry(1.35, 48)),
        track(new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.06 }))
      );
      glow.position.z = -0.35;
      group.add(glow);

      let lastFrac = -1;
      return (t) => {
        const p = reduced ? 1 : Math.min(1, t / 1.25);
        const frac = (score / 100) * easeOutExpo(p);
        if (Math.abs(frac - lastFrac) > 0.003) {
          rebuild(frac);
          lastFrac = frac;
        }
        if (!reduced) {
          // A slow parallax tilt rather than a spin: enough for the clearcoat
          // highlight to travel, not enough to distract from the number.
          group.rotation.y = Math.sin(t * 0.36) * 0.18;
          group.rotation.x = Math.sin(t * 0.27) * 0.06;
          glow.material.opacity = 0.05 + Math.sin(t * 1.1) * 0.02;
        }
      };
    },
    [score, colour],
    { height }
  );

  return (
    <div className="relative" style={{ height }}>
      <div ref={mountRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="tabular-nums"
          style={{ fontSize: 30, fontWeight: 700, color: C.navy, fontFamily: "'Manrope', sans-serif" }}
        >
          {Number(score).toFixed(score % 1 === 0 ? 0 : 1)}
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

  const { mountRef } = useThreeScene(
    ({ scene, camera, THREE, track, reduced }) => {
      camera.position.set(0.4, 2.3, 4.3);
      camera.lookAt(0, 0.45, 0);

      addStudioLights(scene, THREE, { target: [0, 0.5, 0] });
      addShadowFloor(scene, THREE, track, 0);

      const max = Math.max(...rows.map((r) => r.value), 1);
      const span = 4.4;
      const step = rows.length > 1 ? span / rows.length : span;
      const w = step * 0.58;

      // Unit-height rounded box, scaled per bar. The bevel is what lets the
      // key light lay a highlight along each edge.
      const barGeo = track(new RoundedBoxGeometry(w, 1, w, 3, Math.min(w * 0.16, 0.05)));

      const plate = new THREE.Mesh(
        track(new RoundedBoxGeometry(span + 0.55, 0.08, 1.35, 3, 0.03)),
        track(
          new THREE.MeshPhysicalMaterial({
            color: 0xeef2f0,
            roughness: 0.55,
            metalness: 0.08,
            clearcoat: 0.5,
          })
        )
      );
      plate.position.y = -0.04;
      plate.receiveShadow = true;
      scene.add(plate);

      const bars = rows.map((r, i) => {
        const colour = new THREE.Color(r.color || toneForScore((r.value / max) * 100));
        const mesh = new THREE.Mesh(barGeo, physical(THREE, track, colour, { emissive: 0.12 }));
        mesh.position.x = -span / 2 + step * (i + 0.5);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.scale.y = 0.001;
        scene.add(mesh);
        return { mesh, target: Math.max(0.08, (r.value / max) * 2.05), order: i };
      });

      return (t) => {
        bars.forEach(({ mesh, target, order }) => {
          // Staggered, with a slight overshoot at the top of the rise.
          const p = reduced ? 1 : Math.max(0, Math.min(1, (t - order * 0.06) / 0.95));
          const h = Math.max(0.001, target * (p >= 1 ? 1 : easeOutBack(p)));
          mesh.scale.y = h;
          mesh.position.y = h / 2;
        });
        if (!reduced) scene.rotation.y = Math.sin(t * 0.2) * 0.17;
      };
    },
    [JSON.stringify(rows)],
    { height }
  );

  return (
    <div style={{ height }}>
      <div ref={mountRef} className="h-full w-full" />
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
      camera.position.set(0, 0.2, 3.5);
      camera.lookAt(0, 0, 0);

      addStudioLights(scene, THREE, { shadow: false });

      const core = new THREE.Mesh(
        track(new THREE.IcosahedronGeometry(0.7, 4)),
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
        track(new THREE.IcosahedronGeometry(1.12, 5)),
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
        track(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.16, detail))),
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
    <div className="relative" style={{ height }}>
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
