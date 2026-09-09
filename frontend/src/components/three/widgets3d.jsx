import { C, toneForScore } from "../../theme";
import { useThreeScene } from "./useThreeScene";

/**
 * 3D widgets.
 *
 * Each one encodes a real quantity — an arc that sweeps to a score, bars whose
 * height is a value, a shell whose radius is risk. None of them is decoration
 * with numbers bolted on: read the geometry and you have read the data.
 */

/* ------------------------------------------------------------------ */
/* Gauge3D — a torus arc that sweeps to a 0-100 score                  */
/* ------------------------------------------------------------------ */
export function Gauge3D({ score = 0, label, sub, height = 200, tone }) {
  const colour = tone || toneForScore(score);

  const { mountRef } = useThreeScene(
    ({ scene, camera, THREE, track, reduced }) => {
      camera.position.set(0, 0.35, 3.1);
      camera.lookAt(0, -0.05, 0);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(2, 3, 4);
      scene.add(key);

      // Full track, dimmed — the "remaining" part of the scale.
      const trackRing = new THREE.Mesh(
        track(new THREE.TorusGeometry(1, 0.085, 16, 120, Math.PI * 1.5)),
        track(new THREE.MeshStandardMaterial({ color: 0xd8e2e0, roughness: 0.9, metalness: 0.05 }))
      );
      trackRing.rotation.z = Math.PI * 0.75;
      scene.add(trackRing);

      // Value arc, grown in the frame loop.
      const valueMat = track(
        new THREE.MeshStandardMaterial({
          color: colour,
          emissive: colour,
          emissiveIntensity: 0.4,
          roughness: 0.22,
          metalness: 0.55,
        })
      );
      let arc = null;
      const rebuild = (frac) => {
        const sweep = Math.max(0.001, Math.PI * 1.5 * frac);
        if (arc) {
          scene.remove(arc);
          arc.geometry.dispose();
        }
        arc = new THREE.Mesh(new THREE.TorusGeometry(1, 0.095, 16, 120, sweep), valueMat);
        arc.rotation.z = Math.PI * 0.75;
        scene.add(arc);
      };
      rebuild(reduced ? score / 100 : 0);

      // Drifting motes give the scene depth without stealing attention.
      const motes = new THREE.Group();
      for (let i = 0; i < 22; i += 1) {
        const m = new THREE.Mesh(
          track(new THREE.SphereGeometry(0.018, 8, 8)),
          track(new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.35 }))
        );
        m.position.set((Math.random() - 0.5) * 3.2, (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 1.4);
        m.userData.speed = 0.1 + Math.random() * 0.25;
        motes.add(m);
      }
      scene.add(motes);

      let lastFrac = -1;
      return (t) => {
        const p = reduced ? 1 : Math.min(1, t / 1.1);
        const eased = 1 - Math.pow(1 - p, 3);
        const frac = (score / 100) * eased;
        if (Math.abs(frac - lastFrac) > 0.004) {
          rebuild(frac);
          lastFrac = frac;
        }
        if (!reduced) {
          motes.children.forEach((m, i) => {
            m.position.y += Math.sin(t * m.userData.speed + i) * 0.0012;
            m.rotation.y = t * 0.4;
          });
          scene.rotation.y = Math.sin(t * 0.25) * 0.14;
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
/* Bars3D — extruded bars, height proportional to value                */
/* ------------------------------------------------------------------ */
export function Bars3D({ data = [], height = 240, maxBars = 12 }) {
  const rows = data.slice(0, maxBars);

  const { mountRef } = useThreeScene(
    ({ scene, camera, THREE, track, reduced }) => {
      camera.position.set(0, 2.0, 4.2);
      camera.lookAt(0, 0.35, 0);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2b38, 0.95));
      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(2.5, 4, 3);
      scene.add(key);

      const max = Math.max(...rows.map((r) => r.value), 1);
      const span = 4.4;
      const step = rows.length > 1 ? span / rows.length : span;
      const barGeo = track(new THREE.BoxGeometry(step * 0.56, 1, step * 0.56));

      const plate = new THREE.Mesh(
        track(new THREE.BoxGeometry(span + 0.5, 0.07, 1.2)),
        track(new THREE.MeshStandardMaterial({ color: 0xe7edeb, roughness: 0.95 }))
      );
      plate.position.y = -0.035;
      scene.add(plate);

      const bars = rows.map((r, i) => {
        const colour = new THREE.Color(r.color || toneForScore((r.value / max) * 100));
        const mesh = new THREE.Mesh(
          barGeo,
          track(
            new THREE.MeshStandardMaterial({
              color: colour,
              emissive: colour,
              emissiveIntensity: 0.22,
              roughness: 0.3,
              metalness: 0.35,
            })
          )
        );
        mesh.position.x = -span / 2 + step * (i + 0.5);
        mesh.scale.y = 0.001;
        scene.add(mesh);
        return { mesh, target: Math.max(0.08, (r.value / max) * 2.0), order: i };
      });

      return (t) => {
        bars.forEach(({ mesh, target, order }) => {
          const p = reduced ? 1 : Math.max(0, Math.min(1, (t - order * 0.055) / 0.8));
          const eased = 1 - Math.pow(1 - p, 3);
          const h = target * eased;
          mesh.scale.y = Math.max(0.001, h);
          mesh.position.y = h / 2;
        });
        if (!reduced) scene.rotation.y = Math.sin(t * 0.22) * 0.2;
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
/* RiskShell3D — a wireframe sphere whose density reads as exposure    */
/* ------------------------------------------------------------------ */
export function RiskShell3D({ score = 0, height = 220, label = "composite risk" }) {
  const colour = score >= 65 ? C.red : score >= 40 ? C.amber : C.green;

  const { mountRef } = useThreeScene(
    ({ scene, camera, THREE, track, reduced }) => {
      camera.position.set(0, 0, 3.4);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 1.3);
      key.position.set(2, 3, 4);
      scene.add(key);

      const core = new THREE.Mesh(
        track(new THREE.IcosahedronGeometry(0.72, 3)),
        track(
          new THREE.MeshStandardMaterial({
            color: colour,
            emissive: colour,
            emissiveIntensity: 0.35,
            roughness: 0.35,
            metalness: 0.4,
          })
        )
      );
      scene.add(core);

      // Shell detail rises with the score: a calm site looks sparse, an
      // exposed one looks agitated.
      const detail = score >= 65 ? 3 : score >= 40 ? 2 : 1;
      const shell = new THREE.Mesh(
        track(new THREE.IcosahedronGeometry(1.18, detail)),
        track(new THREE.MeshBasicMaterial({ color: colour, wireframe: true, transparent: true, opacity: 0.4 }))
      );
      scene.add(shell);

      return (t) => {
        if (reduced) return;
        core.rotation.y = t * 0.25;
        core.rotation.x = Math.sin(t * 0.4) * 0.15;
        shell.rotation.y = -t * 0.18;
        shell.rotation.z = t * 0.08;
        const pulse = 1 + Math.sin(t * 1.4) * (score / 100) * 0.045;
        shell.scale.setScalar(pulse);
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
/* HeroField3D — the landing page's ambient scene                      */
/* ------------------------------------------------------------------ */
export function HeroField3D({ height = 300, points = [] }) {
  const { mountRef } = useThreeScene(
    ({ scene, camera, THREE, track, reduced }) => {
      camera.position.set(0, 1.5, 4.4);
      camera.lookAt(0, 0.2, 0);

      scene.add(new THREE.HemisphereLight(0x9fd6ea, 0x081720, 0.9));
      const key = new THREE.DirectionalLight(0xfff1d6, 1.6);
      key.position.set(2, 4, 3);
      scene.add(key);

      // A ground lattice standing in for the planning grid.
      const grid = new THREE.GridHelper(9, 30, 0x2dd4bf, 0x14313f);
      grid.material.transparent = true;
      grid.material.opacity = 0.28;
      scene.add(grid);

      // Columns rise where sites are; heights come from real scores when
      // supplied, so even the ambient scene is showing something true.
      const values = points.length ? points : Array.from({ length: 26 }, () => 55 + Math.random() * 40);
      const group = new THREE.Group();
      const geo = track(new THREE.BoxGeometry(0.13, 1, 0.13));
      const bars = values.slice(0, 34).map((v, i) => {
        const colour = new THREE.Color(toneForScore(v));
        const mesh = new THREE.Mesh(
          geo,
          track(
            new THREE.MeshStandardMaterial({
              color: colour,
              emissive: colour,
              emissiveIntensity: 0.35,
              roughness: 0.3,
              metalness: 0.5,
            })
          )
        );
        const angle = (i / 34) * Math.PI * 2;
        const radius = 1.1 + (i % 5) * 0.42;
        mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        mesh.scale.y = 0.001;
        group.add(mesh);
        return { mesh, target: 0.25 + ((v - 45) / 55) * 1.5, order: i };
      });
      scene.add(group);

      return (t) => {
        bars.forEach(({ mesh, target, order }) => {
          const p = reduced ? 1 : Math.max(0, Math.min(1, (t - order * 0.03) / 1.1));
          const eased = 1 - Math.pow(1 - p, 3);
          const bob = reduced ? 0 : Math.sin(t * 0.9 + order * 0.4) * 0.05;
          const h = Math.max(0.02, target * eased + bob);
          mesh.scale.y = h;
          mesh.position.y = h / 2;
        });
        if (!reduced) group.rotation.y = t * 0.09;
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
/* Engine3D — the Copilot's "thinking" core                            */
/* ------------------------------------------------------------------ */
export function Engine3D({ height = 190, active = false }) {
  const { mountRef } = useThreeScene(
    ({ scene, camera, THREE, track, reduced }) => {
      camera.position.set(0, 0.3, 3.6);
      camera.lookAt(0, 0, 0);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x102030, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 1.4);
      key.position.set(2, 3, 4);
      scene.add(key);

      const core = new THREE.Mesh(
        track(new THREE.TorusKnotGeometry(0.62, 0.17, 160, 22)),
        track(
          new THREE.MeshStandardMaterial({
            color: C.teal,
            emissive: C.teal,
            emissiveIntensity: 0.32,
            roughness: 0.24,
            metalness: 0.72,
          })
        )
      );
      scene.add(core);

      // Satellites stand for the engines the Copilot routes questions to.
      const ringGeo = track(new THREE.SphereGeometry(0.055, 12, 12));
      const ringMat = track(new THREE.MeshStandardMaterial({ color: C.lime, emissive: C.lime, emissiveIntensity: 0.5 }));
      const orbiters = Array.from({ length: 6 }, (_, i) => {
        const m = new THREE.Mesh(ringGeo, ringMat);
        scene.add(m);
        return { m, phase: (i / 6) * Math.PI * 2, tilt: (i % 3) * 0.5 };
      });

      return (t) => {
        const rate = reduced ? 0 : active ? 1.6 : 0.45;
        core.rotation.x = t * rate * 0.5;
        core.rotation.y = t * rate;
        orbiters.forEach(({ m, phase, tilt }) => {
          const a = t * rate * 0.8 + phase;
          m.position.set(Math.cos(a) * 1.25, Math.sin(a * 0.7 + tilt) * 0.5, Math.sin(a) * 1.25);
        });
      };
    },
    [active],
    { height }
  );

  return (
    <div style={{ height }}>
      <div ref={mountRef} className="h-full w-full" />
    </div>
  );
}
