'use client';

import React, { useState } from 'react';

// Biểu đồ cột SVG thuần — không dùng thư viện
// Lý do: repo giữ gọn dependency, cột đơn giản không cần recharts (+2.5MB)

interface BieudoCotProps {
  ngay: string[];
  giaTri: number[];
  nhan: string;
  mau?: string;
  dinhDang?: (n: number) => string;
}

export default function BieudoCot({
  ngay,
  giaTri,
  nhan,
  mau = '#6366f1',
  dinhDang,
}: BieudoCotProps) {
  const [hover, setHover] = useState<number | null>(null);

  if (!ngay.length) return null;

  const maxVal = Math.max(...giaTri, 1);
  // 3 mốc trục Y theo §8.3
  const yMoc = [0, Math.round(maxVal / 2), maxVal];

  const W = 800;
  const H = 180;
  const pLeft = 52;
  const pRight = 8;
  const pTop = 16;
  const pBottom = 32;
  const chartW = W - pLeft - pRight;
  const chartH = H - pTop - pBottom;
  const n = ngay.length;
  const slotW = chartW / n;
  const barW = Math.max(slotW - 3, 2);

  const format = dinhDang ?? ((v: number) => v.toLocaleString('vi-VN'));

  // Hiện nhãn ngày ở mốc đầu, giữa, cuối để tránh chật
  const mocNgay = [0, Math.floor(n / 2), n - 1];

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minHeight: 120 }}
      >
        {/* Lưới ngang */}
        {yMoc.map((v, i) => {
          const y = pTop + chartH - (v / maxVal) * chartH;
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

        {/* Cột */}
        {giaTri.map((v, i) => {
          const x = pLeft + i * slotW + (slotW - barW) / 2;
          const barH = Math.max((v / maxVal) * chartH, v > 0 ? 1 : 0);
          const y = pTop + chartH - barH;
          const isHover = hover === i;

          // Tooltip tránh cắt mép phải
          const ttW = 130;
          const ttX = Math.min(pLeft + i * slotW, W - pRight - ttW - 4);

          return (
            <g
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {/* Vùng hover trong suốt để dễ chạm */}
              <rect
                x={pLeft + i * slotW}
                y={pTop}
                width={slotW}
                height={chartH}
                fill="transparent"
              />
              {/* Cột thật */}
              {v > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  fill={mau}
                  opacity={isHover ? 1 : 0.75}
                  rx={2}
                />
              )}
              {/* Tooltip */}
              {isHover && (
                <g>
                  <rect
                    x={ttX}
                    y={y - 34}
                    width={ttW}
                    height={22}
                    rx={4}
                    fill="#1e293b"
                    stroke="#334155"
                    strokeWidth={0.5}
                  />
                  <text
                    x={ttX + 7}
                    y={y - 18}
                    fontSize={11}
                    fill="#e2e8f0"
                  >
                    {ngay[i]?.slice(5)}: {format(v)} {nhan}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Nhãn trục X — chỉ 3 mốc */}
        {mocNgay.map((i) => (
          <text
            key={i}
            x={pLeft + i * slotW + slotW / 2}
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
