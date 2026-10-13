// Acceptance-test support. Active only with ?qa=1 in the URL; renders nothing otherwise.
import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

export const QA = new URLSearchParams(window.location.search).has('qa');

/** Inside the <Canvas>: exposes renderer state to tests and measures frame times. */
export function QAProbe() {
  const { gl, scene, camera } = useThree();
  const controls = useThree((s) => s.controls);
  const frames = useRef({ last: performance.now(), worst: 0, times: [] });

  useEffect(() => {
    window.__qa = Object.assign(window.__qa ?? {}, { gl, scene, camera, controls });
  }, [gl, scene, camera, controls]);

  useFrame(() => {
    const f = frames.current, now = performance.now(), dt = now - f.last;
    f.last = now;
    f.times.push(dt);
    if (f.times.length > 120) f.times.shift();
    f.worst = Math.max(f.worst, dt);
    const materials = new Set();
    scene.traverse((o) => o.material && materials.add(o.material));
    window.__qaStats = {
      fps: Math.round(1000 / (f.times.reduce((a, b) => a + b, 0) / f.times.length)),
      worstFrameMs: Math.round(f.worst),
      textures: gl.info.memory.textures,
      geometries: gl.info.memory.geometries,
      programs: gl.info.programs?.length ?? 0,
      materials: materials.size,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      dpr: gl.getPixelRatio(),
      size: `${gl.domElement.width}x${gl.domElement.height}`,
    };
  });
  return null;
}

/** DOM overlay so staff can read the numbers on the real showroom screen. */
export function QAOverlay() {
  const [s, setS] = useState(null);
  useEffect(() => {
    const t = setInterval(() => setS({ ...window.__qaStats }), 500);
    return () => clearInterval(t);
  }, []);
  if (!s) return null;
  return (
    <pre className="qa-overlay">
      {`fps ${s.fps}  worst frame ${s.worstFrameMs} ms
textures ${s.textures}  geometries ${s.geometries}
programs ${s.programs}  materials ${s.materials}
draw calls ${s.drawCalls}  tris ${s.triangles}
canvas ${s.size} @ dpr ${s.dpr}`}
    </pre>
  );
}
