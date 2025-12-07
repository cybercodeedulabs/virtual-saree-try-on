// src/components/ModelViewer.jsx
import { useGLTF, useTexture, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Suspense, useEffect, useRef } from "react";
import { Html } from "@react-three/drei";

const Model = ({ texturePath }) => {
  const { scene } = useGLTF("/models/sareeanimation_glb.glb");
  const texture = useTexture(texturePath);
  const root = useRef(scene);

  /** 1. Fix texture settings */
  useEffect(() => {
    texture.flipY = false;
    texture.encoding = THREE.sRGBEncoding;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
  }, [texture]);

  /** 2. Apply texture to the cloth mesh */
  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        // cloth detection by geometry size
        if (child.geometry?.attributes?.position?.count > 30000) {
          child.material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.6,
            metalness: 0,
            side: THREE.DoubleSide,
          });
        } else {
          // mannequin material
          child.material = new THREE.MeshStandardMaterial({
            color: 0xf5e9df,
            roughness: 0.9,
            metalness: 0,
          });
        }
      }
    });
  }, [scene, texture]);

  /** 3. Center and normalize height */
 /** 3. Center, scale & rotate model */
useEffect(() => {
  const box = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  const size = box.getSize(new THREE.Vector3());

  // center
  box.getCenter(center);
  scene.position.sub(center);

  // normalize height
  const targetHeight = 1.6;
  const scaleFactor = targetHeight / size.y;
  scene.scale.setScalar(scaleFactor);

  // FIX: rotate in correct facing direction (your GLB faces sideways)
  scene.rotation.set(0, Math.PI, 0);

  // Raise model slightly so it’s not under the camera
  scene.position.y -= size.y * scaleFactor * 0.15;

}, [scene]);

return <primitive object={scene} position={[0, -0.4, 0]} />;

};

const ModelViewer = ({ texturePath, autoRotate }) => (
  <div className="w-full aspect-[3/2] rounded-2xl shadow-2xl p-4 bg-white/30 backdrop-blur">
    <Canvas camera={{ position: [0, 1.5, 3.5], fov: 45 }}>
      {/* Better lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 5, 2]} intensity={1.0} />
      <hemisphereLight intensity={0.3} groundColor={"#222"} />

      <Suspense
        fallback={
          <Html center>
            <div className="text-xl text-gray-700 animate-pulse">
              Loading Saree...
            </div>
          </Html>
        }
      >
        <Model texturePath={texturePath} />
      </Suspense>

      <OrbitControls
        target={[0, 1, 0]}
        minDistance={1.2}
        maxDistance={6}
        enableZoom
        enablePan={false}
        autoRotate={autoRotate}
      />
    </Canvas>
  </div>
);

export default ModelViewer;
