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
