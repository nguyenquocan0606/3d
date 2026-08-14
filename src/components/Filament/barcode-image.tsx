'use client';

import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QRCodeImageProps {
  value: string;
  size?: number;
  margin?: number;
  theme?: 'light' | 'dark';
}

export default function QRCodeImage({
  value,
  size = 128,
  margin = 3,
  theme = 'light',
}: QRCodeImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && value) {
      QRCode.toCanvas(canvasRef.current, value, {
        width: size,
        margin,
        color: {
          dark: theme === 'light' ? '#000000' : '#e2e8f0',
          light: theme === 'light' ? '#ffffff' : '#00000000',
        },
        errorCorrectionLevel: 'H',
      }).catch((err: Error) => {
        console.error('Error generating QR code:', err);
      });
    }
  }, [value, size, margin, theme]);

  return (
    <canvas
      ref={canvasRef}
      className={`max-w-full h-auto ${theme === 'light' ? 'bg-white rounded-lg p-1' : ''}`}
    />
  );
}
