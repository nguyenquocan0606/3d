import type { NextConfig } from "next";
import os from "os";

const getLocalIPs = () => {
  const ips: string[] = ["localhost", "127.0.0.1"];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
        ips.push(`${iface.address}:3000`);
      }
    }
  }
  return ips;
};

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cloud-slice-prod.s3.us-east-2.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.anycubic-cloud.anycubic.com',
      },
    ],
  },
  allowedDevOrigins: [
    ...getLocalIPs(),
    'https://2d.quocan.click',
    'https://3d.quocan.click',
    '3d.quocan.click',
  ],
  async rewrites() {
    return [
      {
        source: '/mqtt',
        destination: 'http://127.0.0.1:9001',
      },
    ];
  },
};

export default nextConfig;
