import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { usePrefersReducedMotion } from "../motion";

/**
 * Shared Three.js lifecycle.
 *
 * Every 3D widget needs the same things: a sized renderer, a scene, a camera,
 * a frame loop, and disposal that actually frees GPU memory. Doing that once
 * here keeps each widget to just its own geometry, and means a leak fixed
 * here is fixed everywhere.
 *
 * Realism comes from two things most WebGL widgets skip. First, an image-based
 * environment: metal and clearcoat have nothing to reflect under lights alone,
 * so a PMREM-filtered room is generated once and shared by every scene on the
 * page — building it per widget would cost a render target each. Second, soft
 * shadows and ACES tone mapping, so bright emissive surfaces roll off instead
 * of clipping to flat white.
 *
 * `build` receives { scene, camera, THREE, track, renderer, reduced } and
 * returns an optional per-frame callback.
 */

// One PMREM environment for the whole app, built lazily on first use.
let sharedEnv = null;
let sharedEnvRenderer = null;
function getEnvironment(renderer) {
  if (sharedEnv) return sharedEnv;
  const pmrem = new THREE.PMREMGenerator(renderer);
  sharedEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  sharedEnvRenderer = renderer;
  pmrem.dispose();
  return sharedEnv;
}

export function useThreeScene(
  build,
  deps = [],
  { height = 220, fov = 45, background = null, shadows = true, envIntensity = 0.9 } = {}
) {
  const mountRef = useRef(null);
  const reduced = usePrefersReducedMotion();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: background === null,
      powerPreference: "high-performance",
    });
    // Cap at 2: beyond that the extra pixels are invisible and the fill cost
    // is real on the small canvases these widgets use.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    if (shadows) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    if (background !== null) scene.background = new THREE.Color(background);
    scene.environment = getEnvironment(renderer);
    scene.environmentIntensity = envIntensity;

    const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
    camera.position.set(0, 0, 4);

    // Anything registered here is disposed on unmount — geometries and
    // materials are not garbage collected on their own.
    const disposables = [];
    const track = (o) => {
      disposables.push(o);
      return o;
    };

    const onFrame = build({ scene, camera, THREE, track, renderer, reduced }) || (() => {});

    const resize = () => {
      const w = mount.clientWidth || 320;
      const h = mount.clientHeight || height;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    // Off-screen widgets keep their state but stop consuming GPU time — a page
    // with eight scenes should not be rendering the six you cannot see.
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(mount);

    let raf = 0;
    // Origin taken from the first frame's timestamp: the rAF clock is not
    // guaranteed to match performance.now(), and a mismatch makes elapsed
    // time negative, freezing every animation at zero.
    let t0 = null;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (t0 === null) t0 = now;
      if (!visible) return;
      onFrame(Math.max(0, (now - t0) / 1000), now);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    setReady(true);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      disposables.forEach((d) => d.dispose?.());
      // The shared environment outlives individual widgets; only drop it if
      // the renderer that produced it is the one going away.
      if (sharedEnvRenderer === renderer) {
        sharedEnv?.dispose();
        sharedEnv = null;
        sharedEnvRenderer = null;
      }
      renderer.dispose();
      const el = renderer.domElement;
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { mountRef, ready, reduced };
}

/** Critically-damped-feeling ease used across the widgets. */
export const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));

/** A slight overshoot, which reads as physical rather than mechanical. */
export function easeOutBack(p) {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
}
