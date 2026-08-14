'use client';

import React, { useState } from 'react';
import { ShoppingBag, Scan, Layers, Boxes } from 'lucide-react';
import OrdersTab from './orders-tab';
import PrintItemsTab from './print-items-tab';
import PeiManagementTab from './pei-management-tab';
import OrderCheckTab from './order-check-tab';
import BulkProductionTab from './bulk-production-tab';

export default function ProductionTab() {
  const [activeSubTab, setActiveSubTab] = useState<'orders' | 'print-items' | 'pei' | 'order-check' | 'bulk'>('orders');

  // Lắng nghe event mở tab kiểm hàng
  React.useEffect(() => {
    const handleOpenOrderCheck = () => {
      setActiveSubTab('order-check');
    };
    window.addEventListener('openOrderCheck', handleOpenOrderCheck);
    return () => window.removeEventListener('openOrderCheck', handleOpenOrderCheck);
  }, []);

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-xl">
        <button
          onClick={() => setActiveSubTab('orders')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeSubTab === 'orders'
              ? 'bg-indigo-650 text-slate-900 dark:text-white shadow-md'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
          }`}
        >
          <ShoppingBag size={18} />
          <span>Tạo & Quản lý Đơn</span>
        </button>
        <button
          onClick={() => setActiveSubTab('print-items')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeSubTab === 'print-items'
              ? 'bg-indigo-650 text-slate-900 dark:text-white shadow-md'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
          }`}
        >
          <Scan size={18} />
          <span>Quét Mã & Cập nhật Trạng thái</span>
        </button>
        <button
          onClick={() => setActiveSubTab('pei')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeSubTab === 'pei'
              ? 'bg-indigo-650 text-slate-900 dark:text-white shadow-md'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
          }`}
        >
          <Layers size={18} />
          <span>Xếp Mâm (PEI)</span>
        </button>
        <button
          onClick={() => setActiveSubTab('order-check')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeSubTab === 'order-check'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
          }`}
        >
          <Scan size={18} />
          <span>Kiểm Hàng</span>
        </button>
        {/* Chế độ 2: đơn lớn quản lý theo lượt mâm PEI thay vì theo từng con */}
        <button
          onClick={() => setActiveSubTab('bulk')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeSubTab === 'bulk'
              ? 'bg-violet-600 text-white shadow-md'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
          }`}
        >
          <Boxes size={18} />
          <span>Sản Xuất SLL</span>
        </button>
      </div>

      {/* Content Rendering */}
      <div>
        {activeSubTab === 'orders' && <OrdersTab />}
        {activeSubTab === 'print-items' && <PrintItemsTab />}
        {activeSubTab === 'pei' && <PeiManagementTab />}
        {activeSubTab === 'order-check' && <OrderCheckTab />}
        {activeSubTab === 'bulk' && <BulkProductionTab />}
      </div>
    </div>
  );
}
