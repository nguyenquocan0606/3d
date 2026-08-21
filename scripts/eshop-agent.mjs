#!/usr/bin/env node
/**
 * Agent eShop — CHẠY TRÊN MÁY CHÍNH (máy đang đăng nhập MISA eShop).
 *
 * Lý do tồn tại: MISA eShop chỉ cho 1 phiên đăng nhập tại một thời điểm. Server gọi thẳng API MISA
 * thì phiên trên máy chính bị đá ra ("mất kết nối"). Script này mở một cổng nhỏ trên máy chính để
 * server nhờ gọi hộ, nhờ vậy mọi request tới MISA đều xuất phát từ đúng máy này:
 *
 *     server  →  agent (máy chính)  →  MISA
 *
 * Server không gọi được máy chính (tắt máy, đổi IP...) thì nó tự gọi thẳng MISA để đơn vẫn về —
 * đổi lại phiên eShop trên máy chính bị đăng xuất và phải gia hạn lại token ở tab Cài đặt.
 *
 * ── Cách chạy ──
 * Windows (PowerShell):
 *   $env:AGENT_TOKEN="<bí mật>"; node scripts/eshop-agent.mjs
 * Linux/macOS:
 *   AGENT_TOKEN=<bí mật> node scripts/eshop-agent.mjs
 *
 * Rồi vào tab eShop trên web, khai địa chỉ máy chính: http://<IP-máy-chính>:39100
 * AGENT_TOKEN phải trùng ESHOP_AGENT_TOKEN trong file .env của server.
 *
 * Yêu cầu Node 18 trở lên (dùng fetch có sẵn).
 */

import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 39100);
const AGENT_TOKEN = process.env.AGENT_TOKEN || '';

/**
 * Chỉ cho phép chuyển tiếp request tới MISA. Không có chốt này thì bất kỳ ai trong mạng LAN cũng có
 * thể biến agent thành proxy để gọi tới máy chủ nội bộ bất kỳ.
 */
const HOST_CHO_PHEP = 'amisapp.misa.vn';

function log(...args) {
  console.log(`[${new Date().toLocaleTimeString('vi-VN')}]`, ...args);
}

function traLoi(res, status, dulieu) {
  const body = JSON.stringify(dulieu);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function docBody(req) {
  return new Promise((resolve, reject) => {
    const phan = [];
    req.on('data', (c) => phan.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(phan).toString('utf8') || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

/** Chốt chặn chống biến agent thành proxy mở: chỉ cho gọi tới MISA. */
function kiemTraHost(url) {
  const host = new URL(url).hostname;
  if (host !== HOST_CHO_PHEP && !host.endsWith(`.${HOST_CHO_PHEP}`)) {
    throw new Error(`Agent chỉ được gọi tới ${HOST_CHO_PHEP}, không gọi tới ${host}`);
  }
}

/**
 * Gọi MISA lấy đơn — chạy TRÊN MÁY NÀY nên dùng chung IP/phiên với trình duyệt đang mở eShop.
 * Lật trang bằng `skip` cho tới khi một trang trả về ít hơn `take` (hết dữ liệu).
 */
async function layDonTuMisa(yeuCau) {
  const { url, headers, body, take, maxPages } = yeuCau;
  kiemTraHost(url);

  const tatCa = [];
  for (let trang = 0; trang < (maxPages || 40); trang += 1) {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, skip: trang * take }),
    });

    if (!res.ok) throw new Error(`MISA trả lỗi HTTP ${res.status}`);

    let json;
    try {
      json = await res.json();
    } catch {
      throw new Error('MISA trả về dữ liệu không phải JSON — phiên đăng nhập có thể đã hỏng');
    }

    if (json?.IsAuthExpired) {
      throw new Error('Token MISA đã hết hạn — vào tab Cài đặt bấm "Gia hạn token ngay"');
    }

    const batch = Array.isArray(json?.Data) ? json.Data : [];
    tatCa.push(...batch);
    log(`  trang ${trang + 1}: ${batch.length} đơn`);
    if (batch.length < take) break;
  }

  return tatCa;
}

const server = createServer(async (req, res) => {
  // Token bí mật: request tới đây mang theo cookie + Bearer token MISA, không để lọt ra ngoài.
  if (AGENT_TOKEN && req.headers['x-agent-token'] !== AGENT_TOKEN) {
    return traLoi(res, 401, { ok: false, error: 'Token agent không hợp lệ' });
  }

  const duongDan = (req.url || '').split('?')[0];

  if (duongDan === '/ping') {
    return traLoi(res, 200, { ok: true, message: 'Agent eShop đang chạy' });
  }

  // Chuyển tiếp 1 request bất kỳ tới MISA (dùng cho luồng đăng nhập: gửi tài khoản/mật khẩu, gửi
  // OTP). Trả về cả set-cookie vì phiên đăng nhập nằm trong đó.
  if (duongDan === '/goi-misa' && req.method === 'POST') {
    try {
      const { url, method, headers, body } = await docBody(req);
      kiemTraHost(url);
      log(`Chuyển tiếp ${method || 'POST'} ${new URL(url).pathname}`);

      const misaRes = await fetch(url, {
        method: method || 'POST',
        headers: headers || {},
        body: body === undefined || body === null ? undefined : JSON.stringify(body),
      });

      return traLoi(res, 200, {
        ok: true,
        status: misaRes.status,
        setCookie:
          typeof misaRes.headers.getSetCookie === 'function' ? misaRes.headers.getSetCookie() : [],
        body: await misaRes.text(),
      });
    } catch (error) {
      log(`Lỗi chuyển tiếp: ${error.message}`);
      return traLoi(res, 200, { ok: false, error: error.message });
    }
  }

  if (duongDan === '/lay-don' && req.method === 'POST') {
    try {
      const yeuCau = await docBody(req);
      log(`Server nhờ lấy đơn từ MISA...`);
      const orders = await layDonTuMisa(yeuCau);
      log(`Xong: ${orders.length} đơn, đang trả về server.`);
      return traLoi(res, 200, { ok: true, orders });
    } catch (error) {
      log(`Lỗi: ${error.message}`);
      return traLoi(res, 200, { ok: false, error: error.message });
    }
  }

  return traLoi(res, 404, { ok: false, error: 'Không có đường dẫn này' });
});

server.listen(PORT, () => {
  if (!AGENT_TOKEN) {
    log('CẢNH BÁO: chưa đặt AGENT_TOKEN — ai trong mạng cũng gọi được agent này.');
  }
  log(`Agent eShop đang nghe ở cổng ${PORT}.`);
  log(`Khai địa chỉ này ở tab eShop: http://<IP-máy-này>:${PORT}`);
  log('Giữ cửa sổ này mở và giữ trình duyệt đăng nhập MISA trên máy này.');
});
