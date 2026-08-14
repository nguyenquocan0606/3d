'use client';

import React, { useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Clock, Printer, History, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export interface PrintHistoriesRef {
  refresh: () => void;
}

const PrintHistories = forwardRef<PrintHistoriesRef, object>((props, ref) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks3d');
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setTasks(data.data || []);
      } else {
        setError(data.message || 'Lỗi khi lấy dữ liệu');
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  useImperativeHandle(ref, () => ({
    refresh: fetchTasks
  }));

  const getStatusBadge = (status: string, endTime: string | null) => {
    if (status === 'completed') {
      return <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-medium flex items-center gap-1"><CheckCircle2 size={12}/> Hoàn thành</span>;
    }
    if (status === 'failed' || status === 'cancelled') {
      return <span className="px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-medium flex items-center gap-1"><XCircle size={12}/> Đã hủy</span>;
    }
    
    // Check if estimated end time is passed
    if (endTime && new Date(endTime) < new Date()) {
       return <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-medium flex items-center gap-1"><CheckCircle2 size={12}/> Hoàn thành</span>;
    }

    return <span className="px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-xs font-medium flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Đang in</span>;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('vi-VN', { 
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="w-full mt-8 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center gap-3 mb-6 px-1">
        <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
          <History size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Lịch sử in 3D</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Quản lý và theo dõi các lệnh in đã tạo</p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Đang tải lịch sử...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-950/40 border border-red-800 text-red-200 rounded-xl text-sm text-center">
          {error}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 border-dashed rounded-2xl">
          <History size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Chưa có lệnh in nào được tạo.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map(task => (
            <div key={task.id} className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
              <div className={`absolute left-0 top-0 w-1 h-full ${task.status === 'printing' && (!task.estimatedEndTime || new Date(task.estimatedEndTime) > new Date()) ? 'bg-amber-500' : (task.status === 'failed' ? 'bg-red-500' : 'bg-emerald-500')}`} />
              
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <Printer size={18} className="text-slate-500 dark:text-slate-400" />
                  <span className="font-bold text-slate-900 dark:text-white">{task.printer?.name || task.printerId}</span>
                </div>
                {getStatusBadge(task.status, task.estimatedEndTime)}
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div className="bg-slate-200/50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                  <div className="text-slate-500 text-xs mb-1 flex items-center gap-1"><Clock size={12}/> Bắt đầu</div>
                  <div className="text-slate-700 dark:text-slate-300 font-medium">{formatDate(task.createdAt)}</div>
                </div>
                <div className="bg-slate-200/50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
                  <div className="text-slate-500 text-xs mb-1 flex items-center gap-1"><Clock size={12}/> Hoàn thành dự kiến</div>
                  <div className="text-slate-700 dark:text-slate-300 font-medium">{task.estimatedEndTime ? formatDate(task.estimatedEndTime) : 'N/A'}</div>
                </div>
              </div>

              {task.usages && task.usages.length > 0 && (
                <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Nhựa đã dùng ({task.usages.length})</h4>
                  <div className="space-y-2">
                    {task.usages.map((u: any) => (
                      <div key={u.id} className="flex items-center justify-between bg-slate-50 dark:bg-[#0B1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800/50">
                        <div>
                          <div className="font-mono text-xs font-bold text-indigo-400">{u.spoolId}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {u.spool?.filament?.brand || ''} {u.spool?.filament?.type} - {u.spool?.filament?.colorName}
                          </div>
                        </div>
                        <div className="font-bold text-emerald-400 text-sm">
                          -{u.usedWeightG}g
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

PrintHistories.displayName = 'PrintHistories';

export default PrintHistories;
