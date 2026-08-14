'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, CheckCircle2, PackageOpen, Circle, AlertCircle, ScanLine } from 'lucide-react';

export default function OrderCheckTab() {
  const [orderCode, setOrderCode] = useState('');
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
    window.dispatchEvent(new CustomEvent('appToast', { detail: { message, type } }));
  };

  // Handle global scanner opening an order check
  // (ref giữ bản fetchOrder mới nhất — tránh closure cũ trong listener đăng ký 1 lần)
  const fetchOrderRef = useRef<(code: string) => void>(() => {});
  useEffect(() => {
    (window as any).orderCheckActive = true;
    const handleOpenOrderCheck = (e: any) => {
      const code = e.detail;
      setOrderCode(code);
      fetchOrderRef.current(code);
    };
    window.addEventListener('openOrderCheck', handleOpenOrderCheck as any);
    return () => {
      (window as any).orderCheckActive = false;
      window.removeEventListener('openOrderCheck', handleOpenOrderCheck as any);
    };
  }, []);

  // Listen to print item scanner in this tab
  useEffect(() => {
    const handlePrintItemScanned = async (e: any) => {
      const { id } = e.detail;
      if (order) {
        // Check if this item belongs to the current order
        let belongsToOrder = false;
        let alreadyChecked = false;
        
        for (const prod of order.products) {
          for (const item of prod.items) {
            if (item.id === id) {
              belongsToOrder = true;
              if (item.isChecked) alreadyChecked = true;
            }
          }
        }

        if (!belongsToOrder) {
          notify(`Tem ${id} không thuộc đơn hàng này!`);
          return;
        }

        if (alreadyChecked) {
          notify(`Tem ${id} đã được kiểm rồi!`);
          return;
        }

        // Mark as checked
        try {
          const res = await fetch(`/api/print-items/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isChecked: true })
          });
          const data = await res.json();
          if (data.status === 'success') {
            // Update local state
            setOrder((prev: any) => {
              const newOrder = { ...prev };
              newOrder.products = newOrder.products.map((p: any) => ({
                ...p,
                items: p.items.map((i: any) => i.id === id ? { ...i, isChecked: true } : i)
              }));
              return newOrder;
            });
          }
        } catch (e) {
          console.error(e);
        }
      }
    };
    window.addEventListener('printItemScannedForCheck', handlePrintItemScanned as any);
    return () => window.removeEventListener('printItemScannedForCheck', handlePrintItemScanned as any);
  }, [order]);

  const fetchOrder = async (code: string) => {
    if (!code) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (data.status === 'success') {
        setOrder(data.data);
      } else {
        setError(data.message || 'Không tìm thấy đơn hàng');
        setOrder(null);
      }
    } catch {
      setError('Lỗi kết nối');
    }
    setLoading(false);
  };

  // Cập nhật ref sau mỗi render
  useEffect(() => {
    fetchOrderRef.current = fetchOrder;
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrder(orderCode);
  };

  let totalItems = 0;
  let checkedItems = 0;
  
  if (order) {
    order.products.forEach((p: any) => {
      p.items.forEach((i: any) => {
        totalItems++;
        if (i.isChecked) checkedItems++;
      });
    });
  }

  const progress = totalItems === 0 ? 0 : Math.round((checkedItems / totalItems) * 100);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <ScanLine className="text-emerald-500" />
          Kiểm Hàng Đóng Gói
        </h2>
        
        <form onSubmit={handleSearch} className="flex gap-3 max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              value={orderCode}
              onChange={e => setOrderCode(e.target.value)}
              placeholder="Nhập hoặc quét Mã đơn hàng / ID..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-emerald-500 dark:text-white uppercase placeholder:normal-case"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            Tìm
          </button>
        </form>

        {error && <p className="text-red-500 mt-4 text-sm font-medium flex items-center gap-1.5"><AlertCircle size={16}/> {error}</p>}
      </div>

      {order && (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <PackageOpen className="text-indigo-500" />
                {order.customerName || 'Khách lẻ'}
              </h3>
              <p className="text-slate-500 mt-1">Mã đơn: <strong className="text-slate-700 dark:text-slate-300">{order.orderCode || order.id}</strong></p>
            </div>
            
            <div className="text-right bg-slate-50 dark:bg-slate-900 px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <p className="text-sm text-slate-500 font-medium mb-1">Tiến độ kiểm hàng</p>
              <div className="flex items-end gap-2">
                <span className={`text-3xl font-black ${progress === 100 ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {checkedItems}
                </span>
                <span className="text-slate-400 font-bold mb-1">/ {totalItems} mảnh</span>
              </div>
            </div>
          </div>

          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 mb-8 overflow-hidden border border-slate-200 dark:border-slate-700">
            <div 
              className={`h-full transition-all duration-500 ${progress === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} 
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          <div className="space-y-6">
            {order.products.map((prod: any) => (
              <div key={prod.id} className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-50 dark:bg-[#0b0f19] px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                  <h4 className="font-bold text-slate-700 dark:text-slate-200">{prod.name}</h4>
                  <span className="text-xs font-semibold px-2 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-md">
                    Số lượng: {prod.quantity}
                  </span>
                </div>
                <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {prod.items.map((item: any) => (
                    <div 
                      key={item.id} 
                      className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all ${
                        item.isChecked 
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50' 
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {item.isChecked ? (
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                      ) : (
                        <Circle size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
                      )}
                      <div className="truncate">
                        <p className={`text-xs font-bold ${item.isChecked ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
                          {item.id}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate" title={item.name}>
                          {item.name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {progress === 100 && totalItems > 0 && (
            <div className="mt-8 p-4 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-center gap-3 text-emerald-700 dark:text-emerald-400 animate-in fade-in zoom-in duration-300">
              <CheckCircle2 size={24} />
              <span className="font-bold text-lg">Tuyệt vời! Đã kiểm đủ 100% số lượng mảnh in.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
