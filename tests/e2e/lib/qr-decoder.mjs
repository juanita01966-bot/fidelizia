import zlib from 'node:zlib';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  EncodeHintType,
  HybridBinarizer,
  QRCodeReader,
  QRCodeWriter,
  RGBLuminanceSource,
} from '@zxing/library';

const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function compositeOverWhite(gray, alpha) {
  if (alpha >= 255) return gray;
  if (alpha <= 0) return 255;
  const a = alpha / 255;
  return Math.round(gray * a + 255 * (1 - a));
}

function rgbToLuminance(r, g, b, a = 255) {
  const lum = (r + 2 * g + b) >> 2;
  return compositeOverWhite(lum, a);
}

/**
 * Parses a raw PNG buffer (non-interlaced, color types 0/2/3/4/6, bitDepth 1/2/4/8, filters 0..4)
 * into 8-bit grayscale luminances composited over white.
 * @param {Buffer|Uint8Array} inputBuffer
 * @returns {{ width: number, height: number, luminances: Uint8ClampedArray }}
 */
export function decodePngToLuminance(inputBuffer) {
  const buffer = Buffer.isBuffer(inputBuffer) ? inputBuffer : Buffer.from(inputBuffer);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error('Invalid PNG signature');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let hasIhdr = false;
  let plte = null;
  let trns = null;
  const idatChunks = [];

  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      throw new Error(`Truncated PNG chunk "${type}"`);
    }
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      if (length !== 13) throw new Error(`Invalid IHDR length ${length}`);
      hasIhdr = true;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      plte = data;
    } else if (type === 'tRNS') {
      trns = data;
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!hasIhdr || width <= 0 || height <= 0) {
    throw new Error('Missing or invalid PNG IHDR');
  }
  if (interlace !== 0) {
    throw new Error(`Interlaced PNGs (interlace=${interlace}) are not supported`);
  }
  if (![1, 2, 4, 8].includes(bitDepth)) {
    throw new Error(`Unsupported PNG bitDepth=${bitDepth}`);
  }
  if (![0, 2, 3, 4, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG colorType=${colorType}`);
  }
  if (idatChunks.length === 0) {
    throw new Error('PNG missing IDAT chunks');
  }

  const samplesPerPixel =
    colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  const bitsPerPixel = samplesPerPixel * bitDepth;
  const bytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const rowDataBytes = Math.ceil((width * bitsPerPixel) / 8);

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const expectedBytes = height * (1 + rowDataBytes);
  if (inflated.length < expectedBytes) {
    throw new Error(`Decompressed PNG data too short: expected ${expectedBytes}, got ${inflated.length}`);
  }

  const recon = Buffer.alloc(height * rowDataBytes);
  for (let y = 0; y < height; y += 1) {
    const srcStart = y * (1 + rowDataBytes);
    const filterType = inflated[srcStart];
    const dstStart = y * rowDataBytes;
    const prevStart = (y - 1) * rowDataBytes;

    for (let x = 0; x < rowDataBytes; x += 1) {
      const rawByte = inflated[srcStart + 1 + x];
      const left = x >= bytesPerPixel ? recon[dstStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? recon[prevStart + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? recon[prevStart + x - bytesPerPixel] : 0;

      let val;
      if (filterType === 0) val = rawByte;
      else if (filterType === 1) val = (rawByte + left) & 0xff;
      else if (filterType === 2) val = (rawByte + up) & 0xff;
      else if (filterType === 3) val = (rawByte + ((left + up) >> 1)) & 0xff;
      else if (filterType === 4) val = (rawByte + paethPredictor(left, up, upLeft)) & 0xff;
      else throw new Error(`Unsupported PNG filter type ${filterType}`);
      recon[dstStart + x] = val;
    }
  }

  const luminances = new Uint8ClampedArray(width * height);
  const maxSample = (1 << bitDepth) - 1;

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowDataBytes;
    for (let x = 0; x < width; x += 1) {
      let lum = 255;

      if (colorType === 0) {
        let sample;
        if (bitDepth === 8) {
          sample = recon[rowStart + x];
        } else {
          const bitOffset = x * bitDepth;
          const byteVal = recon[rowStart + (bitOffset >> 3)];
          const shift = 8 - bitDepth - (bitOffset & 7);
          sample = Math.round((((byteVal >> shift) & maxSample) * 255) / maxSample);
        }
        const alpha = trns && trns.length >= 2 && sample === trns.readUInt16BE(0) ? 0 : 255;
        lum = compositeOverWhite(sample, alpha);
      } else if (colorType === 3) {
        let idx;
        if (bitDepth === 8) {
          idx = recon[rowStart + x];
        } else {
          const bitOffset = x * bitDepth;
          const byteVal = recon[rowStart + (bitOffset >> 3)];
          const shift = 8 - bitDepth - (bitOffset & 7);
          idx = (byteVal >> shift) & maxSample;
        }
        if (!plte || idx * 3 + 2 >= plte.length) {
          throw new Error(`Invalid PLTE palette index ${idx}`);
        }
        const r = plte[idx * 3];
        const g = plte[idx * 3 + 1];
        const b = plte[idx * 3 + 2];
        const a = trns && idx < trns.length ? trns[idx] : 255;
        lum = rgbToLuminance(r, g, b, a);
      } else if (colorType === 2) {
        const px = rowStart + x * 3;
        lum = rgbToLuminance(recon[px], recon[px + 1], recon[px + 2], 255);
      } else if (colorType === 4) {
        const px = rowStart + x * 2;
        lum = compositeOverWhite(recon[px], recon[px + 1]);
      } else if (colorType === 6) {
        const px = rowStart + x * 4;
        lum = rgbToLuminance(recon[px], recon[px + 1], recon[px + 2], recon[px + 3]);
      }

      luminances[y * width + x] = lum;
    }
  }

  return { width, height, luminances };
}

function decodeLuminanceBuffer(luminances, width, height) {
  const source = new RGBLuminanceSource(luminances, width, height);
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));
  const reader = new QRCodeReader();
  const hints = new Map([
    [DecodeHintType.TRY_HARDER, true],
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]],
  ]);
  return reader.decode(bitmap, hints);
}

/**
 * Decode an ISO 18004 QR code from a PNG Buffer or data:image/png;base64,... string.
 * @param {Buffer|Uint8Array|string} input
 */
export function decodeQrFromPng(input) {
  let buf;
  if (typeof input === 'string') {
    const match = input.match(/^data:image\/png;base64,(.+)$/i);
    if (!match) {
      throw new Error('Expected PNG Buffer or data:image/png;base64,... URL');
    }
    buf = Buffer.from(match[1], 'base64');
  } else {
    buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  }

  const { width, height, luminances } = decodePngToLuminance(buf);
  const result = decodeLuminanceBuffer(luminances, width, height);
  return {
    text: result.getText(),
    format: 'QR_CODE',
    width,
    height,
    rawBytes: result.getRawBytes ? result.getRawBytes() : null,
  };
}

function unwrapSvgSource(svgMarkupOrDataUrl) {
  const s = String(svgMarkupOrDataUrl || '').trim();
  if (s.startsWith('data:image/svg+xml')) {
    const commaIdx = s.indexOf(',');
    if (commaIdx === -1) throw new Error('Malformed SVG data URL');
    const meta = s.slice(0, commaIdx).toLowerCase();
    const payload = s.slice(commaIdx + 1);
    if (meta.includes(';base64')) {
      return Buffer.from(payload, 'base64').toString('utf8');
    }
    return decodeURIComponent(payload);
  }
  return s;
}

function parseAttr(tag, attrName) {
  const re = new RegExp(`(?:^|\\s)${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = tag.match(re);
  return m ? (m[1] ?? m[2] ?? '') : null;
}

function isLightOrNoneColor(color) {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  return (
    c === 'none' ||
    c === 'transparent' ||
    c === 'white' ||
    c === '#fff' ||
    c === '#ffffff' ||
    c === 'rgb(255,255,255)' ||
    c === 'rgb(255, 255, 255)'
  );
}

function parsePathSubpaths(d) {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) || [];
  const subpaths = [];
  const strokeSegments = [];
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let currentPoly = [];

  const isCmd = (tok) => /^[a-zA-Z]$/.test(tok);
  const nextNum = () => Number.parseFloat(tokens[i++]);

  const flushPoly = () => {
    if (currentPoly.length >= 3) {
      subpaths.push(currentPoly);
    }
    currentPoly = [];
  };

  while (i < tokens.length) {
    if (isCmd(tokens[i])) {
      cmd = tokens[i++];
      if (cmd === 'Z' || cmd === 'z') {
        if (currentPoly.length > 0) {
          strokeSegments.push([cx, cy, sx, sy]);
        }
        cx = sx;
        cy = sy;
        flushPoly();
        continue;
      }
    }

    if (!cmd) break;

    if (cmd === 'M' || cmd === 'm') {
      flushPoly();
      const x = nextNum();
      const y = nextNum();
      cx = cmd === 'm' ? cx + x : x;
      cy = cmd === 'm' ? cy + y : y;
      sx = cx;
      sy = cy;
      currentPoly.push([cx, cy]);
      cmd = cmd === 'm' ? 'l' : 'L';
    } else if (cmd === 'L' || cmd === 'l') {
      const x = nextNum();
      const y = nextNum();
      const nx = cmd === 'l' ? cx + x : x;
      const ny = cmd === 'l' ? cy + y : y;
      strokeSegments.push([cx, cy, nx, ny]);
      cx = nx;
      cy = ny;
      currentPoly.push([cx, cy]);
    } else if (cmd === 'H' || cmd === 'h') {
      const x = nextNum();
      const nx = cmd === 'h' ? cx + x : x;
      strokeSegments.push([cx, cy, nx, cy]);
      cx = nx;
      currentPoly.push([cx, cy]);
    } else if (cmd === 'V' || cmd === 'v') {
      const y = nextNum();
      const ny = cmd === 'v' ? cy + y : y;
      strokeSegments.push([cx, cy, cx, ny]);
      cy = ny;
      currentPoly.push([cx, cy]);
    } else {
      // Skip unsupported curve arguments safely
      i += 1;
    }
  }
  flushPoly();
  return { subpaths, strokeSegments };
}

function rasterizePolygonsEvenOdd(luminances, width, height, polygons, mapX, mapY) {
  // Build edge list across all subpaths in pixel coordinates
  const edges = [];
  for (const poly of polygons) {
    for (let k = 0; k < poly.length; k += 1) {
      const [x1u, y1u] = poly[k];
      const [x2u, y2u] = poly[(k + 1) % poly.length];
      const x1 = mapX(x1u);
      const y1 = mapY(y1u);
      const x2 = mapX(x2u);
      const y2 = mapY(y2u);
      if (y1 === y2) continue;
      if (y1 < y2) edges.push({ yMin: y1, yMax: y2, xAtMin: x1, dxPerY: (x2 - x1) / (y2 - y1) });
      else edges.push({ yMin: y2, yMax: y1, xAtMin: x2, dxPerY: (x1 - x2) / (y1 - y2) });
    }
  }

  for (let py = 0; py < height; py += 1) {
    const scanY = py + 0.5;
    const xs = [];
    for (const e of edges) {
      if (scanY >= e.yMin && scanY < e.yMax) {
        xs.push(e.xAtMin + (scanY - e.yMin) * e.dxPerY);
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let p = 0; p + 1 < xs.length; p += 2) {
      const startX = Math.max(0, Math.ceil(xs[p] - 0.5));
      const endX = Math.min(width - 1, Math.floor(xs[p + 1] - 0.5));
      for (let px = startX; px <= endX; px += 1) {
        luminances[py * width + px] = 0;
      }
    }
  }
}

function fillRectPixels(luminances, imgW, imgH, x0, y0, x1, y1) {
  const startX = Math.max(0, Math.floor(x0));
  const endX = Math.min(imgW, Math.ceil(x1));
  const startY = Math.max(0, Math.floor(y0));
  const endY = Math.min(imgH, Math.ceil(y1));
  for (let py = startY; py < endY; py += 1) {
    const rowOffset = py * imgW;
    for (let px = startX; px < endX; px += 1) {
      luminances[rowOffset + px] = 0;
    }
  }
}

/**
 * Rasterize an SVG string (<rect> and rectilinear <path>) and decode via @zxing/library.
 * @param {string} svgMarkupOrDataUrl
 * @param {{ size?: number, quietZonePx?: number }} [options]
 */
export function decodeQrFromSvg(svgMarkupOrDataUrl, options = {}) {
  const svg = unwrapSvgSource(svgMarkupOrDataUrl);
  if (!/<svg[\s>]/i.test(svg)) {
    throw new Error('Input does not contain valid <svg> markup');
  }

  const svgTagMatch = svg.match(/<svg\b[^>]*>/i);
  const svgTag = svgTagMatch ? svgTagMatch[0] : '';
  const viewBoxStr = parseAttr(svgTag, 'viewBox');
  let vbX = 0;
  let vbY = 0;
  let vbW = Number.parseFloat(parseAttr(svgTag, 'width') || '0');
  let vbH = Number.parseFloat(parseAttr(svgTag, 'height') || '0');

  if (viewBoxStr) {
    const parts = viewBoxStr.trim().split(/[\s,]+/).map(Number.parseFloat);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      [vbX, vbY, vbW, vbH] = parts;
    }
  }
  if (!vbW || !vbH) {
    vbW = vbW || 100;
    vbH = vbH || 100;
  }

  const size = options.size ?? 280;
  const quietZonePx = options.quietZonePx ?? 24;
  const totalSize = size + quietZonePx * 2;
  const scaleX = size / vbW;
  const scaleY = size / vbH;
  const mapX = (x) => quietZonePx + (x - vbX) * scaleX;
  const mapY = (y) => quietZonePx + (y - vbY) * scaleY;

  const luminances = new Uint8ClampedArray(totalSize * totalSize);
  luminances.fill(255);

  let moduleElements = 0;

  // Parse <rect> elements
  const rectRegex = /<rect\b([^>]*)\/?>/gi;
  let match;
  while ((match = rectRegex.exec(svg)) !== null) {
    const attrs = match[0];
    const fill = parseAttr(attrs, 'fill');
    if (isLightOrNoneColor(fill)) continue;

    const x = Number.parseFloat(parseAttr(attrs, 'x') || '0');
    const y = Number.parseFloat(parseAttr(attrs, 'y') || '0');
    const w = Number.parseFloat(parseAttr(attrs, 'width') || '0');
    const h = Number.parseFloat(parseAttr(attrs, 'height') || '0');
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue;
    // Skip full-canvas background rects
    if (w >= vbW * 0.92 && h >= vbH * 0.92) continue;

    fillRectPixels(luminances, totalSize, totalSize, mapX(x), mapY(y), mapX(x + w), mapY(y + h));
    moduleElements += 1;
  }

  // Parse <path> elements
  const pathRegex = /<path\b([^>]*)\/?>/gi;
  while ((match = pathRegex.exec(svg)) !== null) {
    const attrs = match[0];
    const d = parseAttr(attrs, 'd');
    if (!d) continue;

    const fill = parseAttr(attrs, 'fill');
    const stroke = parseAttr(attrs, 'stroke');
    const { subpaths, strokeSegments } = parsePathSubpaths(d);

    if (fill !== 'none' && !isLightOrNoneColor(fill) && subpaths.length > 0) {
      rasterizePolygonsEvenOdd(luminances, totalSize, totalSize, subpaths, mapX, mapY);
      moduleElements += subpaths.length;
    } else if (stroke && !isLightOrNoneColor(stroke) && strokeSegments.length > 0) {
      const strokeW = Number.parseFloat(parseAttr(attrs, 'stroke-width') || '1') || 1;
      const half = strokeW / 2;
      for (const [x1, y1, x2, y2] of strokeSegments) {
        const minX = Math.min(x1, x2) - half;
        const maxX = Math.max(x1, x2) + half;
        const minY = Math.min(y1, y2) - half;
        const maxY = Math.max(y1, y2) + half;
        fillRectPixels(
          luminances,
          totalSize,
          totalSize,
          mapX(minX),
          mapY(minY),
          mapX(maxX),
          mapY(maxY)
        );
      }
      moduleElements += strokeSegments.length;
    }
  }

  if (moduleElements === 0) {
    throw new Error('SVG contains no drawable QR modules (<rect> or <path>)');
  }

  const result = decodeLuminanceBuffer(luminances, totalSize, totalSize);
  return {
    text: result.getText(),
    format: 'QR_CODE',
    moduleElements,
    width: totalSize,
    height: totalSize,
  };
}

/**
 * Auto-detects SVG markup, data:image/svg+xml, data:image/png;base64, or PNG Buffer and decodes QR.
 * @param {string|Buffer|Uint8Array} source
 */
export function decodeQr(source) {
  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (trimmed.startsWith('data:image/png')) {
      const res = decodeQrFromPng(trimmed);
      return { text: res.text, format: 'QR_CODE', sourceType: 'png' };
    }
    const res = decodeQrFromSvg(trimmed);
    return { text: res.text, format: 'QR_CODE', sourceType: 'svg' };
  }
  const res = decodeQrFromPng(source);
  return { text: res.text, format: 'QR_CODE', sourceType: 'png' };
}

/**
 * Never throws; returns { scannable: boolean, text: string | null, error?: string }.
 * @param {string|Buffer|Uint8Array} source
 */
export function tryDecodeQr(source) {
  try {
    const decoded = decodeQr(source);
    return { scannable: true, text: decoded.text };
  } catch (err) {
    return {
      scannable: false,
      text: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function buildBitMatrix(text, size, margin) {
  const writer = new QRCodeWriter();
  const hints = new Map([[EncodeHintType.MARGIN, margin]]);
  return writer.encode(String(text), BarcodeFormat.QR_CODE, size, size, hints);
}

function makePngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcVal = zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0;
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Generates a valid ISO 18004 QR PNG Buffer via @zxing/library QRCodeWriter.
 * @param {string} text
 * @param {{ size?: number, margin?: number }} [options]
 * @returns {Buffer}
 */
export function encodeQrToPng(text, options = {}) {
  const size = options.size ?? 240;
  const margin = options.margin ?? 4;
  const matrix = buildBitMatrix(text, size, margin);
  const w = matrix.getWidth();
  const h = matrix.getHeight();

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowBytes = 1 + w * 4;
  const raw = Buffer.alloc(rowBytes * h);
  for (let y = 0; y < h; y += 1) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0;
    for (let x = 0; x < w; x += 1) {
      const dark = matrix.get(x, y);
      const val = dark ? 0 : 255;
      const px = rowStart + 1 + x * 4;
      raw[px] = val;
      raw[px + 1] = val;
      raw[px + 2] = val;
      raw[px + 3] = 255;
    }
  }

  return Buffer.concat([
    PNG_MAGIC,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', zlib.deflateSync(raw)),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Generates a valid ISO 18004 QR SVG string via @zxing/library QRCodeWriter.
 * @param {string} text
 * @param {{ size?: number, margin?: number, mode?: 'rect'|'path' }} [options]
 * @returns {string}
 */
export function encodeQrToSvg(text, options = {}) {
  const size = options.size ?? 240;
  const margin = options.margin ?? 4;
  const mode = options.mode || 'rect';
  const matrix = buildBitMatrix(text, size, margin);
  const w = matrix.getWidth();
  const h = matrix.getHeight();

  if (mode === 'path') {
    const segments = [];
    for (let y = 0; y < h; y += 1) {
      let x = 0;
      while (x < w) {
        if (!matrix.get(x, y)) {
          x += 1;
          continue;
        }
        const startX = x;
        while (x < w && matrix.get(x, y)) x += 1;
        const run = x - startX;
        segments.push(`M${startX} ${y}h${run}v1h-${run}z`);
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#ffffff"/><path d="${segments.join('')}" fill="#09090b"/></svg>`;
  }

  const rects = [];
  for (let y = 0; y < h; y += 1) {
    let x = 0;
    while (x < w) {
      if (!matrix.get(x, y)) {
        x += 1;
        continue;
      }
      const startX = x;
      while (x < w && matrix.get(x, y)) x += 1;
      rects.push(`<rect x="${startX}" y="${y}" width="${x - startX}" height="1" fill="#09090b"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#ffffff"/>${rects.join('')}</svg>`;
}
