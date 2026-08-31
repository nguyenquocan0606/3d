/**
 * Cấu hình trạm cân MQTT dùng chung toàn app.
 * Broker được proxy qua Next.js rewrite `/mqtt` → mosquitto websocket (xem next.config.ts).
 */

/** Topic ESPHome publish khối lượng cân (gram) */
export const SCALE_TOPIC = 'esp-can/sensor/c__n_n___ng/state';

/** URL broker MQTT qua websocket, tự chọn ws/wss theo protocol trang hiện tại */
export function getScaleBrokerUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:3000/mqtt';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/mqtt`;
}

/**
 * Làm tròn gram để hiển thị: về số nguyên gần nhất, đúng mốc 0.5 thì làm tròn LÊN
 * (125.5 → 126, 125.4 → 125). Dùng chung cho mọi chỗ hiện số cân.
 */
export function roundGram(grams: number): number {
  return Math.floor(grams + 0.5);
}

/** Chuỗi gram đã làm tròn để hiển thị */
export function formatGram(grams: number): string {
  return roundGram(grams).toString();
}
