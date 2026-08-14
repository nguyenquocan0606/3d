'use client';

import React, { useEffect } from 'react';
import StoreManagementTab from '@/components/Store/store-management-tab';

/**
 * URL riêng cho tab "Hàng hóa cửa hàng" (/hang-hoa-cua-hang) — có thể bookmark/chia sẻ trực tiếp
 * thay vì chỉ là state nội bộ của trang chủ. StoreManagementTab tự quản lý toàn bộ dữ liệu và tự
 * dựng luôn thanh header (nút quay lại + tiêu đề + 4 chỉ số tổng) nên trang chỉ còn là khung chứa.
 *
 * Trang khóa cuộn ở cấp trang: khung cao đúng 1 màn hình, mọi phần cuộn đều nằm trong từng thẻ con
 * (danh sách hàng hóa, các cột chi tiết) và đều ẩn thanh cuộn.
 */
export default function HangHoaCuaHangPage() {
  // Khóa cuộn của body — nếu không, thanh cuộn trang vẫn xuất hiện khi modal/nội dung dài đẩy chiều cao.
  useEffect(() => {
    const cu = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = cu;
    };
  }, []);

  return (
    <main className="h-[100dvh] overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#090d16] dark:text-white">
      <StoreManagementTab />
    </main>
  );
}
