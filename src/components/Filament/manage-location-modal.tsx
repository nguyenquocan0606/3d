'use client';

import React, { useState, useEffect } from 'react';
import { X, Edit2, Check, Trash2, Scan, Printer, Layers } from 'lucide-react';

interface ManageLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  location: any | null;
  onSuccess: () => void;
  onStartAssignSpool: (locationId: string) => void;
  onStartUnassignSpool: (locationId: string) => void;
  onOpenPrintQR: (location: any) => void;
}

export default function ManageLocationModal({
  isOpen,
  onClose,
  location,
  onSuccess,
  onStartAssignSpool,
  onStartUnassignSpool,
  onOpenPrintQR
}: ManageLocationModalProps) {
  const [name, setName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (location) {
      setName(location.name);
      setIsEditingName(false);
      setError('');
    }
  }, [location, isOpen]);

  if (!isOpen || !location) return null;

  const handleSaveName = async () => {
    if (!name.trim()) {
      setError('Tên kho không được để trống');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/locations/${location.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
        }),
      });

      const resData = await response.json();

      if (resData.status === 'success') {
        setIsEditingName(false);
        onSuccess();
      } else {
        setError(resData.message || 'Lỗi khi cập nhật tên kho');
      }
    } catch {
      setError('Lỗi kết nối máy chủ');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveSpool = (spoolId: string) => {
    window.dispatchEvent(new CustomEvent('appConfirm', {
      detail: {
        title: 'Đưa cuộn ra khỏi kho',
        message: `Bạn có chắc muốn đưa cuộn nhựa "${spoolId}" ra khỏi kho "${location.name}"?`,
        onConfirm: async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/spools/${spoolId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          locationId: null, // Gán locationId thành null
        }),
      });

      const resData = await response.json();

      if (resData.status === 'success') {
        onSuccess();
      } else {
        setError(resData.message || 'Lỗi khi đưa cuộn nhựa ra khỏi kho');
      }
    } catch {
      setError('Lỗi kết nối máy chủ');
    } finally {
      setIsLoading(false);
    }
        }
      }
    }));
  };

  const handleDeleteLocation = () => {
    window.dispatchEvent(new CustomEvent('appConfirm', {
      detail: {
        title: 'Xóa kho lưu trữ',
        message: `Bạn có chắc chắn muốn xóa kho "${location.name}"? Các cuộn nhựa đang ở trong kho này sẽ bị tháo khỏi kho (nhưng không bị xóa).`,
        onConfirm: async () => {
          setIsLoading(true);
          setError('');

          try {
            const response = await fetch(`/api/locations/${location.id}`, {
              method: 'DELETE',
            });

            const resData = await response.json();

            if (resData.status === 'success') {
              onSuccess();
              onClose();
            } else {
              setError(resData.message || 'Lỗi khi xóa kho lưu trữ');
            }
          } catch {
            setError('Lỗi kết nối máy chủ');
          } finally {
            setIsLoading(false);
          }
        }
      }
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs py-8 overflow-y-auto">
      {/* Modal Container */}
      <div className="relative w-full max-w-2xl mx-4 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl my-auto max-h-[90vh] flex flex-col">
        {/* Close Button */}
        <div className="absolute top-4 right-4 w-8 h-8 z-10">
          <button 
            onClick={onClose}
            className="w-full h-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:bg-slate-800 rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 pb-4 mb-4 shrink-0 pr-8">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-mono mb-1">
            <Layers size={14} />
            <span>MÃ KHO: {location.id}</span>
          </div>
          <div className="flex items-center gap-3">
            {isEditingName ? (
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-[#1f2937] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-slate-900 dark:text-slate-100 text-lg focus:outline-hidden focus:border-indigo-500 w-full"
                  disabled={isLoading}
                />
                <button
                  onClick={handleSaveName}
                  disabled={isLoading}
                  className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-550/20 rounded-lg transition-colors cursor-pointer"
                  title="Lưu lại"
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={() => { setName(location.name); setIsEditingName(false); }}
                  className="p-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-700 text-slate-355 rounded-lg transition-colors cursor-pointer"
                  title="Hủy"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {location.name}
                </h3>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="text-slate-500 dark:text-slate-400 hover:text-indigo-400 p-1 rounded-md hover:bg-slate-200 dark:bg-slate-800 transition-colors cursor-pointer"
                  title="Đổi tên kho"
                >
                  <Edit2 size={15} />
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="p-3 mb-4 bg-red-950/55 border border-red-800 text-red-200 rounded-lg text-sm shrink-0">
            {error}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-wrap gap-3 mb-4 shrink-0">
          <button
            onClick={() => onStartAssignSpool(location.id)}
            className="flex items-center justify-center gap-2 bg-indigo-650 hover:bg-indigo-600 text-slate-900 dark:text-white font-medium rounded-lg text-sm px-4 py-2.5 transition-colors shadow-lg shadow-indigo-500/10 cursor-pointer"
          >
            <Scan size={16} />
            Nhập cuộn nhựa vào kho
          </button>
          <button
            onClick={() => onStartUnassignSpool(location.id)}
            className="flex items-center justify-center gap-2 bg-rose-650 hover:bg-rose-600 text-slate-900 dark:text-white font-medium rounded-lg text-sm px-4 py-2.5 transition-colors shadow-lg shadow-rose-500/10 cursor-pointer"
          >
            <Scan size={16} />
            Quét tháo cuộn khỏi kho
          </button>
          <button
            onClick={() => onOpenPrintQR(location)}
            className="flex items-center justify-center gap-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-300 dark:border-slate-700 font-medium rounded-lg text-sm px-4 py-2.5 transition-colors cursor-pointer"
          >
            <Printer size={16} />
            In mã QR Kho
          </button>
          <button
            onClick={handleDeleteLocation}
            className="flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-medium rounded-lg text-sm px-4 py-2.5 transition-colors cursor-pointer"
          >
            <Trash2 size={16} />
            Xóa kho
          </button>
        </div>

        {/* Spools List Section */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 shrink-0">
            Danh sách cuộn nhựa đang ở trong kho ({location.spools?.length || 0})
          </h4>

          <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-950/20 max-h-[350px]">
            {!location.spools || location.spools.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Layers size={32} className="mb-2 text-slate-650" />
                <p className="text-xs">Kho này hiện tại chưa có cuộn nhựa nào.</p>
                <p className="text-[10px] text-slate-600 mt-1">Hãy bấm nút quét nhập cuộn ở trên để thêm nhựa vào kho.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/40 font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3 font-mono">Mã cuộn</th>
                    <th className="py-2.5 px-3">Loại nhựa</th>
                    <th className="py-2.5 px-3">Màu sắc</th>
                    <th className="py-2.5 px-3 text-center">Còn lại (g)</th>
                    <th className="py-2.5 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-350">
                  {location.spools.map((spool: any) => (
                    <tr key={spool.id} className="hover:bg-slate-100/30 dark:bg-slate-900/10">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">{spool.id}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded-sm bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-bold">
                          {spool.filament?.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <div 
                            className="w-3.5 h-3.5 rounded-xs border border-slate-200 dark:border-slate-800"
                            style={{ backgroundColor: spool.filament?.colorHex || '#4f46e5' }}
                          ></div>
                          <span>{spool.filament?.colorName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium text-slate-200">
                        {spool.remainingWeightG}g
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleRemoveSpool(spool.id)}
                          className="p-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-md transition-colors cursor-pointer"
                          title="Đưa ra khỏi kho"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800 mt-4 shrink-0">
          <div className="w-24 h-10">
            <button
              onClick={onClose}
              className="w-full h-full flex items-center justify-center bg-slate-850 hover:bg-slate-200 dark:bg-slate-800 text-slate-200 font-medium rounded-lg text-sm transition-colors cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
