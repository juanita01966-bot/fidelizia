'use client';

import React, { useMemo } from 'react';
import QRCode from 'qrcode';

export interface RealQrCodeProps {
  value: string;
  size?: number;
  className?: string;
}

export function buildQrMatrix(value: string): { size: number; cells: boolean[][] } {
  const safeValue = value.trim() || 'FIDELIZIA-PASS';
  const qr = QRCode.create(safeValue, { errorCorrectionLevel: 'M' });
  const moduleCount = qr.modules.size;
  const cells: boolean[][] = [];

  for (let r = 0; r < moduleCount; r += 1) {
    const row: boolean[] = [];
    for (let c = 0; c < moduleCount; c += 1) {
      row.push(Boolean(qr.modules.get(r, c)));
    }
    cells.push(row);
  }

  return { size: moduleCount, cells };
}

export function RealQrCode({ value, size = 120, className = '' }: RealQrCodeProps) {
  const { viewBoxSize, pathData } = useMemo(() => {
    const matrix = buildQrMatrix(value);
    const margin = 2;
    const total = matrix.size + margin * 2;
    const commands: string[] = [];

    for (let r = 0; r < matrix.size; r += 1) {
      for (let c = 0; c < matrix.size; c += 1) {
        if (matrix.cells[r][c]) {
          const x = c + margin;
          const y = r + margin;
          commands.push(`M${x},${y}h1v1h-1z`);
        }
      }
    }

    return {
      viewBoxSize: total,
      pathData: commands.join(''),
    };
  }, [value]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Código QR para ${value}`}
      data-qr-value={value}
      className={`bg-white rounded-lg shadow-md ${className}`.trim()}
    >
      <rect x={0} y={0} width={viewBoxSize} height={viewBoxSize} fill="#ffffff" />
      <path d={pathData} fill="#09090b" />
    </svg>
  );
}
