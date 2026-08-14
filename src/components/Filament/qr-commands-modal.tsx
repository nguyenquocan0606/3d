'use client';

import React from 'react';
import { X, Printer, Command } from 'lucide-react';
import QRCodeImage from './barcode-image';

interface QRCommandsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CommandItem {
  code: string;
  name: string;
  desc: string;
  category: 'navigation' | 'inventory' | 'system';
}

const COMMAND_LIST: CommandItem[] = [
  // Navigation commands
  { code: 'CMD-TAB-SPOOLS', name: 'Tab Cuộn Nhựa', desc: 'Chuyển sang tab Danh sách cuộn nhựa', category: 'navigation' },
  { code: 'CMD-TAB-FILAMENTS', name: 'Tab Theo màu', desc: 'Chuyển sang tab Tổng hợp theo màu sắc', category: 'navigation' },
  { code: 'CMD-TAB-LOCATIONS', name: 'Tab Kho chứa', desc: 'Chuyển sang tab Quản lý vị trí kho', category: 'navigation' },
  { code: 'CMD-TAB-PRINTERS', name: 'Tab Máy In', desc: 'Chuyển sang tab Quản lý máy in 3D', category: 'navigation' },
  { code: 'CMD-TAB-PRINTQR', name: 'Tab In lại QR', desc: 'Chuyển sang tab In lại QR Code', category: 'navigation' },
  { code: 'CMD-TAB-CREATEJOB', name: 'Tab Tạo Lệnh In', desc: 'Chuyển sang tab Tạo lệnh in 3D mới', category: 'navigation' },
  { code: 'CMD-TAB-INVENTORY', name: 'Tab Kiểm Kho', desc: 'Chuyển sang tab Chế độ kiểm kho nhựa', category: 'navigation' },
  
  // Inventory commands (work in CheckInventoryTab and UpdateWeightModal)
  { code: 'CMD-INV-RESET', name: 'Làm mới kiểm kho', desc: 'Reset trạng thái quét của phiên kiểm kho hiện tại', category: 'inventory' },
  { code: 'CMD-INV-TOGGLE-ALL', name: 'Phạm vi kiểm kho', desc: 'Toggle hiển thị (Chỉ cuộn Active / Tất cả các cuộn)', category: 'inventory' },
  { code: 'CMD-WEIGHT-TAB', name: 'Chuyển ô nhập cân', desc: 'Chuyển đổi giữa Nhập số cân nặng / Khối lượng vỏ cuộn', category: 'inventory' },
  { code: 'CMD-WEIGHT-DONE', name: 'Hoàn tất cân nặng', desc: 'Lưu khối lượng cân cuộn nhựa hiện tại và đóng popup', category: 'inventory' },
  
  // General System commands
  { code: 'CMD-REFRESH', name: 'Làm mới dữ liệu', desc: 'Reload toàn bộ dữ liệu spools/filaments từ server', category: 'system' },
  { code: 'CMD-CLOSE-MODAL', name: 'Đóng cửa sổ', desc: 'Đóng tất cả các modal popup đang mở trên màn hình', category: 'system' }
];

export default function QRCommandsModal({ isOpen, onClose }: QRCommandsModalProps) {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const categories = {
    navigation: 'Lệnh Chuyển Tab',
    inventory: 'Lệnh Kiểm Kho',
    system: 'Lệnh Hệ Thống Chung'
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
      
      {/* Modal Container */}
      <div className="relative w-full max-w-4xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        
        {/* Header background line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
        
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-850 flex items-center justify-between no-print">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
              <Command size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Mã QR Lệnh Thao Tác Nhanh</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Quét các mã dưới đây bằng súng quét mã vạch để điều khiển ứng dụng không dùng chuột</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Print Button Wrapper matching Container-First Sizing */}
            <div className="w-28 h-9">
              <button
                type="button"
                onClick={handlePrint}
                className="w-full h-full flex items-center justify-center gap-2 bg-indigo-650 hover:bg-indigo-600 text-slate-900 dark:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                <Printer size={14} />
                In bảng lệnh
              </button>
            </div>
            
            {/* Close Button Wrapper matching Container-First Sizing */}
            <div className="w-8 h-8">
              <button
                type="button"
                onClick={onClose}
                className="w-full h-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:bg-slate-800 rounded-full transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Printable Area */}
        <div id="print-command-area" className="p-6 overflow-y-auto max-h-[70vh] space-y-8">
          
          {/* Printable Header (Visible only when printing) */}
          <div className="hidden show-on-print border-b-2 border-black pb-4 mb-6">
            <h1 className="text-2xl font-bold text-black uppercase">Bảng Mã QR Điều Khiển Nhanh</h1>
            <p className="text-xs text-slate-600 mt-1">Sử dụng máy quét/súng quét mã vạch hướng vào các mã QR dưới đây để thao tác nhanh với hệ thống Filament Hub.</p>
          </div>

          {Object.entries(categories).map(([catKey, catName]) => {
            const items = COMMAND_LIST.filter(item => item.category === catKey);
            
            return (
              <div key={catKey} className="space-y-4">
                <h4 className="text-sm font-bold text-indigo-400 border-l-2 border-indigo-500 pl-2 uppercase tracking-wider no-print-title">
                  {catName}
                </h4>
                
                {/* Print Title (Visible only when printing) */}
                <h4 className="hidden show-on-print text-sm font-bold text-black border-l-4 border-black pl-2 uppercase tracking-wider mb-2">
                  {catName}
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {items.map((cmd) => (
                    <div 
                      key={cmd.code}
                      className="bg-slate-100/80 dark:bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex flex-col items-center justify-between text-center gap-3 hover:border-slate-300 dark:border-slate-700 transition-colors print-item"
                    >
                      <div className="flex flex-col items-center justify-center gap-1">
                        <span className="text-xs font-bold text-slate-200 print-text-black">{cmd.name}</span>
                        <span className="text-[10px] text-slate-500 print-text-slate">{cmd.desc}</span>
                      </div>
                      
                      {/* QR Code Wrapper matching Container-First Sizing */}
                      <div className="w-[100px] h-[100px] flex items-center justify-center">
                        <QRCodeImage value={cmd.code} size={100} margin={2} theme="light" />
                      </div>
                      
                      <span className="font-mono text-[9px] font-bold bg-slate-200/50 dark:bg-slate-800/50 px-2 py-0.5 rounded text-indigo-400 print-badge border border-slate-200 dark:border-slate-800 print-text-black">
                        {cmd.code}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CSS Styles for Print Optimization */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * {
            visibility: hidden;
          }
          .fixed, .fixed * {
            visibility: hidden !important;
          }
          #print-command-area, #print-command-area * {
            visibility: visible !important;
          }
          #print-command-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: auto;
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .show-on-print {
            display: block !important;
          }
          .no-print-title {
            display: none !important;
          }
          .print-item {
            background: white !important;
            border: 1px solid #000000 !important;
            color: black !important;
            page-break-inside: avoid;
          }
          .print-text-black {
            color: black !important;
          }
          .print-text-slate {
            color: #4b5563 !important;
          }
          .print-badge {
            background: #f3f4f6 !important;
            border: 1px solid #d1d5db !important;
            color: black !important;
          }
        }
      `}} />
    </div>
  );
}
