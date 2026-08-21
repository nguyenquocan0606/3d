'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FileJson,
  History,
  KeyRound,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';

/* ==================== Kiểu dữ liệu spec (khớp scripts/build-eshop-openapi-spec.mjs) ==================== */

type SpecParam = {
  name: string;
  type: string;
  description: string;
  location: 'Query' | 'Body' | 'Path' | 'Header' | null;
  isRequired: boolean;
  isNullable: boolean;
  defaultValue: string | null;
  properties: SpecParam[];
};

type SpecEndpoint = {
  id: string;
  sectionId: string;
  title: string;
  description: string;
  method: string;
  baseUrl: string;
  path: string;
  hasAuthentication: boolean;
  parameters: SpecParam[];
  response: SpecParam[];
  /** Chỉ có ở bộ MShopKeeper: ví dụ request/response chép thẳng từ tài liệu + bảng mã lỗi. */
  sampleRequest?: string | null;
  sampleResponse?: string | null;
  errorTypes?: Array<Record<string, string>>;
};

type NguonSpec = 'eshop' | 'mshopkeeper';

type SpecSection = { id: string; label: string; description: string; endpointCount: number };

type Spec = {
  nguon: NguonSpec;
  docUrl: string;
  fetchedAt: string;
  sections: SpecSection[];
  endpoints: SpecEndpoint[];
  macDinh: { baseUrl: string; authUrl?: string; loginPath?: string; headerAppId: string; headerAppKey: string };
};

/** Một lần thử ký khi đăng nhập GraphAPI — server thử vài tổ hợp rồi báo tổ hợp nào qua. */
type LanThuDangNhap = {
  chuKy: string;
  gio: string;
  loginTime: string;
  chuoiKy: string;
  status: number;
  errorType: number | null;
  errorMessage: string | null;
  success: boolean;
};

type KetQuaDangNhapGraph = {
  thanhCong: boolean;
  accessToken: string | null;
  companyCode: string | null;
  environment: string | null;
  dataUrl: string | null;
  cachKy: { chuKy: string; gio: string } | null;
  cacLanThu: LanThuDangNhap[];
};

type KetQuaGoi = {
  ok: boolean;
  status: number;
  statusText: string;
  durationMs: number;
  responseHeaders: Record<string, string>;
  body: unknown;
  bodyIsJson: boolean;
  request: { method: string; url: string; headers: Record<string, string>; body: string | null };
};

/** Phản hồi của nhóm Token (`tokens/create`, `tokens/refresh-token`). */
type KetQuaToken = {
  thanhCong: boolean;
  token: string | null;
  refreshToken: string | null;
  hetHan: string | null;
  loaiToken: string | null;
  maLoi: number | null;
  thongBao: string | null;
  goi: KetQuaGoi;
};

type CapHeader = { key: string; value: string };

/** Cấu hình xác thực + tùy chọn chung, lưu ở localStorage của máy đang test. */
type CauHinh = {
  appId: string;
  appKey: string;
  headerAppId: string;
  headerAppKey: string;
  accessToken: string;
  baseUrl: string;
  /** Cổng xác thực — base URL riêng, không chung với các endpoint nghiệp vụ. */
  authUrl: string;
  /** Nhận kèm access token, dùng cho `tokens/refresh-token` khi token cũ hết hạn. */
  refreshToken: string;
  /** Thời điểm token hết hạn do MISA trả về, giữ nguyên văn để hiện lại. */
  tokenHetHan: string;
  headers: CapHeader[];
  bocParam: boolean;
  /** Bộ tài liệu đang test: eShop Open Platform hay GraphAPI đời cũ (MShopKeeper). */
  nguon: NguonSpec;
  graphAuthUrl: string;
  graphDomain: string;
  /** Điền sau khi đăng nhập GraphAPI thành công — gửi kèm header CompanyCode và ghép vào base URL. */
  graphCompanyCode: string;
  graphDataUrl: string;
};

type MucLichSu = {
  id: string;
  luc: string;
  endpointId: string;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  body: string | null;
  query: Record<string, string>;
};

type ApiResponse<T> = { status?: string; data?: T; message?: string };

/* ==================== Hằng số & tiện ích ==================== */

const KHOA_CAU_HINH = 'eshop-api-test:cau-hinh:v1';
const KHOA_NHAP = 'eshop-api-test:nhap:v1';
const KHOA_LICH_SU = 'eshop-api-test:lich-su:v1';
const SO_LICH_SU = 25;

const LOP_THE = 'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0f1523]';
const LOP_O_NHAP =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-indigo-400';
const LOP_NHAN = 'mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400';

const MAU_METHOD: Record<string, string> = {
  GET: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  POST: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  PUT: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

const CAU_HINH_RONG: CauHinh = {
  appId: '',
  appKey: '',
  headerAppId: 'x-app-id',
  headerAppKey: 'x-app-key',
  accessToken: '',
  baseUrl: 'https://eshopapp.misa.vn/api/platform',
  authUrl: 'https://eshopapp.misa.vn/api/auth-platform',
  refreshToken: '',
  tokenHetHan: '',
  headers: [],
  bocParam: false,
  nguon: 'eshop',
  graphAuthUrl: 'https://graphapi.mshopkeeper.vn/auth',
  graphDomain: '',
  graphCompanyCode: '',
  graphDataUrl: '',
};

function docLocal<T>(khoa: string, mac: T): T {
  if (typeof window === 'undefined') return mac;
  try {
    const s = window.localStorage.getItem(khoa);
    return s ? ({ ...mac, ...(JSON.parse(s) as object) } as T) : mac;
  } catch {
    return mac;
  }
}

function ghiLocal(khoa: string, giaTri: unknown) {
  try {
    window.localStorage.setItem(khoa, JSON.stringify(giaTri));
  } catch {
    // Hết quota / chế độ riêng tư — mất phần lưu tạm thôi, không ảnh hưởng việc gọi API.
  }
}

/** Tách các đoạn `{tên}` trong path để dựng ô nhập tham số đường dẫn. */
function thamSoDuongDan(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}

function laKieuMang(type: string): boolean {
  return /^(List|IEnumerable|ICollection|Array)</i.test(type) || type.endsWith('[]');
}

/** Giá trị mẫu cho 1 field theo kiểu C# mà tài liệu MISA khai báo. */
function giaTriMau(p: SpecParam): unknown {
  if (p.properties.length > 0) {
    const con = bodyMau(p.properties);
    return laKieuMang(p.type) ? [con] : con;
  }

  if (laKieuMang(p.type)) return [];

  const kieu = p.type.replace(/\?$/, '').toLowerCase();
  const mac = p.defaultValue?.trim();

  if (/^(int32|int64|int|decimal|double|single|float)$/.test(kieu)) {
    if (mac && !Number.isNaN(Number(mac))) return Number(mac);
    return p.isNullable ? null : 0;
  }
  if (kieu === 'boolean') {
    if (mac === 'true') return true;
    if (mac === 'false') return false;
    return p.isNullable ? null : false;
  }
  if (kieu === 'datetime') return p.isNullable ? null : new Date().toISOString();
  if (kieu === 'guid') return p.isNullable ? null : '';
  if (kieu === 'string') return mac || '';
  // Enum hoặc kiểu riêng của MISA (SortTypeEnum, EnumAddressLevel...) — mô tả đã ghi rõ số nào là gì.
  if (mac && !Number.isNaN(Number(mac))) return Number(mac);
  return p.isNullable ? null : 1;
}

function bodyMau(danhSach: SpecParam[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const p of danhSach) o[p.name] = giaTriMau(p);
  return o;
}

/** Dựng body JSON mẫu cho endpoint: mặc định gửi thẳng object `param`, có tùy chọn bọc lại. */
function dungBodyMau(e: SpecEndpoint, bocParam: boolean): string {
  const body = e.parameters.filter((p) => p.location === 'Body');
  if (body.length === 0) return '';

  if (body.length === 1 && body[0].properties.length > 0) {
    const trong = bodyMau(body[0].properties);
    return JSON.stringify(bocParam ? { [body[0].name]: trong } : trong, null, 2);
  }

  return JSON.stringify(bodyMau(body), null, 2);
}

function dungUrlHienThi(baseUrl: string, path: string): string {
  return `${(baseUrl || '').replace(/\/+$/, '')}/${(path || '').replace(/^\/+/, '')}`;
}

function dungCurl(k: KetQuaGoi): string {
  const dong = [`curl -X ${k.request.method} '${k.request.url}'`];
  for (const [h, v] of Object.entries(k.request.headers)) dong.push(`  -H '${h}: ${v}'`);
  if (k.request.body) dong.push(`  -d '${k.request.body.replace(/'/g, "'\\''")}'`);
  return dong.join(" \\\n");
}

function coChuoi(giaTri: unknown): string {
  const s = typeof giaTri === 'string' ? giaTri : JSON.stringify(giaTri);
  const byte = new TextEncoder().encode(s ?? '').length;
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(1)} KB`;
  return `${(byte / 1024 / 1024).toFixed(2)} MB`;
}

/* ==================== Thành phần con ==================== */

function BadgeMethod({ method }: { method: string }) {
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide ${MAU_METHOD[method] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
      {method}
    </span>
  );
}

/** Bảng tham số/response dạng cây — thu gọn được từng nhánh con. */
function CayThamSo({ danhSach, cap = 0 }: { danhSach: SpecParam[]; cap?: number }) {
  const [mo, setMo] = useState<Record<string, boolean>>({});

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {danhSach.map((p) => {
        const coCon = p.properties.length > 0;
        const dangMo = mo[p.name] ?? cap === 0;

        return (
          <div key={`${p.name}-${p.type}`}>
            <div className="flex items-start gap-2 py-1.5 text-xs" style={{ paddingLeft: cap * 14 }}>
              {coCon ? (
                <button type="button" onClick={() => setMo((c) => ({ ...c, [p.name]: !dangMo }))} className="mt-0.5 text-slate-400 hover:text-indigo-500">
                  {dangMo ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                </button>
              ) : (
                <span className="mt-0.5 inline-block size-3.5" />
              )}
              <span className="min-w-32 font-mono font-semibold text-slate-700 dark:text-slate-200">{p.name}</span>
              <span className="min-w-28 font-mono text-[11px] text-indigo-600 dark:text-indigo-300">{p.type}</span>
              {p.location && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-semibold uppercase text-slate-500 dark:bg-slate-800">{p.location}</span>}
              {p.isRequired && <span className="text-[10px] font-bold text-red-500">bắt buộc</span>}
              <span className="flex-1 text-slate-500 dark:text-slate-400">{p.description}</span>
            </div>
            {coCon && dangMo && <CayThamSo danhSach={p.properties} cap={cap + 1} />}
          </div>
        );
      })}
    </div>
  );
}

function NutCopy({ noiDung, nhan = 'Copy' }: { noiDung: string; nhan?: string }) {
  const [xong, setXong] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(noiDung);
        setXong(true);
        setTimeout(() => setXong(false), 1500);
      }}
      className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-300 px-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      {xong ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
      {xong ? 'Đã copy' : nhan}
    </button>
  );
}

/* ==================== Trang chính ==================== */

export default function EshopApiTestConsole() {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [loiSpec, setLoiSpec] = useState<string | null>(null);

  const [cauHinh, setCauHinh] = useState<CauHinh>(CAU_HINH_RONG);
  const [hienKey, setHienKey] = useState(false);
  const [daNapCauHinh, setDaNapCauHinh] = useState(false);

  const [endpointId, setEndpointId] = useState<string | null>(null);
  const [timKiem, setTimKiem] = useState('');
  const [nhomMo, setNhomMo] = useState<Record<string, boolean>>({});

  /** Dữ liệu người dùng nhập cho từng endpoint (query/path/body), lưu theo endpoint id. */
  const [nhap, setNhap] = useState<Record<string, { query: Record<string, string>; path: Record<string, string>; body: string }>>({});

  /** Tab đang xem của từng endpoint — nhớ riêng để đổi qua lại không mất chỗ đang đọc. */
  const [tabTheoEndpoint, setTabTheoEndpoint] = useState<Record<string, 'tham-so' | 'body' | 'header' | 'tai-lieu'>>({});
  const [tabPhanHoi, setTabPhanHoi] = useState<'body' | 'header' | 'request' | 'curl'>('body');

  const [dangGoi, setDangGoi] = useState(false);
  const [ketQua, setKetQua] = useState<KetQuaGoi | null>(null);
  const [loiGoi, setLoiGoi] = useState<string | null>(null);

  const [dangLayToken, setDangLayToken] = useState(false);
  const [dangLamMoiToken, setDangLamMoiToken] = useState(false);
  const [dangDangNhapGraph, setDangDangNhapGraph] = useState(false);
  const [ketQuaGraph, setKetQuaGraph] = useState<KetQuaDangNhapGraph | null>(null);
  const [tinToken, setTinToken] = useState<{ kieu: 'ok' | 'loi' | 'tin'; chu: string } | null>(null);

  const [lichSu, setLichSu] = useState<MucLichSu[]>([]);
  const [hienLichSu, setHienLichSu] = useState(false);

  /* ---------- Nạp/ghi localStorage ---------- */

  // Đọc sau khi mount, không đọc lúc render: HTML dựng từ server không có localStorage nên sẽ lệch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCauHinh(docLocal(KHOA_CAU_HINH, CAU_HINH_RONG));
    setNhap(docLocal(KHOA_NHAP, {} as Record<string, { query: Record<string, string>; path: Record<string, string>; body: string }>));
    try {
      const s = window.localStorage.getItem(KHOA_LICH_SU);
      if (s) setLichSu(JSON.parse(s) as MucLichSu[]);
    } catch {
      // Lịch sử hỏng thì bỏ qua, không chặn màn hình.
    }
    setDaNapCauHinh(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (daNapCauHinh) ghiLocal(KHOA_CAU_HINH, cauHinh);
  }, [cauHinh, daNapCauHinh]);

  useEffect(() => {
    if (daNapCauHinh) ghiLocal(KHOA_NHAP, nhap);
  }, [nhap, daNapCauHinh]);

  /* ---------- Nạp spec ---------- */

  useEffect(() => {
    if (!daNapCauHinh) return;
    let huy = false;
    (async () => {
      try {
        const r = await fetch(`/api/eshop-api-test/spec?nguon=${cauHinh.nguon}`, { cache: 'no-store' });
        const j = (await r.json()) as ApiResponse<Spec>;
        if (huy) return;
        if (j.status === 'success' && j.data) {
          setSpec(j.data);
          // Đổi bộ tài liệu thì endpoint cũ không còn tồn tại — nhảy về cái đầu tiên của bộ mới.
          setEndpointId((cu) => (cu && j.data!.endpoints.some((e) => e.id === cu) ? cu : (j.data!.endpoints[0]?.id ?? null)));
          setNhomMo(Object.fromEntries(j.data.sections.map((s) => [s.id, true])));
        } else {
          setLoiSpec(j.message ?? 'Không tải được danh mục API');
        }
      } catch {
        if (!huy) setLoiSpec('Không tải được danh mục API');
      }
    })();
    return () => {
      huy = true;
    };
  }, [cauHinh.nguon, daNapCauHinh]);

  const endpoint = useMemo(() => spec?.endpoints.find((e) => e.id === endpointId) ?? null, [spec, endpointId]);

  const nhomLoc = useMemo(() => {
    if (!spec) return [];
    const tu = timKiem.trim().toLowerCase();
    return spec.sections
      .map((s) => ({
        section: s,
        endpoints: spec.endpoints.filter(
          (e) => e.sectionId === s.id && (!tu || `${e.id} ${e.title} ${e.path} ${e.description}`.toLowerCase().includes(tu)),
        ),
      }))
      .filter((n) => n.endpoints.length > 0);
  }, [spec, timKiem]);

  /* ---------- Dữ liệu nhập của endpoint đang chọn ---------- */

  const thamSoQuery = useMemo(() => endpoint?.parameters.filter((p) => p.location === 'Query') ?? [], [endpoint]);
  const thamSoPath = useMemo(() => {
    if (!endpoint) return [];
    const khaiBao = endpoint.parameters.filter((p) => p.location === 'Path');
    const trongPath = thamSoDuongDan(endpoint.path);
    // Ưu tiên khai báo trong tài liệu, bổ sung những `{...}` chỉ xuất hiện ở path.
    const them = trongPath
      .filter((t) => !khaiBao.some((p) => p.name === t))
      .map<SpecParam>((t) => ({ name: t, type: 'String', description: '', location: 'Path', isRequired: true, isNullable: false, defaultValue: null, properties: [] }));
    return [...khaiBao, ...them];
  }, [endpoint]);
  const coBody = useMemo(() => (endpoint?.parameters.some((p) => p.location === 'Body') ?? false) || (endpoint?.method ?? 'GET') !== 'GET', [endpoint]);

  /**
   * Dữ liệu nhập của endpoint đang chọn. Body chưa gõ gì thì hiện thẳng body mẫu dựng từ tài liệu —
   * tính lúc render chứ không setState trong effect, để đổi endpoint là thấy ngay body đúng.
   */
  const nhapHienTai = useMemo(() => {
    if (!endpoint) return { query: {}, path: {}, body: '' };
    const luu = nhap[endpoint.id] ?? { query: {}, path: {}, body: '' };
    if (luu.body) return luu;
    return { ...luu, body: endpoint.sampleRequest?.trim() || dungBodyMau(endpoint, cauHinh.bocParam) };
  }, [nhap, endpoint, cauHinh.bocParam]);

  const datNhap = useCallback(
    (phan: Partial<{ query: Record<string, string>; path: Record<string, string>; body: string }>) => {
      if (!endpoint) return;
      setNhap((cu) => {
        const truoc = cu[endpoint.id] ?? { query: {}, path: {}, body: '' };
        return { ...cu, [endpoint.id]: { ...truoc, ...phan } };
      });
    },
    [endpoint],
  );

  const tabYeuCau = (endpointId && tabTheoEndpoint[endpointId]) || (coBody ? 'body' : 'tham-so');
  const setTabYeuCau = useCallback(
    (tab: 'tham-so' | 'body' | 'header' | 'tai-lieu') => {
      if (endpointId) setTabTheoEndpoint((cu) => ({ ...cu, [endpointId]: tab }));
    },
    [endpointId],
  );

  const urlDayDu = useMemo(() => {
    if (!endpoint) return '';
    let path = endpoint.path;
    for (const p of thamSoPath) {
      const v = nhapHienTai.path[p.name]?.trim();
      if (v) path = path.replaceAll(`{${p.name}}`, encodeURIComponent(v));
    }
    const goc = cauHinh.nguon === 'mshopkeeper' ? cauHinh.graphDataUrl || endpoint.baseUrl : cauHinh.baseUrl || endpoint.baseUrl;
    return dungUrlHienThi(goc, path);
  }, [endpoint, thamSoPath, nhapHienTai.path, cauHinh.baseUrl, cauHinh.nguon, cauHinh.graphDataUrl]);

  const headerGui = useMemo(() => {
    const o: Record<string, string> = {};
    // GraphAPI bắt buộc gửi kèm mã cửa hàng cùng Bearer token (xem tài liệu Account/Login).
    if (cauHinh.nguon === 'mshopkeeper' && cauHinh.graphCompanyCode.trim()) o.CompanyCode = cauHinh.graphCompanyCode.trim();
    for (const h of cauHinh.headers) if (h.key.trim()) o[h.key.trim()] = h.value;
    return o;
  }, [cauHinh.headers, cauHinh.nguon, cauHinh.graphCompanyCode]);

  /* ---------- Gọi API ---------- */

  const goi = useCallback(async () => {
    if (!endpoint || dangGoi) return;

    const thieu = thamSoPath.filter((p) => !nhapHienTai.path[p.name]?.trim());
    if (thieu.length > 0) {
      setLoiGoi(`Chưa nhập tham số đường dẫn: ${thieu.map((p) => p.name).join(', ')}`);
      return;
    }

    setDangGoi(true);
    setLoiGoi(null);

    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(nhapHienTai.query)) if (v?.trim()) query[k] = v.trim();

    try {
      const r = await fetch('/api/eshop-api-test/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: endpoint.method,
          url: urlDayDu,
          query,
          body: coBody ? nhapHienTai.body : null,
          accessToken: cauHinh.accessToken,
          appId: cauHinh.appId,
          appKey: cauHinh.appKey,
          appIdHeader: cauHinh.headerAppId,
          appKeyHeader: cauHinh.headerAppKey,
          extraHeaders: headerGui,
        }),
      });
      const j = (await r.json()) as ApiResponse<KetQuaGoi>;

      if (j.status === 'success' && j.data) {
        setKetQua(j.data);
        setTabPhanHoi('body');
        setLichSu((cu) => {
          const moi: MucLichSu = {
            id: `${Date.now()}`,
            luc: new Date().toISOString(),
            endpointId: endpoint.id,
            method: endpoint.method,
            url: j.data!.request.url,
            status: j.data!.status,
            durationMs: j.data!.durationMs,
            body: j.data!.request.body,
            query,
          };
          const ds = [moi, ...cu].slice(0, SO_LICH_SU);
          ghiLocal(KHOA_LICH_SU, ds);
          return ds;
        });
      } else {
        setLoiGoi(j.message ?? 'Gọi thất bại');
      }
    } catch {
      setLoiGoi('Không gọi được server nội bộ');
    } finally {
      setDangGoi(false);
    }
  }, [endpoint, dangGoi, thamSoPath, nhapHienTai, urlDayDu, coBody, cauHinh, headerGui]);

  // Ctrl/Cmd + Enter để gửi — thói quen của mọi công cụ test API.
  useEffect(() => {
    const xuLy = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        void goi();
      }
    };
    window.addEventListener('keydown', xuLy);
    return () => window.removeEventListener('keydown', xuLy);
  }, [goi]);

  /* ---------- Lấy token / làm mới token ---------- */

  const dangNhapGraph = useCallback(async () => {
    if (!cauHinh.graphDomain.trim() || !cauHinh.appId.trim() || !cauHinh.appKey.trim()) {
      setTinToken({ kieu: 'loi', chu: 'Cần nhập Domain, AppID và Secret Key' });
      return;
    }

    setDangDangNhapGraph(true);
    setTinToken(null);

    try {
      const r = await fetch('/api/eshop-api-test/graphapi/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authUrl: cauHinh.graphAuthUrl, domain: cauHinh.graphDomain, appId: cauHinh.appId, secretKey: cauHinh.appKey }),
      });
      const j = (await r.json()) as ApiResponse<KetQuaDangNhapGraph>;

      if (j.status !== 'success' || !j.data) {
        setTinToken({ kieu: 'loi', chu: j.message ?? 'Đăng nhập thất bại' });
        return;
      }

      setKetQuaGraph(j.data);

      if (j.data.thanhCong) {
        setCauHinh((c) => ({
          ...c,
          accessToken: j.data!.accessToken ?? c.accessToken,
          graphCompanyCode: j.data!.companyCode ?? c.graphCompanyCode,
          graphDataUrl: j.data!.dataUrl ?? c.graphDataUrl,
        }));
        setTinToken({ kieu: 'ok', chu: `Đăng nhập được. CompanyCode ${j.data.companyCode ?? '—'}, Environment ${j.data.environment ?? '—'}, cách ký ${j.data.cachKy?.chuKy}/${j.data.cachKy?.gio}.` });
      } else {
        const cuoi = j.data.cacLanThu[j.data.cacLanThu.length - 1];
        setTinToken({ kieu: 'loi', chu: `MShopKeeper trả ErrorType ${cuoi?.errorType ?? '—'}: ${cuoi?.errorMessage ?? 'không rõ'}` });
      }
    } catch {
      setTinToken({ kieu: 'loi', chu: 'Không gọi được server nội bộ' });
    } finally {
      setDangDangNhapGraph(false);
    }
  }, [cauHinh.graphAuthUrl, cauHinh.graphDomain, cauHinh.appId, cauHinh.appKey]);

  /** Dùng chung cho cả lấy mới lẫn làm mới: lưu cặp token và đẩy nguyên phản hồi xuống khung dưới. */
  const nhanKetQuaToken = useCallback((k: KetQuaToken) => {
    setKetQua(k.goi);
    setTabPhanHoi('body');

    if (!k.thanhCong) {
      // Cổng trả 204 rỗng (không có Status) khi cặp token gửi lên đã hết hiệu lực — nói thẳng cho đỡ mò.
      const lyDo = k.thongBao ?? (k.goi.status === 204 ? 'cổng trả 204 rỗng, thường là token/refresh token không còn hợp lệ' : 'không rõ nguyên nhân, xem tab Phản hồi');
      setTinToken({ kieu: 'loi', chu: `MISA từ chối (HTTP ${k.goi.status}${k.maLoi === null ? '' : `, ErrorCode ${k.maLoi}`}): ${lyDo}` });
      return;
    }

    setCauHinh((c) => ({ ...c, accessToken: k.token ?? c.accessToken, refreshToken: k.refreshToken ?? c.refreshToken, tokenHetHan: k.hetHan ?? '' }));
    setTinToken({ kieu: 'ok', chu: `Đã lấy được token${k.hetHan ? `, hết hạn ${k.hetHan}` : ''}.` });
  }, []);

  const layToken = useCallback(async () => {
    if (!cauHinh.appId.trim() || !cauHinh.appKey.trim()) {
      setTinToken({ kieu: 'loi', chu: 'Nhập App ID và App Key trước' });
      return;
    }

    setDangLayToken(true);
    setTinToken(null);

    try {
      const r = await fetch('/api/eshop-api-test/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hanhDong: 'tao', authBaseUrl: cauHinh.authUrl, appId: cauHinh.appId, appKey: cauHinh.appKey }),
      });
      const j = (await r.json()) as ApiResponse<KetQuaToken>;

      if (j.status !== 'success' || !j.data) {
        setTinToken({ kieu: 'loi', chu: j.message ?? 'Lấy token thất bại' });
        return;
      }

      nhanKetQuaToken(j.data);
    } catch {
      setTinToken({ kieu: 'loi', chu: 'Không gọi được server nội bộ' });
    } finally {
      setDangLayToken(false);
    }
  }, [cauHinh.appId, cauHinh.appKey, cauHinh.authUrl, nhanKetQuaToken]);

  const lamMoiToken = useCallback(async () => {
    if (!cauHinh.accessToken.trim() || !cauHinh.refreshToken.trim()) {
      setTinToken({ kieu: 'loi', chu: 'Làm mới cần cả token lẫn refresh token — bấm "Lấy token" trước đã' });
      return;
    }

    setDangLamMoiToken(true);
    setTinToken(null);

    try {
      const r = await fetch('/api/eshop-api-test/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hanhDong: 'lam-moi', authBaseUrl: cauHinh.authUrl, token: cauHinh.accessToken, refreshToken: cauHinh.refreshToken }),
      });
      const j = (await r.json()) as ApiResponse<KetQuaToken>;

      if (j.status !== 'success' || !j.data) {
        setTinToken({ kieu: 'loi', chu: j.message ?? 'Làm mới token thất bại' });
        return;
      }

      nhanKetQuaToken(j.data);
    } catch {
      setTinToken({ kieu: 'loi', chu: 'Không gọi được server nội bộ' });
    } finally {
      setDangLamMoiToken(false);
    }
  }, [cauHinh.accessToken, cauHinh.refreshToken, cauHinh.authUrl, nhanKetQuaToken]);

  /* ---------- Render ---------- */

  if (loiSpec) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-red-500">
        <AlertCircle className="size-4" /> {loiSpec}
      </div>
    );
  }

  if (!spec) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Đang tải danh mục API eShop...
      </div>
    );
  }

  const dataPhanHoi = (() => {
    if (!ketQua?.bodyIsJson || !ketQua.body || typeof ketQua.body !== 'object') return null;
    const b = ketQua.body as Record<string, unknown>;
    return b.Data ?? b.data ?? null;
  })();

  return (
    <div className="flex h-full flex-col">
      {/* Thanh tiêu đề */}
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <Link
          href="/"
          className="inline-flex size-9 items-center justify-center rounded-xl border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          title="Về trang chính"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold">eShop API test</h1>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            MISA eShop Open Platform · {spec.endpoints.length} endpoint / {spec.sections.length} nhóm ·{' '}
            <a href={spec.docUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline dark:text-indigo-400">
              tài liệu gốc
            </a>
          </p>
        </div>
        <div className="ml-auto flex rounded-xl border border-slate-300 p-0.5 dark:border-slate-700">
          {(
            [
              ['eshop', 'eShop Open Platform'],
              ['mshopkeeper', 'GraphAPI (MShopKeeper)'],
            ] as const
          ).map(([key, nhan]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCauHinh((c) => ({ ...c, nguon: key }))}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                cauHinh.nguon === key ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {nhan}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setHienLichSu((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <History className="size-4" /> Lịch sử ({lichSu.length})
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Danh mục endpoint */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800">
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
              <input value={timKiem} onChange={(e) => setTimKiem(e.target.value)} placeholder="Tìm endpoint..." className={`${LOP_O_NHAP} pl-8`} />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {nhomLoc.map(({ section, endpoints }) => {
              const mo = nhomMo[section.id] ?? true;
              return (
                <div key={section.id} className="mb-1">
                  <button
                    type="button"
                    onClick={() => setNhomMo((c) => ({ ...c, [section.id]: !mo }))}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    {mo ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    <span className="flex-1 truncate">{section.label}</span>
                    <span className="text-[10px] font-semibold text-slate-400">{endpoints.length}</span>
                  </button>
                  {mo &&
                    endpoints.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => {
                          setEndpointId(e.id);
                          setLoiGoi(null);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
                          e.id === endpointId ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                        title={e.description}
                      >
                        <BadgeMethod method={e.method} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold">{e.title}</span>
                          <span className="block truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">{e.path}</span>
                        </span>
                      </button>
                    ))}
                </div>
              );
            })}
            {nhomLoc.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-500">Không có endpoint khớp từ khóa</p>}
          </div>
        </aside>

        {/* Khu làm việc */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="mx-auto max-w-5xl space-y-4">
            {/* Xác thực */}
            <section className={`${LOP_THE} p-4`}>
              <div className="mb-3 flex items-center gap-2">
                <KeyRound className="size-4 text-indigo-500" />
                <h2 className="text-sm font-bold">Xác thực</h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">App ID / App Key lưu ở localStorage của máy này, không gửi vào cơ sở dữ liệu</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={LOP_NHAN}>{cauHinh.nguon === 'mshopkeeper' ? 'AppID' : 'App ID'}</label>
                  <input value={cauHinh.appId} onChange={(e) => setCauHinh((c) => ({ ...c, appId: e.target.value }))} placeholder="App ID do MISA cấp" className={`${LOP_O_NHAP} font-mono`} />
                </div>
                <div>
                  <label className={LOP_NHAN}>{cauHinh.nguon === 'mshopkeeper' ? 'Secret Key (App Key)' : 'App Key'}</label>
                  <div className="flex gap-2">
                    <input
                      type={hienKey ? 'text' : 'password'}
                      value={cauHinh.appKey}
                      onChange={(e) => setCauHinh((c) => ({ ...c, appKey: e.target.value }))}
                      placeholder="App Key do MISA cấp"
                      className={`${LOP_O_NHAP} font-mono`}
                    />
                    <button
                      type="button"
                      onClick={() => setHienKey((v) => !v)}
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      title={hienKey ? 'Ẩn' : 'Hiện'}
                    >
                      {hienKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                {cauHinh.nguon === 'eshop' ? (
                  <>
                    <div>
                      <label className={LOP_NHAN}>Base URL</label>
                      <input value={cauHinh.baseUrl} onChange={(e) => setCauHinh((c) => ({ ...c, baseUrl: e.target.value }))} className={`${LOP_O_NHAP} font-mono text-xs`} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={LOP_NHAN}>Header App ID</label>
                        <input value={cauHinh.headerAppId} onChange={(e) => setCauHinh((c) => ({ ...c, headerAppId: e.target.value }))} className={`${LOP_O_NHAP} font-mono text-xs`} />
                      </div>
                      <div>
                        <label className={LOP_NHAN}>Header App Key</label>
                        <input value={cauHinh.headerAppKey} onChange={(e) => setCauHinh((c) => ({ ...c, headerAppKey: e.target.value }))} className={`${LOP_O_NHAP} font-mono text-xs`} />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className={LOP_NHAN}>Domain cửa hàng</label>
                      <input
                        value={cauHinh.graphDomain}
                        onChange={(e) => setCauHinh((c) => ({ ...c, graphDomain: e.target.value }))}
                        placeholder="vd: demoquanao.mshopkeeper.vn"
                        className={`${LOP_O_NHAP} font-mono text-xs`}
                      />
                    </div>
                    <div>
                      <label className={LOP_NHAN}>URL đăng nhập</label>
                      <input value={cauHinh.graphAuthUrl} onChange={(e) => setCauHinh((c) => ({ ...c, graphAuthUrl: e.target.value }))} className={`${LOP_O_NHAP} font-mono text-xs`} />
                    </div>
                  </>
                )}
              </div>

              {cauHinh.nguon === 'mshopkeeper' && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                    Cổng GraphAPI (tên miền cũ của eShop) có tài liệu xác thực đầy đủ: ký HMACSHA256 chuỗi JSON{' '}
                    <span className="font-mono">{'{Domain, AppID, LoginTime}'}</span> bằng Secret Key. Tài liệu không nói rõ chữ ký ra hex hay base64 nên server thử lần lượt vài tổ
                    hợp và báo tổ hợp nào qua — MShopKeeper trả <span className="font-mono">ErrorType 4</span> riêng cho chữ ký sai nên phân biệt được.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void dangNhapGraph()}
                      disabled={dangDangNhapGraph}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {dangDangNhapGraph ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Đăng nhập lấy token
                    </button>
                    {cauHinh.graphCompanyCode && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        CompanyCode <b className="font-mono">{cauHinh.graphCompanyCode}</b> · dữ liệu gọi tại <b className="font-mono">{cauHinh.graphDataUrl || '—'}</b>
                      </span>
                    )}
                  </div>

                  {ketQuaGraph && (
                    <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                          <tr>
                            <th className="px-2 py-1">Cách ký</th>
                            <th className="px-2 py-1">LoginTime</th>
                            <th className="px-2 py-1">ErrorType</th>
                            <th className="px-2 py-1">Thông báo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ketQuaGraph.cacLanThu.map((l, i) => (
                            <tr key={i} className={l.success ? 'bg-emerald-50 dark:bg-emerald-500/10' : ''}>
                              <td className="px-2 py-1 font-mono">
                                {l.chuKy} · {l.gio}
                              </td>
                              <td className="px-2 py-1 font-mono">{l.loginTime}</td>
                              <td className="px-2 py-1 font-semibold">{l.errorType ?? '—'}</td>
                              <td className="px-2 py-1 text-slate-500">{l.errorMessage ?? (l.success ? 'OK' : '')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {tinToken && (
                    <p
                      className={`mt-2 flex items-start gap-1.5 text-xs ${
                        tinToken.kieu === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : tinToken.kieu === 'loi' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {tinToken.kieu === 'ok' ? <CheckCircle2 className="mt-px size-3.5 shrink-0" /> : <AlertCircle className="mt-px size-3.5 shrink-0" />}
                      {tinToken.chu}
                    </p>
                  )}
                </div>
              )}

              {cauHinh.nguon === 'eshop' && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  Theo nhóm <span className="font-mono">Token</span> của tài liệu: <span className="font-mono">POST tokens/create</span> với{' '}
                  <span className="font-mono">{'{ app_id, login_time, sign }'}</span>, trong đó <span className="font-mono">sign</span> là HMAC-SHA256 (hex thường) của chuỗi{' '}
                  <span className="font-mono">app_id:{'{app_id}'};login_time:{'{login_time}'}</span> ký bằng App Key, còn{' '}
                  <span className="font-mono">login_time</span> là Unix timestamp mili giây UTC. Việc ký chạy ở server nên App Key không ra tới trình duyệt.
                  <br />
                  Cổng xác thực luôn trả HTTP 200, thành/bại nằm ở <span className="font-mono">Status.ErrorCode</span> (1300 = không thấy app_id, 1000 = tham số không hợp lệ).
                  <br />
                  Tài liệu hướng dẫn của MISA ghi rõ <b>Danh sách IP là bắt buộc</b> khi tạo kết nối Open API, và mỗi cửa hàng chỉ kết nối được với 1 ứng dụng. Nếu bị từ chối, hãy
                  vào eShop (Ứng dụng → Open API) thêm <b>IP của server chạy web này</b> vào danh sách — request đi từ server chứ không phải từ máy đang mở trình duyệt.
                </p>
                <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
                  <div>
                    <label className={LOP_NHAN}>Base URL cổng xác thực</label>
                    <input value={cauHinh.authUrl} onChange={(e) => setCauHinh((c) => ({ ...c, authUrl: e.target.value }))} className={`${LOP_O_NHAP} font-mono text-xs`} />
                  </div>
                  <div>
                    <label className={LOP_NHAN}>Token hết hạn lúc</label>
                    <div className={`${LOP_O_NHAP} truncate font-mono text-xs text-slate-500 dark:text-slate-400`}>{cauHinh.tokenHetHan || '—'}</div>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void layToken()}
                    disabled={dangLayToken}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {dangLayToken ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Lấy token
                  </button>
                  <button
                    type="button"
                    onClick={() => void lamMoiToken()}
                    disabled={dangLamMoiToken || !cauHinh.refreshToken}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    title="Gọi tokens/refresh-token bằng cặp token đang có"
                  >
                    {dangLamMoiToken ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Làm mới token
                  </button>
                </div>

                {tinToken && (
                  <p
                    className={`mt-2 flex items-start gap-1.5 text-xs ${
                      tinToken.kieu === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : tinToken.kieu === 'loi' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {tinToken.kieu === 'ok' ? <CheckCircle2 className="mt-px size-3.5 shrink-0" /> : <AlertCircle className="mt-px size-3.5 shrink-0" />}
                    {tinToken.chu}
                  </p>
                )}
              </div>
              )}

              <div className="mt-3">
                <label className={LOP_NHAN}>Access token (gửi kèm header Authorization: Bearer ...)</label>
                <textarea
                  value={cauHinh.accessToken}
                  onChange={(e) => setCauHinh((c) => ({ ...c, accessToken: e.target.value }))}
                  rows={2}
                  spellCheck={false}
                  placeholder="Dán token nếu đã có sẵn"
                  className={`${LOP_O_NHAP} font-mono text-xs`}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCauHinh((c) => ({ ...c, accessToken: '', refreshToken: '', tokenHetHan: '' }))}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-300 px-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <X className="size-3.5" /> Xóa token
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCauHinh({ ...CAU_HINH_RONG, appId: cauHinh.appId, appKey: cauHinh.appKey });
                      setTinToken({ kieu: 'tin', chu: 'Đã trả cấu hình về mặc định (giữ App ID/Key)' });
                    }}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-300 px-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Đặt lại cấu hình
                  </button>
                </div>
              </div>
            </section>

            {/* Endpoint đang chọn */}
            {endpoint && (
              <section className={`${LOP_THE} p-4`}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <BadgeMethod method={endpoint.method} />
                  <h2 className="text-sm font-bold">{endpoint.title}</h2>
                  {endpoint.hasAuthentication ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">cần token</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">không cần token</span>
                  )}
                </div>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{endpoint.description}</p>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs dark:border-slate-800 dark:bg-slate-900/60">
                    {urlDayDu}
                  </code>
                  <NutCopy noiDung={urlDayDu} nhan="Copy URL" />
                  <button
                    type="button"
                    onClick={() => void goi()}
                    disabled={dangGoi}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                    title="Ctrl/Cmd + Enter"
                  >
                    {dangGoi ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Gửi
                  </button>
                </div>

                {/* Tab yêu cầu */}
                <div className="mb-3 flex gap-1 border-b border-slate-200 dark:border-slate-800">
                  {(
                    [
                      ['tham-so', `Tham số (${thamSoQuery.length + thamSoPath.length})`],
                      ['body', 'Body'],
                      ['header', `Header (${cauHinh.headers.length})`],
                      ['tai-lieu', 'Tài liệu'],
                    ] as const
                  ).map(([key, nhan]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTabYeuCau(key)}
                      className={`-mb-px border-b-2 px-3 py-1.5 text-xs font-semibold ${
                        tabYeuCau === key ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      {nhan}
                    </button>
                  ))}
                </div>

                {tabYeuCau === 'tham-so' && (
                  <div className="space-y-2">
                    {thamSoPath.length === 0 && thamSoQuery.length === 0 && <p className="text-xs text-slate-500">Endpoint này không có tham số query/đường dẫn.</p>}
                    {[...thamSoPath, ...thamSoQuery].map((p) => {
                      const laPath = p.location === 'Path';
                      const giaTri = laPath ? (nhapHienTai.path[p.name] ?? '') : (nhapHienTai.query[p.name] ?? '');
                      return (
                        <div key={`${p.location}-${p.name}`} className="grid gap-1 sm:grid-cols-[220px_1fr] sm:items-center">
                          <label className="text-xs">
                            <span className="font-mono font-semibold">{p.name}</span>
                            {p.isRequired && <span className="ml-1 text-red-500">*</span>}
                            <span className="ml-1.5 rounded bg-slate-100 px-1 text-[10px] font-semibold uppercase text-slate-500 dark:bg-slate-800">{p.location}</span>
                            <span className="ml-1 font-mono text-[10px] text-indigo-600 dark:text-indigo-300">{p.type}</span>
                          </label>
                          <div>
                            <input
                              value={giaTri}
                              onChange={(e) =>
                                laPath
                                  ? datNhap({ path: { ...nhapHienTai.path, [p.name]: e.target.value } })
                                  : datNhap({ query: { ...nhapHienTai.query, [p.name]: e.target.value } })
                              }
                              placeholder={p.defaultValue ? `mặc định: ${p.defaultValue}` : ''}
                              className={`${LOP_O_NHAP} py-1.5 text-xs`}
                            />
                            {p.description && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{p.description}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {tabYeuCau === 'body' && (
                  <div>
                    {!coBody ? (
                      <p className="text-xs text-slate-500">Endpoint {endpoint.method} này không gửi body.</p>
                    ) : (
                      <>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => datNhap({ body: dungBodyMau(endpoint, cauHinh.bocParam) })}
                            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-300 px-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            <FileJson className="size-3.5" /> Dựng lại body mẫu
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                datNhap({ body: JSON.stringify(JSON.parse(nhapHienTai.body || '{}'), null, 2) });
                              } catch {
                                setLoiGoi('Body chưa phải JSON hợp lệ nên không định dạng được');
                              }
                            }}
                            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-300 px-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            <Braces className="size-3.5" /> Định dạng JSON
                          </button>
                          <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <input type="checkbox" checked={cauHinh.bocParam} onChange={(e) => setCauHinh((c) => ({ ...c, bocParam: e.target.checked }))} className="size-3.5" />
                            Bọc trong {'{ param: ... }'}
                          </label>
                        </div>
                        <textarea
                          value={nhapHienTai.body}
                          onChange={(e) => datNhap({ body: e.target.value })}
                          rows={14}
                          spellCheck={false}
                          className={`${LOP_O_NHAP} font-mono text-xs`}
                        />
                      </>
                    )}
                  </div>
                )}

                {tabYeuCau === 'header' && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Header thêm tay — ghi đè được cả Authorization và header App ID/Key ở trên (hữu ích khi MISA yêu cầu tên header khác).
                    </p>
                    {cauHinh.headers.map((h, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          value={h.key}
                          onChange={(e) => setCauHinh((c) => ({ ...c, headers: c.headers.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) }))}
                          placeholder="Tên header"
                          className={`${LOP_O_NHAP} py-1.5 font-mono text-xs`}
                        />
                        <input
                          value={h.value}
                          onChange={(e) => setCauHinh((c) => ({ ...c, headers: c.headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) }))}
                          placeholder="Giá trị"
                          className={`${LOP_O_NHAP} py-1.5 font-mono text-xs`}
                        />
                        <button
                          type="button"
                          onClick={() => setCauHinh((c) => ({ ...c, headers: c.headers.filter((_, j) => j !== i) }))}
                          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-red-500 hover:bg-red-50 dark:border-slate-700 dark:hover:bg-red-500/10"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCauHinh((c) => ({ ...c, headers: [...c.headers, { key: '', value: '' }] }))}
                      className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-slate-300 px-2 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      <Plus className="size-3.5" /> Thêm header
                    </button>
                  </div>
                )}

                {tabYeuCau === 'tai-lieu' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Parameters</h3>
                      {endpoint.parameters.length > 0 ? <CayThamSo danhSach={endpoint.parameters} /> : <p className="text-xs text-slate-500">Không có</p>}
                    </div>
                    <div>
                      <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Response</h3>
                      {endpoint.response.length > 0 ? <CayThamSo danhSach={endpoint.response} /> : <p className="text-xs text-slate-500">Không có</p>}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Phản hồi */}
            {(ketQua || loiGoi) && (
              <section className={`${LOP_THE} p-4`}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold">Phản hồi</h2>
                  {ketQua && (
                    <>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          ketQua.ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                        }`}
                      >
                        {ketQua.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                        HTTP {ketQua.status} {ketQua.statusText}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {ketQua.durationMs} ms · {coChuoi(ketQua.body)}
                      </span>
                      <div className="ml-auto flex gap-2">
                        <NutCopy noiDung={typeof ketQua.body === 'string' ? ketQua.body : JSON.stringify(ketQua.body, null, 2)} nhan="Copy body" />
                        <NutCopy noiDung={dungCurl(ketQua)} nhan="Copy cURL" />
                      </div>
                    </>
                  )}
                </div>

                {loiGoi && (
                  <p className="mb-3 flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-500/10 dark:text-red-300">
                    <AlertCircle className="size-3.5" /> {loiGoi}
                  </p>
                )}

                {ketQua && (
                  <>
                    <div className="mb-2 flex gap-1 border-b border-slate-200 dark:border-slate-800">
                      {(
                        [
                          ['body', 'Body'],
                          ['header', `Header (${Object.keys(ketQua.responseHeaders).length})`],
                          ['request', 'Request đã gửi'],
                          ['curl', 'cURL'],
                        ] as const
                      ).map(([key, nhan]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setTabPhanHoi(key)}
                          className={`-mb-px border-b-2 px-3 py-1.5 text-xs font-semibold ${
                            tabPhanHoi === key
                              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                          }`}
                        >
                          {nhan}
                        </button>
                      ))}
                    </div>

                    {tabPhanHoi === 'body' && (
                      <>
                        {dataPhanHoi !== null && (
                          <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
                            {Array.isArray((dataPhanHoi as { Data?: unknown }).Data)
                              ? `Data.Data: ${((dataPhanHoi as { Data: unknown[] }).Data).length} bản ghi`
                              : 'Phản hồi có trường Data'}
                          </p>
                        )}
                        <pre className="max-h-[28rem] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed dark:border-slate-800 dark:bg-slate-900/60">
                          {typeof ketQua.body === 'string' ? ketQua.body || '(body rỗng)' : JSON.stringify(ketQua.body, null, 2)}
                        </pre>
                      </>
                    )}

                    {tabPhanHoi === 'header' && (
                      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-left text-[11px]">
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {Object.entries(ketQua.responseHeaders).map(([k, v]) => (
                              <tr key={k}>
                                <td className="w-56 px-2 py-1 font-mono font-semibold">{k}</td>
                                <td className="px-2 py-1 font-mono text-slate-500 dark:text-slate-400">{v}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {tabPhanHoi === 'request' && (
                      <pre className="max-h-96 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] dark:border-slate-800 dark:bg-slate-900/60">
                        {`${ketQua.request.method} ${ketQua.request.url}\n`}
                        {Object.entries(ketQua.request.headers)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join('\n')}
                        {ketQua.request.body ? `\n\n${ketQua.request.body}` : ''}
                      </pre>
                    )}

                    {tabPhanHoi === 'curl' && (
                      <pre className="max-h-96 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] dark:border-slate-800 dark:bg-slate-900/60">
                        {dungCurl(ketQua)}
                      </pre>
                    )}
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">App Key và token trong phần Request/cURL đã được che bớt để copy đi dán vẫn an toàn.</p>
                  </>
                )}
              </section>
            )}
          </div>
        </main>

        {/* Lịch sử */}
        {hienLichSu && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
              <History className="size-4 text-slate-400" />
              <h2 className="text-sm font-bold">Lịch sử gọi</h2>
              <button
                type="button"
                onClick={() => {
                  setLichSu([]);
                  ghiLocal(KHOA_LICH_SU, []);
                }}
                className="ml-auto text-xs font-semibold text-red-500 hover:underline"
              >
                Xóa hết
              </button>
              <button type="button" onClick={() => setHienLichSu(false)} className="text-slate-400 hover:text-slate-600">
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {lichSu.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-500">Chưa gọi request nào</p>}
              {lichSu.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setEndpointId(m.endpointId);
                    setLoiGoi(null);
                    setNhap((cu) => ({ ...cu, [m.endpointId]: { query: m.query, path: cu[m.endpointId]?.path ?? {}, body: m.body ?? '' } }));
                  }}
                  className="mb-1 flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Nạp lại request này"
                >
                  <span className="flex items-center gap-2">
                    <BadgeMethod method={m.method} />
                    <span className={`text-xs font-bold ${m.status >= 200 && m.status < 300 ? 'text-emerald-600' : 'text-red-500'}`}>{m.status}</span>
                    <span className="text-[10px] text-slate-400">{m.durationMs} ms</span>
                    <span className="ml-auto text-[10px] text-slate-400">{new Date(m.luc).toLocaleTimeString('vi-VN')}</span>
                  </span>
                  <span className="truncate text-xs font-semibold">{m.endpointId}</span>
                  <span className="truncate font-mono text-[10px] text-slate-500">{m.url}</span>
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
