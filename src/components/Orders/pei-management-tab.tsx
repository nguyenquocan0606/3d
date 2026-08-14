'use client';

import React, { useState, useEffect } from 'react';
import { LayoutTemplate, Plus, Printer } from 'lucide-react';

export default function PeiManagementTab() {
  const [sheets, setSheets] = useState<any[]>([]);
  const [unassignedItems, setUnassignedItems] = useState<any[]>([]);
  const [printers, setPrinters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New Sheet Form
  const [newSheetName, setNewSheetName] = useState('');

  // Assign Items
  const [selectedSheetId, setSelectedSheetId] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const fetchData = async () => {
    setLoading(true);
    const [sheetRes, itemRes, prtRes] = await Promise.all([
      fetch('/api/pei-sheets'),
      fetch('/api/print-items'),
      fetch('/api/printers')
    ]);
    
    if (sheetRes.ok) {
      const s = await sheetRes.json();
      setSheets(s.data);
    }
    if (itemRes.ok) {
      const it = await itemRes.json();
      // Filter items that are pending and not assigned to any sheet
      const unassigned = it.data.filter((i: any) => !i.peiSheetId && i.status === 'pending');
      setUnassignedItems(unassigned);
    }
    if (prtRes.ok) {
      const p = await prtRes.json();
      setPrinters(p.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateSheet = async () => {
    if (!newSheetName.trim()) return;
    const res = await fetch('/api/pei-sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSheetName })
    });
    if (res.ok) {
      setNewSheetName('');
      fetchData();
    }
  };

  const toggleItemSelection = (id: string) => {
    if (selectedItemIds.includes(id)) {
      setSelectedItemIds(selectedItemIds.filter(i => i !== id));
    } else {
      setSelectedItemIds([...selectedItemIds, id]);
    }
  };

  const handleAssignToSheet = async () => {
    if (!selectedSheetId || selectedItemIds.length === 0) return;
    
    for (const itemId of selectedItemIds) {
      await fetch(`/api/print-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peiSheetId: selectedSheetId })
      });
    }
    setSelectedItemIds([]);
    fetchData();
  };

  const handleAssignPrinterToSheet = async (sheetId: string, printerId: string) => {
    await fetch(`/api/pei-sheets/${sheetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printerId: printerId || null })
    });
    fetchData();
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <LayoutTemplate className="text-indigo-400" />
          Quản lý Mâm In (PEI Sheet)
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cột trái: Quản lý Mâm & Gán miếng in */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Tạo Mâm In Mới</h3>
            <div className="flex gap-2">
              <input 
                className="flex-1 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
                value={newSheetName}
                onChange={e => setNewSheetName(e.target.value)}
                placeholder="Tên mâm (VD: Mâm PEI 1)"
              />
              <button onClick={handleCreateSheet} className="px-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-slate-900 dark:text-white">
                <Plus size={18}/>
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Gom miếng in vào Mâm</h3>
            
            <div className="mb-4">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Chọn Mâm In (Đích)</label>
              <select 
                className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white"
                value={selectedSheetId}
                onChange={e => setSelectedSheetId(e.target.value)}
              >
                <option value="">-- Chọn mâm in --</option>
                {sheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1 flex justify-between">
                <span>Miếng in chờ xếp ({unassignedItems.length})</span>
                <span className="text-indigo-400 cursor-pointer" onClick={() => setSelectedItemIds(unassignedItems.map(i => i.id))}>Chọn tất cả</span>
              </label>
              <div className="max-h-60 overflow-y-auto space-y-1 bg-slate-50 dark:bg-slate-900/50 p-2 border border-slate-200 dark:border-slate-800 rounded-lg">
                {unassignedItems.length === 0 && <div className="text-xs text-slate-500 text-center py-4">Không có miếng in rảnh</div>}
                {unassignedItems.map(item => (
                  <label key={item.id} className="flex items-center gap-2 p-2 hover:bg-slate-200 dark:bg-slate-800 rounded cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={selectedItemIds.includes(item.id)}
                      onChange={() => toggleItemSelection(item.id)}
                      className="rounded border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 text-indigo-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-700 dark:text-slate-200 truncate">{item.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{item.id} | {item.product?.name}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button 
              onClick={handleAssignToSheet}
              disabled={!selectedSheetId || selectedItemIds.length === 0}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-slate-900 dark:text-white text-sm font-semibold rounded-lg shadow-lg shadow-indigo-500/20 disabled:opacity-50"
            >
              Gán vào mâm ({selectedItemIds.length})
            </button>
          </div>
        </div>

        {/* Cột phải: Danh sách mâm */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Danh sách Mâm In hiện tại</h3>
          {loading ? (
             <div className="text-center text-slate-500 py-10">Đang tải...</div>
          ) : sheets.length === 0 ? (
            <div className="text-center text-slate-500 py-10 bg-white dark:bg-[#111827] rounded-xl border border-slate-200 dark:border-slate-800">Chưa có mâm in nào được tạo</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sheets.map(sheet => (
                <div key={sheet.id} className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-bold text-slate-900 dark:text-white text-base">{sheet.name}</h4>
                    <span className="px-2 py-1 bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded text-xs">{sheet.items?.length || 0} miếng</span>
                  </div>

                  <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200 dark:border-slate-800 mb-4 overflow-y-auto max-h-40">
                    {(!sheet.items || sheet.items.length === 0) ? (
                      <div className="text-xs text-slate-500 text-center py-2">Trống</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {sheet.items.map((it: any) => (
                          <div key={it.id} className="text-[10px] bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                            {it.name} <span className="text-indigo-400 ml-1">({it.id})</span>
                            {it.status === 'completed' && <span className="ml-1 text-emerald-400">✔</span>}
                            {it.status === 'printing' && <span className="ml-1 text-amber-400">▶</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto pt-3 border-t border-slate-200 dark:border-slate-800">
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                      <Printer size={12}/> Đang gắn trên máy in:
                    </label>
                    <select 
                      className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-amber-400"
                      value={sheet.printerId || ''}
                      onChange={e => handleAssignPrinterToSheet(sheet.id, e.target.value)}
                    >
                      <option value="">-- Chưa gắn máy nào --</option>
                      {printers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
