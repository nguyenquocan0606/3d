'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { X, Package, CheckCircle2, Circle, AlertCircle } from 'lucide-react';

interface EshopPickModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  scannedData: { code: string; timestamp: number } | null;
}

export default function EshopPickModal({ isOpen, onClose, order, scannedData }: EshopPickModalProps) {
  const [pickedItems, setPickedItems] = useState<Record<string, number>>(
    order?.pickProgress?.pickedItems || {}
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPicking, setIsPicking] = useState(false);

  useEffect(() => {
    if (order) {
      setPickedItems(order.pickProgress?.pickedItems || {});
      setIsPicking(false); // Reset state khi mở đơn mới
    }
  }, [order]);

  // Aggregate items and map progress
  const displayItems = useMemo(() => {
    if (!order) return [];

    const map = new Map<string, any>();
    for (const item of order.items) {
      const sku = item.skuCode || 'NO-SKU';
      const isCombo = item.itemName.toLowerCase().includes('combo') || item.quantity > 1;
      
      // Tự động phân tích số lượng từ tên nếu có từ "combo"
      let qtyPerItem = 1;
      if (item.itemName.toLowerCase().includes('combo 2')) qtyPerItem = 2;
      else if (item.itemName.toLowerCase().includes('combo 3')) qtyPerItem = 3;
      else if (item.itemName.toLowerCase().includes('combo 4')) qtyPerItem = 4;
      else if (item.itemName.toLowerCase().includes('combo 5')) qtyPerItem = 5;

      const finalQuantity = item.quantity * qtyPerItem;

      if (map.has(sku)) {
        map.get(sku).quantity += finalQuantity;
      } else {
        map.set(sku, {
          skuCode: sku,
          itemName: item.itemName,
          quantity: finalQuantity,
        });
      }
    }

    const aggregated = Array.from(map.values());

    return aggregated.map((item) => {
      const picked = pickedItems[item.skuCode] || 0;
      return {
        ...item,
        pickedQuantity: picked,
        isComplete: picked >= item.quantity,
      };
    });
  }, [order, pickedItems]);

  const allComplete = displayItems.length > 0 && displayItems.every((i) => i.isComplete);

  // Handle scan
  useEffect(() => {
    if (!isOpen || !scannedData || !order || isUpdating || allComplete || !isPicking) return;

    // Normalization logic similar to what you had
    const normalized = scannedData.code.replace(/-/g, '').toUpperCase();
    
    // Find matching item by SKU
    // Wait, the physical QR code on the spool is the SKU? Usually yes, or CLR-
    const targetItem = displayItems.find((item) => 
      item.skuCode?.toUpperCase() === normalized ||
      item.skuCode?.toUpperCase() === scannedData.code.toUpperCase()
    );

    if (targetItem && targetItem.pickedQuantity < targetItem.quantity) {
      handlePick(targetItem.skuCode);
    }
  }, [scannedData, isOpen, order, allComplete]);

  const handlePick = async (skuCode: string) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/eshop/orders/${order.id}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skuCode }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setPickedItems(data.data.pickedItems || {});
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOpen || !order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1729] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-[#0f1729] z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
              <Package size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Đơn {order.deliveryCode || order.refNo || order.id}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isPicking 
                  ? (allComplete ? 'Đã nhặt đủ hàng' : 'Quét mã sản phẩm để nhặt hàng') 
                  : 'Chi tiết đơn hàng'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 dark:bg-slate-800 rounded-lg transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {!isPicking ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-xl">
                  <div className="text-xs text-slate-500 mb-1">Mã vận đơn</div>
                  <div className="font-semibold text-slate-900 dark:text-white">{order.deliveryCode || '—'}</div>
                </div>
                <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-xl">
                  <div className="text-xs text-slate-500 mb-1">Kênh bán</div>
                  <div className="font-semibold text-slate-900 dark:text-white">{order.channelName || '—'}</div>
                </div>
                <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-xl">
                  <div className="text-xs text-slate-500 mb-1">Mã tham chiếu</div>
                  <div className="font-semibold text-slate-900 dark:text-white">{order.refNo || '—'}</div>
                </div>
                <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-xl">
                  <div className="text-xs text-slate-500 mb-1">Trạng thái đối tác</div>
                  <div className="font-semibold text-slate-900 dark:text-white">{order.partnerOrderStatus || '—'}</div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-3">Danh sách sản phẩm ({displayItems.length})</h3>
                <div className="space-y-2">
                  {displayItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">{item.itemName}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">{item.skuCode}</div>
                      </div>
                      <div className="font-bold text-slate-900 dark:text-white">x{item.quantity}</div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setIsPicking(true)}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
              >
                Bắt đầu nhặt hàng
              </button>
            </div>
          ) : (
            <>
              {allComplete && (
                <div className="mb-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 flex items-start gap-3">
                  <CheckCircle2 className="text-emerald-500 shrink-0" size={20} />
                  <div>
                    <h3 className="font-bold text-emerald-500">Hoàn tất!</h3>
                    <p className="text-sm text-emerald-600/80 dark:text-emerald-400/80">
                      Đơn hàng này đã được nhặt đủ số lượng.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {displayItems.map((item, idx) => {
                  const isDone = item.isComplete;
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        if (!isDone) handlePick(item.skuCode);
                      }}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        isDone
                          ? 'bg-emerald-500/5 border-emerald-500/20'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500/50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="shrink-0">
                          {isDone ? (
                            <CheckCircle2 className="text-emerald-500" size={24} />
                          ) : (
                            <Circle className="text-slate-300 dark:text-slate-700" size={24} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className={`font-bold truncate ${isDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                            {item.itemName}
                          </h4>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            SKU: <span className="font-mono">{item.skuCode}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-2xl font-black ${isDone ? 'text-emerald-500' : 'text-slate-900 dark:text-white'}`}>
                            {item.pickedQuantity} <span className="text-sm font-semibold text-slate-400">/ {item.quantity}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
