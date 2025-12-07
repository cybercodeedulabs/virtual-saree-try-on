// src/components/ModelViewer.jsx  -- DEBUG VERSION
import React, { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";

/**
 * Debug GLTF viewer:
 * - logs mesh names & counts
 * - shows simple material view and textured view toggle
 */

function ModelDebug({ modelUrl, textureUrl }) {
  const gltf = useGLTF(modelUrl, true);
  const [mode, setMode] = useState("plain"); // "plain" | "textured"
  const texture = textureUrl ? new THREE.TextureLoader().load(textureUrl) : null;
  if (texture) {
    texture.encoding = THREE.sRGBEncoding;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.anisotropy = 4;
  }

  useEffect(() => {
    if (!gltf || !gltf.scene) return;
    // Print scene summary
    const meshes = [];
    gltf.scene.traverse((c) => {
      if (c.isMesh) {
        meshes.push({ name: c.name || "(no-name)", vertices: c.geometry?.attributes?.position?.count || 0 });
      }
    });
    console.groupCollapsed("GLTF Debug Info");
    console.log("Model URL:", modelUrl);
    console.log("Mesh count:", meshes.length);
    meshes.forEach((m, i) => console.log(i, m.name, "vertices:", m.vertices));
    // bounding box
    const box = new THREE.Box3().setFromObject(gltf.scene);
    console.log("Bounding box:", box.min, box.max, "size:", box.getSize(new THREE.Vector3()));
    console.groupEnd();
    // center and scale normalization
    const size = box.getSize(new THREE.Vector3()).length();
    if (size > 0) {
      const scaleFactor = 2.5 / size; // bring model into reasonable scene scale
      gltf.scene.scale.setScalar(scaleFactor);
    }
    const center = box.getCenter(new THREE.Vector3());
    gltf.scene.position.sub(center);
  }, [gltf, modelUrl]);

  useEffect(() => {
    if (!gltf || !gltf.scene) return;
    // Apply materials
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Ensure normals exist
        try {
          if (!child.geometry.attributes.normal) {
            child.geometry.computeVertexNormals();
          }
        } catch (e) {
          console.warn("Failed to compute normals for", child.name, e);
        }

        if (mode === "plain") {
          child.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0xdddddd),
            roughness: 0.7,
            metalness: 0.0,
            side: THREE.DoubleSide,
          });
        } else {
          // textured view: apply texture if available, else fallback
          child.material = texture
            ? new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.6,
                metalness: 0,
                side: THREE.DoubleSide,
              })
            : new THREE.MeshStandardMaterial({
                color: new THREE.Color(0xcccccc),
                roughness: 0.7,
                metalness: 0,
                side: THREE.DoubleSide,
              });
        }
      }
    });
  }, [gltf, mode, texture]);

  return (
    <>
      <Html position={[0, 2.2, 0]} center>
        <div style={{ width: 380, textAlign: "center", padding: 8, background: "rgba(255,255,255,0.85)", borderRadius: 8 }}>
          <div style={{ marginBottom: 8 }}>
            <strong>Debug Viewer</strong>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={() => setMode("plain")} style={{ padding: "6px 10px" }}>
              Plain
            </button>
            <button onClick={() => setMode("textured")} style={{ padding: "6px 10px" }}>
              Textured
            </button>
          </div>
        </div>
      </Html>

      <primitive object={gltf.scene} />
    </>
  );
}

export default function ModelViewer({ texturePath = "/textures/red-saree.jpg", autoRotate = true }) {
  return (
    <div className="w-full h-[620px] rounded-2xl shadow-2xl p-4 bg-white/5 backdrop-blur">
      <Canvas shadows camera={{ position: [0, 1.6, 4], fov: 40 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1.0} />
        <Suspense fallback={<Html center><div>Loading model...</div></Html>}>
          <ModelDebug modelUrl={"/models/sareeanimation_glb.glb"} textureUrl={texturePath} />
        </Suspense>
        <OrbitControls enablePan={false} autoRotate={autoRotate} />
      </Canvas>
    </div>
  );
}
