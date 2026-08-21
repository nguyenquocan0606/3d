'use client';

import React, { useEffect } from 'react';
import EshopApiTestConsole from '@/components/Eshop/eshop-api-test-console';

/**
 * Trang riêng để thử API của MISA eShop Open Platform (/eshop-api-test).
 *
 * Tách khỏi tab "eShop" (nơi chạy nghiệp vụ thật) vì đây là công cụ kỹ thuật: nhập App ID/App Key,
 * bắn request tùy ý và đọc phản hồi thô — không được lẫn vào luồng lấy đơn/soạn hàng hằng ngày.
 */
export default function EshopApiTestPage() {
  // Khóa cuộn của body: khung cao đúng 1 màn hình, cuộn nằm trong từng cột con.
  useEffect(() => {
    const cu = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = cu;
    };
  }, []);

  return (
    <main className="h-[100dvh] overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#090d16] dark:text-white">
      <EshopApiTestConsole />
    </main>
  );
}
