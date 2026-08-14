import { useState, useEffect, useCallback } from 'react';
import mqtt from 'mqtt';

interface UseScaleMqttProps {
  brokerUrl: string; // VD: 'ws://192.168.1.100:9001'
  topic: string;     // VD: 'espscale/sensor/live_weight/state'
}

export const useScaleMqtt = ({ brokerUrl, topic }: UseScaleMqttProps) => {
  const [rawWeight, setRawWeight] = useState<number>(0);
  const [weight, setWeight] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [offset, setOffsetState] = useState<number>(0);

  // Khởi tạo offset từ localStorage (chỉ chạy ở client side)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedOffset = localStorage.getItem('scale_offset');
      if (savedOffset) {
        setOffsetState(parseFloat(savedOffset));
      }
    }
  }, []);

  const setOffset = useCallback((newOffset: number) => {
    setOffsetState(newOffset);
    if (typeof window !== 'undefined') {
      localStorage.setItem('scale_offset', newOffset.toString());
      window.dispatchEvent(new CustomEvent('scaleOffsetChanged', { detail: newOffset }));
    }
  }, []);

  useEffect(() => {
    const handleOffsetChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === 'number') {
        setOffsetState(detail);
      }
    };
    window.addEventListener('scaleOffsetChanged', handleOffsetChange);
    return () => window.removeEventListener('scaleOffsetChanged', handleOffsetChange);
  }, []);

  useEffect(() => {
    setWeight(rawWeight + offset);
  }, [rawWeight, offset]);

  useEffect(() => {
    // Kết nối tới MQTT Broker qua giao thức WebSockets.
    // reconnectPeriod: mqtt.js tự động kết nối lại khi mất mạng/broker restart.
    const client = mqtt.connect(brokerUrl, { reconnectPeriod: 3000 });

    client.on('connect', () => {
      setIsConnected(true);
      client.subscribe(topic);
    });

    client.on('message', (receivedTopic, message) => {
      if (receivedTopic === topic) {
        const val = parseFloat(message.toString());
        if (!isNaN(val)) {
          setRawWeight(val);
        }
      }
    });

    client.on('error', (err) => {
      // KHÔNG gọi client.end() ở đây — end() sẽ tắt cơ chế tự reconnect
      // khiến trạm cân chết vĩnh viễn cho tới khi F5.
      console.error('Lỗi MQTT: ', err);
      setIsConnected(false);
    });

    client.on('close', () => {
      setIsConnected(false);
    });

    client.on('offline', () => {
      setIsConnected(false);
    });

    // Cleanup chống memory leak
    return () => {
      if (client) {
        client.end();
      }
    };
  }, [brokerUrl, topic]);

  return { weight, rawWeight, offset, setOffset, isConnected };
};
