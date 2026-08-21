import type { MqttClient } from 'mqtt';
import { xoaTheoTienTo } from '@/utils/bo-nho-dem';

/**
 * Báo cho các máy đang chạy app biết "có thay đổi, kéo delta đi".
 *
 * Không dựng WebSocket server riêng: hệ thống **đã có** mosquitto cho trạm cân
 * (xem `mosquitto.conf`), app cũng đã nối sẵn broker đó. Thêm một topic rẻ hơn
 * nhiều so với dựng và nuôi một kênh realtime thứ hai.
 *
 * Server nối cổng MQTT chuẩn 1883, còn app di động và web nối cổng websocket 9001.
 */

/** Topic app lắng nghe. Payload: `{ tables: string[], at: string }`. */
export const TOPIC_DONG_BO = '3dmanage/sync';

const BROKER = process.env.MQTT_URL || 'mqtt://127.0.0.1:1883';

let client: MqttClient | null = null;
let dangNoi = false;
/** Chỉ kêu ca một lần cho mỗi lần mất kết nối, không spam log mỗi request. */
let daBaoLoi = false;

async function layClient(): Promise<MqttClient | null> {
  if (client?.connected) return client;
  if (dangNoi) return null;

  dangNoi = true;
  try {
    const { connect } = await import('mqtt');
    const c = connect(BROKER, {
      clientId: `3dmanage-server-${process.pid}`,
      reconnectPeriod: 10_000,
      connectTimeout: 5_000,
      clean: true,
    });

    c.on('connect', () => {
      daBaoLoi = false;
      console.log('[Đồng bộ] Đã nối broker MQTT để báo thay đổi.');
    });
    c.on('error', (err) => {
      if (!daBaoLoi) {
        daBaoLoi = true;
        console.warn('[Đồng bộ] Không nối được broker MQTT:', err.message);
      }
    });

    client = c;
    return c;
  } catch (err) {
    console.warn('[Đồng bộ] Lỗi khởi tạo MQTT:', err);
    return null;
  } finally {
    dangNoi = false;
  }
}

/**
 * Bắn thông báo có thay đổi. **Không bao giờ ném lỗi.**
 *
 * Đây chỉ là đường tăng tốc: mất thông báo thì app vẫn tự kéo delta theo chu kỳ,
 * chỉ chậm hơn. Để nó làm hỏng một request ghi dữ liệu thì lợi bất cập hại.
 */
export async function baoThayDoi(tables: string[]): Promise<void> {
  if (tables.length === 0) return;

  // Xóa cache dashboard để lần poll tiếp theo thấy số mới ngay, không phải chờ hết TTL.
  // canh-bao và tong-quan bị ảnh hưởng bởi mọi thay đổi; xu-huong chỉ đổi khi có dữ liệu mới thật sự
  // nhưng rẻ hơn là xóa luôn, tránh nhầm.
  xoaTheoTienTo('dashboard:');

  try {
    const c = await layClient();
    if (!c?.connected) return;
    c.publish(
      TOPIC_DONG_BO,
      JSON.stringify({ tables, at: new Date().toISOString() }),
      { qos: 0 },
    );
  } catch {
    // Im lặng có chủ đích — xem doc phía trên.
  }
}
