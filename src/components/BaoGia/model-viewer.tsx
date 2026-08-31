'use client';

import React, { useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls, TransformControls } from '@react-three/drei';

export type ModelInstance = {
  id: string;
  x: number;
  z: number;
  rotationY: number;
};

type Props = {
  geometry: THREE.BufferGeometry;
  /** Kích thước mâm in (mm), lấy từ Printer.buildVolume* — mặc định theo Bambu X1C nếu máy chưa khai. */
  plateWidthMm: number;
  plateDepthMm: number;
  instances: ModelInstance[];
  /** Rỗng = không chọn bản sao nào (ẩn TransformControls). */
  selectedId: string;
  onSelect: (id: string) => void;
  onInstanceChange: (id: string, patch: Partial<ModelInstance>) => void;
  /** Tỷ lệ scale áp dụng chung cho mọi bản sao (%, 100 = giữ nguyên kích thước gốc). */
  scalePercent: number;
  transformMode: 'translate' | 'rotate';
};

function Instance({
  geometry,
  instance,
  selected,
  onSelect,
  onChange,
  scale,
  transformMode,
}: {
  geometry: THREE.BufferGeometry;
  instance: ModelInstance;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<ModelInstance>) => void;
  scale: number;
  transformMode: 'translate' | 'rotate';
}) {
  // State (không phải ref) để TransformControls chỉ nhận object sau khi đã gắn xong — đọc `.current`
  // của ref ngay trong render bị React coi là tác dụng phụ không an toàn.
  const [group, setGroup] = useState<THREE.Group | null>(null);

  return (
    <>
      <group
        ref={setGroup}
        position={[instance.x, 0, instance.z]}
        rotation={[0, instance.rotationY, 0]}
        scale={[scale, scale, scale]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <mesh geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial color={selected ? '#f59e0b' : '#94a3b8'} roughness={0.5} metalness={0.05} />
        </mesh>
      </group>
      {selected && group && (
        <TransformControls
          object={group}
          mode={transformMode}
          showX={transformMode === 'translate'}
          showY={transformMode === 'rotate'}
          showZ={transformMode === 'translate'}
          onObjectChange={() => {
            onChange({ x: group.position.x, z: group.position.z, rotationY: group.rotation.y });
          }}
        />
      )}
    </>
  );
}

/** Mâm in ảo + toàn bộ bản sao model, xoay/di chuyển được từng bản qua TransformControls. */
export default function ModelViewer({
  geometry,
  plateWidthMm,
  plateDepthMm,
  instances,
  selectedId,
  onSelect,
  onInstanceChange,
  scalePercent,
  transformMode,
}: Props) {
  const scale = scalePercent / 100;
  const camDist = Math.max(plateWidthMm, plateDepthMm) * 1.4;

  return (
    <Canvas
      shadows
      camera={{ position: [camDist, camDist * 0.8, camDist], fov: 45, near: 1, far: camDist * 10 }}
      onPointerMissed={() => onSelect('')}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[plateWidthMm, plateWidthMm, plateWidthMm]} intensity={0.9} castShadow />

      <Grid
        args={[plateWidthMm, plateDepthMm]}
        cellSize={10}
        sectionSize={50}
        sectionColor="#f59e0b"
        cellColor="#64748b"
        fadeDistance={camDist * 2}
        infiniteGrid={false}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[plateWidthMm, plateDepthMm]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {instances.map((instance) => (
        <Instance
          key={instance.id}
          geometry={geometry}
          instance={instance}
          selected={instance.id === selectedId}
          onSelect={() => onSelect(instance.id)}
          onChange={(patch) => onInstanceChange(instance.id, patch)}
          scale={scale}
          transformMode={transformMode}
        />
      ))}

      <OrbitControls makeDefault />
    </Canvas>
  );
}
