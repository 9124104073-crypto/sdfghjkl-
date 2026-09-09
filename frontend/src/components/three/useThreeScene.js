import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { usePrefersReducedMotion } from "../motion";

/**
 * Shared Three.js lifecycle.
 *
 * Every 3D widget needs the same five things: a sized renderer, a scene, a
 * camera, a frame loop, and disposal that actually frees GPU memory. Doing
 * that once here keeps each widget to just its own geometry, and means a leak
 * fixed here is fixed everywhere.
 *
 * `build` receives { scene, camera, THREE, track, reduced } and returns an
 * optional per-frame callback.
 */
export function useThreeScene(build, deps = [], { height = 220, fov = 45, background = null } = {}) {
  const mountRef = useRef(null);
  const reduced = usePrefersReducedMotion();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: background === null });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    if (background !== null) scene.background = new THREE.Color(background);

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

    let raf = 0;
    // Origin taken from the first frame's timestamp — see StreamingText: the
    // rAF clock is not guaranteed to match performance.now().
    let t0 = null;
    const loop = (now) => {
      if (t0 === null) t0 = now;
      onFrame(Math.max(0, (now - t0) / 1000), now);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    setReady(true);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      disposables.forEach((d) => d.dispose?.());
      renderer.dispose();
      const el = renderer.domElement;
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { mountRef, ready, reduced };
}
