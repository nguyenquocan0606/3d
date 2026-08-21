import { describe, expect, it } from 'vitest';

import { chuanHoaBearer, docThongTinToken, dungHeaderMisa } from '../misa.service';

/**
 * Hai cái bẫy dưới đây từng làm MỌI request tới MISA trả 422 {"Error":401,"IsAuthExpired":true}
 * dù token vừa lấy về còn hạn hơn 20 tiếng (bắt được ngày 16/08/2026). Cả hai đều "im lặng": token
 * trông đúng, hạn còn dài, chỉ có server MISA là chối.
 */

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMiJ9.abc-DEF_123';

const ROW = {
  bearerToken: JWT,
  cookie: 'x-deviceid=abc; x-sessionid=phien-cu-da-het-han',
  deviceId: 'abc',
  msBid: 'bid-1',
  dbid: 'db-1',
  tid: 'tid-1',
  tco: 'tco-1',
  brid: 'br-1',
  env: 'g3',
};

describe('chuanHoaBearer', () => {
  it('cắt tiền tố "Bearer " mà API đổi phiên của eShop trả về', () => {
    // login-amis / refresh-token trả "Bearer eyJ...", ghép thêm lần nữa thành "Bearer Bearer eyJ...".
    expect(chuanHoaBearer(`Bearer ${JWT}`)).toBe(JWT);
  });

  it('giữ nguyên token vốn đã trần', () => {
    expect(chuanHoaBearer(JWT)).toBe(JWT);
  });

  it('không phân biệt hoa thường và nuốt khoảng trắng thừa', () => {
    expect(chuanHoaBearer('  bearer   ' + JWT)).toBe(JWT);
  });

  it('trả null khi rỗng', () => {
    expect(chuanHoaBearer('')).toBeNull();
    expect(chuanHoaBearer(null)).toBeNull();
  });

  it('đọc được hạn token kể cả khi còn dính tiền tố', () => {
    // Token dán tay kèm "Bearer " mà không đọc ra hạn thì hệ thống tưởng token vô hạn, không gia hạn.
    const coHan = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: 2_000_000_000 })).toString('base64url')}.sig`;
    expect(docThongTinToken(`Bearer ${coHan}`).hetHanLuc?.getTime()).toBe(2_000_000_000_000);
  });
});

describe('dungHeaderMisa', () => {
  it('KHÔNG gửi cookie — cookie phiên cũ làm MISA trả IsAuthExpired dù Bearer còn hạn', () => {
    const headers = dungHeaderMisa(ROW, 'https://amisapp.misa.vn/eshop/management');
    expect(headers.Cookie).toBeUndefined();
    expect(Object.keys(headers).some((k) => k.toLowerCase() === 'cookie')).toBe(false);
  });

  it('không ghép "Bearer" hai lần khi token đã lưu kèm tiền tố', () => {
    const headers = dungHeaderMisa({ ...ROW, bearerToken: `Bearer ${JWT}` }, 'https://amisapp.misa.vn/');
    expect(headers.Authorization).toBe(`Bearer ${JWT}`);
  });

  it('vẫn gửi context tenant/chi nhánh — thiếu nó MISA trả thiếu trường', () => {
    const headers = dungHeaderMisa(ROW, 'https://amisapp.misa.vn/');
    expect(headers['x-ms-bid']).toBe('bid-1');
    expect(JSON.parse(headers['x-ems-context'])).toMatchObject({ dbid: 'db-1', tid: 'tid-1', brid: 'br-1' });
  });
});
