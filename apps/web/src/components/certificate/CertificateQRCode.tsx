'use client';

import React, { useMemo } from 'react';
import { generateQrMatrix } from './qr';

interface CertificateQRCodeProps {
  value: string;
  size?: number;
  className?: string;
}

export function CertificateQRCode({
  value,
  size = 112,
  className = '',
}: CertificateQRCodeProps) {
  const matrix = useMemo(() => {
    try {
      return generateQrMatrix(value);
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-100 rounded-lg text-[10px] text-gray-400 ${className}`}
        style={{ width: size, height: size }}
      >
        QR Preview
      </div>
    );
  }

  const moduleCount = matrix.length;
  const padding = 2;
  const viewBoxSize = moduleCount + padding * 2;

  return (
    <svg
      role='img'
      aria-label={`QR code for certificate verification: ${value}`}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      width={size}
      height={size}
      className={`bg-white rounded-md p-1 shadow-2xs border border-gray-200 ${className}`}
      shapeRendering='crispEdges'
    >
      <rect width={viewBoxSize} height={viewBoxSize} fill='#ffffff' />
      {matrix.map((row, r) =>
        row.map((cell, c) => {
          if (!cell) return null;
          return (
            <rect
              key={`${r}-${c}`}
              x={c + padding}
              y={r + padding}
              width={1}
              height={1}
              fill='#111827'
            />
          );
        })
      )}
    </svg>
  );
}
