import { describe, it, expect } from 'vitest';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
} from '@zxing/library';
import { buildQrMatrix } from '@/components/passes/RealQrCode';
import { toLocalDateKey } from '@/components/dashboard/ReservationsCalendarView';

describe('RealQrCode matrix encoding & ReservationsCalendarView local timezone key', () => {
  it('buildQrMatrix generates a valid ISO 18004 QR decodable back to the exact pass serial string', () => {
    const serial = 'PASS-CANELO-001';
    const { size, cells } = buildQrMatrix(serial);

    expect(size).toBeGreaterThanOrEqual(21);
    expect(cells.length).toBe(size);

    // Render binary modules onto white background with 4px module scaling + quiet zone
    const scale = 4;
    const quiet = 4;
    const totalModules = size + quiet * 2;
    const imgSize = totalModules * scale;
    const luminances = new Uint8ClampedArray(imgSize * imgSize);
    luminances.fill(255);

    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (!cells[r][c]) continue;
        const startY = (r + quiet) * scale;
        const startX = (c + quiet) * scale;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            luminances[(startY + dy) * imgSize + (startX + dx)] = 0;
          }
        }
      }
    }

    const source = new RGBLuminanceSource(luminances, imgSize, imgSize);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);

    const decoded = new QRCodeReader().decode(bitmap, hints);
    expect(decoded.getText()).toBe(serial);
  });

  it('toLocalDateKey formats timestamps in local calendar timezone instead of UTC toISOString shift', () => {
    // Construct local date 2026-11-20 22:30 local time (in UTC-5 like Bogota this is 2026-11-21T03:30Z)
    const localLateNight = new Date(2026, 10, 20, 22, 30, 0);
    const isoUtc = localLateNight.toISOString();

    const expectedYear = localLateNight.getFullYear();
    const expectedMonth = String(localLateNight.getMonth() + 1).padStart(2, '0');
    const expectedDay = String(localLateNight.getDate()).padStart(2, '0');

    expect(toLocalDateKey(isoUtc)).toBe(`${expectedYear}-${expectedMonth}-${expectedDay}`);
    expect(toLocalDateKey('not-a-valid-date')).toBe('');
  });
});
