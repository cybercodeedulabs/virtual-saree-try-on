import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { CameraControls, ContactShadows, Environment, Lightformer, useProgress, Html } from '@react-three/drei';
import CameraControlsImpl from 'camera-controls';
import * as THREE from 'three';
import Mannequin from './Mannequin';
import { VIEWS } from './views';
import { QA, QAProbe } from './QAProbe';


function Controls({ view, viewNonce, autoRotate, onUserInteract }) {
  const ref = useRef();
  const dragging = useRef(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.mouseButtons.right = CameraControlsImpl.ACTION.NONE;    // no panning off the mannequin
    c.mouseButtons.middle = CameraControlsImpl.ACTION.DOLLY;
    c.mouseButtons.wheel = CameraControlsImpl.ACTION.DOLLY;
    c.touches.two = CameraControlsImpl.ACTION.TOUCH_DOLLY;
    c.touches.three = CameraControlsImpl.ACTION.NONE;
    c.minDistance = 0.8;
    c.maxDistance = 5.5;
    c.minPolarAngle = Math.PI * 0.3;   // never look from too high
    c.maxPolarAngle = Math.PI * 0.56;  // never go under the floor
    c.smoothTime = 0.35;
    c.draggingSmoothTime = 0.12;
    c.dollySpeed = 0.6;
    const v = VIEWS.front;
    c.setLookAt(...v.pos, ...v.target, false);
  }, []);

  // view buttons
  useEffect(() => {
    const v = VIEWS[view];
    if (v && ref.current) ref.current.setLookAt(...v.pos, ...v.target, true);
  }, [view, viewNonce]);

  useFrame((_, dt) => {
    if (autoRotate && !dragging.current && ref.current) {
      ref.current.azimuthAngle += Math.min(dt, 0.05) * 0.32;
    }
  });

  return (
    <CameraControls
      ref={ref}
      makeDefault
      onStart={() => { dragging.current = true; onUserInteract?.(); }}
      onEnd={() => { dragging.current = false; }}
    />
  );
}

function Plinth() {
  return (
    <group>
      <mesh position={[0, -0.03, 0]} receiveShadow>
        <cylinderGeometry args={[0.46, 0.48, 0.06, 96]} />
        <meshStandardMaterial color="#2a1d2c" roughness={0.55} metalness={0.1} />
      </mesh>
      {/* thin zari rim */}
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.438, 0.448, 128]} />
        <meshStandardMaterial color="#cfa957" roughness={0.35} metalness={0.8} />
      </mesh>
    </group>
  );
}

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="loader" role="status">
        <span className="loader-bar"><span style={{ width: `${Math.round(progress)}%` }} /></span>
        <span>Preparing the mannequin</span>
      </div>
    </Html>
  );
}

export default function ModelViewer({ item, view, viewNonce, autoRotate, onUserInteract, onDraping, onError }) {
  return (
    <Canvas
      className="stage-canvas"
      shadows
      dpr={[1, 2]}
      camera={{ fov: 30, near: 0.05, far: 40, position: VIEWS.front.pos }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05, powerPreference: 'high-performance' }}
      onPointerDown={onUserInteract}
    >
      <color attach="background" args={['#1d1320']} />
      <fog attach="fog" args={['#1d1320', 5.5, 11]} />

      {/* Studio lighting built locally: no HDR download, works offline */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[-2.5, 2.5, 3]} scale={[3, 4, 1]} target={[0, 1, 0]} />
        <Lightformer form="rect" intensity={1.1} position={[3, 1.5, 2]} scale={[2, 3, 1]} target={[0, 1, 0]} />
        <Lightformer form="rect" intensity={1.4} position={[0, 2.5, -3.5]} scale={[4, 2, 1]} target={[0, 1, 0]} />
        <Lightformer form="circle" intensity={0.6} position={[0, 5, 0]} scale={3} target={[0, 0, 0]} />
      </Environment>
      <ambientLight intensity={0.15} />
      {/* back fill: keeps the pallu and back drape readable on dark sarees (no shadows, cheap) */}
      <directionalLight position={[-1.2, 2.4, -3.2]} intensity={1.6} />
      <spotLight
        position={[1.6, 4.2, 2.6]}
        angle={0.42}
        penumbra={0.7}
        intensity={38}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />

      <Suspense fallback={<Loader />}>
        <Mannequin item={item} onDraping={onDraping} onError={onError} />
        <ContactShadows position={[0, 0.002, 0]} scale={1.6} blur={2.4} opacity={0.55} far={1.2} frames={1} resolution={512} />
      </Suspense>
      <Plinth />

      <Controls view={view} viewNonce={viewNonce} autoRotate={autoRotate} onUserInteract={onUserInteract} />
      {QA && <QAProbe />}
    </Canvas>
  );
}
