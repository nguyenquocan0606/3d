'use client';

import React, { useState } from 'react';

// Biểu đồ đường SVG thuần với hỗ trợ đứt đoạn khi giá trị null
// null = ngày không có dữ liệu (vd. không sản xuất) — vẽ thành 0 là nói dối biểu đồ

interface BieudoDuongProps {
  ngay: string[];
  giaTri: (number | null)[];   // null = đứt đoạn, không vẽ điểm/nối
  nhan: string;
  mau?: string;
  dinhDang?: (n: number) => string;
  phanTram?: boolean;           // hiện % thay vì số tuyệt đối trên tooltip
}

export default function BieudoDuong({
  ngay,
  giaTri,
  nhan,
  mau = '#6366f1',
  dinhDang,
  phanTram = false,
}: BieudoDuongProps) {
  const [hover, setHover] = useState<number | null>(null);

  if (!ngay.length) return null;

  const soThuc = giaTri.filter((v): v is number => v !== null);
  if (!soThuc.length) {
    return (
      <div className="flex h-24 items-center justify-center text-xs text-slate-500">
        Không có dữ liệu
      </div>
    );
  }

  const maxVal = Math.max(...soThuc, phanTram ? 1 : 1);
  const yMoc = [0, maxVal / 2, maxVal];

  const W = 800;
  const H = 180;
  const pLeft = 52;
  const pRight = 8;
  const pTop = 16;
  const pBottom = 32;
  const chartW = W - pLeft - pRight;
  const chartH = H - pTop - pBottom;
  const n = ngay.length;

  const format =
    dinhDang ??
    ((v: number) =>
      phanTram
        ? `${(v * 100).toFixed(1)}%`
        : v.toLocaleString('vi-VN'));

  // Hàm chuyển index → toạ độ SVG
  const toX = (i: number) => pLeft + (i / (n - 1)) * chartW;
  const toY = (v: number) => pTop + chartH - (v / maxVal) * chartH;

  // Chia thành các đoạn liên tục (bỏ qua null)
  // Mỗi đoạn là mảng index có giá trị không null liền kề
  const doan: number[][] = [];
  let current: number[] = [];
  for (let i = 0; i < n; i++) {
    if (giaTri[i] !== null) {
      current.push(i);
    } else {
      if (current.length > 0) {
        doan.push(current);
        current = [];
      }
    }
  }
  if (current.length > 0) doan.push(current);

  // Tạo path cho từng đoạn
  const taoPath = (indices: number[]) => {
    if (!indices.length) return '';
    return indices
      .map((i, pos) => {
        const v = giaTri[i] as number;
        const x = toX(i);
        const y = toY(v);
        return `${pos === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  const mocNgay = [0, Math.floor(n / 2), n - 1];

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minHeight: 120 }}>
        {/* Lưới ngang */}
        {yMoc.map((v, i) => {
          const y = toY(v);
          return (
            <g key={i}>
              <line
                x1={pLeft}
                y1={y}
                x2={W - pRight}
                y2={y}
                stroke="currentColor"
                strokeWidth={0.5}
                opacity={0.15}
              />
              <text
                x={pLeft - 4}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                fill="currentColor"
                opacity={0.45}
              >
                {format(v)}
              </text>
            </g>
          );
        })}

        {/* Đường — mỗi đoạn vẽ riêng để đứt đoạn khi null */}
        {doan.map((indices, di) => (
          <path
            key={di}
            d={taoPath(indices)}
            fill="none"
            stroke={mau}
            strokeWidth={2}
            opacity={0.85}
            strokeLinejoin="round"
          />
        ))}

        {/* Điểm dữ liệu */}
        {giaTri.map((v, i) => {
          if (v === null) return null;
          const x = toX(i);
          const y = toY(v);
          const isHover = hover === i;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={isHover ? 5 : 3}
              fill={mau}
              opacity={isHover ? 1 : 0.7}
            />
          );
        })}

        {/* Vùng hover trong suốt phủ toàn bộ */}
        {giaTri.map((v, i) => {
          const ttW = 145;
          const ttX = Math.min(toX(i) - ttW / 2, W - pRight - ttW - 4);

          return (
            <g
              key={`h-${i}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <rect
                x={pLeft + (i / n) * chartW}
                y={pTop}
                width={chartW / n}
                height={chartH}
                fill="transparent"
              />
              {/* Tooltip chỉ khi có dữ liệu */}
              {hover === i && v !== null && (
                <g>
                  <rect
                    x={ttX}
                    y={toY(v) - 36}
                    width={ttW}
                    height={22}
                    rx={4}
                    fill="#1e293b"
                    stroke="#334155"
                    strokeWidth={0.5}
                  />
                  <text
                    x={ttX + 7}
                    y={toY(v) - 20}
                    fontSize={11}
                    fill="#e2e8f0"
                  >
                    {ngay[i]?.slice(5)}: {format(v)} {nhan}
                  </text>
                </g>
              )}
              {/* Tooltip "không có dữ liệu" khi null */}
              {hover === i && v === null && (
                <g>
                  <rect
                    x={ttX}
                    y={pTop + chartH / 2 - 18}
                    width={ttW}
                    height={22}
                    rx={4}
                    fill="#1e293b"
                    stroke="#334155"
                    strokeWidth={0.5}
                  />
                  <text
                    x={ttX + 7}
                    y={pTop + chartH / 2 - 2}
                    fontSize={11}
                    fill="#94a3b8"
                  >
                    {ngay[i]?.slice(5)}: không có dữ liệu
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Nhãn trục X */}
        {mocNgay.map((i) => (
          <text
            key={i}
            x={toX(i)}
            y={H - 6}
            textAnchor="middle"
            fontSize={10}
            fill="currentColor"
            opacity={0.4}
          >
            {ngay[i]?.slice(5)}
          </text>
        ))}
      </svg>
    </div>
  );
}
