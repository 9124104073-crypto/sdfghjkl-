import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import GEO from "../data/chennai-geo.json";
import { C, toneForScore } from "../theme";
import { usePrefersReducedMotion } from "./motion";

/**
 * Chennai suitability landscape.
 *
 * The ground is real OpenStreetMap geometry for the Chennai bbox — coastline,
 * rivers, water bodies and the road network, fetched via Overpass and
 * simplified to about 45 m — projected in spherical Web Mercator, the same
 * projection a slippy map uses.
 *
 * Each locality raises a tower whose height is the decision engine's score and
 * whose colour is its recommendation tier. The 3D carries data: a tall green
 * tower is a site the engine rates highly, standing where it actually is.
 */

const BB = GEO.bbox;
const RAD = Math.PI / 180;

/**
 * Both axes must share units or the scene stretches: Mercator y is
 * ln(tan(π/4 + φ/2)) with φ in radians, so x is longitude in radians too.
 */
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
const X0 = BB.w * RAD;
const X1 = BB.e * RAD;
const Y0 = mercY(BB.n);
const Y1 = mercY(BB.s);
const ASPECT = (X1 - X0) / Math.abs(Y1 - Y0);

function project(lat, lon) {
  const nx = (lon * RAD - X0) / (X1 - X0);
  const ny = (mercY(lat) - Y0) / (Y1 - Y0);
  return [(nx - 0.5) * 2 * ASPECT, -(ny - 0.5) * 2];
}

/** Signed ring area — polygons must wind consistently before extruding. */
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}

export default function CityScape3D({ sites = [], height = 560, onSelect, selectedId }) {
  const mountRef = useRef(null);
  const reduced = usePrefersReducedMotion();
  const [hovered, setHovered] = useState(null);
  const [ready, setReady] = useState(false);
  const [spin, setSpin] = useState(true);
  const spinRef = useRef(true);
  const selRef = useRef(selectedId);

  useEffect(() => {
    spinRef.current = spin;
  }, [spin]);
  useEffect(() => {
    selRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    // ---------------- renderer ----------------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x081720);
    scene.fog = new THREE.FogExp2(0x081720, 0.13);

    const camera = new THREE.PerspectiveCamera(46, 1, 0.05, 60);

    // ---------------- lighting ----------------
    // A hemisphere light gives the ambient a direction, so surfaces read as
    // lit from the sky rather than uniformly flat.
    scene.add(new THREE.HemisphereLight(0x9fd6ea, 0x08161e, 0.7));

    const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sun.position.set(1.8, 2.8, 1.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 9;
    sun.shadow.camera.left = -2.4;
    sun.shadow.camera.right = 2.4;
    sun.shadow.camera.top = 2.4;
    sun.shadow.camera.bottom = -2.4;
    sun.shadow.bias = -0.0015;
    sun.shadow.radius = 3;
    scene.add(sun);

    const bounce = new THREE.DirectionalLight(0x3f7f9f, 0.45);
    bounce.position.set(-2.2, 0.9, -1.8);
    scene.add(bounce);

    const world = new THREE.Group();
    scene.add(world);

    const disposables = [];
    const track = (o) => {
      disposables.push(o);
      return o;
    };

    // ---------------- terrain slab ----------------
    const W = 2 * ASPECT + 0.3;
    const H = 2 + 0.3;

    const slab = new THREE.Mesh(
      track(new THREE.BoxGeometry(W, 0.14, H)),
      track(new THREE.MeshStandardMaterial({ color: 0x14313f, roughness: 0.94, metalness: 0.05 }))
    );
    slab.position.y = -0.07;
    slab.receiveShadow = true;
    world.add(slab);

    const grid = new THREE.GridHelper(Math.max(W, H), 24, 0x1d4152, 0x14303d);
    grid.position.y = 0.002;
    grid.material.transparent = true;
    grid.material.opacity = 0.45;
    world.add(grid);

    // ---------------- water ----------------
    // Extruded and given a glassy material, so lakes and the Pallikaranai
    // marsh read as water rather than as paint on the ground.
    const waterMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0x1b6ea0,
        roughness: 0.09,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        transparent: true,
        opacity: 0.9,
      })
    );

    GEO.water.slice(0, 200).forEach((poly) => {
      if (poly.length < 4) return;
      const pts = poly.map(([lon, lat]) => {
        const [x, z] = project(lat, lon);
        return new THREE.Vector2(x, z);
      });
      const shape = new THREE.Shape(ringArea(poly) < 0 ? pts.reverse() : pts);
      const geo = track(
        new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, curveSegments: 1 })
      );
      const mesh = new THREE.Mesh(geo, waterMat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = 0.015;
      mesh.receiveShadow = true;
      world.add(mesh);
    });

    // ---------------- linework ----------------
    const addLine = (coords, colour, opacity, y) => {
      if (coords.length < 2) return;
      const pts = coords.map(([lon, lat]) => {
        const [x, z] = project(lat, lon);
        return new THREE.Vector3(x, y, z);
      });
      const geo = track(new THREE.BufferGeometry().setFromPoints(pts));
      const mat = track(new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity }));
      world.add(new THREE.Line(geo, mat));
    };

    GEO.rivers.forEach((l) => addLine(l, 0x4bb6e8, 0.55, 0.021));
    GEO.coast.forEach((l) => addLine(l, 0x8ad4f0, 0.85, 0.023));
    GEO.primary.slice(0, 480).forEach((l) => addLine(l, 0x2f5163, 0.45, 0.018));
    GEO.major.forEach((l) => addLine(l, 0xd8b878, 0.72, 0.025));

    // ---------------- towers ----------------
    const towers = new THREE.Group();
    world.add(towers);

    // Tapered shaft with a glowing cap reads as built form, not a peg.
    const towerGeo = track(new THREE.CylinderGeometry(0.0075, 0.0135, 1, 16));
    const capGeo = track(new THREE.SphereGeometry(0.0115, 14, 10));
    const haloGeo = track(new THREE.RingGeometry(0.021, 0.031, 24));
    const towerMeshes = [];

    sites.forEach((s, i) => {
      const lat = s.latitude ?? s.lat;
      const lon = s.longitude ?? s.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const [x, z] = project(lat, lon);
      const score = s.score ?? s.dataset?.ai_score ?? 60;
      const target = Math.max(0.06, ((score - 45) / 55) * 0.62);
      const colour = new THREE.Color(toneForScore(score));

      const mesh = new THREE.Mesh(
        towerGeo,
        track(
          new THREE.MeshStandardMaterial({
            color: colour,
            emissive: colour,
            emissiveIntensity: 0.28,
            roughness: 0.3,
            metalness: 0.45,
          })
        )
      );
      mesh.position.set(x, 0, z);
      mesh.scale.y = 0.001;
      mesh.castShadow = true;
      mesh.userData = { site: s, target, order: i };
      towers.add(mesh);

      const cap = new THREE.Mesh(
        capGeo,
        track(new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.95 }))
      );
      cap.position.set(x, 0, z);
      world.add(cap);

      const halo = new THREE.Mesh(
        haloGeo,
        track(
          new THREE.MeshBasicMaterial({
            color: colour,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
          })
        )
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.set(x, 0.027, z);
      world.add(halo);

      towerMeshes.push({ mesh, cap, target, order: i });
    });

    // ---------------- camera ----------------
    const orbit = { theta: -0.5, phi: 0.86, radius: 2.5 };
    const applyCamera = () => {
      camera.position.set(
        orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
        orbit.radius * Math.cos(orbit.phi),
        orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)
      );
      camera.lookAt(0, 0.08, 0);
    };
    applyCamera();

    // ---------------- interaction ----------------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    let moved = false;
    let last = { x: 0, y: 0 };
    const el = renderer.domElement;
    el.style.cursor = "grab";

    const pick = () => {
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(towers.children, false)[0];
    };

    const onDown = (e) => {
      dragging = true;
      moved = false;
      spinRef.current = false;
      setSpin(false);
      last = { x: e.clientX, y: e.clientY };
      el.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (dragging) {
        moved = true;
        orbit.theta -= (e.clientX - last.x) * 0.006;
        orbit.phi = Math.min(1.44, Math.max(0.22, orbit.phi - (e.clientY - last.y) * 0.005));
        last = { x: e.clientX, y: e.clientY };
        applyCamera();
        return;
      }
      const hit = pick();
      const site = hit?.object.userData.site || null;
      setHovered(site ? { site, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
      el.style.cursor = site ? "pointer" : "grab";
    };
    const onUp = () => {
      dragging = false;
      el.style.cursor = "grab";
    };
    const onClick = () => {
      if (moved) return; // a drag is not a selection
      const hit = pick();
      if (hit && onSelect) onSelect(hit.object.userData.site);
    };
    const onWheel = (e) => {
      e.preventDefault();
      orbit.radius = Math.min(5, Math.max(1.1, orbit.radius + e.deltaY * 0.002));
      applyCamera();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", () => setHovered(null));
    el.addEventListener("click", onClick);
    el.addEventListener("wheel", onWheel, { passive: false });

    const resize = () => {
      const w = mount.clientWidth || 640;
      const h = mount.clientHeight || height;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    // ---------------- loop ----------------
    let raf = 0;
    const t0 = performance.now();
    const loop = (now) => {
      const elapsed = (now - t0) / 1000;

      towerMeshes.forEach(({ mesh, cap, target, order }) => {
        const p = Math.max(0, Math.min(1, (elapsed - order * 0.018) / 0.9));
        const eased = 1 - Math.pow(1 - p, 3);
        const h = target * eased;
        mesh.scale.y = Math.max(0.001, h);
        mesh.position.y = h / 2;
        cap.position.y = h;

        const sel = selRef.current != null && mesh.userData.site?.id === selRef.current;
        mesh.material.emissiveIntensity = sel
          ? 0.95
          : 0.26 + Math.sin(elapsed * 1.5 + order) * 0.05;
        cap.material.opacity = sel ? 1 : 0.9;
      });

      if (spinRef.current && !reduced) {
        orbit.theta += 0.0013;
        applyCamera();
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    setReady(true);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("click", onClick);
      el.removeEventListener("wheel", onWheel);
      disposables.forEach((d) => d.dispose?.());
      renderer.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, height, reduced]);

  return (
    <div className="relative overflow-hidden rounded-xl" style={{ height, background: "#081720" }}>
      <div ref={mountRef} className="h-full w-full" />

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg px-3 py-2 text-[11px] shadow-xl"
          style={{
            left: Math.min(hovered.x + 14, 300),
            top: hovered.y + 14,
            background: "rgba(255,255,255,0.97)",
            color: C.navy,
          }}
        >
          <div className="font-semibold">{hovered.site.site_name || hovered.site.name}</div>
          {hovered.site.score != null && (
            <div style={{ color: C.slateSoft }}>
              {Number(hovered.site.score).toFixed(1)} / 100
              {hovered.site.recommendation ? ` · ${hovered.site.recommendation}` : ""}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setSpin((v) => !v)}
        className="absolute right-3 top-3 z-10 rounded-md px-2.5 py-1.5 text-[11px] font-medium backdrop-blur"
        style={{ background: "rgba(255,255,255,0.14)", color: "#fff" }}
      >
        {spin ? "Pause orbit" : "Resume orbit"}
      </button>

      <div
        className="pointer-events-none absolute bottom-2.5 left-3 rounded px-2 py-1 text-[9.5px] leading-relaxed"
        style={{ background: "rgba(8,23,32,0.72)", color: "rgba(255,255,255,0.66)" }}
      >
        Tower height = suitability score · colour = tier · © OpenStreetMap contributors
        <br />
        Drag to orbit · scroll to zoom · click a tower to select
      </div>

      {!ready && (
        <div className="absolute inset-0 grid place-items-center text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
          Building scene…
        </div>
      )}
    </div>
  );
}
