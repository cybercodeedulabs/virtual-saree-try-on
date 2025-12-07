// src/components/ModelViewer.jsx
import { useGLTF, useTexture, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense, useEffect, useRef } from 'react';
import { Html } from '@react-three/drei';


const Model = ({ texturePath }) => {
  const { scene, materials } = useGLTF('/models/sareeanimation_glb.glb');
  const texture = useTexture(texturePath);
  const ref = useRef();

  // Apply texture to saree material
  useEffect(() => {
    const sareeMaterial = Object.values(materials).find((mat) =>
      mat.name.toLowerCase().includes('saree')
    );
    if (sareeMaterial) {
      sareeMaterial.map = texture;
      sareeMaterial.map.encoding = THREE.sRGBEncoding;
      sareeMaterial.needsUpdate = true;
    }
  }, [texture, materials]);

  // Center the model
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    box.getCenter(center);
    scene.position.sub(center);
  }, [scene]);

  return (
    <primitive ref={ref} object={scene} scale={[0.01, 0.01, 0.01]} position={[0, 0, 0]} />
  );
};

const ModelViewer = ({ texturePath, autoRotate }) => (
  <div className="w-full aspect-[3/2] rounded-2xl shadow-2xl p-4 bg-white/30 backdrop-blur">
    <Canvas camera={{ position: [0, 1.5, 10] }}>
      <ambientLight intensity={2} />
      <directionalLight position={[5, 10, 7]} intensity={1} />

      <Suspense
        fallback={
          <Html center>
            <div className="text-xl text-gray-700 animate-pulse">Loading Saree...</div>
          </Html>
        }
      >
        <Model texturePath={texturePath} />
      </Suspense>

      <OrbitControls
        target={[0, 1, 0]}
        minDistance={2.5}
        maxDistance={12}
        enableZoom={true}
        enablePan={false}
        enableRotate={true}
        autoRotate={autoRotate}
      />
    </Canvas>
  </div>
);

export default ModelViewer;
