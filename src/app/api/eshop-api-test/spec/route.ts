import { NextResponse } from 'next/server';
import {
  AUTH_BASE_URL_MAC_DINH,
  BASE_URL_MAC_DINH,
  GRAPH_AUTH_URL_MAC_DINH,
  HEADER_APP_ID_MAC_DINH,
  HEADER_APP_KEY_MAC_DINH,
  laySpec,
  laySpecMshopkeeper,
} from '@/services/eshop-open-api.service';

/**
 * GET /api/eshop-api-test/spec?nguon=eshop|mshopkeeper - Danh mục endpoint để test.
 *
 * Hai bộ tài liệu, một dạng dữ liệu: `eshop` là MISA eShop Open Platform (bóc từ trang docs của
 * MISA), `mshopkeeper` là cổng GraphAPI đời trước (openplatform.mshopkeeper.vn) — cùng một hệ thống
 * trước khi đổi tên, hiện vẫn chạy và trả lỗi có nội dung nên dễ dò hơn hẳn.
 *
 * Trả từ server thay vì import vào component: hai file spec cộng lại ~400KB.
 */

type ThamSoChung = {
  name: string;
  type: string;
  description: string;
  location: string | null;
  isRequired: boolean;
  isNullable: boolean;
  defaultValue: string | null;
  properties: ThamSoChung[];
};

/** Bảng "Parameters"/"Headers" của docfx → cùng dạng tham số với spec eShop. */
function doiThamSo(rows: Array<Record<string, string>>, viTriMacDinh: string): ThamSoChung[] {
  return rows.map((r) => ({
    name: r.Name ?? '',
    type: r.Type ?? 'string',
    description: r.Description ?? r['Mô tả'] ?? '',
    location: (r.In || viTriMacDinh).replace(/^body$/i, 'Body').replace(/^header$/i, 'Header').replace(/^query$/i, 'Query'),
    isRequired: /true|có/i.test(r['Required?'] ?? ''),
    isNullable: false,
    defaultValue: null,
    properties: [],
  }));
}

/** Definition table của docfx → cây thuộc tính để hiện ở tab "Tài liệu". */
function doiDinhNghia(dn: { name: string; rows: Array<Record<string, string>> }): ThamSoChung {
  return {
    name: dn.name,
    type: 'object',
    description: '',
    location: null,
    isRequired: false,
    isNullable: false,
    defaultValue: null,
    properties: dn.rows.map((r) => ({
      name: r.Property ?? r.Name ?? '',
      type: r.Type ?? '',
      description: r['Mô tả'] ?? r.Description ?? '',
      location: null,
      isRequired: false,
      isNullable: false,
      defaultValue: r.Format || null,
      properties: [],
    })),
  };
}

function specEshop() {
  return {
    nguon: 'eshop' as const,
    ...laySpec(),
    macDinh: {
      baseUrl: BASE_URL_MAC_DINH,
      authUrl: AUTH_BASE_URL_MAC_DINH,
      headerAppId: HEADER_APP_ID_MAC_DINH,
      headerAppKey: HEADER_APP_KEY_MAC_DINH,
    },
  };
}

function specMshopkeeper() {
  const goc = laySpecMshopkeeper();

  const endpoints = goc.endpoints.map((e) => {
    // "Customers API - Thêm khách hàng" → nhóm "Customers API".
    const nhom = e.title.split(' - ')[0].trim() || 'Khác';
    return {
      id: e.id,
      sectionId: nhom,
      title: e.title,
      description: e.description,
      method: e.method,
      baseUrl: goc.auth.dataUrlPattern,
      path: e.path,
      hasAuthentication: e.headers.length > 0,
      parameters: [...doiThamSo(e.parameters, 'Body'), ...doiThamSo(e.headers, 'Header')],
      response: e.definitions.map(doiDinhNghia),
      /** Ví dụ ngay trong tài liệu — dùng luôn làm body mẫu, chính xác hơn mọi cách tự dựng. */
      sampleRequest: e.sampleRequest,
      sampleResponse: e.sampleResponse,
      errorTypes: e.errorTypes,
    };
  });

  const sections = [...new Set(endpoints.map((e) => e.sectionId))].map((id) => ({
    id,
    label: id,
    description: '',
    endpointCount: endpoints.filter((e) => e.sectionId === id).length,
  }));

  return {
    nguon: 'mshopkeeper' as const,
    docUrl: goc.docUrl,
    fetchedAt: goc.fetchedAt,
    sections,
    endpoints,
    macDinh: {
      baseUrl: goc.auth.dataUrlPattern,
      authUrl: GRAPH_AUTH_URL_MAC_DINH,
      loginPath: goc.auth.loginPath,
      headerAppId: HEADER_APP_ID_MAC_DINH,
      headerAppKey: HEADER_APP_KEY_MAC_DINH,
    },
  };
}

export async function GET(request: Request) {
  const nguon = new URL(request.url).searchParams.get('nguon');
  return NextResponse.json({ status: 'success', data: nguon === 'mshopkeeper' ? specMshopkeeper() : specEshop() });
}
