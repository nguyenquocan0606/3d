/**
 * Gửi thông báo và ảnh camera lên Discord qua webhook.
 *
 * Dùng webhook chứ không dựng bot: không cần nuôi một tiến trình giữ kết nối gateway, không cần
 * token bot, và webhook đã đủ để đăng chữ lẫn ảnh. Đổi lại là không nhận được lệnh từ Discord —
 * chấp nhận, vì đây là kênh **một chiều để theo dõi**.
 *
 * Phân vai với Zalo: Discord là sổ cái nhận mọi thứ (kể cả ảnh từng lớp), Zalo chỉ nhận việc cần
 * người bỏ dở tay đang làm mà chạy ra xem.
 */

/** Màu viền trái của embed, theo mức độ. */
const MAU: Record<string, number> = {
  tin: 0x5865f2, // xanh tím Discord
  canhBao: 0xf59e0b,
  loi: 0xef4444,
};

/** Discord chặn file quá lớn ở webhook thường. Ảnh camera ~40-160KB nên không bao giờ chạm, nhưng cứ chặn cho chắc. */
const CO_TOI_DA = 8 * 1024 * 1024;

export type AnhGui = { ten: string; du: Buffer };

/**
 * Đăng một tin lên Discord. **Không bao giờ ném lỗi** — Discord hỏng thì lịch sử sự kiện vẫn phải
 * ghi và các kênh khác vẫn phải chạy.
 *
 * Trả về true nếu Discord nhận.
 */
export async function guiDiscord(input: {
  webhook: string;
  tieuDe: string;
  noiDung?: string;
  mucDo?: string;
  /** Các dòng "nhãn: giá trị" hiện thành bảng trong embed. */
  truong?: Array<{ ten: string; giaTri: string; ngang?: boolean }>;
  anh?: AnhGui[];
}): Promise<boolean> {
  if (!input.webhook) return false;

  const anh = (input.anh ?? []).filter((a) => a.du.length > 0 && a.du.length <= CO_TOI_DA);

  const embed: Record<string, unknown> = {
    title: input.tieuDe.slice(0, 256),
    color: MAU[input.mucDo ?? 'tin'] ?? MAU.tin,
    timestamp: new Date().toISOString(),
  };
  if (input.noiDung) embed.description = input.noiDung.slice(0, 4096);
  if (input.truong?.length) {
    embed.fields = input.truong.slice(0, 25).map((t) => ({
      name: t.ten.slice(0, 256),
      value: (t.giaTri || '—').slice(0, 1024),
      inline: t.ngang ?? true,
    }));
  }
  // Ảnh đính kèm chỉ hiện to trong embed nếu trỏ đúng tên file bằng attachment://
  if (anh.length > 0) embed.image = { url: `attachment://${anh[0].ten}` };

  const form = new FormData();
  form.append('payload_json', JSON.stringify({ embeds: [embed] }));
  anh.forEach((a, i) => {
    form.append(`files[${i}]`, new Blob([new Uint8Array(a.du)], { type: 'image/jpeg' }), a.ten);
  });

  try {
    const res = await fetch(input.webhook, { method: 'POST', body: form });
    if (res.ok) return true;
    // 429 = bị giới hạn tốc độ. Không thử lại ở đây: vòng gọi tiếp theo sẽ tự đến, mà xếp hàng
    // chờ trong này chỉ làm nghẽn cả luồng thông báo.
    console.warn(`[Discord] Trả về ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return false;
  } catch (e) {
    console.warn('[Discord] Không gửi được:', e instanceof Error ? e.message : e);
    return false;
  }
}
