#!/usr/bin/env node
/**
 * Sinh lại `src/config/mshopkeeper-open-api-spec.json` từ tài liệu MShopKeeper OpenPlatform
 * (https://openplatform.mshopkeeper.vn) — bộ API "đời trước" của MISA eShop, hiện vẫn sống ở
 * `graphapi.mshopkeeper.vn` và trả lỗi có nội dung nên test được thật.
 *
 * Trang tài liệu do docfx sinh ra: HTML tĩnh, mỗi endpoint 1 file, bảng tham số/định nghĩa là
 * `<table>` chuẩn và ví dụ là `<pre><code class="lang-json">` → parse thẳng bằng regex.
 *
 * Chạy: node scripts/build-mshopkeeper-openapi-spec.mjs
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const GOC = 'https://openplatform.mshopkeeper.vn';
const DICH = path.join(process.cwd(), 'src/config/mshopkeeper-open-api-spec.json');

const boThe = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** Đọc 1 `<table>` thành mảng object theo tên cột ở `<thead>`. */
function docBang(html) {
  const cot = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => boThe(m[1]));
  const than = html.slice(html.indexOf('<tbody'));
  return [...than.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((h) => {
    const o = {};
    [...h[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].forEach((c, i) => {
      o[cot[i] ?? `col${i}`] = boThe(c[1]);
    });
    return o;
  });
}

/** Cắt phần `<article>` và ghép từng bảng với tiêu đề đứng ngay trước nó. */
function docTrang(html) {
  const art = /<article[^>]*>([\s\S]*?)<\/article>/.exec(html);
  if (!art) return null;
  const body = art[1];

  const title = boThe(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(body)?.[1] ?? '');
  const description = boThe(/<p>([\s\S]*?)<\/p>/.exec(body)?.[1] ?? '');

  const bang = [];
  let tieuDeGanNhat = '';
  const moc = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>|<table>[\s\S]*?<\/table>/g;
  let m;
  while ((m = moc.exec(body))) {
    if (m[1] !== undefined) tieuDeGanNhat = boThe(m[1]);
    else bang.push({ tieuDe: tieuDeGanNhat, rows: docBang(m[0]) });
  }

  const timBang = (ten) => bang.find((b) => b.tieuDe.toLowerCase().startsWith(ten))?.rows ?? [];

  // Endpoint: <h3>đường dẫn</h3><h4>METHOD</h4>
  const ep = /<h3[^>]*>([\s\S]*?)<\/h3>\s*<h4[^>]*>([\s\S]*?)<\/h4>/.exec(body);
  const baseUrl = timBang('url')[0]?.URL ?? '';

  const viDu = [...body.matchAll(/<pre><code class="lang-json">([\s\S]*?)<\/code><\/pre>/g)].map((c) => boThe(c[1]));

  const dinhNghia = bang
    .filter((b) => /definition/i.test(b.tieuDe))
    .map((b) => ({ name: b.tieuDe.replace(/\s*definition\s*$/i, '').trim(), rows: b.rows }));

  return {
    title,
    description,
    baseUrl,
    method: ep ? boThe(ep[2]).toUpperCase() : 'POST',
    path: ep ? boThe(ep[1]) : '',
    parameters: timBang('parameters'),
    headers: timBang('headers'),
    errorTypes: timBang('expected response types'),
    sampleRequest: viDu[0] ?? null,
    sampleResponse: viDu[1] ?? null,
    definitions: dinhNghia,
  };
}

const tocHtml = await fetch(`${GOC}/api/toc.html`).then((r) => r.text());
const trangs = [...new Set([...tocHtml.matchAll(/href="([a-z0-9_]+\.html)"/g)].map((m) => m[1]))];

const endpoints = [];
for (const ten of trangs) {
  const html = await fetch(`${GOC}/api/${ten}`).then((r) => r.text());
  const t = docTrang(html);
  if (!t || !t.path) {
    console.warn(`Bỏ qua ${ten}: không thấy endpoint`);
    continue;
  }
  endpoints.push({ id: ten.replace(/\.html$/, ''), ...t });
}

const spec = {
  docUrl: `${GOC}/api/index.html`,
  fetchedAt: new Date().toISOString(),
  /** Xác thực: lấy token ở `{authUrl}/api/Account/Login`, sau đó gọi dữ liệu ở `{dataUrl}`. */
  auth: {
    authUrl: 'https://graphapi.mshopkeeper.vn/auth',
    dataUrlPattern: 'https://graphapi.mshopkeeper.vn/{Environment}',
    loginPath: 'api/Account/Login',
    // Chữ ký: HMACSHA256 của JSON {Domain, AppID, LoginTime} với salt là Secret Key.
    signatureFields: ['Domain', 'AppID', 'LoginTime'],
    tokenLifetimeHours: 24,
  },
  endpoints,
};

await writeFile(DICH, `${JSON.stringify(spec, null, 1)}\n`, 'utf8');
console.log(`Đã ghi ${DICH}: ${endpoints.length} endpoint`);
