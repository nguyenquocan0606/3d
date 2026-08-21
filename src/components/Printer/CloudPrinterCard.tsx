import React, { useState } from 'react';
import { Cloud, Printer, Edit2, Play, Pause, Square, LayoutDashboard, Settings2, Wind, Info, RefreshCw } from 'lucide-react';
import { TinhTrangMay } from './tinh-trang-may';
import { PrinterDetailsModal } from './PrinterDetailsModal';

interface CloudPrinterCardProps {
  printer: any;
  liveStatus: any;
  onOpenQR: (prt: any) => void;
  onManage: (prt: any) => void;
}

export function CloudPrinterCard({ printer, liveStatus, onOpenQR, onManage }: CloudPrinterCardProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isCommandLoading, setIsCommandLoading] = useState(false);
  const [isLightOn, setIsLightOn] = useState(false);

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'error') => {
    window.dispatchEvent(new CustomEvent('appToast', { detail: { message, type } }));
  };

  const handleControlAction = async (action: string, value?: any) => {
    if (isCommandLoading) return;
    setIsCommandLoading(true);
    try {
      const res = await fetch('/api/printers/cloud/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerId: printer.id, action, value })
      });
      const data = await res.json();
      if (data.status !== 'success') {
        notify(`Lỗi: ${data.message}`);
      }
    } catch {
      notify('Đã xảy ra lỗi khi gửi lệnh');
    } finally {
      setIsCommandLoading(false);
    }
  };

  const isPrinting = liveStatus?.status === 'printing' || printer.status === 'printing';
  const displayStatus = liveStatus?.status || printer.status;
  
  const cloudAccount = printer.cloudAccount;
  const isAuthFailed = cloudAccount && cloudAccount.isActive === false;
  const isOnline = liveStatus && liveStatus.status !== 'offline' && !isAuthFailed;
  
  // Dữ liệu mock/fallback tạm thời nếu API chưa có
  const progress = liveStatus?.progress || 0;
  const nozzleTemp = liveStatus?.nozzleTemp || 0;
  const nozzleTarget = liveStatus?.nozzleTargetTemp || 0;
  const bedTemp = liveStatus?.bedTemp || 0;
  const bedTarget = liveStatus?.bedTargetTemp || 0;
  const fileName = liveStatus?.fileName || 'Không xác định';
  const previewImage = liveStatus?.previewUrl || '';
  
  // Thời gian
  const remainingMins = liveStatus?.remainingTimeSeconds
    ? Math.floor(liveStatus.remainingTimeSeconds / 60)
    : null;
  const remainingLabel = remainingMins !== null
    ? remainingMins >= 60
      ? `${Math.floor(remainingMins / 60)}h ${remainingMins % 60}m`
      : `${remainingMins}m`
    : null;

  return (
    <div className="flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl overflow-hidden w-full transition-all hover:border-slate-600/80 shadow-lg shadow-black/20">
      
      {/* HEADER */}
      <div className="flex items-center justify-between p-4 pb-3 border-b border-slate-800/60 bg-slate-850/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center border border-slate-700/50">
            <Printer size={20} className="text-slate-300" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 leading-tight flex items-center gap-2">
              {printer.name}
              {isOnline && (
                <span title="Kết nối Cloud ổn định">
                  <Cloud size={14} className="text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">{printer.model || 'Model unknown'}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isAuthFailed ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full text-[10px] font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Lỗi Token
            </span>
          ) : isOnline ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[10px] font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-500/10 text-slate-400 border border-slate-500/20 rounded-full text-[10px] font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              Offline
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* STATUS SECTION */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
            <LayoutDashboard size={12} />
            Status
          </div>
          
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 relative overflow-hidden">
            {isPrinting && (
              <div className="absolute top-0 left-0 w-full h-1 bg-slate-800">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-1000 shadow-[0_0_10px_rgba(52,211,153,0.5)]" 
                  style={{ width: `${progress}%` }} 
                />
              </div>
            )}
            
            <div className="flex gap-4 items-center">
              {/* Preview Image */}
              <div className="w-16 h-16 bg-slate-900 rounded-lg border border-slate-700/60 flex items-center justify-center shrink-0 overflow-hidden relative">
                {previewImage ? (
                  <img src={previewImage} alt="Preview" className="w-full h-full object-cover absolute inset-0" />
                ) : (
                  <Printer size={24} className="text-slate-600" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold ${isPrinting ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {isPrinting ? 'Printing' : displayStatus === 'maintenance' ? 'Maintenance' : 'Ready'}
                  </span>
                  {isPrinting && (
                    <span className="text-xs font-mono font-bold text-emerald-400">{progress}%</span>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-slate-200 truncate mb-2" title={fileName}>
                  {isAuthFailed ? <span className="text-red-400">Vui lòng kết nối lại Cloud</span> : isPrinting ? fileName : 'No active task'}
                </h4>
                
                {isPrinting && (
                  <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                    {remainingLabel !== null && (
                      <span>Time left: <span className="text-slate-200 font-bold text-sm">{remainingLabel}</span></span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* TEMPS SECTION */}
        <div className="grid grid-cols-2 gap-3">
          <button 
            className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden group hover:bg-slate-800/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isCommandLoading}
            onClick={() => {
              const temp = prompt('Nhập nhiệt độ Nozzle (°C):');
              if (temp && !isNaN(Number(temp))) {
                handleControlAction('temp-nozzle', { target: Number(temp) });
              }
            }}
          >
            <div className="text-orange-400 mb-1 opacity-80 group-hover:opacity-100 transition-opacity">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/><path d="M12 9v3"/></svg>
            </div>
            <div className="text-xs text-slate-400 font-semibold mb-1">Nozzle</div>
            <div className="text-lg font-bold text-slate-100 font-mono">
              {nozzleTemp}°<span className="text-xs text-slate-500 font-normal ml-1">/ {nozzleTarget}°</span>
            </div>
            {nozzleTemp > 50 && (
              <div className="absolute top-2 right-2 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
              </div>
            )}
          </button>
          
          <button 
            className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 flex flex-col items-center justify-center relative overflow-hidden group hover:bg-slate-800/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isCommandLoading}
            onClick={() => {
              const temp = prompt('Nhập nhiệt độ Heatbed (°C):');
              if (temp && !isNaN(Number(temp))) {
                handleControlAction('temp-bed', { target: Number(temp) });
              }
            }}
          >
            <div className="text-red-400 mb-1 opacity-80 group-hover:opacity-100 transition-opacity">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/><path d="M12 9v3"/></svg>
            </div>
            <div className="text-xs text-slate-400 font-semibold mb-1">Heatbed</div>
            <div className="text-lg font-bold text-slate-100 font-mono">
              {bedTemp}°<span className="text-xs text-slate-500 font-normal ml-1">/ {bedTarget}°</span>
            </div>
            {bedTemp > 40 && (
              <div className="absolute top-2 right-2 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </div>
            )}
          </button>
        </div>

        {/* CONTROLS SECTION */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
            <Settings2 size={12} />
            Controls
          </div>
          
          <div className="flex items-center justify-between gap-3 bg-slate-800/20 border border-slate-700/30 rounded-xl p-2">
            <div className="flex gap-1">
               <button 
                 onClick={() => {
                   const nextState = !isLightOn;
                   setIsLightOn(nextState);
                   handleControlAction('light', { on: nextState });
                 }}
                 disabled={isCommandLoading}
                 className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${isLightOn ? 'text-amber-400 bg-slate-700/50' : 'text-slate-400 hover:text-amber-400 hover:bg-slate-700/50'}`} 
                 title="Toggle Light">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.9 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
               </button>
               <button 
                 onClick={() => {
                   const speed = prompt('Nhập tốc độ quạt (0-100%):');
                   if (speed && !isNaN(Number(speed))) {
                     handleControlAction('fan', { fan: 'part', speed: Number(speed) });
                   }
                 }}
                 disabled={isCommandLoading}
                 className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors disabled:opacity-50" title="Fan Speed">
                 <Wind size={16} />
               </button>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => handleControlAction(displayStatus === 'pause' || displayStatus === 'paused' ? 'resume' : 'pause')}
                disabled={isCommandLoading || !isPrinting && displayStatus !== 'pause' && displayStatus !== 'paused'}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {displayStatus === 'pause' || displayStatus === 'paused' ? (
                  <>
                    <Play size={12} />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause size={12} />
                    Pause
                  </>
                )}
              </button>
              <button 
                onClick={() => handleControlAction('stop')}
                disabled={isCommandLoading || !isPrinting && displayStatus !== 'pause' && displayStatus !== 'paused'}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                <Square size={12} fill="currentColor" />
                Stop
              </button>
            </div>
          </div>
        </div>

        <TinhTrangMay payload={liveStatus?.extendedInfo?.payload} />

        {/* FILAMENTS SECTION (AMS thật & Local DB) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
              Filaments
            </div>
          </div>
          
          <div className="space-y-3">
            {/* Cloud AMS */}
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-3">
               <div className="text-[10px] font-bold text-slate-500 uppercase mb-2 px-1">AMS trên máy (thực tế)</div>
               <div className="flex justify-start gap-3 overflow-x-auto pb-1 custom-scrollbar">
                  {Array.from({ length: Math.max(4, liveStatus?.materials?.length || 0) }).map((_, idx) => {
                    const cloudMat = liveStatus?.materials?.[idx];
                    
                    if (!cloudMat) {
                      return (
                        <div 
                          key={`cloud-empty-${idx}`} 
                          className="w-14 shrink-0 flex flex-col items-center gap-1 opacity-50 grayscale"
                        >
                          <div className="w-5 h-5 rounded-full bg-slate-700 text-[10px] flex items-center justify-center font-bold text-slate-400 mb-1">{idx + 1}</div>
                          <div className="w-10 h-10 rounded-full border-2 border-slate-600 flex items-center justify-center p-0.5">
                            <div className="w-full h-full rounded-full bg-transparent"></div>
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 mt-1">Empty</span>
                        </div>
                      );
                    }

                    const material = cloudMat.name || 'Unknown';
                    const colorHex = cloudMat.color || '#ffffff';
                    
                    return (
                      <div 
                        key={`cloud-slot-${idx}`} 
                        className="w-14 shrink-0 flex flex-col items-center gap-1 opacity-100"
                      >
                        <div 
                          className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold text-slate-800 mb-1 shadow-sm border border-slate-700"
                          style={{ backgroundColor: colorHex }}
                        >
                          {idx + 1}
                        </div>
                        <div 
                          className="w-10 h-10 rounded-full border-[3px] flex items-center justify-center p-0.5"
                          style={{ borderColor: colorHex }}
                        >
                          <div className="w-full h-full rounded-full shadow-inner" style={{ backgroundColor: colorHex }}></div>
                        </div>
                        <span className="text-[10px] font-bold text-slate-300 mt-1 truncate w-full text-center" title={material}>{material}</span>
                      </div>
                    );
                  })}
               </div>
            </div>

            {/* Local DB */}
            <div className="bg-indigo-900/20 border border-indigo-700/30 rounded-xl p-3 relative group">
               <div className="flex items-center justify-between mb-2 px-1">
                 <div className="text-[10px] font-bold text-indigo-400 uppercase">Hệ thống gán (QR)</div>
                 <button
                   onClick={() => handleControlAction('sync-ams', { spools: printer.spools })}
                   disabled={isCommandLoading}
                   className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                   title="Đồng bộ thông tin nhựa từ Hệ thống lên Máy in"
                 >
                   <RefreshCw size={10} className={isCommandLoading ? "animate-spin" : ""} />
                   Sync to Printer
                 </button>
               </div>
               <div className="flex justify-start gap-3 overflow-x-auto pb-1 custom-scrollbar">
                  {Array.from({ length: 4 }).map((_, idx) => {
                    const slotNum = idx + 1;
                    const localSpool = printer.spools?.find((s: any) => s.printerSlot === slotNum);
                    
                    if (!localSpool) {
                      return (
                        <div 
                          key={`local-empty-${idx}`} 
                          className="w-14 shrink-0 flex flex-col items-center gap-1 opacity-50 grayscale"
                        >
                          <div className="w-5 h-5 rounded-full bg-slate-700 text-[10px] flex items-center justify-center font-bold text-slate-400 mb-1">{slotNum}</div>
                          <div className="w-10 h-10 rounded-full border-2 border-slate-600 flex items-center justify-center p-0.5" title={`Chưa gán cuộn nào vào Line ${slotNum}`}>
                            <div className="w-full h-full rounded-full bg-transparent"></div>
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 mt-1">Empty</span>
                        </div>
                      );
                    }

                    const material = localSpool.filament?.type || 'Unknown';
                    const colorHex = localSpool.filament?.colorHex || '#ffffff';
                    const colorName = localSpool.filament?.colorName || '';
                    
                    return (
                      <div 
                        key={`local-slot-${idx}`} 
                        className="w-14 shrink-0 flex flex-col items-center gap-1 opacity-100"
                        title={`${material} - ${colorName} (${localSpool.id})`}
                      >
                        <div 
                          className="w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold text-slate-800 mb-1 shadow-sm border border-slate-700"
                          style={{ backgroundColor: colorHex }}
                        >
                          {slotNum}
                        </div>
                        <div 
                          className="w-10 h-10 rounded-full border-[3px] flex items-center justify-center p-0.5"
                          style={{ borderColor: colorHex }}
                        >
                          <div className="w-full h-full rounded-full shadow-inner" style={{ backgroundColor: colorHex }}></div>
                        </div>
                        <span className="text-[10px] font-bold text-indigo-300 mt-1 truncate w-full text-center">{material}</span>
                      </div>
                    );
                  })}
               </div>
            </div>
          </div>
        </div>

      </div>

      {/* FOOTER ACTIONS */}
      <div className="mt-auto flex items-center justify-between border-t border-slate-800/60 bg-slate-850/30 p-3">
         <button
            onClick={() => onOpenQR(printer)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Printer size={14} />
            In mã QR
          </button>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDetailsOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
            >
              <Info size={12} />
              Chi tiết
            </button>
            <button
              onClick={() => onManage(printer)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-xs font-semibold transition-colors"
            >
              <Edit2 size={12} />
              Quản lý
            </button>
          </div>
      </div>

      <PrinterDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        liveStatus={liveStatus}
        may={printer.cloudPrinterId}
        tenMay={printer.name}
      />

    </div>
  );
}
