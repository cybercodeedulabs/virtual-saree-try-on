// src/components/ModelViewer.jsx  (REPLACE your current file)
import React, { Suspense, useEffect, useRef, useMemo } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls, Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader";

// Utility: generate a simple height -> normal map from an image using Canvas
function generateNormalMapFromImage(img) {
  // returns a THREE.Texture
  const w = img.width;
  const h = img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);

  // compute grayscale
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    const r = imgData.data[idx];
    const g = imgData.data[idx + 1];
    const b = imgData.data[idx + 2];
    gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  // Sobel-like normal approximation
  const strength = 0.6; // tweak: higher = more pronounced bumps
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const left = gray[y * w + Math.max(0, x - 1)];
      const right = gray[y * w + Math.min(w - 1, x + 1)];
      const up = gray[Math.max(0, y - 1) * w + x];
      const down = gray[Math.min(h - 1, y + 1) * w + x];

      const dx = (right - left) * strength;
      const dy = (down - up) * strength;

      // normal vector in [0..1] space
      const nx = (dx + 1) * 127;
      const ny = (dy + 1) * 127;
      const nz = 255; // keep z high

      const idx = (y * w + x) * 4;
      out.data[idx] = Math.round(nx);
      out.data[idx + 1] = Math.round(ny);
      out.data[idx + 2] = Math.round(nz);
      out.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Triplanar shader material — blends texture by world axis to avoid bad UV stretch
const TriplanarMaterial = ({ mapTexture, normalTexture, roughness = 0.6 }) => {
  // We'll create a ShaderMaterial derived from MeshStandardMaterial uniforms
  const materialRef = useRef();

  const map = mapTexture;
  const normalMap = normalTexture;

  const uniforms = useMemo(
    () => ({
      uMap: { value: map },
      uNormalMap: { value: normalMap },
      uRoughness: { value: roughness },
      uRepeat: { value: new THREE.Vector2(1, 1) },
    }),
    [map, normalMap, roughness]
  );

  useEffect(() => {
    // nothing
  }, []);

  const vertexShader = `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const fragmentShader = `
    uniform sampler2D uMap;
    uniform sampler2D uNormalMap;
    uniform float uRoughness;
    uniform vec2 uRepeat;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    // simple triplanar sampling
    vec4 sampleTriplanar(sampler2D tex, vec3 p, vec3 n) {
      vec3 absN = abs(n);
      // normalized weights
      float sum = absN.x + absN.y + absN.z;
      vec2 xy = p.yz * uRepeat;
      vec2 yz = p.zx * uRepeat;
      vec2 zx = p.xy * uRepeat;

      vec4 sx = texture2D(tex, zx);
      vec4 sy = texture2D(tex, xy);
      vec4 sz = texture2D(tex, yz);

      vec4 color = (sx * absN.z + sy * absN.x + sz * absN.y) / sum;
      return color;
    }

    void main(){
      vec3 p = vWorldPosition * 0.1; // scale down world space mapping for tiling control
      vec3 n = normalize(vNormal);
      vec4 base = sampleTriplanar(uMap, p, n);

      // For normal, do a simple blend too (approx)
      vec4 ncol = sampleTriplanar(uNormalMap, p, n);
      // convert normal map from [0..1] to [-1..1]
      vec3 normalTex = normalize((ncol.xyz * 2.0) - 1.0);
      // blend normalTex with geometry normal
      vec3 finalNormal = normalize(normalize(n) + normalTex * 0.6);

      // compute simple lighting (Lambert + rim)
      vec3 lightDir = normalize(vec3(0.5, 0.8, 0.3));
      float diff = max(dot(finalNormal, lightDir), 0.0);
      vec3 viewColor = base.rgb * (0.4 + diff * 0.8);

      // simple ambient occlusion fallback
      float ao = 0.9;
      vec3 outColor = viewColor * ao;
      gl_FragColor = vec4(outColor, base.a);
    }
  `;

  const mat = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      lights: false,
      transparent: false,
      side: THREE.DoubleSide,
    });
    return m;
  }, [uniforms]);

  // Expose materialRef if needed
  return <primitive object={mat} ref={materialRef} />;
};

// Actual model component
function DrapedModel({ modelUrl, textureUrl }) {
  const gltf = useGLTF(modelUrl, true);
  const texture = useLoader(THREE.TextureLoader, textureUrl);

  // ensure texture settings
  texture.encoding = THREE.sRGBEncoding;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);

  // create normal map from image (best-effort)
  const normalTexRef = useRef();
  useEffect(() => {
    // Create Image element and generate normal map after load
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = texture.image?.currentSrc || texture.image?.src || texture.image;
    img.onload = () => {
      try {
        normalTexRef.current = generateNormalMapFromImage(img);
      } catch (err) {
        console.warn("Normal map generator failed:", err);
      }
    };
  }, [texture]);

  // find saree mesh and apply material override with triplanar
  useEffect(() => {
    if (!gltf || !gltf.scene) return;
    // normalize model scale: set to 1 and center
    gltf.scene.scale.set(1, 1, 1);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new THREE.Vector3());
    gltf.scene.position.sub(center); // center to origin

    // loop meshes and apply materials
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        // if material name contains "saree" or "cloth", assign triplanar shader
        const name = (child.material?.name || "").toLowerCase();
        const matches = name.includes("saree") || name.includes("cloth") || name.includes("drape");
        if (matches || child.name.toLowerCase().includes("cloth") || child.name.toLowerCase().includes("saree")) {
          // create a MeshStandardMaterial fallback that uses texture if shader fails
          const fallback = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.6,
            metalness: 0.0,
            side: THREE.DoubleSide,
          });
          // assign fallback now
          child.material = fallback;

          // After normal map generated, replace with triplanar shader material
          const interval = setInterval(() => {
            if (normalTexRef.current) {
              try {
                // build triplanar shader material manually and assign
                const mat = new THREE.ShaderMaterial({
                  uniforms: {
                    uMap: { value: texture },
                    uNormalMap: { value: normalTexRef.current },
                    uRepeat: { value: new THREE.Vector2(1, 1) },
                  },
                  vertexShader: `
                    varying vec3 vWorldPosition;
                    varying vec3 vNormal;
                    void main() {
                      vNormal = normalize(normalMatrix * normal);
                      vec4 worldPos = modelMatrix * vec4(position, 1.0);
                      vWorldPosition = worldPos.xyz;
                      gl_Position = projectionMatrix * viewMatrix * worldPos;
                    }
                  `,
                  fragmentShader: `
                    uniform sampler2D uMap;
                    uniform sampler2D uNormalMap;
                    uniform vec2 uRepeat;
                    varying vec3 vWorldPosition;
                    varying vec3 vNormal;

                    vec4 sampleTriplanar(sampler2D tex, vec3 p, vec3 n) {
                      vec3 absN = abs(n);
                      float sum = absN.x + absN.y + absN.z;
                      vec2 xy = p.yz * uRepeat;
                      vec2 yz = p.zx * uRepeat;
                      vec2 zx = p.xy * uRepeat;
                      vec4 sx = texture2D(tex, zx);
                      vec4 sy = texture2D(tex, xy);
                      vec4 sz = texture2D(tex, yz);
                      vec4 color = (sx * absN.z + sy * absN.x + sz * absN.y) / sum;
                      return color;
                    }

                    void main(){
                      vec3 p = vWorldPosition * 0.1;
                      vec3 n = normalize(vNormal);
                      vec4 base = sampleTriplanar(uMap, p, n);
                      vec4 ncol = sampleTriplanar(uNormalMap, p, n);
                      vec3 normalTex = normalize((ncol.xyz * 2.0) - 1.0);
                      vec3 finalNormal = normalize(normalTex * 0.9 + n * 0.1);
                      vec3 lightDir = normalize(vec3(0.5, 0.8, 0.3));
                      float diff = max(dot(finalNormal, lightDir), 0.0);
                      vec3 viewColor = base.rgb * (0.35 + diff * 0.85);
                      gl_FragColor = vec4(viewColor, base.a);
                    }
                  `,
                  side: THREE.DoubleSide,
                });
                child.material = mat;
                clearInterval(interval);
              } catch (e) {
                console.warn(" assigning triplanar failed", e);
              }
            }
          }, 250);
        } else {
          // non-saree meshes: better default material
          child.material = new THREE.MeshStandardMaterial({
            color: child.material?.color || new THREE.Color(0xffffff),
            roughness: 0.7,
            metalness: 0.0,
          });
        }
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [gltf, texture]);

  return <primitive object={gltf.scene} />;
}

const ModelViewer = ({ texturePath = "/textures/red-saree.jpg", autoRotate = true }) => {
  const envHdr = null; // optional: put HDR env if you have one
  return (
    <div className="w-full h-[620px] rounded-2xl shadow-2xl p-4 bg-white/10 backdrop-blur">
      <Canvas shadows camera={{ position: [0, 1.3, 4.5], fov: 35 }}>
        <ambientLight intensity={0.6} />
        <hemisphereLight skyColor={"#ffffff"} groundColor={"#222222"} intensity={0.25} />
        <directionalLight position={[2.5, 5, 2]} intensity={1.0} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
        <Suspense fallback={<Html center><div className="text-xl text-gray-700 animate-pulse">Loading model...</div></Html>}>
          <DrapedModel modelUrl={"/models/sareeanimation_glb.glb"} textureUrl={texturePath} />
        </Suspense>
        <OrbitControls enablePan={false} enableZoom={true} autoRotate={autoRotate} autoRotateSpeed={0.6} />
      </Canvas>
    </div>
  );
};

export default ModelViewer;
