#!/usr/bin/env node
/**
 * Worker Slicer — chạy OrcaSlicer (bản build sẵn, KHÔNG sửa mã nguồn) ở chế độ CLI headless để
 * slice thật file STL/3MF khách tải lên qua tab Báo giá, thay vì chỉ ước lượng heuristic.
 *
 * ── Vì sao là tiến trình/container riêng, không nhét vào Next server ──
 * OrcaSlicer là app GUI (wxWidgets), CLI headless vẫn cần virtual display (`xvfb-run`), nặng và có
 * thể treo/crash với file lỗi — không nên chạy trong process Next.js chính (rớt là sập cả app).
 * Container này cũng KHÔNG có quyền truy cập Postgres — chỉ nhận job qua HTTP, tự chạy binary, rồi
 * gọi ngược (callback) một URL do Next chỉ định để báo kết quả. Cô lập kiểu này vì đây là nơi chạy
 * một binary ngoài trên file người dùng tải lên — không có lý do gì để nó cũng cầm được thông tin
 * đăng nhập DB.
 *
 * ── Sơ đồ ──
 *     Next (`/api/quote/slice`) ──POST /slice──► worker ──xvfb-run + orca-slicer──► gcode
 *                                                   │
 *                                                   └──POST callbackUrl──► Next (`/api/quote/slice/[id]/complete`)
 *
 * ── Cách chạy ──
 *     SLICER_WORKER_TOKEN=<bí mật> node scripts/slicer-worker.mjs
 * hoặc (khuyến nghị) chạy nền bằng Docker: docker compose up -d slicer-worker
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.SLICER_WORKER_PORT || 39300);
const TOKEN = process.env.SLICER_WORKER_TOKEN || '';

/** Cùng thư mục bind-mount với Next (`data/quote-uploads`) — worker chỉ ĐỌC, không bao giờ ghi. */
const THU_MUC_UPLOAD = process.env.QUOTE_UPLOAD_DIR || path.join(process.cwd(), 'data', 'quote-uploads');

/** Binary đã giải nén sẵn lúc build image — xem Dockerfile.slicer-worker. */
const ORCA_BIN = process.env.ORCA_SLICER_BIN || '/opt/orcaslicer/bin/orca-slicer';
const PROFILE_DIR = process.env.ORCA_PROFILE_DIR || '/opt/orcaslicer/resources/profiles/BBL';

/** File lỗi/quá phức tạp không được phép treo worker mãi — cắt ngang sau ngần này ms. */
const SLICE_TIMEOUT_MS = Number(process.env.SLICE_TIMEOUT_MS || 120_000);

/** Bao nhiêu job chạy song song tối đa — slicing tốn CPU, không giới hạn thì vài request dồn lúc dễ nghẽn máy. */
const MAX_CONCURRENCY = Number(process.env.SLICE_MAX_CONCURRENCY || 2);

function log(...args) {
  console.log(`[${new Date().toLocaleTimeString('vi-VN')}] [slicer]`, ...args);
}

// ─────────────────────────────────────────────────────────────────────────────
// Máy in Bambu → bộ 3 profile OrcaSlicer bundled sẵn (machine/process/filament).
//
// Chỉ cần ĐÚNG MỘT profile "Standard 0.20mm" mỗi máy làm nền — infill% và layer height thật của
// từng lượt báo giá override qua CLI (`--layer-height`, `--sparse-infill-density`, đã kiểm chứng
// hoạt động đúng bằng tay), nên khỏi phải map layer height → đúng tên file profile (tên mô tả như
// "Optimal"/"Fine"/"Extra Draft" không theo quy luật cố định giữa các máy).
// ─────────────────────────────────────────────────────────────────────────────
const MAY_IN_MAC_DINH = 'Bambu Lab X1 Carbon';
const MAY_IN_HO_TRO = [
  'Bambu Lab X1 Carbon',
  'Bambu Lab X1E',
  'Bambu Lab X1',
  'Bambu Lab P1S',
  'Bambu Lab P1P',
  'Bambu Lab A1 mini',
  'Bambu Lab A1',
];

/** Tên máy tự do người dùng nhập (Printer.model) → tên chuẩn trong MAY_IN_HO_TRO. */
function chuanHoaTenMay(model) {
  const ten = (model || '').toLowerCase();
  const khop = MAY_IN_HO_TRO.find((m) => ten.includes(m.toLowerCase()));
  return khop || MAY_IN_MAC_DINH;
}

function duongDanProfile(tenMay) {
  return {
    machine: path.join(PROFILE_DIR, 'machine', `${tenMay} 0.4 nozzle.json`),
    process: path.join(PROFILE_DIR, 'process', `0.20mm Standard @BBL ${tenMayVietTat(tenMay)}.json`),
    filament: path.join(PROFILE_DIR, 'filament', `Bambu PLA Basic @BBL ${tenMayVietTat(tenMay)}.json`),
  };
}

/** Tên file profile process/filament dùng viết tắt khác tên máy đầy đủ (VD "X1 Carbon" → "X1C"). */
function tenMayVietTat(tenMay) {
  const bang = {
    'Bambu Lab X1 Carbon': 'X1C',
    'Bambu Lab X1E': 'X1E',
    'Bambu Lab X1': 'X1',
    'Bambu Lab P1S': 'P1S',
    'Bambu Lab P1P': 'P1P',
    'Bambu Lab A1 mini': 'A1M',
    'Bambu Lab A1': 'A1',
  };
  return bang[tenMay] || 'X1C';
}

// ─────────────────────────────────────────────────────────────────────────────
// Đọc phần tổng kết ở đầu gcode — cùng kỹ thuật/regex với
// src/services/printer-integration/providers/bambu/doc-3mf.ts (`docTongKet`), chép lại vì worker
// này chạy .mjs thuần không qua bước biên dịch TypeScript của app. Ở đây có NGUYÊN file gcode (do
// tự slice ra, không phải tải dở qua FTP) nên không cần các mẹo đọc dở/giải nén một phần của bản
// gốc — chỉ còn lại phần regex đọc dòng tổng kết.
// ─────────────────────────────────────────────────────────────────────────────
function docThoiGian(chuoi) {
  const g = /(\d+)\s*h/.exec(chuoi);
  const p = /(\d+)\s*m/.exec(chuoi);
  const gi = /(\d+)\s*s/.exec(chuoi);
  if (!g && !p && !gi) return null;
  return (g ? +g[1] * 3600 : 0) + (p ? +p[1] * 60 : 0) + (gi ? +gi[1] : 0);
}

function docTongKetGcode(gcode) {
  const mTheTich = /;\s*filament used \[cm3\]\s*=\s*([\d.,\s]+)/i.exec(gcode);
  const mGio = /;\s*total estimated time\s*:\s*([^\n;]+)/i.exec(gcode);
  if (!mTheTich || !mGio) return null;

  const theTichCm3 = mTheTich[1]
    .split(',')
    .map((x) => parseFloat(x.trim()))
    .filter((x) => Number.isFinite(x))
    .reduce((a, b) => a + b, 0);
  const giay = docThoiGian(mGio[1]);
  if (giay === null) return null;

  return { theTichCm3, giay };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hàng đợi job — giới hạn số lượt slice chạy song song.
// ─────────────────────────────────────────────────────────────────────────────
let dangChay = 0;
const hangDoi = [];

function xepHangJob(job) {
  hangDoi.push(job);
  chayTiep();
}

function chayTiep() {
  if (dangChay >= MAX_CONCURRENCY) return;
  const job = hangDoi.shift();
  if (!job) return;
  dangChay += 1;
  xuLyJob(job)
    .catch((e) => log(`Job ${job.jobId} lỗi ngoài dự kiến:`, e.message))
    .finally(() => {
      dangChay -= 1;
      chayTiep();
    });
}

async function baoKetQua(callbackUrl, body) {
  try {
    await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Worker-Token': TOKEN },
      body: JSON.stringify(body),
    });
  } catch (e) {
    log(`Không gọi được callback ${callbackUrl}:`, e.message);
  }
}

async function xuLyJob(job) {
  const { jobId, inputPath, infillPercent, layerHeightMm, printerModel, callbackUrl } = job;
  log(`Job ${jobId}: bắt đầu slice ${inputPath} (infill ${infillPercent}%, layer ${layerHeightMm}mm)`);

  // `inputPath` do Next sinh ra (uuid do server tự đặt), nhưng vẫn chặn "../" — một dòng dữ liệu
  // sai lệch là route này có thể bị lợi dụng đọc file tùy ý trên máy chủ.
  const fileTuyetDoi = path.resolve(THU_MUC_UPLOAD, inputPath);
  if (!fileTuyetDoi.startsWith(path.resolve(THU_MUC_UPLOAD) + path.sep)) {
    return baoKetQua(callbackUrl, { ok: false, error: 'Đường dẫn file không hợp lệ' });
  }

  const tenMay = chuanHoaTenMay(printerModel);
  const profile = duongDanProfile(tenMay);
  const thuMucRa = await mkdtemp(path.join(tmpdir(), 'bao-gia-slice-'));

  try {
    const maLenh = [
      'xvfb-run',
      '-a',
      ORCA_BIN,
      '--slice',
      '0',
      '--outputdir',
      thuMucRa,
      '--load-settings',
      `${profile.machine};${profile.process}`,
      '--load-filaments',
      profile.filament,
      '--layer-height',
      String(layerHeightMm),
      '--sparse-infill-density',
      String(infillPercent),
      fileTuyetDoi,
    ];

    await chayCoTimeout(maLenh, SLICE_TIMEOUT_MS);

    const cacFile = await readdir(thuMucRa);
    const tenGcode = cacFile.find((f) => f.endsWith('.gcode'));
    if (!tenGcode) throw new Error('Slice xong nhưng không thấy file .gcode xuất ra');

    const gcode = await readFile(path.join(thuMucRa, tenGcode), 'utf8');
    const tongKet = docTongKetGcode(gcode);
    if (!tongKet) throw new Error('Không đọc được dòng tổng kết trong gcode');

    log(`Job ${jobId}: xong — ${tongKet.theTichCm3.toFixed(2)}cm³, ${Math.round(tongKet.giay / 60)} phút`);
    await baoKetQua(callbackUrl, { ok: true, volumeCm3: tongKet.theTichCm3, timeMinutes: tongKet.giay / 60 });
  } catch (e) {
    log(`Job ${jobId}: lỗi —`, e.message);
    await baoKetQua(callbackUrl, { ok: false, error: e.message });
  } finally {
    await rm(thuMucRa, { recursive: true, force: true }).catch(() => {});
  }
}

function chayCoTimeout(maLenh, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(maLenh[0], maLenh.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    const hetGio = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Slice quá ${timeoutMs / 1000}s — đã hủy (file quá phức tạp hoặc lỗi)`));
    }, timeoutMs);

    proc.on('error', (e) => {
      clearTimeout(hetGio);
      reject(e);
    });
    proc.on('exit', (code) => {
      clearTimeout(hetGio);
      if (code === 0) return resolve();
      reject(new Error(`orca-slicer thoát mã ${code}: ${stderr.slice(-2000) || '(không có stderr)'}`));
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cổng điều khiển — Next gọi vào đây
// ─────────────────────────────────────────────────────────────────────────────

function traLoi(res, status, duLieu) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(duLieu));
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

const server = createServer(async (req, res) => {
  if (TOKEN && req.headers['x-worker-token'] !== TOKEN) return traLoi(res, 401, { loi: 'Sai token' });

  const duongDan = new URL(req.url, 'http://localhost').pathname;

  try {
    if (req.method === 'POST' && duongDan === '/slice') {
      const body = await docBody(req);
      if (!body.jobId || !body.inputPath || !body.callbackUrl) {
        return traLoi(res, 400, { loi: 'Thiếu jobId/inputPath/callbackUrl' });
      }
      xepHangJob({
        jobId: body.jobId,
        inputPath: body.inputPath,
        infillPercent: Number(body.infillPercent) || 15,
        layerHeightMm: Number(body.layerHeightMm) || 0.2,
        printerModel: body.printerModel || '',
        callbackUrl: body.callbackUrl,
      });
      return traLoi(res, 202, { ok: true, dangCho: hangDoi.length, dangChay });
    }

    if (req.method === 'GET' && duongDan === '/trang-thai') {
      return traLoi(res, 200, { dangChay, dangCho: hangDoi.length, maxConcurrency: MAX_CONCURRENCY });
    }

    return traLoi(res, 404, { loi: 'Không có endpoint này' });
  } catch (error) {
    log('Lỗi xử lý request:', error.message);
    return traLoi(res, 500, { loi: error.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  log(`Cổng điều khiển: http://0.0.0.0:${PORT}`);
  if (!TOKEN) log('⚠ Chưa đặt SLICER_WORKER_TOKEN — cổng điều khiển đang không kiểm tra token.');
  log(`Thư mục đọc file upload: ${THU_MUC_UPLOAD}`);
  log(`Giới hạn song song: ${MAX_CONCURRENCY} job, timeout mỗi job ${SLICE_TIMEOUT_MS / 1000}s`);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
