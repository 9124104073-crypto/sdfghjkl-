import * as THREE from "three";
import { useThreeScene } from "./three/useThreeScene";
import { toneForScore } from "../theme";

/** A compact, data-tinted street-context preview for a selected map location. */
export default function SitePreview3D({ score = 0, height = 190 }) {
  const colour = toneForScore(score);
  const { mountRef } = useThreeScene(
    ({ scene, camera, THREE: T, track, reduced }) => {
      camera.position.set(4.4, 3.1, 5.3);
      camera.lookAt(0, 0.7, 0);
      scene.background = new T.Color(0xf6f8f5);
      scene.add(new T.HemisphereLight(0xffffff, 0xcbd5e1, 1.7));
      const sun = new T.DirectionalLight(0xffffff, 1.6);
      sun.position.set(3, 6, 4);
      scene.add(sun);

      const ground = new T.Mesh(track(new T.PlaneGeometry(9, 7)), track(new T.MeshStandardMaterial({ color: 0xdce8df, roughness: 1 })));
      ground.rotation.x = -Math.PI / 2;
      scene.add(ground);
      const road = new T.Mesh(track(new T.PlaneGeometry(1.5, 7)), track(new T.MeshStandardMaterial({ color: 0x8c9aa2, roughness: 0.95 })));
      road.rotation.x = -Math.PI / 2;
      road.position.y = 0.012;
      scene.add(road);

      [-2.4, -1.45, 1.45, 2.35].forEach((x, index) => {
        const h = 0.65 + (index % 2) * 0.32;
        const building = new T.Mesh(track(new T.BoxGeometry(0.7, h, 0.78)), track(new T.MeshStandardMaterial({ color: index % 2 ? 0xe7ece9 : 0xd6e0da, roughness: 0.82 })));
        building.position.set(x, h / 2, index < 2 ? -0.8 : 0.75);
        scene.add(building);
      });

      const site = new T.Mesh(track(new T.CylinderGeometry(0.52, 0.62, 0.18, 32)), track(new T.MeshStandardMaterial({ color: colour, roughness: 0.52, metalness: 0.06 })));
      site.position.set(0, 0.09, 0);
      scene.add(site);
      const beacon = new T.Mesh(track(new T.CylinderGeometry(0.06, 0.06, 0.78, 16)), track(new T.MeshStandardMaterial({ color: 0xffffff, emissive: colour, emissiveIntensity: 0.18, roughness: 0.4 })));
      beacon.position.set(0, 0.57, 0);
      scene.add(beacon);
      const cap = new T.Mesh(track(new T.SphereGeometry(0.12, 20, 20)), beacon.material);
      cap.position.set(0, 1.0, 0);
      scene.add(cap);

      return (time) => {
        if (!reduced) {
          scene.rotation.y = Math.sin(time * 0.28) * 0.07;
          cap.position.y = 1 + Math.sin(time * 1.4) * 0.035;
        }
      };
    },
    [colour],
    { height, shadows: false, background: 0xf6f8f5, envIntensity: 0.45 }
  );

  return <div ref={mountRef} className="overflow-hidden rounded-md" style={{ height }} aria-label="Selected location street context preview" />;
}
