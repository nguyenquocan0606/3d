import { afterEach, describe, expect, it, vi } from 'vitest';

import { doiCookieLayPhienEshop, LoiPhienHetHan, timJwt } from '../misa-login.service';

/**
 * `timJwt` là chỗ moi token MISA ID ra khỏi phản hồi đăng nhập. Nó hỏng thì đăng nhập vẫn báo
 * "thành công" nhưng không có Bearer token — đúng lỗi đã gặp ngày 15/08/2026.
 *
 * MISA không cam kết cấu trúc phản hồi nên các ca dưới đây mô phỏng những hình dạng đã gặp và
 * những hình dạng hợp lý khác, để lần sau MISA đổi kiểu thì test chỉ ra ngay.
 */

// JWT giả, đúng khuôn 3 đoạn base64url — không phải token thật.
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMiJ9.abc-DEF_123';

describe('timJwt', () => {
  it('tìm được token nằm thẳng trong object', () => {
    expect(timJwt({ AccessToken: JWT })).toBe(JWT);
  });

  it('tìm được token nằm sâu nhiều tầng', () => {
    expect(timJwt({ a: { b: { c: { d: { AccessToken: JWT } } } } })).toBe(JWT);
  });

  it('mở được JSON bị đóng gói thành chuỗi — ca làm hỏng bản cũ', () => {
    // MISA hay trả `Data` kiểu này. Bản cũ so cả cục chuỗi với khuôn JWT rồi bỏ cuộc.
    expect(timJwt(JSON.stringify({ AccessToken: JWT, TenantId: 'x' }))).toBe(JWT);
  });

  it('mở được chuỗi JSON lồng trong chuỗi JSON', () => {
    expect(timJwt({ Data: JSON.stringify({ Inner: JSON.stringify({ AccessToken: JWT }) }) })).toBe(JWT);
  });

  it('lấy được token khi nó lồng trong chuỗi dài hơn', () => {
    expect(timJwt({ Authorization: `Bearer ${JWT}` })).toBe(JWT);
  });

  it('tìm được token trong mảng', () => {
    expect(timJwt({ Tokens: [{ loai: 'refresh', giaTri: 'khong-phai-jwt' }, { giaTri: JWT }] })).toBe(JWT);
  });

  it('trả null khi thật sự không có token', () => {
    expect(timJwt({ Success: true, Data: { TenantId: 'abc', SoDu: 12 } })).toBeNull();
  });

  it('không nhầm chuỗi thường hay GUID thành token', () => {
    expect(timJwt({ id: 'a38f9189-ad87-11ef-a35e-005056b28600', ghiChu: 'eyJ thiếu đoạn' })).toBeNull();
  });

  it('không chết khi gặp JSON hỏng', () => {
    expect(timJwt('{"AccessToken": "eyJ')).toBeNull();
  });

  it('không lặp vô hạn khi object tự trỏ vào chính nó', () => {
    const vong: Record<string, unknown> = { ten: 'vong' };
    vong.chinhNo = vong;
    expect(timJwt(vong)).toBeNull();
  });
});

/**
 * `doiCookieLayPhienEshop` là đường CHÍNH để có Bearer token: nó đi hết chuỗi chuyển hướng SSO của
 * MISA bằng cookie đăng nhập, thay cho việc bắt người dùng tự chép `KeyCacheMID` từ Local Storage.
 *
 * Chuỗi thật (đo bằng tài khoản thật ngày 15/08/2026):
 *   /eshop/api/oauth/oauth/amisplcallback
 *     → /eshop/management/login-amispl-callback?sid=…&tenantId=…&env=g3
 *
 * Các test dưới đây giả lập chuỗi đó để nếu MISA đổi hình dạng thì lỗi hiện ra ở đây, chứ không phải
 * lúc đang đồng bộ đơn hàng.
 */
describe('doiCookieLayPhienEshop', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const COOKIE = 'x-deviceid=abc; x-tenantid=tid-1';

  /** Dựng fetch giả: trả 302 theo `chuyenHuong`, còn lại là JSON của API đổi phiên. */
  function gaLapFetch(chuyenHuong: Record<string, string>, phien: unknown) {
    const daGoi: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        daGoi.push(url);
        const ke = chuyenHuong[url];
        if (ke) {
          return {
            status: 302,
            ok: false,
            headers: { get: (h: string) => (h.toLowerCase() === 'location' ? ke : null) },
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => JSON.stringify(phien),
        } as unknown as Response;
      }),
    );
    return daGoi;
  }

  const VAO = 'https://amisapp.misa.vn/eshop/api/oauth/oauth/amisplcallback';

  it('đi hết chuỗi SSO rồi đổi `sid` lấy Bearer token — không cần chép tay gì', async () => {
    const daGoi = gaLapFetch(
      {
        [VAO]: 'https://amisapp.misa.vn/eshop/management/login-amispl-callback?sid=SID-1&tenantId=TID-1&env=g2',
      },
      { token: 'bearer-moi', _eshop_rf_token: 'rf-moi', currentBranch: { branch_id: 'br-1' } },
    );

    const { phien } = await doiCookieLayPhienEshop(COOKIE);

    expect(phien.token).toBe('bearer-moi');
    expect(phien._eshop_rf_token).toBe('rf-moi');
    // Phải gọi đúng nhánh login-amis, đúng env lấy từ URL callback (g2, không phải mặc định g3).
    expect(daGoi.at(-1)).toBe(
      'https://amisapp.misa.vn/eshop/g2/api/auth/Accounts/login-amis/TID-1?sessionId=SID-1&force=true',
    );
  });

  it('nhận cả nhánh MISA ID (`tokenMisaId` trên URL callback)', async () => {
    const daGoi = gaLapFetch(
      {
        [VAO]: 'https://amisapp.misa.vn/eshop/management/login-callback?tokenMisaId=MID-9&tenantId=TID-2&env=g3',
      },
      { token: 'bearer-2' },
    );

    const { phien } = await doiCookieLayPhienEshop(COOKIE);

    expect(phien.token).toBe('bearer-2');
    expect(daGoi.at(-1)).toBe(
      'https://amisapp.misa.vn/eshop/g3/api/auth/Accounts/login/TID-2?tokenMisaId=MID-9&force=true',
    );
  });

  it('nối được Location tương đối', async () => {
    gaLapFetch(
      {
        [VAO]: '/eshop/management/login-amispl-callback?sid=SID-3&tenantId=TID-3&env=g2',
      },
      { token: 'bearer-3' },
    );

    await expect(doiCookieLayPhienEshop(COOKIE)).resolves.toMatchObject({
      phien: { token: 'bearer-3' },
    });
  });

  it('không nhầm chặng `/eshop?sid=` giữa đường là vé thật', async () => {
    // Vé nội bộ của AMIS: có `sid` nhưng không có tenantId, và `env` là "Production" chứ không phải
    // g2/g3. Bản đầu dừng ngay ở đây rồi gọi API với tenantId rỗng — đúng lỗi bắt được lúc chạy thật.
    const daGoi = gaLapFetch(
      {
        [VAO]: 'https://amisapp.misa.vn/eshop?sid=VE-NOI-BO&lid=vi&tcode=abc&env=Production',
        'https://amisapp.misa.vn/eshop?sid=VE-NOI-BO&lid=vi&tcode=abc&env=Production':
          'https://amisapp.misa.vn/eshop/management/login-amispl-callback?sid=SID-THAT&tenantId=TID-4&env=g3',
      },
      { token: 'bearer-4' },
    );

    const { phien } = await doiCookieLayPhienEshop(COOKIE);

    expect(phien.token).toBe('bearer-4');
    expect(daGoi.at(-1)).toBe(
      'https://amisapp.misa.vn/eshop/g3/api/auth/Accounts/login-amis/TID-4?sessionId=SID-THAT&force=true',
    );
  });

  it('báo hết hạn bằng LoiPhienHetHan khi MISA đá về trang đăng nhập', async () => {
    gaLapFetch({ [VAO]: 'https://amisapp.misa.vn/login?href=abc' }, {});

    // Phải đúng lớp lỗi này, không chỉ đúng chữ: ô trạng thái dựa vào nó để phân biệt "hết phiên"
    // (cần đăng nhập lại) với "MISA lỗi/mạng hỏng" (chờ tí rồi thử lại).
    await expect(doiCookieLayPhienEshop(COOKIE)).rejects.toBeInstanceOf(LoiPhienHetHan);
  });

  it('lỗi mạng KHÔNG bị hiểu nhầm thành hết phiên', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('mạng hỏng'); }));

    await expect(doiCookieLayPhienEshop(COOKIE)).rejects.not.toBeInstanceOf(LoiPhienHetHan);
  });

  it('không gửi cookie ra tên miền lạ', async () => {
    gaLapFetch({ [VAO]: 'https://ke-gian.example.com/thu-cookie' }, {});

    await expect(doiCookieLayPhienEshop(COOKIE)).rejects.toThrow(/ke-gian\.example\.com/);
  });

  it('báo rõ khi tài khoản không có cửa hàng eShop nào', async () => {
    gaLapFetch(
      { [VAO]: 'https://amisapp.misa.vn/eshop/management/login-callback?hasTenant=false' },
      {},
    );

    await expect(doiCookieLayPhienEshop(COOKIE)).rejects.toThrow(/không có cửa hàng/i);
  });

  it('không lặp vô hạn khi MISA chuyển hướng vòng tròn', async () => {
    gaLapFetch({ [VAO]: VAO }, {});

    await expect(doiCookieLayPhienEshop(COOKIE)).rejects.toThrow(/chuyển hướng quá/i);
  });
});
