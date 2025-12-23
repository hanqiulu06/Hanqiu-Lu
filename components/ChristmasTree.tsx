
import React, { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Float, Stars } from '@react-three/drei';

// Map intrinsic Three.js elements to constants to resolve JSX type errors in environments without R3F global type augmentation.
const Group = 'group' as any;
const Points = 'points' as any;
const BufferGeometry = 'bufferGeometry' as any;
const BufferAttribute = 'bufferAttribute' as any;
const PointsMaterial = 'pointsMaterial' as any;
const Mesh = 'mesh' as any;
const SphereGeometry = 'sphereGeometry' as any;
const MeshStandardMaterial = 'meshStandardMaterial' as any;
const OctahedronGeometry = 'octahedronGeometry' as any;
const PointLight = 'pointLight' as any;
const AmbientLight = 'ambientLight' as any;

interface ChristmasTreeProps {
  power: boolean;
  spread: number;
  rotation: number;
  isExploded: boolean;
}

const ChristmasTree: React.FC<ChristmasTreeProps> = ({ power, spread, rotation, isExploded }) => {
  const pointsRef = useRef<THREE.Points>(null!);
  const starRef = useRef<THREE.Group>(null!);
  
  // Internal state to track infinite spread after explosion
  const [explosionOffset, setExplosionOffset] = useState(0);

  const particleCount = 15000;
  
  const [positions, initialPositions] = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const initial = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      // Create cone shape for the tree
      const h = Math.random() * 8; // height
      const r = (1 - h / 8) * 2.5; // radius decreases as height increases
      const angle = Math.random() * Math.PI * 2;
      
      const x = Math.cos(angle) * r;
      const y = h - 4; // center vertically
      const z = Math.sin(angle) * r;

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      initial[i * 3] = x;
      initial[i * 3 + 1] = y;
      initial[i * 3 + 2] = z;
    }
    return [pos, initial];
  }, []);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();
    const p = pointsRef.current.geometry.attributes.position;
    
    // Smoothly increase or decrease explosion offset
    if (isExploded) {
      setExplosionOffset(prev => prev + delta * 2.5); 
    } else if (explosionOffset > 0) {
      // Return to 0 spread quickly but smoothly when explosion reversed
      setExplosionOffset(prev => Math.max(0, prev - delta * 4));
    }

    const effectiveSpread = spread + explosionOffset;

    for (let i = 0; i < particleCount; i++) {
      const ix = i * 3;
      const iy = i * 3 + 1;
      const iz = i * 3 + 2;

      // Base subtle movement
      const offsetX = Math.sin(time * 0.5 + initialPositions[iy]) * 0.05;
      const offsetZ = Math.cos(time * 0.5 + initialPositions[ix]) * 0.05;

      // Explode effect logic
      const explodeFactor = power ? effectiveSpread * 12 : 0;
      
      p.array[ix] = initialPositions[ix] + (initialPositions[ix] * explodeFactor) + offsetX;
      p.array[iy] = initialPositions[iy] + (initialPositions[iy] * (explodeFactor * 0.3)) + (Math.sin(time) * 0.1);
      p.array[iz] = initialPositions[iz] + (initialPositions[iz] * explodeFactor) + offsetZ;
    }
    
    p.needsUpdate = true;

    // Rotation logic: slow continuous rotate when idle, reactive when powered
    if (!isExploded) {
      pointsRef.current.rotation.y += power ? (0.005 + (rotation * 0.05)) : 0.002;
    }
    
    if (starRef.current) {
      starRef.current.rotation.y += 0.02;
      // Star lifts up and glows more during spread
      starRef.current.position.y = 4.2 + (effectiveSpread * 6);
      const s = 1 + (effectiveSpread * 2.5);
      starRef.current.scale.set(s, s, s);
    }
  });

  return (
    <Group>
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      
      {/* The Tree - Always visible, but dimmed when power is off */}
      <Points ref={pointsRef}>
        <BufferGeometry>
          <BufferAttribute
            attach="attributes-position"
            count={particleCount}
            array={positions}
            itemSize={3}
          />
        </BufferGeometry>
        <PointsMaterial
          size={0.035}
          color={power ? "#60a5fa" : "#064e3b"}
          transparent
          opacity={power ? 0.9 : 0.2}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </Points>

      {/* Decorative Lights */}
      <Group>
        {Array.from({ length: 12 }).map((_, i) => (
           <Float key={i} speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
            <Mesh 
              position={[
                Math.sin(i) * (2 + spread * 5 + explosionOffset * 2), 
                (i - 4) + (spread * 2 + explosionOffset), 
                Math.cos(i) * (2 + spread * 5 + explosionOffset * 2)
              ]}
            >
              <SphereGeometry args={[0.08, 16, 16]} />
              <MeshStandardMaterial 
                color={i % 2 === 0 ? "#ef4444" : "#fbbf24"} 
                emissive={i % 2 === 0 ? "#ef4444" : "#fbbf24"}
                emissiveIntensity={power ? 5 : 0.2}
                transparent
                opacity={power ? 1 : 0.3}
              />
            </Mesh>
          </Float>
        ))}
      </Group>

      {/* The Star */}
      <Group ref={starRef} position={[0, 4.2, 0]}>
        <Mesh>
          <OctahedronGeometry args={[0.4, 0]} />
          <MeshStandardMaterial 
            color="#fde047" 
            emissive="#fde047" 
            emissiveIntensity={power ? 8 : 0.5} 
            transparent
            opacity={power ? 1 : 0.4}
          />
        </Mesh>
        <PointLight intensity={power ? 15 : 0.5} color="#fde047" />
      </Group>
      
      <AmbientLight intensity={power ? 0.2 : 0.05} />
      <PointLight position={[10, 10, 10]} intensity={power ? 1.5 : 0.1} />
    </Group>
  );
};

export default ChristmasTree;
