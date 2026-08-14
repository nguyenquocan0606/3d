import React, { useState } from 'react';
import { X, CheckCircle2, PlayCircle, Clock } from 'lucide-react';

interface ManagePrintItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  printItem: any; // Thông tin từ API GET /api/print-items/[id]
}

export default function ManagePrintItemModal({ isOpen, onClose, onSuccess, printItem }: ManagePrintItemModalProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
    window.dispatchEvent(new CustomEvent('appToast', { detail: { message, type } }));
  };

  if (!isOpen || !printItem) return null;

  const handleUpdateStatus = async (status: string) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/print-items/${printItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.status === 'success') {
        onSuccess();
        onClose();
      } else {
        notify(data.message || 'Lỗi cập nhật trạng thái');
      }
    } catch {
      notify('Lỗi kết nối server');
    } finally {
      setIsUpdating(false);
    }
  };

  const customerName = printItem.product?.order?.customerName || 'Khách lẻ';
  const productName = printItem.product?.name || 'Sản phẩm';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
        
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Chi Tiết Tem & Trạng Thái</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400">Mã tem:</span>
              <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{printItem.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400">Khách hàng:</span>
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">{customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400">Sản phẩm:</span>
              <span className="font-medium text-slate-900 dark:text-white">{productName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400">Tên tem (Chi tiết):</span>
              <span className="font-bold text-amber-600 dark:text-amber-400 text-right max-w-[200px] truncate">{printItem.name}</span>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-center mb-3">Đổi trạng thái nhanh</p>
            
            <button 
              onClick={() => handleUpdateStatus('pending')}
              disabled={isUpdating || printItem.status === 'pending'}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-all ${printItem.status === 'pending' ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 ring-2 ring-slate-400' : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'}`}
            >
              <Clock size={18} /> Chờ in (Pending)
            </button>

            <button 
              onClick={() => handleUpdateStatus('printing')}
              disabled={isUpdating || printItem.status === 'printing'}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-all ${printItem.status === 'printing' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 ring-2 ring-amber-500' : 'bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-600'}`}
            >
              <PlayCircle size={18} /> Đang in (Printing)
            </button>

            <button 
              onClick={() => handleUpdateStatus('completed')}
              disabled={isUpdating || printItem.status === 'completed'}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-all ${printItem.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 ring-2 ring-emerald-500' : 'bg-emerald-50 dark:bg-emerald-900/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600'}`}
            >
              <CheckCircle2 size={18} /> Hoàn thành (Completed)
            </button>
          </div>
        </div>
        
      </div>
    </div>
  );
}
