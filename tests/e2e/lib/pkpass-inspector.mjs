import crypto from 'node:crypto';
import zlib from 'node:zlib';
import forge from 'node-forge';

const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Parses a ZIP buffer via EOCD (0x06054b50), Central Directory (0x02014b50),
 * and Local File Headers (0x04034b50). Supports STORE (0) and DEFLATE (8).
 * @param {Buffer|Uint8Array} inputBuffer
 * @returns {{ entries: Map<string, Buffer>, compressionMethods: Record<string, number> }}
 */
export function parseZipBuffer(inputBuffer) {
  const buffer = Buffer.isBuffer(inputBuffer) ? inputBuffer : Buffer.from(inputBuffer);
  if (buffer.length < 22) {
    throw new Error('Invalid ZIP: buffer smaller than EOCD minimum (22 bytes)');
  }

  let eocdOffset = -1;
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= minOffset; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP: EOCD signature (0x06054b50) not found');
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (cdOffset + cdSize > buffer.length) {
    throw new Error('Invalid ZIP: Central Directory extends past end of buffer');
  }

  const entries = new Map();
  const compressionMethods = {};
  let cursor = cdOffset;

  for (let idx = 0; idx < totalEntries; idx += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`Invalid ZIP: bad Central Directory header at offset ${cursor}`);
    }

    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const expectedCrc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const fileNameLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);

    const fileName = buffer.toString('utf8', cursor + 46, cursor + 46 + fileNameLen);
    cursor += 46 + fileNameLen + extraLen + commentLen;

    if (localHeaderOffset + 30 > buffer.length || buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Invalid ZIP: bad Local File Header for "${fileName}" at ${localHeaderOffset}`);
    }

    const lhNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const lhExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) {
      throw new Error(`Invalid ZIP: compressed payload for "${fileName}" exceeds buffer`);
    }

    const compressedSlice = buffer.subarray(dataStart, dataEnd);
    let data;
    if (compressionMethod === 0) {
      data = Buffer.from(compressedSlice);
    } else if (compressionMethod === 8) {
      data = zlib.inflateRawSync(compressedSlice);
    } else {
      throw new Error(`Unsupported ZIP compression method ${compressionMethod} for "${fileName}"`);
    }

    if (data.length !== uncompressedSize) {
      throw new Error(
        `ZIP size mismatch for "${fileName}": expected ${uncompressedSize}, got ${data.length}`
      );
    }

    const actualCrc = zlib.crc32(data) >>> 0;
    if (actualCrc !== expectedCrc) {
      throw new Error(
        `ZIP CRC32 mismatch for "${fileName}": expected 0x${expectedCrc.toString(16)}, got 0x${actualCrc.toString(16)}`
      );
    }

    entries.set(fileName, data);
    compressionMethods[fileName] = compressionMethod;
  }

  return { entries, compressionMethods };
}

/**
 * Validates PNG magic bytes, IHDR chunk (length 13 + IHDR CRC32), dimensions, and IEND chunk.
 * @param {Buffer|Uint8Array} inputBuffer
 */
export function inspectPngBuffer(inputBuffer) {
  const buffer = Buffer.isBuffer(inputBuffer) ? inputBuffer : Buffer.from(inputBuffer);
  const errors = [];
  const result = {
    valid: false,
    bytes: buffer.length,
    width: 0,
    height: 0,
    bitDepth: 0,
    colorType: 0,
    hasIend: false,
    errors,
  };

  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    errors.push('Invalid PNG magic signature');
    return result;
  }

  let offset = 8;
  let foundIhdr = false;
  let foundIdat = false;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      errors.push(`Truncated PNG chunk "${type}"`);
      break;
    }

    const chunkData = buffer.subarray(dataStart, dataEnd);
    const expectedCrc = buffer.readUInt32BE(dataEnd);
    const actualCrc = zlib.crc32(buffer.subarray(offset + 4, dataEnd)) >>> 0;
    if (actualCrc !== expectedCrc) {
      errors.push(`CRC32 mismatch in PNG chunk "${type}"`);
    }

    if (type === 'IHDR') {
      if (foundIhdr) errors.push('Duplicate IHDR chunk');
      foundIhdr = true;
      if (length !== 13) {
        errors.push(`IHDR length must be 13, got ${length}`);
      } else {
        result.width = chunkData.readUInt32BE(0);
        result.height = chunkData.readUInt32BE(4);
        result.bitDepth = chunkData[8];
        result.colorType = chunkData[9];
        if (result.width <= 0 || result.height <= 0) {
          errors.push(`Invalid PNG dimensions ${result.width}x${result.height}`);
        }
      }
    } else if (type === 'IDAT') {
      foundIdat = true;
    } else if (type === 'IEND') {
      result.hasIend = true;
      offset = dataEnd + 4;
      break;
    }

    offset = dataEnd + 4;
  }

  if (!foundIhdr) errors.push('Missing IHDR chunk');
  if (!foundIdat) errors.push('Missing IDAT chunk');
  if (!result.hasIend) errors.push('Missing IEND chunk');

  result.valid = errors.length === 0;
  return result;
}

/**
 * Unzips and validates a .pkpass archive (pass.json, manifest.json SHA-1 hashes,
 * DER PKCS#7 signature via node-forge, and all PNG assets).
 * @param {Buffer|Uint8Array} buffer
 * @param {{
 *   expectedSerialNumber?: string,
 *   expectedPassTypeId?: string,
 *   expectedTeamId?: string,
 *   minPngBytes?: number,
 *   requireIconPng?: boolean
 * }} [options]
 */
export function inspectPkpass(buffer, options = {}) {
  const minPngBytes = options.minPngBytes ?? 100;
  const requireIconPng = options.requireIconPng ?? true;
  const errors = [];
  const entriesObj = {};
  const pngs = {};
  let fileNames = [];
  let passJson = null;
  let passType = null;
  let manifest = null;
  const fields = {
    primaryFields: [],
    secondaryFields: [],
    auxiliaryFields: [],
    headerFields: [],
    backFields: [],
  };
  const signatureInfo = {
    present: false,
    bytes: 0,
    isDerSequence: false,
    certificateCount: 0,
  };

  let zip;
  try {
    zip = parseZipBuffer(buffer);
    fileNames = Array.from(zip.entries.keys());
    for (const [k, v] of zip.entries.entries()) {
      entriesObj[k] = v;
    }
  } catch (err) {
    errors.push(`ZIP parse error: ${err.message}`);
    return {
      valid: false,
      errors,
      fileNames,
      entries: entriesObj,
      passJson,
      passType,
      fields,
      manifest,
      signatureInfo,
      pngs,
    };
  }

  // 1. pass.json
  const passBuf = zip.entries.get('pass.json');
  if (!passBuf) {
    errors.push('Missing pass.json');
  } else {
    try {
      passJson = JSON.parse(passBuf.toString('utf8'));
      const candidateTypes = ['storeCard', 'coupon', 'generic', 'eventTicket', 'boardingPass'];
      passType = candidateTypes.find((t) => passJson[t] && typeof passJson[t] === 'object') || null;
      if (!passType) {
        errors.push('pass.json missing pass style dictionary (e.g. storeCard)');
      } else {
        const dict = passJson[passType];
        fields.primaryFields = Array.isArray(dict.primaryFields) ? dict.primaryFields : [];
        fields.secondaryFields = Array.isArray(dict.secondaryFields) ? dict.secondaryFields : [];
        fields.auxiliaryFields = Array.isArray(dict.auxiliaryFields) ? dict.auxiliaryFields : [];
        fields.headerFields = Array.isArray(dict.headerFields) ? dict.headerFields : [];
        fields.backFields = Array.isArray(dict.backFields) ? dict.backFields : [];
      }

      if (options.expectedSerialNumber && passJson.serialNumber !== options.expectedSerialNumber) {
        errors.push(
          `serialNumber mismatch: expected "${options.expectedSerialNumber}", got "${passJson.serialNumber}"`
        );
      }
      if (options.expectedPassTypeId && passJson.passTypeIdentifier !== options.expectedPassTypeId) {
        errors.push(
          `passTypeIdentifier mismatch: expected "${options.expectedPassTypeId}", got "${passJson.passTypeIdentifier}"`
        );
      }
      if (options.expectedTeamId && passJson.teamIdentifier !== options.expectedTeamId) {
        errors.push(
          `teamIdentifier mismatch: expected "${options.expectedTeamId}", got "${passJson.teamIdentifier}"`
        );
      }
    } catch (err) {
      errors.push(`Invalid pass.json: ${err.message}`);
    }
  }

  // 2. manifest.json
  const manifestBuf = zip.entries.get('manifest.json');
  if (!manifestBuf) {
    errors.push('Missing manifest.json');
  } else {
    try {
      manifest = JSON.parse(manifestBuf.toString('utf8'));
      if (!manifest['pass.json']) {
        errors.push('manifest.json does not include pass.json hash');
      }
      for (const [entryName, expectedHash] of Object.entries(manifest)) {
        const entryData = zip.entries.get(entryName);
        if (!entryData) {
          errors.push(`manifest.json references missing entry "${entryName}"`);
          continue;
        }
        const actualSha1 = crypto.createHash('sha1').update(entryData).digest('hex');
        if (actualSha1.toLowerCase() !== String(expectedHash).toLowerCase()) {
          errors.push(
            `manifest.json SHA-1 mismatch for "${entryName}": expected ${expectedHash}, got ${actualSha1}`
          );
        }
      }
    } catch (err) {
      errors.push(`Invalid manifest.json: ${err.message}`);
    }
  }

  // 3. signature (PKCS#7 DER)
  const sigBuf = zip.entries.get('signature');
  if (!sigBuf || sigBuf.length === 0) {
    errors.push('Missing or empty signature');
  } else {
    signatureInfo.present = true;
    signatureInfo.bytes = sigBuf.length;
    signatureInfo.isDerSequence = sigBuf[0] === 0x30;
    try {
      const asn1 = forge.asn1.fromDer(forge.util.createBuffer(sigBuf.toString('binary')));
      const p7 = forge.pkcs7.messageFromAsn1(asn1);
      signatureInfo.certificateCount = Array.isArray(p7.certificates) ? p7.certificates.length : 0;
      if (signatureInfo.certificateCount === 0) {
        errors.push('PKCS#7 signature contains 0 certificates');
      }
    } catch (err) {
      errors.push(`Invalid PKCS#7 DER signature: ${err.message}`);
    }
  }

  // 4. PNG assets
  for (const [name, data] of zip.entries.entries()) {
    if (name.toLowerCase().endsWith('.png')) {
      const inspected = inspectPngBuffer(data);
      if (inspected.bytes < minPngBytes) {
        inspected.errors.push(`PNG "${name}" size ${inspected.bytes} bytes < minimum ${minPngBytes} bytes`);
        inspected.valid = false;
      }
      pngs[name] = inspected;
      if (!inspected.valid) {
        errors.push(`Invalid PNG "${name}": ${inspected.errors.join('; ')}`);
      }
    }
  }

  if (requireIconPng && !pngs['icon.png'] && !pngs['icon@2x.png']) {
    errors.push('Missing required icon.png (or icon@2x.png) asset');
  }

  return {
    valid: errors.length === 0,
    errors,
    fileNames,
    entries: entriesObj,
    passJson,
    passType,
    fields,
    manifest,
    signatureInfo,
    pngs,
  };
}
