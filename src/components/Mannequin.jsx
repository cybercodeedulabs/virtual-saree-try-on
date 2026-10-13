import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MODEL_URL } from '../config';
import { configureTextures, getSareeTexture } from '../lib/sareeTextures';

// Model facts (exported from Blender): 1.65 m tall, feet at y = 0, facing +Z.
// No runtime centring or scaling is needed.

export default function Mannequin({ item, onDraping, onError }) {
  // draco off (its decoder comes from a CDN); meshopt decoder is bundled -> works offline
  const { nodes } = useGLTF(MODEL_URL, false, true);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  const { saree, blouse, mannequin } = useMemo(() => {
    const saree = nodes.Saree, blouse = nodes.Blouse, mannequin = nodes.Mannequin;
    for (const m of [saree, blouse, mannequin]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    // Saree: silk with a soft sheen, visible from both sides
    const sm = saree.material;
    sm.side = THREE.DoubleSide;
    sm.roughness = 0.52;
    sm.sheen = 0.7;
    sm.sheenRoughness = 0.38;
    sm.sheenColor = new THREE.Color('#fff4e0').multiplyScalar(0.35);
    sm.envMapIntensity = 0.9;
    // Blouse
    const bm = blouse.material;
    bm.side = THREE.DoubleSide;
    bm.roughness = 0.5;
    bm.sheen = 0.5;
    bm.sheenRoughness = 0.4;
    bm.sheenColor = new THREE.Color('#ffffff').multiplyScalar(0.25);
    // Mannequin: matte display finish
    mannequin.material = new THREE.MeshStandardMaterial({ color: '#d9d1c6', roughness: 0.78, metalness: 0 });
    return { saree, blouse, mannequin };
  }, [nodes]);

  useEffect(() => configureTextures(gl), [gl]);

  // Swap the saree: keep the current one on the mannequin until the new one is ready.
  useEffect(() => {
    if (!item) return;
    let live = true;
    onDraping?.(true);
    getSareeTexture(item)
      .then((tex) => {
        if (!live) return;
        saree.material.map = tex;
        saree.material.color.set('#ffffff');
        saree.material.needsUpdate = true;
        blouse.material.color.set(item.blouse ?? '#3b2a3f');
        invalidate();
      })
      .catch((err) => live && onError?.(err))
      .finally(() => live && onDraping?.(false));
    return () => { live = false; };
  }, [item, saree, blouse, invalidate, onDraping, onError]);

  return (
    <group>
      <primitive object={mannequin} />
      <primitive object={blouse} />
      <primitive object={saree} />
    </group>
  );
}

useGLTF.preload(MODEL_URL, false, true);
