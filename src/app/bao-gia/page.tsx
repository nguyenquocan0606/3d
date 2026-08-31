'use client';

import React, { useEffect } from 'react';
import BaoGiaTab from '@/components/BaoGia/bao-gia-tab';

/**
 * URL riêng /bao-gia — theo đúng pattern /hang-hoa-cua-hang: BaoGiaTab tự quản lý toàn bộ dữ liệu
 * và tự dựng header, trang chỉ còn là khung chứa khóa cuộn ở cấp trang (viewer 3D chiếm hết chiều
 * cao còn lại nên không muốn thanh cuộn của body chen vào).
 */
export default function BaoGiaPage() {
  useEffect(() => {
    const cu = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = cu;
    };
  }, []);

  return <BaoGiaTab />;
}
