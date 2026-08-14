'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Kích thước ảnh gốc lấy từ camera để phân tích (giữ đúng 16:9 như khung hiển thị) */
const SRC_W = 320;
const SRC_H = 180;
/** Kích thước ảnh sau khi crop (nắn phẳng) vùng 4 điểm */
export const CROP_W = 160;
export const CROP_H = 120;
/** Khoảng cách giữa 2 lần lấy mẫu (~30 fps) */
const SAMPLE_INTERVAL = 33;
/** Nhịp đẩy chỉ số chuyển động lên UI (tránh re-render 30 lần/giây) */
const UI_INTERVAL = 100;
/** Bỏ qua khung hình đầu để camera cân bằng sáng xong mới đếm */
const WARMUP_MS = 1000;
/** Số dòng lịch sử giữ lại */
const MAX_EVENTS = 500;
/** Nơi lưu phiên đếm để reload / mất mạng / sập trình duyệt vẫn không mất số */
const SESSION_KEY = 'camera-counter-session-v1';

interface StoredSession {
  startedAt: number;
  count: number;
  events: CountEvent[];
  nextId: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Vùng đếm mặc định: hình chữ nhật giữa khung hình */
export const DEFAULT_QUAD: Point[] = [
  { x: 0.25, y: 0.3 },
  { x: 0.75, y: 0.3 },
  { x: 0.75, y: 0.7 },
  { x: 0.25, y: 0.7 },
];

export interface CountEvent {
  id: number;
  index: number;
  at: number;
  /** Mức chuyển động lúc đếm (%) */
  motion: number;
  source: 'cam' | 'tay';
}

export interface MotionCounterOptions {
  /** Độ lệch độ sáng (0-255) để coi 1 pixel là "có thay đổi" */
  pixelThreshold: number;
  /** % pixel thay đổi trong vùng đếm để tính là 1 lần thả */
  triggerPercent: number;
  /** Thời gian khoá sau mỗi lần đếm (ms) - chống đếm trùng */
  cooldownMs: number;
  /** Vùng đếm: 4 điểm theo tỉ lệ khung hình (0-1), thứ tự trên-trái → trên-phải → dưới-phải → dưới-trái */
  quad: Point[];
  /** Kêu bíp mỗi lần đếm được */
  sound: boolean;
}

interface Homography {
  a: number; b: number; c: number;
  d: number; e: number; f: number;
  g: number; h: number;
}

/**
 * Phép biến hình chiếu đưa ô vuông đơn vị (0,0)-(1,0)-(1,1)-(0,1) về đúng 4 điểm của vùng đếm.
 * Dùng để lấy ngược từng pixel của ảnh crop -> pixel tương ứng trên ảnh gốc.
 */
function unitSquareToQuad(q: Point[]): Homography | null {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;

  // Vùng đếm là hình bình hành -> chỉ cần phép biến đổi affine
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    return {
      a: p1.x - p0.x, b: p2.x - p1.x, c: p0.x,
      d: p1.y - p0.y, e: p2.y - p1.y, f: p0.y,
      g: 0, h: 0,
    };
  }

  const den = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(den) < 1e-9) return null; // 4 điểm suy biến (thẳng hàng)

  const g = (dx3 * dy2 - dy3 * dx2) / den;
  const h = (dx1 * dy3 - dy1 * dx3) / den;
  return {
    a: p1.x - p0.x + g * p1.x, b: p3.x - p0.x + h * p3.x, c: p0.x,
    d: p1.y - p0.y + g * p1.y, e: p3.y - p0.y + h * p3.y, f: p0.y,
    g,
    h,
  };
}

/**
 * Đếm vật rơi qua camera:
 * 1. Cắt (nắn phẳng) vùng 4 điểm người dùng vẽ thành một ảnh chữ nhật.
 * 2. So sánh ảnh đó với khung hình trước đó (frame-differencing).
 * 3. Lượng pixel thay đổi vượt ngưỡng -> tính 1 lần thả và ghi vào lịch sử.
 */
export function useMotionCounter(options: MotionCounterOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** Canvas hiển thị ảnh đã crop cho người dùng soi */
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [events, setEvents] = useState<CountEvent[]>([]);
  const [motion, setMotion] = useState(0);
  /** Bật ~250ms sau mỗi lần đếm được, dùng cho hiệu ứng nháy trên UI */
  const [flash, setFlash] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  /** Thời điểm mở phiên đếm hiện tại; null = chưa đọc xong localStorage */
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);

  // Tuỳ chọn đọc trong vòng lặp qua ref để không phải dựng lại vòng lặp mỗi lần chỉnh slider
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });

  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const srcCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const cropImageRef = useRef<ImageData | null>(null);
  const grayRef = useRef<[Uint8ClampedArray, Uint8ClampedArray] | null>(null);
  const grayFlipRef = useRef(0);
  const hasPrevRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const activeRef = useRef(false);
  const countRef = useRef(0);
  const eventIdRef = useRef(0);
  const lastHitRef = useRef(0);
  const startedAtRef = useRef(0);
  const lastSampleRef = useRef(0);
  const lastUiRef = useRef(0);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Đọc lại phiên đang dở. Phải đọc sau khi mount, đọc lúc render sẽ lệch với HTML dựng từ server.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let startedAt = Date.now();
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw) as StoredSession;
        if (typeof s.count === 'number' && Array.isArray(s.events)) {
          countRef.current = s.count;
          eventIdRef.current = typeof s.nextId === 'number' ? s.nextId : (s.events[0]?.id ?? -1) + 1;
          setCount(s.count);
          setEvents(s.events);
          if (typeof s.startedAt === 'number') startedAt = s.startedAt;
        }
      }
    } catch {
      // Dữ liệu hỏng -> coi như mở phiên mới
    }
    setSessionStartedAt(startedAt);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Ghi lại ngay sau mỗi thay đổi (không debounce) để đóng máy đột ngột cũng không mất lượt vừa đếm
  useEffect(() => {
    if (sessionStartedAt === null) return;
    try {
      const data: StoredSession = { startedAt: sessionStartedAt, count, events, nextId: eventIdRef.current };
      localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch {
      // Hết dung lượng localStorage -> vẫn đếm bình thường, chỉ không lưu được
    }
  }, [sessionStartedAt, count, events]);

  const pushEvent = useCallback((source: CountEvent['source'], motionValue: number) => {
    countRef.current += 1;
    setCount(countRef.current);
    const ev: CountEvent = {
      id: eventIdRef.current++,
      index: countRef.current,
      at: Date.now(),
      motion: motionValue,
      source,
    };
    setEvents((prev) => [ev, ...prev].slice(0, MAX_EVENTS));
  }, []);

  /** Cộng tay 1 sản phẩm (khi camera bỏ sót) */
  const addManual = useCallback(() => pushEvent('tay', 0), [pushEvent]);

  /** Bỏ lần đếm gần nhất (khi camera đếm nhầm) */
  const undo = useCallback(() => {
    if (countRef.current <= 0) return;
    countRef.current -= 1;
    setCount(countRef.current);
    setEvents((prev) => prev.slice(1));
  }, []);

  /** Kết thúc phiên hiện tại và mở phiên mới - chỗ DUY NHẤT xoá lịch sử */
  const reset = useCallback(() => {
    countRef.current = 0;
    eventIdRef.current = 0;
    setCount(0);
    setEvents([]);
    setSessionStartedAt(Date.now());
  }, []);

  const beep = useCallback(() => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = (audioRef.current ??= new AC());
      if (ctx.state === 'suspended') void ctx.resume();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      // Sóng vuông + tần số ~2kHz (vùng tai người nghe rõ nhất) để tít xuyên qua tiếng máy in
      osc.type = 'square';
      osc.frequency.value = 2000;
      gain.gain.setValueAtTime(0.0001, t);
      // Lên biên độ tối đa (1.0) trong 3ms - vào thẳng 1.0 sẽ nghe "bụp" ở loa
      gain.gain.exponentialRampToValueAtTime(1, t + 0.003);
      gain.gain.setValueAtTime(1, t + 0.13);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    } catch {
      // Không có audio thì thôi, không ảnh hưởng việc đếm
    }
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    hasPrevRef.current = false;
    activeRef.current = false;
    setIsRunning(false);
    setMotion(0);
  }, []);

  const start = useCallback(async (id?: string | null) => {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError(
        'Trình duyệt không cho phép mở camera. Trang phải chạy trên https:// hoặc localhost (mở bằng IP LAN + http sẽ bị chặn).',
      );
      return;
    }

    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      // Xin thẳng khung 16:9 từ camera; cam nào không có thì trình duyệt tự cắt/co về gần nhất
      const shape = { width: { ideal: 1280 }, height: { ideal: 720 }, aspectRatio: { ideal: 16 / 9 } };
      const stream = await navigator.mediaDevices.getUserMedia({
        video: id ? { deviceId: { exact: id }, ...shape } : { facingMode: { ideal: 'environment' }, ...shape },
        audio: false,
      });
      streamRef.current = stream;
      setDeviceId(id ?? stream.getVideoTracks()[0]?.getSettings().deviceId ?? null);

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }

      // Danh sách camera chỉ có label sau khi đã được cấp quyền
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'));

      hasPrevRef.current = false;
      activeRef.current = false;
      startedAtRef.current = performance.now();
      setIsRunning(true);
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Bạn đã từ chối quyền camera. Hãy cấp lại quyền trong thanh địa chỉ của trình duyệt.'
          : name === 'NotFoundError'
            ? 'Không tìm thấy camera nào trên thiết bị này.'
            : `Không mở được camera: ${e instanceof Error ? e.message : String(e)}`,
      );
      setIsRunning(false);
    }
  }, []);

  // Vòng lặp phân tích khung hình
  useEffect(() => {
    if (!isRunning) return;

    if (!srcCtxRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = SRC_W;
      canvas.height = SRC_H;
      srcCtxRef.current = canvas.getContext('2d', { willReadFrequently: true });
      cropImageRef.current = srcCtxRef.current?.createImageData(CROP_W, CROP_H) ?? null;
      grayRef.current = [new Uint8ClampedArray(CROP_W * CROP_H), new Uint8ClampedArray(CROP_W * CROP_H)];
    }
    const srcCtx = srcCtxRef.current;
    const cropImage = cropImageRef.current;
    const grays = grayRef.current;
    if (!srcCtx || !cropImage || !grays) {
      setError('Trình duyệt không hỗ trợ canvas 2D.');
      return;
    }

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);

      const now = performance.now();
      if (now - lastSampleRef.current < SAMPLE_INTERVAL) return;
      lastSampleRef.current = now;

      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;

      const { quad, pixelThreshold, triggerPercent, cooldownMs, sound } = optsRef.current;
      // Đổi vùng đếm sang toạ độ pixel của ảnh gốc
      const H = unitSquareToQuad(quad.map((p) => ({ x: p.x * SRC_W, y: p.y * SRC_H })));
      if (!H) return;

      srcCtx.drawImage(video, 0, 0, SRC_W, SRC_H);
      const src = srcCtx.getImageData(0, 0, SRC_W, SRC_H).data;

      const gray = grays[grayFlipRef.current];
      const prev = grays[1 - grayFlipRef.current];
      grayFlipRef.current = 1 - grayFlipRef.current;
      const out = cropImage.data;

      // Lấy ngược từng pixel của ảnh crop từ ảnh gốc
      let i = 0;
      for (let cy = 0; cy < CROP_H; cy++) {
        const v = (cy + 0.5) / CROP_H;
        for (let cx = 0; cx < CROP_W; cx++, i++) {
          const u = (cx + 0.5) / CROP_W;
          const den = H.g * u + H.h * v + 1;
          const sx = (H.a * u + H.b * v + H.c) / den;
          const sy = (H.d * u + H.e * v + H.f) / den;
          const px = sx < 0 ? 0 : sx >= SRC_W ? SRC_W - 1 : sx | 0;
          const py = sy < 0 ? 0 : sy >= SRC_H ? SRC_H - 1 : sy | 0;
          const s = (py * SRC_W + px) * 4;
          const r = src[s];
          const g2 = src[s + 1];
          const b2 = src[s + 2];
          // Xám nhanh: xấp xỉ luminance
          gray[i] = (r * 77 + g2 * 151 + b2 * 28) >> 8;
          const o = i * 4;
          out[o] = r;
          out[o + 1] = g2;
          out[o + 2] = b2;
          out[o + 3] = 255;
        }
      }

      // Vẽ ảnh crop cho người dùng xem
      const cropCanvas = cropCanvasRef.current;
      if (cropCanvas) cropCanvas.getContext('2d')?.putImageData(cropImage, 0, 0);

      if (!hasPrevRef.current) {
        hasPrevRef.current = true;
        return;
      }
      if (now - startedAtRef.current < WARMUP_MS) return;

      let changed = 0;
      for (let k = 0; k < gray.length; k++) {
        if (Math.abs(gray[k] - prev[k]) > pixelThreshold) changed++;
      }
      const ratio = (changed / gray.length) * 100;

      if (now - lastUiRef.current > UI_INTERVAL) {
        lastUiRef.current = now;
        setMotion(ratio);
      }

      if (!activeRef.current) {
        if (ratio >= triggerPercent && now - lastHitRef.current > cooldownMs) {
          activeRef.current = true;
          lastHitRef.current = now;
          pushEvent('cam', ratio);
          setFlash(true);
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
          flashTimerRef.current = setTimeout(() => setFlash(false), 250);
          if (sound) beep();
        }
      } else if (ratio < triggerPercent * 0.5) {
        // Vật đã đi qua hết, sẵn sàng cho lần sau
        activeRef.current = false;
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isRunning, beep, pushEvent]);

  // Dọn dẹp khi rời trang
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    void audioRef.current?.close();
  }, []);

  return {
    videoRef,
    cropCanvasRef,
    isRunning,
    error,
    count,
    events,
    sessionStartedAt,
    motion,
    flash,
    devices,
    deviceId,
    start,
    stop,
    addManual,
    undo,
    reset,
  };
}
