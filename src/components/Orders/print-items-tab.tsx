'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PackageSearch, ScanBarcode, ArrowRight } from 'lucide-react';

type PrintItem = {
  id: string;
  name: string;
  status: string;
  product?: {
    name?: string;
    order?: {
      customerName?: string;
    };
  };
  peiSheet?: {
    name?: string;
  } | null;
};

export default function PrintItemsTab() {
  const [items, setItems] = useState<PrintItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scannedId, setScannedId] = useState('');
  
  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/print-items');
    const data = await res.json();
    if (data.status === 'success') setItems(data.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      fetchItems();
    });
  }, [fetchItems]);

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
    window.dispatchEvent(new CustomEvent('appToast', { detail: { message, type } }));
  };

  const processScannedId = useCallback(async (id: string) => {
    const cleanId = id.trim();
    if (!cleanId) return;

    const targetItem = items.find(i => i.id === cleanId);
    if (!targetItem) {
      notify(`Không tìm thấy miếng in mã: ${cleanId}`, 'error');
      setScannedId('');
      return;
    }

    let nextStatus = 'pending';
    if (targetItem.status === 'pending') nextStatus = 'printing';
    else if (targetItem.status === 'pre') nextStatus = 'printing';
    else if (targetItem.status === 'printing') nextStatus = 'completed';

    const res = await fetch(`/api/print-items/${targetItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus })
    });

    if (res.ok) {
      notify(`Đã cập nhật ${targetItem.id} sang trạng thái ${nextStatus}`, 'success');
      fetchItems();
    } else {
      notify('Lỗi cập nhật', 'error');
    }
    setScannedId('');
  }, [fetchItems, items]);

  useEffect(() => {
    const handleProductionScan = (event: Event) => {
      const code = (event as CustomEvent<string>).detail;
      if (!code) return;
      processScannedId(code);
    };
    window.addEventListener('productionNumericScanned', handleProductionScan);
    return () => window.removeEventListener('productionNumericScanned', handleProductionScan);
  }, [processScannedId]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    processScannedId(scannedId);
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <PackageSearch className="text-indigo-400" />
          Miếng In & Quét Mã Vạch
        </h2>
      </div>

      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Quét mã vạch miếng in (Cập nhật trạng thái nhanh)</label>
        <form onSubmit={handleScan} className="flex gap-2">
          <div className="relative flex-1">
            <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input
              autoFocus
              type="text"
              value={scannedId}
              onChange={(e) => setScannedId(e.target.value)}
              placeholder="Nhập hoặc quét mã số (VD: 12345678)..."
              className="w-full bg-slate-50 dark:bg-[#1f2937] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-hidden focus:border-indigo-500"
            />
          </div>
          <button type="submit" className="px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl">
            Cập Nhật
          </button>
        </form>
        <div className="mt-3 text-xs text-slate-500 flex gap-4">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500"></span> Chờ in</span>
          <ArrowRight size={12}/>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Đang in</span>
          <ArrowRight size={12}/>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Hoàn thành</span>
        </div>
      </div>

      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {loading ? (
           <div className="text-center text-slate-500 py-10">Đang tải...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                  <th className="px-4 py-3">Mã (Barcode)</th>
                  <th className="px-4 py-3">Tên miếng in</th>
                  <th className="px-4 py-3">Thuộc Sản phẩm (Đơn)</th>
                  <th className="px-4 py-3">Mâm PEI</th>
                  <th className="px-4 py-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors text-sm text-slate-700 dark:text-slate-300">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">{item.id}</td>
                    <td className="px-4 py-3 font-medium text-indigo-600 dark:text-indigo-300">{item.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {item.product?.name} ({item.product?.order?.customerName || 'Khách lẻ'})
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {item.peiSheet ? (
                        <span className="px-2 py-1 bg-slate-200 dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-700">{item.peiSheet.name}</span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {item.status === 'completed' && <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded text-xs border border-emerald-500/20">Hoàn thành</span>}
                      {item.status === 'printing' && <span className="px-2 py-1 bg-amber-500/10 text-amber-400 rounded text-xs border border-amber-500/20">Đang in</span>}
                      {item.status === 'pending' && <span className="px-2 py-1 bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded text-xs border border-slate-300 dark:border-slate-700">Chờ in</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
