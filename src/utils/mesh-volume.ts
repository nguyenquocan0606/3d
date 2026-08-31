import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Đuôi file model chấp nhận cho tab Báo giá. */
export const DUOI_FILE_HOP_LE = ['.stl', '.3mf'];

export function duoiFileHopLe(fileName: string): boolean {
  const ten = fileName.toLowerCase();
  return DUOI_FILE_HOP_LE.some((duoi) => ten.endsWith(duoi));
}

/** Thể tích 1 tam giác ký hiệu (Möller) — tổng dồn cho ra thể tích khối kín, đơn vị = đơn vị dài³. */
function theTichTamGiacKyHieu(p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3): number {
  return p1.dot(new THREE.Vector3().crossVectors(p2, p3)) / 6;
}

/** Thể tích tuyệt đối của mesh (mm³ nếu tọa độ gốc là mm — đúng chuẩn STL/3MF). */
export function tinhTheTichMm3(geometry: THREE.BufferGeometry): number {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const soDinh = index ? index.count : pos.count;
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const p3 = new THREE.Vector3();
  let theTich = 0;

  for (let i = 0; i + 2 < soDinh; i += 3) {
    const ia = index ? index.getX(i) : i;
    const ib = index ? index.getX(i + 1) : i + 1;
    const ic = index ? index.getX(i + 2) : i + 2;
    p1.fromBufferAttribute(pos, ia);
    p2.fromBufferAttribute(pos, ib);
    p3.fromBufferAttribute(pos, ic);
    theTich += theTichTamGiacKyHieu(p1, p2, p3);
  }

  return Math.abs(theTich);
}

/**
 * Gộp toàn bộ mesh trong 1 file (3MF có thể có nhiều object) thành MỘT geometry duy nhất, đã áp
 * transform gốc của từng object và đặt đứng trên mặt phẳng Y=0, canh giữa X/Z — sẵn sàng hiển thị
 * và nhân bản trên mâm in ảo mà không cần quan tâm gốc tọa độ gốc của file.
 */
export async function loadGeometryFromFile(file: File): Promise<THREE.BufferGeometry> {
  const buffer = await file.arrayBuffer();
  const ten = file.name.toLowerCase();

  const geometries: THREE.BufferGeometry[] = [];

  if (ten.endsWith('.stl')) {
    geometries.push(new STLLoader().parse(buffer));
  } else if (ten.endsWith('.3mf')) {
    const group = new ThreeMFLoader().parse(buffer);
    group.updateMatrixWorld(true);
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) {
        const geo = mesh.geometry.clone();
        geo.applyMatrix4(mesh.matrixWorld);
        geometries.push(geo);
      }
    });
  } else {
    throw new Error('Chỉ hỗ trợ file .stl hoặc .3mf');
  }

  if (geometries.length === 0) throw new Error('Không đọc được mesh nào trong file');

  const gop = geometries.length === 1 ? geometries[0] : (mergeGeometries(geometries, false) ?? geometries[0]);

  gop.computeBoundingBox();
  const bb = gop.boundingBox!;
  const tamX = (bb.min.x + bb.max.x) / 2;
  const tamZ = (bb.min.z + bb.max.z) / 2;
  gop.translate(-tamX, -bb.min.y, -tamZ);
  gop.computeBoundingBox();
  gop.computeVertexNormals();

  return gop;
}

export type KichThuocMm = { x: number; y: number; z: number };

export function kichThuocTuGeometry(geometry: THREE.BufferGeometry): KichThuocMm {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  return { x: bb.max.x - bb.min.x, y: bb.max.y - bb.min.y, z: bb.max.z - bb.min.z };
}
