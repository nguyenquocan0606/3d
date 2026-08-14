'use client';

import React, { useState, useEffect } from 'react';
import { PackageOpen, Plus, CheckCircle2, Clock, Printer, Edit, X, Trash2, Minus, ChevronDown, ShoppingCart, User, Layers, ScanLine, BarChart2 } from 'lucide-react';

const PRINTER_COLORS = [
  'bg-indigo-500', 'bg-rose-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500',
  'bg-orange-500', 'bg-teal-500'
];

const getStatusPriority = (status: string) => {
  if (status === 'pending') return 1;
  if (status === 'pre') return 2;
  if (status === 'printing') return 3;
  if (status === 'completed') return 4;
  return 5;
};

export default function OrdersTab() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editOrderCode, setEditOrderCode] = useState('');
  const [editProducts, setEditProducts] = useState<any[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  const [dashboardProduct, setDashboardProduct] = useState<any>(null);
  const [targetSets, setTargetSets] = useState<number>(1);
  const [printers, setPrinters] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; isVisible: boolean } | null>(null);

  const getPrinterColor = (printerId: string) => {
    const index = printers.findIndex(p => p.id === printerId);
    return index !== -1 ? PRINTER_COLORS[index % PRINTER_COLORS.length] : 'bg-slate-500';
  };
  
  const [customerName, setCustomerName] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [products, setProducts] = useState([{ name: '', quantity: 1, price: 0, piecesPerProduct: [{ name: '', count: 1 }] }]);

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    window.dispatchEvent(new CustomEvent('appToast', { detail: { message, type } }));
  };

  const fetchOrders = async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await fetch('/api/orders');
    const data = await res.json();
    if (data.status === 'success') {
      setOrders(data.data);
    }
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
    fetch('/api/printers').then(res => res.json()).then(data => {
      if (data.status === 'success') setPrinters(data.data);
    });
    
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);

    const handlePrintItemUpdated = () => {
      fetchOrders(true);
    };
    window.addEventListener('printItemUpdated', handlePrintItemUpdated as any);

    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('printItemUpdated', handlePrintItemUpdated as any);
    };
  }, []);

  const handleItemClick = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    if (selectedItems.includes(itemId)) {
      setSelectedItems(selectedItems.filter(id => id !== itemId));
    } else {
      setSelectedItems([...selectedItems, itemId]);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, itemId: string) => {
    e.preventDefault();
    e.stopPropagation(); // prevent window click
    if (!selectedItems.includes(itemId)) {
      setSelectedItems([itemId]);
    }
    
    // Đảm bảo menu không bị tràn màn hình (cơ bản)
    let x = e.clientX;
    let y = e.clientY;
    if (window.innerWidth - x < 250) x -= 250;
    if (window.innerHeight - y < 300) y -= 300;
    
    setContextMenu({ x, y, isVisible: true });
  };

  const handleBatchAction = async (action: 'status' | 'printer', value: string | null) => {
    if (selectedItems.length === 0) return;
    try {
      const body: any = { itemIds: selectedItems };
      if (action === 'status') body.status = value;
      if (action === 'printer') body.printerId = value;

      const res = await fetch('/api/print-items/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.status === 'success') {
        fetchOrders(true);
        setSelectedItems([]);
        setContextMenu(null);
      } else {
        notify(data.message || 'Lỗi cập nhật');
      }
    } catch {
      notify('Lỗi kết nối');
    }
  };

  const handleBatchPrint = async () => {
    const jobs: any[] = [];
    orders.forEach(order => {
      let pIdx = 1;
      order.products.forEach((prod: any) => {
        let iIdx = 1;
        prod.items.forEach((item: any) => {
          if (selectedItems.includes(item.id)) {
            jobs.push({
              qrCode: item.id,
              labelData: {
                line1: item.id,
                line2: `${prod.name} - ${item.name}`,
                line3: `STT: ${pIdx}-${iIdx}`
              }
            });
          }
          iIdx++;
        });
        pIdx++;
      });
    });

    if (jobs.length === 0) return;

    try {
      const res = await fetch('/api/print-jobs/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs })
      });
      const data = await res.json();
      if (data.status === 'success') notify(`Đã gửi lệnh in ${jobs.length} tem`);
      else notify(data.message || 'Lỗi in mã vạch');
    } catch {
      notify("Lỗi khi gửi lệnh in");
    }
  };

  const handlePrintOrderCode = async (order: any) => {
    if (!order.orderCode) return;
    const jobs = [{
      qrCode: order.orderCode,
      labelData: {
        line1: order.orderCode,
        line2: order.customerName || 'Khách lẻ',
        line3: `DON HANG`
      }
    }];
    try {
      const res = await fetch('/api/print-jobs/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs })
      });
      const data = await res.json();
      if (data.status === 'success') notify(`Đã gửi lệnh in mã đơn hàng`);
      else notify(data.message || 'Lỗi in mã vạch');
    } catch {
      notify("Lỗi khi gửi lệnh in");
    }
  };

  const handleAddProduct = () => {
    setProducts([...products, { name: '', quantity: 1, price: 0, piecesPerProduct: [{ name: '', count: 1 }] }]);
  };

  const handleAddPiece = (prodIndex: number) => {
    const newProducts = [...products];
    newProducts[prodIndex].piecesPerProduct.push({ name: '', count: 1 });
    setProducts(newProducts);
  };

  const handleSubmit = async () => {
    if (products.length === 0) return notify("Cần có ít nhất 1 sản phẩm");
    setIsCreating(true);
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName, products })
    });
    
    if (res.ok) {
      setCustomerName('');
      setProducts([{ name: '', quantity: 1, price: 0, piecesPerProduct: [{ name: '', count: 1 }] }]);
      fetchOrders();
    } else {
      notify("Lỗi tạo đơn hàng");
    }
    setIsCreating(false);
  };

  const handlePrintOrder = async (order: any) => {
    try {
      const jobs = [];
      let productIndex = 1;
      for (const prod of order.products) {
        let pieceIndex = 1;
        for (const item of prod.items) {
          jobs.push({
            qrCode: item.id,
            labelData: {
              line1: item.id,
              line2: `${prod.name} - ${item.name}`,
              line3: `STT: ${productIndex}-${pieceIndex}`
            }
          });
          pieceIndex++;
        }
        productIndex++;
      }
      if (jobs.length === 0) {
        notify("Không có mã vạch nào để in");
        return;
      }
      const res = await fetch('/api/print-jobs/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs })
      });
      const data = await res.json();
      if (data.status === 'success') {
        notify(`Đã in thành công ${jobs.length} tem!`);
      } else {
        notify(data.message || 'Lỗi in mã vạch');
      }
    } catch {
      notify("Lỗi khi gửi lệnh in");
    }
  };

  const handleDeleteOrder = (order: any) => {
    window.dispatchEvent(new CustomEvent('appConfirm', {
      detail: {
        title: 'Xóa đơn hàng',
        message: `Bạn có chắc chắn muốn xóa đơn hàng "${order.orderCode || order.customerName || order.id}"? Toàn bộ sản phẩm và tem chưa in của đơn sẽ bị xóa.`,
        onConfirm: async () => {
          try {
            const res = await fetch(`/api/orders/${order.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.status === 'success') {
              notify('Đã xóa đơn hàng.', 'success');
              fetchOrders(true);
            } else {
              notify(data.message || 'Không xóa được đơn hàng.', 'error');
            }
          } catch {
            notify('Lỗi kết nối máy chủ.', 'error');
          }
        }
      }
    }));
  };

  const handleEditClick = (order: any) => {
    setEditingOrder(order);
    setEditCustomerName(order.customerName || '');
    setEditOrderCode(order.orderCode || '');
    const formattedProducts = order.products.map((p: any) => {
      const piecesMap: Record<string, number> = {};
      p.items.forEach((item: any) => {
        piecesMap[item.name] = (piecesMap[item.name] || 0) + 1;
      });
      const piecesPerProduct = Object.keys(piecesMap).map(name => ({
        name,
        count: piecesMap[name] / p.quantity
      }));
      return { id: p.id, name: p.name, quantity: p.quantity, price: p.price || 0, piecesPerProduct };
    });
    setEditProducts(formattedProducts);
  };

  const handleUpdateOrder = async () => {
    if (!editCustomerName.trim() && editProducts.length === 0) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/orders/${editingOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerName: editCustomerName, products: editProducts, orderCode: editOrderCode })
      });
      const data = await res.json();
      if (data.status === 'success') {
        notify("Cập nhật đơn hàng thành công!");
        setEditingOrder(null);
        fetchOrders();
      } else {
        notify(data.message || "Lỗi cập nhật");
      }
    } catch {
      notify("Lỗi kết nối");
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePrintItem = async (item: any, prod: any, pIdx: number, iIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const job = {
        qrCode: item.id,
        labelData: {
          line1: item.id,
          line2: `${prod.name} - ${item.name}`,
          line3: `STT: ${pIdx + 1}-${iIdx + 1}`
        }
      };
      const res = await fetch('/api/print-jobs/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs: [job] })
      });
      const data = await res.json();
      if (data.status !== 'success') notify(data.message || 'Lỗi in mã vạch');
      else notify('Đã gửi lệnh in 1 tem!');
    } catch {
      notify("Lỗi khi gửi lệnh in");
    }
  };

  const handlePrintProduct = async (prod: any, pIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      const jobs = [];
      let pieceIndex = 1;
      for (const item of prod.items) {
        jobs.push({
          qrCode: item.id,
          labelData: {
            line1: item.id,
            line2: `${prod.name} - ${item.name}`,
            line3: `STT: ${pIdx + 1}-${pieceIndex}`
          }
        });
        pieceIndex++;
      }
      if (jobs.length === 0) return notify("Không có mã vạch");
      const res = await fetch('/api/print-jobs/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs })
      });
      const data = await res.json();
      if (data.status === 'success') notify(`Đã gửi lệnh in ${jobs.length} tem`);
      else notify(data.message || 'Lỗi in mã vạch');
    } catch {
      notify("Lỗi khi gửi lệnh in");
    }
  };

  const isOrderCompleted = (order: any) => {
    if (!order.products || order.products.length === 0) return false;
    return order.products.every((prod: any) => 
      prod.items && prod.items.length > 0 && prod.items.every((item: any) => item.status === 'completed')
    );
  };

  const activeOrders = orders.filter((o: any) => !isOrderCompleted(o));
  const completedOrders = orders.filter((o: any) => isOrderCompleted(o));

  const renderOrderCard = (order: any) => (
              <div key={order.id} className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-lg flex items-center gap-2">
                      <User size={18} className="text-slate-400"/>
                      {order.customerName || 'Khách lẻ'}
                    </h4>
                    <div className="flex items-center gap-3 mt-1.5">
                      {order.orderCode && (
                        <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">
                          Mã: {order.orderCode}
                        </span>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                        <Clock size={12}/> {new Date(order.createdAt).toLocaleString('vi-VN')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 items-center">
                    {order.orderCode && (
                      <button 
                        onClick={() => handlePrintOrderCode(order)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg text-xs font-semibold transition-colors border border-emerald-200 dark:border-emerald-800"
                      >
                        <ScanLine size={14} /> In Mã Đơn
                      </button>
                    )}
                    <button 
                      onClick={() => handleEditClick(order)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xs font-semibold transition-colors border border-slate-200 dark:border-slate-700"
                    >
                      <Edit size={14} /> Sửa
                    </button>
                    <button
                      onClick={() => handlePrintOrder(order)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg text-xs font-semibold transition-colors border border-indigo-200 dark:border-indigo-800"
                    >
                      <Printer size={14} /> In Toàn Bộ Mã
                    </button>
                    <button
                      onClick={() => handleDeleteOrder(order)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 rounded-lg text-xs font-semibold transition-colors border border-red-200 dark:border-red-800"
                    >
                      <Trash2 size={14} /> Xóa
                    </button>
                  </div>
                </div>

                <div className="p-5">
                  <div className="space-y-4">
                    {order.products.map((prod: any, prodIdx: number) => (
                      <details key={prod.id} className="group/details bg-slate-50 dark:bg-[#0b0f19] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden" open>
                        <summary className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors list-none">
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400 group-open/details:rotate-180 transition-transform">
                              <ChevronDown size={18} />
                            </span>
                            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              {prod.name} <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 text-xs rounded-full">x{prod.quantity}</span>
                              <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs rounded-full">
                                {Number(prod.price || 0).toLocaleString('vi-VN')}đ
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={(e) => { e.preventDefault(); setDashboardProduct(prod); setTargetSets(1); }}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-bold transition-colors shadow-sm border border-slate-200 dark:border-slate-700"
                              title="Xem tiến độ và tính toán mảnh in"
                            >
                              <BarChart2 size={12} /> Tiến độ
                            </button>
                            <button 
                              onClick={(e) => handlePrintProduct(prod, prodIdx, e)}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold transition-colors shadow-sm border border-slate-200 dark:border-slate-700"
                              title="In toàn bộ tem của riêng sản phẩm này"
                            >
                              <Printer size={12} /> In Riêng Sp Này
                            </button>
                          </div>
                        </summary>
                        
                        <div className="p-4 pt-2 border-t border-slate-100 dark:border-slate-800/50 bg-white/50 dark:bg-[#111827]/50">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                            {[...prod.items].sort((a: any, b: any) => {
                              const pA = getStatusPriority(a.status);
                              const pB = getStatusPriority(b.status);
                              if (pA !== pB) return pA - pB;
                              return a.name.localeCompare(b.name, 'vi');
                            }).map((item: any, itemIdx: number) => {
                              const isSelected = selectedItems.includes(item.id);
                              const printerName = item.printerId ? (printers.find(p => p.id === item.printerId)?.name || item.printerId) : null;
                              
                              return (
                              <div 
                                key={item.id} 
                                onClick={(e) => handleItemClick(e, item.id)}
                                onContextMenu={(e) => handleContextMenu(e, item.id)}
                                className={`px-3 py-2.5 rounded-xl flex flex-col border shadow-sm relative group/item cursor-pointer transition-all select-none ${
                                  isSelected 
                                    ? 'border-indigo-500 ring-2 ring-indigo-500/50 ' + (item.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/40' : item.status === 'printing' ? 'bg-amber-100 dark:bg-amber-900/40' : item.status === 'pre' ? 'bg-slate-200 dark:bg-slate-800' : 'bg-indigo-50 dark:bg-indigo-900/30')
                                    : (item.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50 hover:border-emerald-400' : item.status === 'printing' ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/50 hover:border-amber-400' : item.status === 'pre' ? 'bg-slate-100 dark:bg-slate-800/50 border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500' : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600')
                                }`}
                              >
                                {printerName && (
                                  <div className={`absolute -top-2.5 right-2 ${getPrinterColor(item.printerId)} text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap`}>
                                    🖨️ {printerName}
                                  </div>
                                )}
                                
                                <div className="flex justify-between items-start gap-2">
                                  <span className="text-xs text-slate-700 dark:text-slate-300 font-bold leading-tight">{item.name}</span>
                                  <button 
                                    onClick={(e) => handlePrintItem(item, prod, prodIdx, itemIdx, e)}
                                    className="text-slate-300 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors opacity-0 group-hover/item:opacity-100 shrink-0 p-1"
                                    title="In lại tem này"
                                  >
                                    <Printer size={14} />
                                  </button>
                                </div>
                                <div className="mt-2 flex items-center justify-between">
                                  <span className="text-[10px] text-slate-400 font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-700">{item.id}</span>
                                  <div>
                                    {item.status === 'completed' && <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500"><CheckCircle2 size={10}/> Xong</span>}
                                    {item.status === 'printing' && <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500"><ScanLine size={10}/> Đang in</span>}
                                    {item.status === 'pending' && <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400"><Clock size={10}/> Chờ</span>}
                                  </div>
                                </div>
                              </div>
                            )})}
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 relative">
      
      {/* CONTEXT MENU */}
      {contextMenu?.isVisible && (
        <div 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-[100] bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl py-2 w-56 animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-1.5 border-b border-slate-100 dark:border-slate-700 mb-1">
            <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Đã chọn {selectedItems.length} tem</span>
          </div>
          
          <div className="px-1 group/status relative">
            <button className="w-full text-left px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded flex justify-between items-center text-slate-700 dark:text-slate-200">
              ⏱️ Đổi Trạng Thái <ChevronDown size={14} className="-rotate-90 text-slate-400"/>
            </button>
            <div className="absolute left-full top-0 ml-1 hidden group-hover/status:block bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl w-40 py-1 z-50">
              <button onClick={() => handleBatchAction('status', 'pending')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 font-medium text-slate-500">⏳ Chờ in</button>
              <button onClick={() => handleBatchAction('status', 'printing')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 font-bold text-amber-500">▶ Đang in</button>
              <button onClick={() => handleBatchAction('status', 'completed')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 font-bold text-emerald-500">✔ Xong</button>
            </div>
          </div>

          <div className="px-1 group/printer relative mt-1">
            <button className="w-full text-left px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded flex justify-between items-center text-slate-700 dark:text-slate-200">
              🖨️ Gán Máy In <ChevronDown size={14} className="-rotate-90 text-slate-400"/>
            </button>
            <div className="absolute left-full top-0 ml-1 hidden group-hover/printer:block bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl w-56 py-1 max-h-64 overflow-y-auto custom-scrollbar z-50">
              <button onClick={() => handleBatchAction('printer', null)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-red-500 font-bold border-b border-slate-100 dark:border-slate-700">❌ Tháo khỏi máy in</button>
              {printers.length === 0 && <div className="px-4 py-3 text-xs text-slate-400">Chưa có máy in nào</div>}
              {printers.map(p => (
                <button key={p.id} onClick={() => handleBatchAction('printer', p.id)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${getPrinterColor(p.id)}`}></span> {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="px-1 mt-1 border-t border-slate-100 dark:border-slate-700 pt-1">
            <button onClick={() => { handleBatchPrint(); setContextMenu(null); }} className="w-full text-left px-4 py-2.5 text-sm font-bold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700 rounded">
              🏷️ In Mã Vạch ({selectedItems.length})
            </button>
            <button onClick={() => { setSelectedItems([]); setContextMenu(null); }} className="w-full text-left px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded mt-1">
              ❌ Bỏ Chọn Tất Cả
            </button>
          </div>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingCart className="text-indigo-500" />
            Quản Lý Sản Xuất Đơn Hàng
          </h2>
          <p className="text-slate-500 text-sm mt-1">Tạo đơn hàng, click vào mảnh in để chọn & click chuột phải để thao tác</p>
        </div>
      </div>

      {/* CREATE ORDER CARD */}
      <details className="group bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
        <summary className="flex items-center justify-between cursor-pointer p-6 list-none">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Plus size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Tạo Đơn Hàng Mới</h3>
              <p className="text-sm text-slate-500">Mở ra để thêm khách hàng và sản phẩm mới</p>
            </div>
          </div>
          <div className="text-slate-400 group-open:rotate-180 transition-transform duration-300">
            <ChevronDown size={24} />
          </div>
        </summary>
        
        <div className="p-6 pt-0 border-t border-slate-100 dark:border-slate-800/50 mt-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <ScanLine size={16} className="text-indigo-400" /> Mã Đơn Hàng (Không bắt buộc)
              </label>
              <input 
                className="w-full bg-slate-50 dark:bg-[#0b0f19] border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white transition-all outline-none uppercase placeholder:normal-case"
                value={orderCode}
                onChange={e => setOrderCode(e.target.value.replace(/\s+/g, ''))}
                placeholder="VD: DH-001"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <User size={16} className="text-indigo-400" /> Tên khách hàng / Ghi chú
              </label>
              <input 
                className="w-full bg-slate-50 dark:bg-[#0b0f19] border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white transition-all outline-none"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="VD: Anh Tùng - Quận 1"
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <PackageOpen size={16} className="text-indigo-400" /> Danh sách Sản Phẩm
            </label>
            
            <div className="grid gap-4">
              {products.map((prod, pIdx) => (
                <div key={pIdx} className="bg-slate-50 dark:bg-[#0b0f19] rounded-xl border border-slate-200 dark:border-slate-800 p-5 relative group/prod transition-colors hover:border-indigo-300 dark:hover:border-indigo-700">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_8rem_12rem] gap-4 mb-4">
                    <div className="flex-1">
                      <input 
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                        value={prod.name}
                        onChange={e => {
                          const newP = [...products];
                          newP[pIdx].name = e.target.value;
                          setProducts(newP);
                        }}
                        placeholder="Tên Sản Phẩm (VD: Hộp quà A)"
                      />
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-medium">SL</div>
                      <input 
                        type="number"
                        min="1"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 font-semibold"
                        value={prod.quantity}
                        onChange={e => {
                          const newP = [...products];
                          newP[pIdx].quantity = parseInt(e.target.value) || 1;
                          setProducts(newP);
                        }}
                      />
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-medium">Giá</div>
                      <input
                        type="number"
                        min="0"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-12 pr-9 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500 font-semibold"
                        value={prod.price}
                        onChange={e => {
                          const newP = [...products];
                          newP[pIdx].price = Number(e.target.value) || 0;
                          setProducts(newP);
                        }}
                        placeholder="0"
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-xs font-medium">đ</div>
                    </div>
                  </div>

                  <div className="ml-4 pl-4 border-l-2 border-indigo-100 dark:border-indigo-900/50 space-y-2">
                    {prod.piecesPerProduct.map((piece, pieceIdx) => (
                      <div key={pieceIdx} className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <input 
                          className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                          value={piece.name}
                          onChange={e => {
                            const newP = [...products];
                            newP[pIdx].piecesPerProduct[pieceIdx].name = e.target.value;
                            setProducts(newP);
                          }}
                          placeholder="Tên mảnh (VD: Mặt Nắp)"
                        />
                        <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-1 py-1">
                           <span className="text-xs text-slate-500 px-2">SL/1:</span>
                           <input 
                            type="number"
                            min="1"
                            className="w-12 bg-transparent text-center text-sm font-semibold outline-none text-slate-900 dark:text-white border-l border-slate-200 dark:border-slate-700"
                            value={piece.count}
                            onChange={e => {
                              const newP = [...products];
                              newP[pIdx].piecesPerProduct[pieceIdx].count = parseInt(e.target.value) || 1;
                              setProducts(newP);
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold border border-indigo-100 dark:border-indigo-800">
                          ∑ = {piece.count * prod.quantity}
                        </div>
                      </div>
                    ))}
                    <button onClick={() => handleAddPiece(pIdx)} className="text-indigo-500 dark:text-indigo-400 text-xs font-semibold hover:text-indigo-600 dark:hover:text-indigo-300 mt-2 flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1.5 rounded-lg w-max transition-colors">
                      <Plus size={14}/> Thêm mảnh mới
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <button onClick={handleAddProduct} className="px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-sm font-medium text-slate-700 dark:text-slate-300 rounded-xl flex items-center gap-2 transition-colors">
              <Plus size={18} className="text-indigo-500"/> Thêm Sản Phẩm Khác
            </button>
          </div>

          <div className="pt-6 flex justify-end">
            <button 
              onClick={handleSubmit} 
              disabled={isCreating}
              className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(79,70,229,0.3)] disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {isCreating ? 'Đang tạo...' : <><CheckCircle2 size={20}/> Lưu Đơn Hàng & Sinh Mã</>}
            </button>
          </div>
        </div>
      </details>

      {/* ORDERS LIST */}
      <div className="space-y-4 pt-4">
        <div className="flex justify-between items-end mb-6">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="text-indigo-400" />
            Danh Sách Đơn Hàng
          </h3>
          {selectedItems.length > 0 && (
            <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 animate-pulse bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-800">
              Đang chọn {selectedItems.length} tem (Click phải chuột)
            </div>
          )}
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-400 animate-pulse font-medium">Đang tải dữ liệu...</div>
        ) : orders.length === 0 ? (
          <div className="text-center text-slate-500 py-16 bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">Chưa có đơn hàng nào</div>
        ) : (
          <div className="space-y-8">
            {activeOrders.length > 0 && (
              <div className="grid gap-6">
                {activeOrders.map((order: any) => renderOrderCard(order))}
              </div>
            )}
            
            {completedOrders.length > 0 && (
              <details className="group/completed bg-slate-50 dark:bg-[#111827]/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <summary className="flex items-center justify-between p-4 cursor-pointer list-none select-none">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500 font-bold">
                    <CheckCircle2 size={20} />
                    <span>Đơn Hàng Đã Xong ({completedOrders.length})</span>
                  </div>
                  <div className="text-slate-400 group-open/completed:rotate-180 transition-transform duration-300">
                    <ChevronDown size={20} />
                  </div>
                </summary>
                <div className="p-4 pt-0 border-t border-slate-100 dark:border-slate-800/50 mt-2">
                  <div className="grid gap-6 mt-4">
                    {completedOrders.map((order: any) => renderOrderCard(order))}
                  </div>
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* EDIT MODAL */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111827] rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200 flex flex-col">
            <div className="sticky top-0 bg-white dark:bg-[#111827] z-10 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Edit size={24} className="text-indigo-500" />
                Sửa Đơn Hàng: {editingOrder.customerName || 'Khách lẻ'}
              </h3>
              <button onClick={() => setEditingOrder(null)} className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Mã Đơn Hàng (Không bắt buộc)</label>
                  <input 
                    type="text" 
                    value={editOrderCode}
                    onChange={e => setEditOrderCode(e.target.value.replace(/\s+/g, ''))}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#0b0f19] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-slate-900 dark:text-white uppercase placeholder:normal-case"
                    placeholder="VD: DH-001"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tên Khách Hàng</label>
                  <input 
                    type="text" 
                    value={editCustomerName}
                    onChange={e => setEditCustomerName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-[#0b0f19] border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-4">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Sản Phẩm</label>
                  <button 
                    onClick={() => setEditProducts([...editProducts, { id: '', name: '', quantity: 1, price: 0, piecesPerProduct: [{ name: '', count: 1 }] }])}
                    className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-2 rounded-lg transition-colors border border-indigo-100 dark:border-indigo-800/50"
                  >
                    <Plus size={14} /> Thêm Mới Sản Phẩm
                  </button>
                </div>

                <div className="space-y-4">
                  {editProducts.map((prod, pIdx) => (
                    <div key={pIdx} className="bg-slate-50 dark:bg-[#0b0f19] border border-slate-200 dark:border-slate-700 rounded-xl p-5 relative group/editprod transition-colors hover:border-amber-300 dark:hover:border-amber-700">
                      <button 
                        onClick={() => {
                          const newProds = [...editProducts];
                          newProds.splice(pIdx, 1);
                          setEditProducts(newProds);
                        }}
                        className="absolute top-4 right-4 text-slate-400 hover:text-red-500 p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                        title="Xóa Sản Phẩm Này"
                      >
                        <Trash2 size={18} />
                      </button>

                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_8rem_12rem] gap-4 mb-5 pr-8">
                        <div>
                          <input 
                            placeholder="Tên sản phẩm (VD: Hộp giấy)" 
                            value={prod.name}
                            onChange={(e) => {
                              const newProds = [...editProducts];
                              newProds[pIdx].name = e.target.value;
                              setEditProducts(newProds);
                            }}
                            className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-medium">SL:</div>
                          <input 
                            type="number" 
                            min="1"
                            value={prod.quantity}
                            onChange={(e) => {
                              const newProds = [...editProducts];
                              newProds[pIdx].quantity = parseInt(e.target.value) || 1;
                              setEditProducts(newProds);
                            }}
                            className="w-full px-4 py-2 pl-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 text-slate-900 dark:text-white font-semibold"
                          />
                        </div>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-medium">Giá:</div>
                          <input
                            type="number"
                            min="0"
                            value={prod.price || 0}
                            onChange={(e) => {
                              const newProds = [...editProducts];
                              newProds[pIdx].price = Number(e.target.value) || 0;
                              setEditProducts(newProds);
                            }}
                            className="w-full px-4 py-2 pl-12 pr-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 text-slate-900 dark:text-white font-semibold"
                          />
                          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-xs font-medium">đ</div>
                        </div>
                      </div>

                      <div className="space-y-3 bg-white dark:bg-[#111827] p-4 rounded-xl border border-slate-100 dark:border-slate-800/50 shadow-sm">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Mảnh in cấu thành</div>
                        {prod.piecesPerProduct.map((piece: any, cIdx: number) => (
                          <div key={cIdx} className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <input 
                              placeholder="Tên mảnh (VD: Mặt Nắp)" 
                              value={piece.name}
                              onChange={(e) => {
                                const newProds = [...editProducts];
                                newProds[pIdx].piecesPerProduct[cIdx].name = e.target.value;
                                setEditProducts(newProds);
                              }}
                              className="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-amber-500 text-slate-900 dark:text-white transition-colors"
                            />
                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-lg">
                              <span className="text-xs font-medium text-slate-500 px-1">SL/1:</span>
                              <input 
                                type="number" 
                                min="1"
                                value={piece.count}
                                onChange={(e) => {
                                  const newProds = [...editProducts];
                                  newProds[pIdx].piecesPerProduct[cIdx].count = parseInt(e.target.value) || 1;
                                  setEditProducts(newProds);
                                }}
                                className="w-14 px-1 py-1 text-sm bg-transparent border-l border-slate-200 dark:border-slate-700 rounded-none outline-none text-center font-semibold text-slate-900 dark:text-white"
                              />
                            </div>
                            <button 
                              onClick={() => {
                                const newProds = [...editProducts];
                                newProds[pIdx].piecesPerProduct.splice(cIdx, 1);
                                setEditProducts(newProds);
                              }}
                              className="p-2 text-slate-400 hover:text-red-500 rounded-lg bg-slate-100 dark:bg-slate-800 transition-colors"
                            >
                              <Minus size={16} />
                            </button>
                          </div>
                        ))}
                        <button 
                          onClick={() => {
                            const newProds = [...editProducts];
                            newProds[pIdx].piecesPerProduct.push({ name: '', count: 1 });
                            setEditProducts(newProds);
                          }}
                          className="flex items-center gap-1.5 text-xs text-indigo-500 font-bold mt-3 hover:text-indigo-600 dark:hover:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2 rounded-lg w-max transition-colors border border-indigo-100 dark:border-indigo-800/50"
                        >
                          <Plus size={14} /> Thêm Mảnh In Khác
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white dark:bg-[#111827] px-6 py-4 border-t border-slate-200 dark:border-slate-800 text-right">
              <button 
                onClick={handleUpdateOrder} 
                disabled={isUpdating}
                className="px-8 py-2.5 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(245,158,11,0.3)] disabled:opacity-50 transition-all flex items-center gap-2 ml-auto"
              >
                {isUpdating ? 'Đang cập nhật...' : <><CheckCircle2 size={20} /> Lưu Các Thay Đổi</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* PRODUCT DASHBOARD MODAL */}
      {dashboardProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111827] rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="sticky top-0 bg-white dark:bg-[#111827] z-10 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center rounded-t-2xl">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart2 size={24} className="text-emerald-500" />
                Dashboard Tiến Độ: {dashboardProduct.name}
              </h3>
              <button onClick={() => setDashboardProduct(null)} className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar">
              {/* Thống kê chung */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">Tổng số bộ (Sets)</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white">{dashboardProduct.quantity}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">Tổng số mảnh</div>
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{dashboardProduct.items.length}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">Đã xong</div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {dashboardProduct.items.filter((i:any) => i.status === 'completed').length}
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">Đang in</div>
                  <div className="text-2xl font-bold text-amber-500">
                    {dashboardProduct.items.filter((i:any) => i.status === 'printing' || i.status === 'pre').length}
                  </div>
                </div>
              </div>

              {/* Tính toán giao sớm */}
              <div className="bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800 mb-6">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                  <div>
                    <h4 className="font-bold text-indigo-900 dark:text-indigo-300 text-lg">Tính toán Giao Hàng Trước</h4>
                    <p className="text-sm text-indigo-700 dark:text-indigo-400/80">Nhập số lượng bộ bạn muốn giao ngay để xem các mảnh in còn thiếu.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Số bộ muốn giao:</span>
                    <input 
                      type="number" 
                      min="1" 
                      max={dashboardProduct.quantity}
                      value={targetSets}
                      onChange={e => setTargetSets(Math.min(dashboardProduct.quantity, Math.max(1, Number(e.target.value) || 1)))}
                      className="w-24 px-3 py-2 bg-white dark:bg-[#111827] border border-indigo-200 dark:border-indigo-700 rounded-lg text-center font-bold text-lg text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Bảng chi tiết */}
              <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-400">
                      <th className="px-4 py-3">Tên mảnh</th>
                      <th className="px-4 py-3 text-center">Cần / Bộ</th>
                      <th className="px-4 py-3 text-center">Tổng mảnh</th>
                      <th className="px-4 py-3 text-center">Đã xong</th>
                      <th className="px-4 py-3 text-center">Đang in</th>
                      <th className="px-4 py-3 text-center">Chờ in</th>
                      <th className="px-4 py-3 text-right bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300">Thiếu (cho {targetSets} bộ)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {(() => {
                      // Tính toán số lượng của từng mảnh
                      const pieceStats: Record<string, any> = {};
                      dashboardProduct.items.forEach((it: any) => {
                        if (!pieceStats[it.name]) {
                          pieceStats[it.name] = { total: 0, completed: 0, printing: 0, pending: 0 };
                        }
                        pieceStats[it.name].total++;
                        if (it.status === 'completed') pieceStats[it.name].completed++;
                        else if (it.status === 'printing' || it.status === 'pre') pieceStats[it.name].printing++;
                        else pieceStats[it.name].pending++;
                      });

                      return Object.keys(pieceStats).sort((a,b)=>a.localeCompare(b,'vi')).map(name => {
                        const stat = pieceStats[name];
                        const countPerSet = stat.total / dashboardProduct.quantity;
                        const targetRequired = countPerSet * targetSets;
                        const missing = Math.max(0, targetRequired - stat.completed);
                        
                        return (
                          <tr key={name} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors text-sm text-slate-700 dark:text-slate-300">
                            <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{name}</td>
                            <td className="px-4 py-3 text-center font-mono">{countPerSet}</td>
                            <td className="px-4 py-3 text-center">{stat.total}</td>
                            <td className="px-4 py-3 text-center text-emerald-600 dark:text-emerald-400 font-bold">{stat.completed}</td>
                            <td className="px-4 py-3 text-center text-amber-500 font-bold">{stat.printing}</td>
                            <td className="px-4 py-3 text-center text-slate-400">{stat.pending}</td>
                            <td className="px-4 py-3 text-right font-bold text-lg bg-indigo-50/50 dark:bg-indigo-900/10">
                              {missing > 0 ? (
                                <span className="text-red-500 flex items-center justify-end gap-1">
                                  Thiếu {missing}
                                </span>
                              ) : (
                                <span className="text-emerald-500 flex items-center justify-end gap-1">
                                  <CheckCircle2 size={16} /> Đủ
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
