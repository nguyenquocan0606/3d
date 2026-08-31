import { useState, useEffect, useCallback, useRef } from 'react';
import mqtt from 'mqtt';

interface UseScaleMqttProps {
  brokerUrl: string; // VD: 'ws://192.168.1.100:9001'
  topic: string;     // VD: 'espscale/sensor/live_weight/state'
}

/**
 * Hiệu chuẩn 2 điểm: gram hiển thị = (số thô - zeroRaw) * gain
 * - zeroRaw: số thô khi bàn cân trống (sửa sai lệch điểm 0)
 * - gain:    hệ số khuếch đại (sửa sai lệch độ dốc, chỉ chỉnh được bằng quả cân chuẩn)
 */
export interface ScaleCalibration {
  zeroRaw: number;
  gain: number;
  /** Thời điểm hiệu chuẩn gần nhất (epoch ms) */
  updatedAt?: number;
}

/** Trạng thái số cân: đứng yên / đang dao động / không còn nhận được dữ liệu */
export type ScaleStability = 'stable' | 'unstable' | 'stale';

const CAL_KEY = 'scale_calibration';
const LEGACY_OFFSET_KEY = 'scale_offset';
const CAL_EVENT = 'scaleCalibrationChanged';

/** Cửa sổ mẫu dùng để lấy trung bình và xét độ ổn định */
const SAMPLE_WINDOW_MS = 2500;
/** Biên độ dao động tối đa (gram) để coi là số đã đứng yên */
const STABLE_SPREAD_G = 2;
/** Quá lâu không có bản tin mới thì coi như mất số */
const STALE_AFTER_MS = 4000;

/** Cửa sổ mẫu dùng để lọc nhiễu cho số hiển thị (ngắn hơn cửa sổ xét ổn định cho nhạy) */
const FILTER_WINDOW_MS = 1500;
/** Tỉ lệ mẫu bị cắt ở MỖI đầu trước khi lấy trung bình — vứt các mẫu vọt lên/tụt xuống */
const TRIM_RATIO = 0.2;
/** Chênh lệch nhỏ hơn mức này thì GIỮ NGUYÊN số đang hiện — chống nhảy số ±1 g */
const DISPLAY_LOCK_G = 0.7;
/** Lệch hơn mức này = vừa đặt/nhấc vật thật → bỏ mẫu cũ để số bám theo ngay */
const FAST_TRACK_G = 5;
/** Nhịp tính lại số hiển thị */
const DISPLAY_TICK_MS = 150;

const DEFAULT_CALIBRATION: ScaleCalibration = { zeroRaw: 0, gain: 1 };

/**
 * Trung bình sau khi cắt bớt hai đầu (trimmed mean): sắp xếp các mẫu, bỏ TRIM_RATIO
 * ở đầu dưới và đầu trên rồi mới lấy trung bình. Cách này vừa hạ nhiễu ngẫu nhiên
 * như trung bình cộng, vừa miễn nhiễm với vài mẫu vọt bất thường như trung vị.
 */
function trimmedMean(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * TRIM_RATIO);
  const kept = sorted.length - cut * 2 >= 1 ? sorted.slice(cut, sorted.length - cut) : sorted;
  return kept.reduce((sum, v) => sum + v, 0) / kept.length;
}

function readStoredCalibration(): ScaleCalibration {
  if (typeof window === 'undefined') return DEFAULT_CALIBRATION;
  try {
    const raw = localStorage.getItem(CAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ScaleCalibration>;
      const zeroRaw = Number(parsed?.zeroRaw);
      const gain = Number(parsed?.gain);
      if (isFinite(zeroRaw) && isFinite(gain) && gain > 0) {
        return { zeroRaw, gain, updatedAt: parsed?.updatedAt };
      }
    }
    // Dữ liệu cũ chỉ có mức bù trừ cộng thêm: hiển thị = thô + offset  →  zeroRaw = -offset
    const legacy = localStorage.getItem(LEGACY_OFFSET_KEY);
    if (legacy) {
      const offset = parseFloat(legacy);
      if (isFinite(offset)) return { zeroRaw: -offset, gain: 1 };
    }
  } catch {
    // localStorage hỏng/không dùng được thì quay về mặc định
  }
  return DEFAULT_CALIBRATION;
}

export const useScaleMqtt = ({ brokerUrl, topic }: UseScaleMqttProps) => {
  const [rawWeight, setRawWeight] = useState<number>(0);
  /** Số gram đã lọc nhiễu — dùng cho MỌI chỗ hiển thị/chốt số */
  const [steadyWeight, setSteadyWeight] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [calibration, setCalibration] = useState<ScaleCalibration>(DEFAULT_CALIBRATION);
  const [stability, setStability] = useState<ScaleStability>('stale');

  const calibrationRef = useRef<ScaleCalibration>(DEFAULT_CALIBRATION);
  const rawWeightRef = useRef<number>(0);
  /** Các mẫu thô gần đây, dùng để lấy trung bình khi hiệu chuẩn/trừ bì */
  const samplesRef = useRef<{ t: number; v: number }[]>([]);
  const lastMessageAtRef = useRef<number>(0);
  /** Thời điểm số nhảy hẳn một nấc (đặt/nhấc vật) — mẫu trước đó không còn giá trị */
  const jumpAtRef = useRef<number>(0);
  const steadyWeightRef = useRef<number>(0);

  // Giữ bản sao mới nhất cho các hàm chạy ngoài vòng render (timer, callback MQTT)
  useEffect(() => {
    rawWeightRef.current = rawWeight;
  }, [rawWeight]);

  // Nạp hiệu chuẩn đã lưu (chỉ chạy phía client)
  useEffect(() => {
    setCalibration(readStoredCalibration());
  }, []);

  // Đồng bộ hiệu chuẩn giữa các tab / các hook khác trong cùng tab
  useEffect(() => {
    const onLocalChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as ScaleCalibration | undefined;
      if (detail && isFinite(detail.zeroRaw) && detail.gain > 0) setCalibration(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === CAL_KEY || e.key === LEGACY_OFFSET_KEY) setCalibration(readStoredCalibration());
    };
    window.addEventListener(CAL_EVENT, onLocalChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CAL_EVENT, onLocalChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const saveCalibration = useCallback((next: ScaleCalibration) => {
    const value: ScaleCalibration = { ...next, updatedAt: Date.now() };
    setCalibration(value);
    calibrationRef.current = value;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CAL_KEY, JSON.stringify(value));
        // Xoá dữ liệu cũ để lần sau không bị nạp đè lên hiệu chuẩn mới
        localStorage.removeItem(LEGACY_OFFSET_KEY);
      } catch {
        // bỏ qua nếu trình duyệt chặn localStorage
      }
      window.dispatchEvent(new CustomEvent(CAL_EVENT, { detail: value }));
    }
  }, []);

  /**
   * Tính lại số hiển thị đã lọc nhiễu.
   *  1) Lấy trung bình đã cắt hai đầu trên các mẫu trong FILTER_WINDOW_MS (bỏ mẫu trước cú nhảy).
   *  2) Khoá số: lệch dưới DISPLAY_LOCK_G thì giữ nguyên số cũ, nên số không nhảy lăng tăng ±1 g.
   * `force` dùng khi vừa đổi hiệu chuẩn — phải cập nhật ngay dù lệch nhỏ.
   */
  const refreshSteady = useCallback((force = false) => {
    const now = Date.now();
    const inWindow = samplesRef.current.filter(
      (s) => s.t >= jumpAtRef.current && now - s.t <= FILTER_WINDOW_MS,
    );
    // Không có mẫu mới (mất tín hiệu) thì giữ nguyên số cuối cùng thay vì nhảy về 0
    if (inWindow.length === 0) return;
    const cal = calibrationRef.current;
    const candidate = (trimmedMean(inWindow.map((s) => s.v)) - cal.zeroRaw) * cal.gain;
    if (!force && Math.abs(candidate - steadyWeightRef.current) < DISPLAY_LOCK_G) return;
    steadyWeightRef.current = candidate;
    setSteadyWeight(candidate);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => refreshSteady(), DISPLAY_TICK_MS);
    return () => clearInterval(timer);
  }, [refreshSteady]);

  // Đổi điểm 0 / hệ số thì số hiển thị phải nhảy theo ngay, không chờ khoá số nhả
  useEffect(() => {
    calibrationRef.current = calibration;
    refreshSteady(true);
  }, [calibration, refreshSteady]);

  /** Đánh giá lại độ ổn định + dọn các mẫu đã quá cũ */
  const evaluateStability = useCallback(() => {
    const now = Date.now();
    const inWindow = samplesRef.current.filter((s) => now - s.t <= SAMPLE_WINDOW_MS);
    samplesRef.current = inWindow;

    let next: ScaleStability;
    if (!lastMessageAtRef.current || now - lastMessageAtRef.current > STALE_AFTER_MS || inWindow.length === 0) {
      next = 'stale';
    } else {
      const values = inWindow.map((s) => s.v);
      const spread = (Math.max(...values) - Math.min(...values)) * calibrationRef.current.gain;
      next = spread <= STABLE_SPREAD_G ? 'stable' : 'unstable';
    }
    setStability((prev) => (prev === next ? prev : next));
  }, []);

  useEffect(() => {
    const timer = setInterval(evaluateStability, 1000);
    return () => clearInterval(timer);
  }, [evaluateStability]);

  useEffect(() => {
    // Kết nối tới MQTT Broker qua giao thức WebSockets.
    // reconnectPeriod: mqtt.js tự động kết nối lại khi mất mạng/broker restart.
    const client = mqtt.connect(brokerUrl, { reconnectPeriod: 3000 });

    client.on('connect', () => {
      setIsConnected(true);
      client.subscribe(topic);
    });

    client.on('message', (receivedTopic, message) => {
      if (receivedTopic === topic) {
        const val = parseFloat(message.toString());
        if (!isNaN(val)) {
          const now = Date.now();
          const cal = calibrationRef.current;
          lastMessageAtRef.current = now;
          // Số nhảy hẳn một nấc = có người đặt/nhấc vật, không phải nhiễu:
          // đánh dấu mốc để bộ lọc bỏ hết mẫu cũ, số bám theo ngay lập tức.
          if (Math.abs((val - cal.zeroRaw) * cal.gain - steadyWeightRef.current) > FAST_TRACK_G) {
            jumpAtRef.current = now;
          }
          samplesRef.current = [...samplesRef.current, { t: now, v: val }].slice(-60);
          setRawWeight(val);
          evaluateStability();
          refreshSteady();
        }
      }
    });

    client.on('error', (err) => {
      // KHÔNG gọi client.end() ở đây — end() sẽ tắt cơ chế tự reconnect
      // khiến trạm cân chết vĩnh viễn cho tới khi F5.
      console.error('Lỗi MQTT: ', err);
      setIsConnected(false);
    });

    client.on('close', () => {
      setIsConnected(false);
    });

    client.on('offline', () => {
      setIsConnected(false);
    });

    // Cleanup chống memory leak
    return () => {
      if (client) {
        client.end();
      }
    };
  }, [brokerUrl, topic, evaluateStability, refreshSteady]);

  const weight = (rawWeight - calibration.zeroRaw) * calibration.gain;

  /** Số thô đã lọc nhiễu trong cửa sổ mẫu — dùng khi trừ bì/hiệu chuẩn */
  const getStableRaw = useCallback((): number => {
    const now = Date.now();
    const inWindow = samplesRef.current.filter(
      (s) => s.t >= jumpAtRef.current && now - s.t <= SAMPLE_WINDOW_MS,
    );
    if (inWindow.length === 0) return rawWeightRef.current;
    return trimmedMean(inWindow.map((s) => s.v));
  }, []);

  /** Khối lượng đã hiệu chuẩn, lấy trung bình nhiều mẫu */
  const getStableWeight = useCallback((): number => {
    const cal = calibrationRef.current;
    return (getStableRaw() - cal.zeroRaw) * cal.gain;
  }, [getStableRaw]);

  /** Lấy lại điểm 0 khi bàn cân trống (giữ nguyên hệ số) */
  const captureZero = useCallback(() => {
    saveCalibration({ ...calibrationRef.current, zeroRaw: getStableRaw() });
  }, [getStableRaw, saveCalibration]);

  /** Ép số hiển thị hiện tại bằng đúng `target` gram bằng cách dời điểm 0 */
  const setDisplayWeight = useCallback(
    (target: number) => {
      const cal = calibrationRef.current;
      saveCalibration({ ...cal, zeroRaw: getStableRaw() - target / cal.gain });
    },
    [getStableRaw, saveCalibration],
  );

  /**
   * Hiệu chuẩn hệ số bằng quả cân chuẩn: đặt vật đã biết khối lượng lên cân
   * (sau khi đã lấy điểm 0) rồi gọi hàm này với khối lượng thật của nó.
   */
  const calibrateSpan = useCallback(
    (knownWeight: number): { ok: boolean; message: string } => {
      if (!isFinite(knownWeight) || knownWeight <= 0) {
        return { ok: false, message: 'Khối lượng chuẩn phải là số lớn hơn 0.' };
      }
      const cal = calibrationRef.current;
      const delta = getStableRaw() - cal.zeroRaw;
      if (delta <= 0) {
        return { ok: false, message: 'Cân chưa nhận thấy vật chuẩn. Hãy đặt vật lên bàn cân rồi thử lại.' };
      }
      const gain = knownWeight / delta;
      if (gain < 0.2 || gain > 5) {
        return {
          ok: false,
          message: `Hệ số tính ra bất thường (${gain.toFixed(3)}). Kiểm tra lại điểm 0 và khối lượng vật chuẩn.`,
        };
      }
      saveCalibration({ ...cal, gain });
      return { ok: true, message: `Đã hiệu chuẩn, hệ số mới ${gain.toFixed(4)}.` };
    },
    [getStableRaw, saveCalibration],
  );

  const resetCalibration = useCallback(() => {
    saveCalibration({ ...DEFAULT_CALIBRATION });
  }, [saveCalibration]);

  // --- Tương thích ngược với API cũ (mức bù trừ cộng thêm) ---
  const offset = weight - rawWeight;
  const setOffset = useCallback(
    (newOffset: number) => {
      setDisplayWeight(rawWeightRef.current + newOffset);
    },
    [setDisplayWeight],
  );

  return {
    weight,
    /** Số gram đã lọc nhiễu + khoá số — dùng cho mọi chỗ hiển thị cho người dùng */
    steadyWeight,
    rawWeight,
    isConnected,
    stability,
    calibration,
    getStableRaw,
    getStableWeight,
    captureZero,
    setDisplayWeight,
    calibrateSpan,
    resetCalibration,
    offset,
    setOffset,
  };
};
