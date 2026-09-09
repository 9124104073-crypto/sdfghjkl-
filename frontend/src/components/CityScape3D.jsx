import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import GEO from "../data/chennai-geo.json";
import { C, toneForScore } from "../theme";
import { usePrefersReducedMotion } from "./motion";

/**
 * Chennai suitability landscape.
 *
 * The ground is real OpenStreetMap geometry for the Chennai bbox — coastline,
 * rivers, water bodies and the road network — projected in spherical Web
 * Mercator, the same projection a slippy map uses. Each locality raises a
 * tower whose height is the decision engine's score for it and whose colour
 * is its recommendation tier.
 *
 * So the 3D is carrying data, not decorating: a tall green tower is a site
 * the engine rates highly, and its position on the ground is where it
 * actually is.
 */

const BB = GEO.bbox;

/**
 * Spherical Mercator, normalised into a centred plane.
 *
 * Both axes must be in the same units or the scene comes out stretched:
 * Mercator y is `ln(tan(π/4 + φ/2))` with φ in radians, so x has to be
 * longitude in radians too — not degrees.
 */
const RAD = Math.PI / 180;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));

function project(lat, lon) {
  const x0 = BB.w * RAD;
  const x1 = BB.e * RAD;
  const y0 = mercY(BB.n);
  const y1 = mercY(BB.s);
  const nx = (lon * RAD - x0) / (x1 - x0);
  const ny = (mercY(lat) - y0) / (y1 - y0);
  // Width relative to height, so the city keeps its true proportions.
  const aspect = (x1 - x0) / Math.abs(y1 - y0);
  return [(nx - 0.5) * 2 * aspect, -(ny - 0.5) * 2];
}

export default function CityScape3D({ sites = [], height = 460, onSelect, selectedId }) {
  const mountRef = useRef(null);
  const stateRef = useRef({});
  const reduced = usePrefersReducedMotion();
  const [hovered, setHovered] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(C.navy);
    scene.fog = new THREE.Fog(C.navy, 3.2, 8.5);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // ---- lighting: one key, one fill, so towers read as solid ----
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 6, 2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7dd3fc, 0.45);
    rim.position.set(-4, 2, -3);
    scene.add(rim);

    const world = new THREE.Group();
    scene.add(world);

    // ---- ground ----
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.0),
      new THREE.MeshStandardMaterial({ color: 0x10293b, roughness: 0.95, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    world.add(ground);

    const lineFrom = (coords, colour, opacity, y) => {
      const pts = coords.map(([lon, lat]) => {
        const [x, z] = project(lat, lon);
        return new THREE.Vector3(x, y, z);
      });
      if (pts.length < 2) return null;
      return new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity })
      );
    };

    // Water bodies as filled shapes, so the marshland reads as an area.
    GEO.water.slice(0, 180).forEach((poly) => {
      const shape = new THREE.Shape();
      poly.forEach(([lon, lat], i) => {
        const [x, z] = project(lat, lon);
        if (i === 0) shape.moveTo(x, z);
        else shape.lineTo(x, z);
      });
      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({ color: 0x1d4e63, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.004;
      world.add(mesh);
    });

    GEO.rivers.forEach((l) => {
      const line = lineFrom(l, 0x38bdf8, 0.5, 0.008);
      if (line) world.add(line);
    });
    GEO.coast.forEach((l) => {
      const line = lineFrom(l, 0x7dd3fc, 0.75, 0.01);
      if (line) world.add(line);
    });
    GEO.primary.slice(0, 420).forEach((l) => {
      const line = lineFrom(l, 0x33506a, 0.5, 0.006);
      if (line) world.add(line);
    });
    GEO.major.forEach((l) => {
      const line = lineFrom(l, 0x8a7f5c, 0.7, 0.012);
      if (line) world.add(line);
    });

    // ---- towers: height is the score, colour is the tier ----
    const towers = new THREE.Group();
    world.add(towers);
    const towerGeo = new THREE.CylinderGeometry(0.011, 0.016, 1, 12);

    sites.forEach((s) => {
      const [x, z] = project(s.latitude, s.longitude);
      const score = s.score ?? s.dataset?.ai_score ?? 60;
      const h = Math.max(0.05, ((score - 45) / 55) * 0.68);
      const colour = new THREE.Color(toneForScore(score));
      const mesh = new THREE.Mesh(
        towerGeo,
        new THREE.MeshStandardMaterial({
          color: colour,
          emissive: colour,
          emissiveIntensity: 0.35,
          roughness: 0.35,
          metalness: 0.15,
        })
      );
      mesh.position.set(x, 0, z);
      mesh.scale.y = 0.001; // grown in the animation loop
      mesh.userData = { site: s, target: h, score };
      towers.add(mesh);

      // Glow disc at the base so a tower is findable from directly above.
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.032, 18),
        new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.25 })
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, 0.014, z);
      world.add(disc);
    });

    // ---- camera + interaction ----
    const orbit = { theta: -0.42, phi: 0.72, radius: 2.15, autoRotate: !reduced };
    const applyCamera = () => {
      camera.position.set(
        orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
        orbit.radius * Math.cos(orbit.phi),
        orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)
      );
      camera.lookAt(0, 0.12, 0);
    };
    applyCamera();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    let last = { x: 0, y: 0 };

    const onDown = (e) => {
      dragging = true;
      orbit.autoRotate = false;
      last = { x: e.clientX, y: e.clientY };
      renderer.domElement.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (dragging) {
        orbit.theta -= (e.clientX - last.x) * 0.006;
        orbit.phi = Math.min(1.45, Math.max(0.25, orbit.phi - (e.clientY - last.y) * 0.005));
        last = { x: e.clientX, y: e.clientY };
        applyCamera();
        return;
      }
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(towers.children, false)[0];
      const site = hit?.object.userData.site || null;
      setHovered(site ? { site, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
      renderer.domElement.style.cursor = site ? "pointer" : dragging ? "grabbing" : "grab";
    };
    const onUp = () => {
      dragging = false;
    };
    const onClick = () => {
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(towers.children, false)[0];
      if (hit && onSelect) onSelect(hit.object.userData.site);
    };
    const onWheel = (e) => {
      e.preventDefault();
      orbit.radius = Math.min(5, Math.max(1.2, orbit.radius + e.deltaY * 0.002));
      applyCamera();
    };

    const el = renderer.domElement;
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", () => setHovered(null));
    el.addEventListener("click", onClick);
    el.addEventListener("wheel", onWheel, { passive: false });

    // ---- sizing ----
    const resize = () => {
      const w = mount.clientWidth || 600;
      const h = mount.clientHeight || height;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    // ---- loop ----
    let raf = 0;
    let t0 = performance.now();
    const loop = (now) => {
      const elapsed = (now - t0) / 1000;
      towers.children.forEach((m, i) => {
        const delay = i * 0.022;
        const p = Math.max(0, Math.min(1, (elapsed - delay) / 0.85));
        const eased = 1 - Math.pow(1 - p, 3);
        const target = m.userData.target;
        m.scale.y = Math.max(0.001, target * eased);
        m.position.y = (target * eased) / 2;
        const isSel = selectedId != null && m.userData.site?.id === selectedId;
        m.material.emissiveIntensity = isSel ? 0.9 : 0.35;
      });
      if (orbit.autoRotate) {
        orbit.theta += 0.0016;
        applyCamera();
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    setReady(true);

    stateRef.current = { orbit, applyCamera };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("click", onClick);
      el.removeEventListener("wheel", onWheel);
      renderer.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    // Rebuild only when the plotted set changes, not on every hover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, height, reduced]);

  return (
    <div className="relative overflow-hidden rounded-xl" style={{ height, background: C.navy }}>
      <div ref={mountRef} className="h-full w-full" />

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 rounded-md px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{
            left: Math.min(hovered.x + 12, 260),
            top: hovered.y + 12,
            background: "rgba(255,255,255,0.96)",
            color: C.navy,
          }}
        >
          <div className="font-semibold">{hovered.site.site_name || hovered.site.name}</div>
          {hovered.site.score != null && (
            <div style={{ color: C.slateSoft }}>
              {Number(hovered.site.score).toFixed(1)} / 100 · {hovered.site.recommendation}
            </div>
          )}
        </div>
      )}

      <div
        className="pointer-events-none absolute bottom-2.5 left-3 rounded px-2 py-1 text-[9.5px]"
        style={{ background: "rgba(11,31,51,0.6)", color: "rgba(255,255,255,0.6)" }}
      >
        Tower height = suitability score · © OpenStreetMap contributors · drag to orbit, scroll to zoom
      </div>

      {!ready && (
        <div className="absolute inset-0 grid place-items-center text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
          Building scene…
        </div>
      )}
    </div>
  );
}
