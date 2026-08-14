import React, { useMemo } from 'react';
import { X, Info, Box, Thermometer, Wind, Layers, Settings2, Clock, Scale } from 'lucide-react';

interface PrinterDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  extendedInfo: any;
}

export function PrinterDetailsModal({ isOpen, onClose, extendedInfo }: PrinterDetailsModalProps) {
  const parsedData = useMemo(() => {
    if (!extendedInfo) return null;
    
    let sliceParam: any = {};
    let sliceResult: any = {};
    let settings: any = {};

    try {
      if (extendedInfo.project?.slice_param) sliceParam = JSON.parse(extendedInfo.project.slice_param);
    } catch {}

    try {
      if (extendedInfo.project?.slice_result) sliceResult = JSON.parse(extendedInfo.project.slice_result);
    } catch {}

    try {
      if (extendedInfo.project?.settings) settings = JSON.parse(extendedInfo.project.settings);
    } catch {}

    return {
      project: extendedInfo.project || {},
      parameter: extendedInfo.parameter || {},
      mqtt: extendedInfo.mqtt || {},
      sliceParam,
      sliceResult,
      settings,
    };
  }, [extendedInfo]);

  if (!isOpen) return null;

  if (!parsedData) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
          <div className="p-4 flex justify-between items-center border-b border-slate-800">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Info size={18} className="text-indigo-400" /> Chi tiết dữ liệu máy in
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><X size={20}/></button>
          </div>
          <div className="p-8 text-center text-slate-400">
            Không có dữ liệu mở rộng (chưa kết nối hoặc API chưa trả về)
          </div>
        </div>
      </div>
    );
  }

  if (extendedInfo?.provider === 'bambulab') {
    const payload = extendedInfo.payload;
    const timeStr = payload.remaining_time ? (payload.remaining_time > 60 ? `${Math.floor(payload.remaining_time / 60)}h ${payload.remaining_time % 60}m` : `${payload.remaining_time}m`) : 'N/A';
    const nozzle = payload.nozzles?.[0] || {};
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-850/80 sticky top-0 z-10">
            <div className="flex items-center gap-4">
              {payload.previewUrl && (
                <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-700 shrink-0">
                  <img src={payload.previewUrl} alt="Preview" className="w-full h-full object-cover" />
                </div>
              )}
              <div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-1">
                  <Info size={18} className="text-green-400" />
                  Chi tiết: {payload.name || 'Bambu Lab Printer'}
                </h3>
                <p className="text-xs text-slate-400 truncate max-w-lg">
                  {payload.current_print || 'Không xác định file'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-2 rounded-xl hover:bg-slate-800">
              <X size={20} />
            </button>
          </div>
          <div className="p-5 overflow-y-auto flex-1 custom-scrollbar space-y-6">
            <section>
              <div className="flex items-center gap-2 mb-3 text-sm font-bold text-emerald-400 uppercase tracking-wider">
                <Clock size={16} /> Trạng thái Thời gian thực
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatusBox icon={<Layers />} label="Lớp in (Layer)" value={`${payload.layer_num ?? 0} / ${payload.total_layers ?? '?'}`} />
                <StatusBox icon={<Clock />} label="Thời gian còn lại" value={timeStr} />
                <StatusBox icon={<Thermometer />} label="Nhiệt độ Đầu phun" value={`${Math.round(payload.temperatures?.nozzle ?? 0)}°C / ${Math.round(payload.temperatures?.nozzle_target ?? 0)}°C`} />
                <StatusBox icon={<Thermometer />} label="Nhiệt độ Bàn in" value={`${Math.round(payload.temperatures?.bed ?? 0)}°C / ${Math.round(payload.temperatures?.bed_target ?? 0)}°C`} />
                <StatusBox icon={<Wind />} label="Quạt làm mát" value={`${payload.cooling_fan_speed ?? 0}%`} />
                <StatusBox icon={<Settings2 />} label="Chế độ tốc độ" value={`${payload.speed_level || 'N/A'}`} />
              </div>
            </section>
            <hr className="border-slate-800" />
            <section>
              <div className="flex items-center gap-2 mb-3 text-sm font-bold text-indigo-400 uppercase tracking-wider">
                <Box size={16} /> Thông số Slicing (File In)
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <InfoRow label="Lượng nhựa dự kiến" value={`${payload.print_length || 'N/A'} (${payload.print_weight || 'N/A'})`} />
                <InfoRow label="Loại mâm in (Bed)" value={payload.print_bed_type || 'N/A'} />
                <InfoRow label="Số lượng chi tiết (Objects)" value={`${payload.printable_objects ?? 'N/A'} (Bỏ qua: ${payload.skipped_objects ?? 0})`} />
                <InfoRow label="Thời gian bắt đầu" value={payload.start_time || 'N/A'} />
                <InfoRow label="Thời gian dự kiến kết thúc" value={payload.end_time || 'N/A'} />
              </div>
            </section>
            <hr className="border-slate-800" />
            <section>
              <div className="flex items-center gap-2 mb-3 text-sm font-bold text-amber-400 uppercase tracking-wider">
                <Settings2 size={16} /> Cấu hình Phần cứng
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <InfoRow label="Đầu phun (Nozzle)" value={`${nozzle.nozzle_diameter ? nozzle.nozzle_diameter + 'mm' : 'N/A'} (${nozzle.nozzle_type || 'N/A'})`} />
                <InfoRow label="Đèn buồng in" value={payload.chamber_light ? 'Đang bật' : 'Đang tắt'} />
                <InfoRow label="Firmware" value={payload.firmware_version || 'N/A'} />
              </div>
            </section>
          </div>
          <div className="p-4 border-t border-slate-800 bg-slate-850/50 flex justify-end">
            <button onClick={onClose} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl transition-colors">
              Đóng
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { project, parameter, sliceParam, sliceResult, settings, mqtt } = parsedData;
  const rtSettings = mqtt.settings || settings.settings || {}; // ưu tiên mqtt realtime

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-850/80 sticky top-0 z-10">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-1">
              <Info size={18} className="text-indigo-400" />
              Chi tiết: {project.printer_name || 'Máy in'}
            </h3>
            <p className="text-xs text-slate-400 truncate max-w-lg">
              {mqtt.filename || project.gcode_name || 'Không xác định file'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-2 rounded-xl hover:bg-slate-800"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 custom-scrollbar space-y-6">
          
          {/* Section 1: Real-time Status */}
          <section>
            <div className="flex items-center gap-2 mb-3 text-sm font-bold text-emerald-400 uppercase tracking-wider">
              <Clock size={16} />
              Trạng thái Thời gian thực
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatusBox icon={<Layers />} label="Lớp in (Layer)" value={`${mqtt.curr_layer ?? settings.curr_layer ?? 0} / ${mqtt.total_layers ?? settings.total_layers ?? sliceResult.total_layers ?? '?'}`} />
              
              {(() => {
                const remain = mqtt.remain_time ?? settings.remain_time;
                const timeStr = remain ? (remain > 60 ? `${Math.floor(remain / 60)}h ${remain % 60}m` : `${remain}m`) : 'N/A';
                return <StatusBox icon={<Clock />} label="Thời gian còn lại" value={timeStr} />
              })()}

              <StatusBox icon={<Thermometer />} label="Nhiệt độ Đầu phun" value={`${parameter.curr_nozzle_temp ?? mqtt.curr_nozzle_temp ?? mqtt.nozzle_temp ?? 0}°C / ${rtSettings.target_nozzle_temp ?? mqtt.target_nozzle_temp ?? sliceParam.temperature ?? 0}°C`} />
              <StatusBox icon={<Thermometer />} label="Nhiệt độ Bàn in" value={`${parameter.curr_hotbed_temp ?? mqtt.curr_hotbed_temp ?? mqtt.bed_temp ?? 0}°C / ${rtSettings.target_hotbed_temp ?? mqtt.target_hotbed_temp ?? sliceParam.bed_temperature ?? 0}°C`} />
              <StatusBox icon={<Wind />} label="Quạt tản nhiệt" value={`${rtSettings.fan_speed_pct ?? 0}% (Phụ: ${rtSettings.aux_fan_speed_pct ?? 0}%)`} />
              <StatusBox icon={<Settings2 />} label="Chế độ tốc độ" value={rtSettings.print_speed_mode === 2 ? 'Normal' : rtSettings.print_speed_mode || 'N/A'} />
              <StatusBox icon={<Box />} label="Z-Offset" value={`${rtSettings.z_comp ?? '0'} mm`} />
              <StatusBox icon={<Scale />} label="Nhựa đã dùng" value={`${mqtt.supplies_usage || settings.supplies_usage ? ((mqtt.supplies_usage || settings.supplies_usage) / 1000).toFixed(2) + 'm' : 'N/A'}`} />
            </div>
          </section>

          <hr className="border-slate-800" />

          {/* Section 2: Slicing Parameters */}
          <section>
            <div className="flex items-center gap-2 mb-3 text-sm font-bold text-indigo-400 uppercase tracking-wider">
              <Box size={16} />
              Thông số Slicing (File In)
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <InfoRow label="Loại nhựa (Filament)" value={sliceParam.filament_type ? sliceParam.filament_type.split(';')[0] : 'N/A'} />
              <InfoRow label="Thời gian in ước tính" value={sliceResult.print_time || 'N/A'} />
              <InfoRow label="Lượng nhựa dự kiến" value={`${sliceResult.used_filament ? sliceResult.used_filament + 'm' : 'N/A'} (${sliceResult['filament used [g]'] ? sliceResult['filament used [g]'][0] + 'g' : 'N/A'})`} />
              <InfoRow label="Kích thước mô hình (mm)" value={sliceResult.model_size || 'N/A'} />
              <InfoRow label="Chiều cao lớp (Layer)" value={sliceParam.layer_height ? `${sliceParam.layer_height} mm` : 'N/A'} />
              <InfoRow label="Độ đặc (Infill)" value={sliceParam.fill_density ? `${sliceParam.fill_density}%` : 'N/A'} />
              <InfoRow label="Support" value={sliceParam.enable_support ? `Có (${sliceParam.support_type || 'auto'})` : 'Không'} />
              <InfoRow label="Brim / Skirt" value={sliceParam.brim_type || 'N/A'} />
              <InfoRow label="Tốc độ in tối đa" value={sliceParam.travel_speed ? `${sliceParam.travel_speed} mm/s` : 'N/A'} />
            </div>
          </section>

          <hr className="border-slate-800" />

          {/* Section 3: Machine & Hardware */}
          <section>
            <div className="flex items-center gap-2 mb-3 text-sm font-bold text-amber-400 uppercase tracking-wider">
              <Settings2 size={16} />
              Cấu hình Phần cứng
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <InfoRow label="Đầu phun (Nozzle)" value={`${sliceParam.nozzle_diameter ? sliceParam.nozzle_diameter[0] + 'mm' : 'N/A'} (${sliceParam.nozzle_type || 'N/A'})`} />
              <InfoRow label="Loại mâm in (Bed)" value={sliceParam.curr_bed_type || 'N/A'} />
              <InfoRow label="Cấu hình máy (Profile)" value={sliceParam.printer_settings_id || 'N/A'} />
            </div>
          </section>

        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-850/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 flex flex-col justify-center">
      <div className="flex items-center gap-2 text-slate-400 mb-2 text-xs">
        {React.cloneElement(icon as React.ReactElement, { size: 14 } as any)}
        {label}
      </div>
      <div className="text-sm font-bold text-slate-100">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-800/30 rounded-lg p-2.5 px-3 flex flex-col">
      <span className="text-[10px] text-slate-400 uppercase font-semibold mb-0.5">{label}</span>
      <span className="text-xs text-slate-200 font-medium truncate">{value}</span>
    </div>
  );
}
