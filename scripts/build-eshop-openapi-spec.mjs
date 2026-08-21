#!/usr/bin/env node
/**
 * Sinh lại `src/config/eshop-open-api-spec.json` từ trang tài liệu của MISA eShop Open Platform.
 *
 * Vì sao phải bóc tay: trang tài liệu (`/api/platform/documents/html`) là 1 file HTML tĩnh, toàn bộ
 * dữ liệu endpoint được nhúng sẵn trong script dưới dạng `menuData.push(...[...])` /
 * `endpointsData.push(...[...])`. Ba API dữ liệu mà trang có nhắc tới (`/api/menu`, `/api/sections`,
 * `/api/endpoints`) đều trả 401 nếu gọi trực tiếp, nên cách chắc chắn nhất là tải HTML rồi parse
 * đúng hai mảng đó.
 *
 * Chạy: node scripts/build-eshop-openapi-spec.mjs
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const DOC_URL = 'https://eshopapp.misa.vn/api/platform/documents/html';
const DICH = path.join(process.cwd(), 'src/config/eshop-open-api-spec.json');

/** Cắt đúng một mảng JSON bắt đầu tại `viTri` bằng cách đếm ngoặc vuông. */
function catMang(html, viTri) {
  let sau = 0;
  for (let i = viTri; i < html.length; i += 1) {
    if (html[i] === '[') sau += 1;
    else if (html[i] === ']') {
      sau -= 1;
      if (sau === 0) return html.slice(viTri, i + 1);
    }
  }
  throw new Error('Không tìm được dấu đóng mảng');
}

/**
 * Gom TẤT CẢ lần `push` của một biến, không chỉ lần đầu.
 *
 * Trang tài liệu chia dữ liệu thành nhiều lời gọi `push` (hiện có 2: nhóm Token đứng riêng, phần còn
 * lại là các nhóm nghiệp vụ). Bản đầu của script chỉ đọc lần push đầu tiên nên khi MISA bổ sung nhóm
 * Token lên đầu trang thì toàn bộ endpoint nghiệp vụ biến mất khỏi spec.
 */
function docMang(html, tenBien) {
  const moc = new RegExp(`${tenBien}\\.push\\(\\.\\.\\.\\s*\\[`, 'g');
  const gop = [];

  for (const khop of html.matchAll(moc)) {
    gop.push(...JSON.parse(catMang(html, khop.index + khop[0].length - 1)));
  }

  if (gop.length === 0) throw new Error(`Không thấy dữ liệu ${tenBien} trong trang tài liệu`);
  return gop;
}

/** Chuẩn hóa cây tham số: bỏ field rỗng cho gọn file, giữ nguyên tên thuộc tính của MISA. */
function chuanHoaThamSo(danhSach) {
  if (!Array.isArray(danhSach)) return [];
  return danhSach.map((p) => ({
    name: p.name,
    type: p.type,
    description: p.description || '',
    location: p.location || null,
    isRequired: Boolean(p.is_required),
    isNullable: Boolean(p.is_nullable),
    defaultValue: p.default_value ?? null,
    properties: chuanHoaThamSo(p.properties),
  }));
}

const html = await fetch(DOC_URL, { headers: { Accept: 'text/html' } }).then((r) => {
  if (!r.ok) throw new Error(`Tải tài liệu lỗi: HTTP ${r.status}`);
  return r.text();
});

const menu = docMang(html, 'menuData');
const endpoints = docMang(html, 'endpointsData');

const sections = menu
  .filter((m) => !m.parent_id)
  .map((m) => ({
    id: m.id,
    label: m.label,
    description: m.description || '',
    endpointCount: m.endpoint_count ?? 0,
  }));

const spec = {
  docUrl: DOC_URL,
  fetchedAt: new Date().toISOString(),
  sections,
  endpoints: endpoints.map((e) => ({
    id: e.id,
    sectionId: e.sectionId,
    title: e.title,
    description: e.description || '',
    method: String(e.method || 'GET').toUpperCase(),
    baseUrl: e.baseUrl,
    path: e.path,
    hasAuthentication: Boolean(e.hasAuthentication),
    parameters: chuanHoaThamSo(e.parameters),
    response: chuanHoaThamSo(e.request_example),
  })),
};

await writeFile(DICH, `${JSON.stringify(spec, null, 1)}\n`, 'utf8');
console.log(`Đã ghi ${DICH}: ${spec.sections.length} nhóm, ${spec.endpoints.length} endpoint`);
