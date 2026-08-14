'use client';

import React, { createContext, useContext } from 'react';
import { useScaleMqtt } from '@/hooks/useScaleMqtt';
import { SCALE_TOPIC, getScaleBrokerUrl } from '@/config/scale';

type ScaleContextValue = ReturnType<typeof useScaleMqtt>;

const ScaleContext = createContext<ScaleContextValue | null>(null);

/**
 * Giữ DUY NHẤT 1 kết nối MQTT tới trạm cân cho toàn app.
 * Các component con đọc số cân qua useScale() thay vì tự mở kết nối riêng.
 */
export function ScaleProvider({ children }: { children: React.ReactNode }) {
  const scale = useScaleMqtt({
    brokerUrl: getScaleBrokerUrl(),
    topic: SCALE_TOPIC,
  });

  return <ScaleContext.Provider value={scale}>{children}</ScaleContext.Provider>;
}

export function useScale(): ScaleContextValue {
  const ctx = useContext(ScaleContext);
  if (!ctx) {
    throw new Error('useScale phải được dùng bên trong <ScaleProvider>');
  }
  return ctx;
}
