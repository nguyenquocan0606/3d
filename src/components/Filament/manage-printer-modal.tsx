'use client';

import React from 'react';
import { X, Printer, Scan, Trash2 } from 'lucide-react';

interface ManagePrinterModalProps {
  isOpen: boolean;
  onClose: () => void;
  printer: any;
  onSuccess: () => void;
  onStartAssignSpool: (printerId: string) => void;
  onStartUnassignSpool: (printerId: string) => void;
  onOpenPrintQR: (printer: any) => void;
}

export default function ManagePrinterModal({
  isOpen,
  onClose,
  printer,
  onSuccess,
  onStartAssignSpool,
  onStartUnassignSpool,
  onOpenPrintQR,
}: ManagePrinterModalProps) {
  const [editName, setEditName] = React.useState('');
  const [editModel, setEditModel] = React.useState('');
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (printer && isOpen) {
      setEditName(printer.name || '');
      setEditModel(printer.model || '');
      setEditing(false);
      setError('');
    }
  }, [printer, isOpen]);

  if (!isOpen || !printer) return null;

  const handleSave = async () => {
    if (!editName.trim()) {
      setError('Tên máy in không được để trống');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/printers/${printer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          model: editModel.trim() || null,
        }),
      });

      const data = await res.json();
      if (data.status === 'success') {
        setEditing(false);
        onSuccess();
      } else {
        setError(data.message || 'Lỗi khi cập nhật');
      }
    } catch {
      setError('Lỗi kết nối máy chủ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    window.dispatchEvent(new CustomEvent('appConfirm', {
      detail: {
        title: 'Xóa máy in',
        message: `Bạn có chắc muốn xóa máy in "${printer.name}"? Cuộn nhựa đang gắn sẽ được tháo ra.`,
        onConfirm: async () => {
    try {
      const res = await fetch(`/api/printers/${printer.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'success') {
        onSuccess();
        onClose();
      } else {
        setError(data.message || 'Lỗi khi xóa máy in');
      }
    } catch {
      setError('Lỗi kết nối máy chủ');
    }
        }
      }
    }));
  };

  const spools = printer.spools || [];

  const statusLabel = (status: string) => {
    switch (status) {
      case 'printing': return { text: 'Đang in', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      case 'maintenance': return { text: 'Bảo trì', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      default: return { text: 'Rảnh', color: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20' };
    }
  };

  const st = statusLabel(printer.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1729] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-[#0f1729] z-10">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
              <Printer size={20} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Quản Lý Máy In</h2>
              <span className="font-mono text-xs text-indigo-400">{printer.id}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 dark:bg-slate-800 rounded-lg transition-colors text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Info / Edit section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${st.color}`}>
                {st.text}
              </span>
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                >
                  Chỉnh sửa
                </button>
              )}
            </div>

            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Tên máy in</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Model</label>
                  <input
                    type="text"
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    className="w-full bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 h-9">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="w-full h-full bg-indigo-650 hover:bg-indigo-600 text-slate-900 dark:text-white font-medium text-xs rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </div>
                  <div className="h-9">
                    <button
                      onClick={() => { setEditing(false); setEditName(printer.name); setEditModel(printer.model || ''); }}
                      className="h-full px-4 bg-slate-200 dark:bg-slate-800 hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{printer.name}</h3>
                {printer.model && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Model: {printer.model}</p>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3">
            <div className="h-10">
              <button
                onClick={() => onStartAssignSpool(printer.id)}
                className="w-full h-full flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                <Scan size={14} />
                Quét gán cuộn vào máy
              </button>
            </div>
            <div className="h-10">
              <button
                onClick={() => onStartUnassignSpool(printer.id)}
                className="w-full h-full flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                <Scan size={14} />
                Quét tháo cuộn khỏi máy
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="h-9">
              <button
                onClick={() => onOpenPrintQR(printer)}
                className="w-full h-full flex items-center justify-center gap-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg text-xs transition-colors cursor-pointer"
              >
                <Printer size={12} />
                In QR máy in
              </button>
            </div>
            <div className="h-9">
              <button
                onClick={handleDelete}
                className="w-full h-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs transition-colors cursor-pointer"
              >
                <Trash2 size={12} />
                Xóa máy in
              </button>
            </div>
          </div>

          {/* Spools attached list */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              Cuộn nhựa đang gắn ({spools.length})
            </h4>

            {spools.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <p className="text-xs text-slate-500">Chưa có cuộn nhựa nào được gắn vào máy in này.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {spools.map((spool: any) => {
                  const percent = spool.initialWeightG > 0
                    ? (spool.remainingWeightG / spool.initialWeightG) * 100
                    : 0;

                  return (
                    <div
                      key={spool.id}
                      className="flex items-center justify-between p-3 bg-slate-100/80 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-8 h-5 rounded-md border border-slate-300 dark:border-slate-700 shrink-0"
                          style={{ backgroundColor: spool.filament?.colorHex || '#4f46e5' }}
                        />
                        <div className="min-w-0">
                          <span className="font-mono text-xs font-bold text-slate-200 block">{spool.id}</span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            {spool.filament?.type} — {spool.filament?.colorName}
                            {spool.filament?.brand ? ` (${spool.filament.brand})` : ''}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0 ml-3">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                          {spool.remainingWeightG}g
                        </span>
                        <div className="w-16 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-1">
                          <div
                            className={`h-full transition-all ${
                              percent > 50
                                ? 'bg-emerald-500'
                                : percent > 20
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
