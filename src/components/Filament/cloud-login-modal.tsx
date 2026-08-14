'use client';

import React, { useState } from 'react';
import { X, Cloud, Loader2 } from 'lucide-react';
import { Printer } from '@/types/filament.types';

interface CloudLoginModalProps {
  onClose: () => void;
  onSuccess: (accountId: string) => void;
  localPrinters: Printer[];
}

export function CloudLoginModal({ onClose, onSuccess, localPrinters }: CloudLoginModalProps) {
  const [step, setStep] = useState<'login' | 'sync'>('login');
  
  // Step 1 states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Step 2 states
  const [accountId, setAccountId] = useState('');
  const [cloudPrinters, setCloudPrinters] = useState<any[]>([]);
  // map from cloudPrinterId to localPrinterId ('NEW' means create new)
  const [mappings, setMappings] = useState<Record<string, string>>({});

  const [provider, setProvider] = useState<'moonraker' | 'bambulab'>('moonraker');
  const [bambuUrl, setBambuUrl] = useState('http://192.168.99.152:6626');
  const [bambuApiKey, setBambuApiKey] = useState('');
  
  const [moonrakerUrl, setMoonrakerUrl] = useState('http://192.168.1.100:7125');
  const [moonrakerApiKey, setMoonrakerApiKey] = useState('');

  const hasExistingCloud = localPrinters.some((p: any) => p.cloudAccountId != null);
  const [isResetMode, setIsResetMode] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (provider === 'moonraker' && !moonrakerUrl.trim()) {
      setError('Vui lòng nhập URL của Moonraker');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let endpoint = '';
      let payload: any = {};

      if (provider === 'bambulab') {
        endpoint = '/api/printers/bambulab/login';
        payload = { url: bambuUrl.trim(), apiKey: bambuApiKey.trim() };
      } else if (provider === 'moonraker') {
        endpoint = '/api/printers/moonraker/login';
        payload = { url: moonrakerUrl.trim(), apiKey: moonrakerApiKey.trim() };
      }

      if (isResetMode) {
        payload.reset = true;
      }
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setAccountId(data.data.accountId);

        // Luôn hiện bước đồng bộ nếu tìm thấy máy in trên cloud (kể cả account đã tồn tại),
        // để máy in mới thêm vào Bambuddy/HA có cơ hội được ghép nối — máy đã link trước đó
        // vẫn giữ nguyên mapping nhờ `linkedLocalId`.
        if (data.data.cloudPrinters && data.data.cloudPrinters.length > 0) {
          setCloudPrinters(data.data.cloudPrinters);
          // Auto-select 'NEW' for all, but pre-select linked if exists
          const initialMappings: Record<string, string> = {};
          data.data.cloudPrinters.forEach((p: any) => {
            initialMappings[p.id.toString()] = p.linkedLocalId || 'NEW';
          });
          setMappings(initialMappings);
          setStep('sync');
        } else {
          // No printers found on cloud, just finish
          onSuccess(data.data.accountId);
        }
      } else {
        setError(data.message || 'Lỗi kết nối tới Server');
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi kết nối mạng');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    setError('');

    try {
      const payload = {
        accountId,
        mappings: cloudPrinters.map(p => ({
          cloudPrinterId: p.id,
          cloudPrinterName: p.name,
          localPrinterId: mappings[p.id.toString()],
          model: p.model
        }))
      };

      let endpoint = '';
      if (provider === 'bambulab') endpoint = '/api/printers/bambulab/link';
      else if (provider === 'moonraker') endpoint = '/api/printers/moonraker/link';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.status === 'success') {
        onSuccess(accountId);
      } else {
        setError(data.message || 'Lỗi đồng bộ máy in');
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi kết nối mạng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
              <Cloud size={24} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {step === 'login' ? (provider === 'bambulab' ? 'Kết nối Bambu Lab' : 'Kết nối Moonraker') : 'Đồng bộ máy in'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {error && (
            <div className="mb-4 text-red-500 dark:text-red-400 text-sm p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800/30">
              {error}
            </div>
          )}

          {step === 'login' && (
            <>
              {hasExistingCloud && (
                <div className="mb-4 flex gap-2 p-1 bg-gray-100 dark:bg-gray-700/50 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setIsResetMode(false)}
                    className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all ${
                      !isResetMode 
                        ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    Cập nhật kết nối
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsResetMode(true)}
                    className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all ${
                      isResetMode 
                        ? 'bg-white dark:bg-gray-600 text-red-600 dark:text-red-400 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    }`}
                  >
                    Xóa kết nối cũ
                  </button>
                </div>
              )}

              <div className="mb-6 flex gap-2 p-1 bg-gray-100 dark:bg-gray-700/50 rounded-xl">
                <button
                  type="button"
                  onClick={() => setProvider('moonraker')}
                  className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all ${
                    provider === 'moonraker'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  Moonraker
                </button>
                <button
                  type="button"
                  onClick={() => setProvider('bambulab')}
                  className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all ${
                    provider === 'bambulab'
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  Bambu Lab
                </button>
              </div>

              {provider === 'bambulab' && (
                <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm rounded-lg border border-green-100 dark:border-green-800/30 leading-relaxed">
                  Bambu Lab yêu cầu phải có phần mềm <strong>Bambuddy</strong> chạy nội bộ. Vui lòng nhập địa chỉ IP và API Key của Bambuddy.
                </div>
              )}
              {provider === 'moonraker' && (
                <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 text-sm rounded-lg border border-orange-100 dark:border-orange-800/30 leading-relaxed">
                  Nhập địa chỉ IP/URL của Moonraker (bao gồm cả port 7125 nếu có). Để trống API Key nếu không sử dụng bảo mật API Key.
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                {provider === 'bambulab' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Bambuddy URL
                      </label>
                      <input
                        type="url"
                        value={bambuUrl}
                        onChange={(e) => setBambuUrl(e.target.value)}
                        placeholder="http://192.168.99.152:6626"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:text-white"
                        required={provider === 'bambulab'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Bambuddy API Key
                      </label>
                      <input
                        type="password"
                        value={bambuApiKey}
                        onChange={(e) => setBambuApiKey(e.target.value)}
                        placeholder="Nhập API Key..."
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:text-white"
                        required={provider === 'bambulab'}
                      />
                    </div>
                  </>
                )}

                {provider === 'moonraker' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Moonraker URL
                      </label>
                      <input
                        type="url"
                        value={moonrakerUrl}
                        onChange={(e) => setMoonrakerUrl(e.target.value)}
                        placeholder="http://192.168.1.100:7125"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:text-white"
                        required={provider === 'moonraker'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        API Key (Tuỳ chọn)
                      </label>
                      <input
                        type="password"
                        value={moonrakerApiKey}
                        onChange={(e) => setMoonrakerApiKey(e.target.value)}
                        placeholder="Nhập API Key nếu có..."
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:text-white"
                      />
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    isResetMode ? 'bg-red-600 hover:bg-red-700' : (provider === 'bambulab' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700')
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Đang xử lý...
                    </>
                  ) : isResetMode ? (
                    'Xóa & Kết nối mới'
                  ) : (
                    hasExistingCloud ? 'Cập nhật kết nối' : 'Kết nối'
                  )}
                </button>
              </form>
            </>
          )}

          {step === 'sync' && (
            <div className="space-y-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Tìm thấy {cloudPrinters.length} máy in. Vui lòng chọn cách ghép nối cho từng máy:
              </p>

              <div className="space-y-4">
                {cloudPrinters.map(cp => (
                  <div key={cp.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/50">
                    <div className="font-medium text-gray-900 dark:text-white mb-2">{cp.name}</div>
                    <select
                      value={mappings[cp.id.toString()] || 'NEW'}
                      onChange={(e) => setMappings({ ...mappings, [cp.id.toString()]: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="NEW">✨ Nhập thành máy in mới (Tự tạo ID)</option>
                      {localPrinters.length > 0 && <optgroup label="Ghép nối với máy in nội bộ:">
                        {localPrinters.map(lp => (
                          <option key={lp.id} value={lp.id}>🔗 {lp.id} - {lp.name}</option>
                        ))}
                      </optgroup>}
                    </select>
                  </div>
                ))}
              </div>

              <button
                onClick={handleSync}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Đang đồng bộ...
                  </>
                ) : (
                  'Hoàn tất đồng bộ'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
