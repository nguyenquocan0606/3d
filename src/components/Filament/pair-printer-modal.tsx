'use client';

import React, { useEffect, useState } from 'react';
import { X, Link2, Loader2 } from 'lucide-react';
import { Printer } from '@/types/filament.types';

interface CloudAccountOption {
  id: string;
  provider: string;
  email: string | null;
}

interface CloudPrinterEntry {
  id: string | number;
  name: string;
  model?: string;
  linkedLocalId?: string | null;
}

interface PairPrinterModalProps {
  onClose: () => void;
  onSuccess: (accountId: string) => void;
  localPrinters: Printer[];
}

const providerLabel = (provider: string) => (provider === 'bambulab' ? 'Bambu Lab' : provider === 'moonraker' ? 'Moonraker' : provider);

/**
 * Ghép nối nhanh 1 (hoặc nhiều) máy in mới vào tài khoản Cloud ĐÃ kết nối sẵn,
 * không cần nhập lại URL/API Key như CloudLoginModal.
 */
export function PairPrinterModal({ onClose, onSuccess, localPrinters }: PairPrinterModalProps) {
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accounts, setAccounts] = useState<CloudAccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');

  const [discovering, setDiscovering] = useState(false);
  const [cloudPrinters, setCloudPrinters] = useState<CloudPrinterEntry[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [hasDiscovered, setHasDiscovered] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleDiscover = async (accountId: string) => {
    if (!accountId) return;
    setDiscovering(true);
    setError('');
    try {
      const res = await fetch(`/api/printers/cloud/discover?accountId=${encodeURIComponent(accountId)}`);
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        const list = data.data.cloudPrinters as CloudPrinterEntry[];
        setCloudPrinters(list);
        const initialMappings: Record<string, string> = {};
        list.forEach((p) => {
          initialMappings[p.id.toString()] = p.linkedLocalId || 'NEW';
        });
        setMappings(initialMappings);
        setHasDiscovered(true);
        if (list.length === 0) {
          setError('Không tìm thấy máy in nào trên tài khoản Cloud này.');
        }
      } else {
        setError(data.message || 'Không lấy được danh sách máy in');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi kết nối mạng');
    } finally {
      setDiscovering(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/printers/cloud/accounts');
        const data = await res.json();
        if (res.ok && data.status === 'success') {
          const list: CloudAccountOption[] = data.data;
          setAccounts(list);
          // Chỉ có đúng 1 kết nối Cloud → tự động dò máy in luôn, khỏi bắt chọn thêm bước
          if (list.length === 1) {
            setSelectedAccountId(list[0].id);
            handleDiscover(list[0].id);
          }
        } else {
          setError(data.message || 'Không tải được danh sách kết nối Cloud');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lỗi kết nối mạng');
      } finally {
        setLoadingAccounts(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  const handleSubmit = async () => {
    if (!selectedAccount) return;
    setSubmitting(true);
    setError('');

    try {
      const payload = {
        accountId: selectedAccountId,
        mappings: cloudPrinters.map((p) => ({
          cloudPrinterId: p.id,
          cloudPrinterName: p.name,
          localPrinterId: mappings[p.id.toString()],
          model: p.model,
        })),
      };

      const endpoint = selectedAccount.provider === 'bambulab' ? '/api/printers/bambulab/link' : '/api/printers/moonraker/link';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.status === 'success') {
        onSuccess(selectedAccountId);
      } else {
        setError(data.message || 'Lỗi ghép nối máy in');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi kết nối mạng');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
              <Link2 size={24} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Pair máy in</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {error && (
            <div className="mb-4 text-red-500 dark:text-red-400 text-sm p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800/30">
              {error}
            </div>
          )}

          {loadingAccounts && (
            <div className="flex items-center justify-center py-10 text-gray-500 dark:text-gray-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Đang tải kết nối Cloud...
            </div>
          )}

          {!loadingAccounts && accounts.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Chưa có kết nối Cloud nào. Vui lòng dùng nút &quot;Kết nối cloud&quot; để kết nối trước (Bambu Lab / Moonraker).
            </p>
          )}

          {!loadingAccounts && accounts.length > 0 && !hasDiscovered && (
            <div className="space-y-4">
              {accounts.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Chọn kết nối Cloud</label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                  >
                    <option value="">-- Chọn --</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {providerLabel(a.provider)} — {a.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="button"
                onClick={() => handleDiscover(selectedAccountId)}
                disabled={!selectedAccountId || discovering}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {discovering ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Đang tìm máy in...
                  </>
                ) : (
                  'Tìm máy in'
                )}
              </button>
            </div>
          )}

          {hasDiscovered && cloudPrinters.length > 0 && (
            <div className="space-y-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Tìm thấy {cloudPrinters.length} máy in trên {providerLabel(selectedAccount?.provider || '')}. Chọn cách ghép nối cho từng máy:
              </p>

              <div className="space-y-4">
                {cloudPrinters.map((cp) => (
                  <div key={cp.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/50">
                    <div className="font-medium text-gray-900 dark:text-white mb-2">{cp.name}</div>
                    <select
                      value={mappings[cp.id.toString()] || 'NEW'}
                      onChange={(e) => setMappings({ ...mappings, [cp.id.toString()]: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="NEW">✨ Nhập thành máy in mới (Tự tạo ID)</option>
                      {localPrinters.length > 0 && (
                        <optgroup label="Ghép nối với máy in nội bộ:">
                          {localPrinters.map((lp) => (
                            <option key={lp.id} value={lp.id}>
                              🔗 {lp.id} - {lp.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                ))}
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Đang ghép nối...
                  </>
                ) : (
                  'Hoàn tất ghép nối'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
