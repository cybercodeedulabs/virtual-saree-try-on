import { useGLTF, useTexture, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Suspense, useEffect, useRef } from "react";
import { Html } from "@react-three/drei";

const Model = ({ texturePath }) => {
  const { scene, materials } = useGLTF("/models/sareeanimation_glb.glb");
  const texture = useTexture(texturePath);
  const ref = useRef();

  // Apply the texture to ANY material that exists
  useEffect(() => {
    if (!materials) return;

    Object.values(materials).forEach((mat) => {
      if (mat.map !== undefined) {
        mat.map = texture;
        mat.map.encoding = THREE.sRGBEncoding;
        mat.needsUpdate = true;
      }
    });
  }, [texture, materials]);

  // Auto-center + scale
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    const size = box.getSize(new THREE.Vector3());

    // center the model
    box.getCenter(center);
    scene.position.sub(center);

    // scale to height 2 meters
    const targetHeight = 2;
    const scaleFactor = targetHeight / size.y;
    scene.scale.setScalar(scaleFactor);

    // rotate to face forward
    scene.rotation.set(0, Math.PI, 0);

    // lift slightly
    scene.position.y = -0.3;

  }, [scene]);

  return <primitive ref={ref} object={scene} />;
};

const ModelViewer = ({ texturePath, autoRotate }) => (
  <div className="w-full aspect-[3/2] rounded-2xl shadow-2xl p-4 bg-white/30 backdrop-blur">
    <Canvas camera={{ position: [0, 2, 6], fov: 35 }}>
      <ambientLight intensity={1.2} />
      <directionalLight position={[3, 5, 2]} intensity={1.5} />

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
        autoRotate={autoRotate}
        enablePan={false}
        minDistance={3}
        maxDistance={10}
      />
    </Canvas>
  </div>
);

export default ModelViewer;
