export type ZipArchiveSource = {
  name: string;
  url: string;
};

export type ZipArchiveProgress = {
  loaded: number;
  total: number;
  currentName?: string;
};

type ZipEntry = {
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  time: number;
  date: number;
  localHeaderOffset: number;
};

const textEncoder = new TextEncoder();

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const sanitizeZipName = (value: string, fallback: string) => {
  const normalized = String(value || '').trim() || fallback;
  return normalized
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 180) || fallback;
};

const makeUniqueName = (name: string, seen: Map<string, number>) => {
  const safeName = sanitizeZipName(name, 'file');
  const lower = safeName.toLowerCase();
  const count = seen.get(lower) || 0;
  seen.set(lower, count + 1);
  if (count === 0) return safeName;

  const dotIndex = safeName.lastIndexOf('.');
  if (dotIndex > 0) {
    return `${safeName.slice(0, dotIndex)}-${count + 1}${safeName.slice(dotIndex)}`;
  }
  return `${safeName}-${count + 1}`;
};

const getDosDateTime = (date = new Date()) => {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time: dosTime, date: dosDate };
};

const writeUint16 = (target: Uint8Array, offset: number, value: number) => {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
};

const writeUint32 = (target: Uint8Array, offset: number, value: number) => {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
};

const appendBytes = (parts: Uint8Array[], bytes: Uint8Array) => {
  parts.push(bytes);
  return bytes.length;
};

export const buildZipArchive = async (
  sources: ZipArchiveSource[],
  onProgress?: (progress: ZipArchiveProgress) => void,
): Promise<Blob> => {
  const validSources = (sources || [])
    .map((source) => ({
      name: String(source?.name || '').trim(),
      url: String(source?.url || '').trim(),
    }))
    .filter((source) => source.url);

  if (validSources.length === 0) {
    throw new Error('فایلی برای فشرده‌سازی انتخاب نشده است.');
  }

  const seenNames = new Map<string, number>();
  const { time, date } = getDosDateTime();
  const entries: ZipEntry[] = [];

  for (const [index, source] of validSources.entries()) {
    onProgress?.({ loaded: index, total: validSources.length, currentName: source.name });
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`دریافت فایل "${source.name || source.url}" ناموفق بود.`);
    }
    const data = new Uint8Array(await response.arrayBuffer());
    entries.push({
      nameBytes: textEncoder.encode(makeUniqueName(source.name || `file-${index + 1}`, seenNames)),
      data,
      crc: crc32(data),
      time,
      date,
      localHeaderOffset: 0,
    });
    onProgress?.({ loaded: index + 1, total: validSources.length, currentName: source.name });
  }

  const parts: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    entry.localHeaderOffset = offset;
    const header = new Uint8Array(30);
    writeUint32(header, 0, 0x04034b50);
    writeUint16(header, 4, 20);
    writeUint16(header, 6, 0x0800);
    writeUint16(header, 8, 0);
    writeUint16(header, 10, entry.time);
    writeUint16(header, 12, entry.date);
    writeUint32(header, 14, entry.crc);
    writeUint32(header, 18, entry.data.length);
    writeUint32(header, 22, entry.data.length);
    writeUint16(header, 26, entry.nameBytes.length);
    writeUint16(header, 28, 0);
    offset += appendBytes(parts, header);
    offset += appendBytes(parts, entry.nameBytes);
    offset += appendBytes(parts, entry.data);
  });

  const centralDirectoryOffset = offset;
  entries.forEach((entry) => {
    const header = new Uint8Array(46);
    writeUint32(header, 0, 0x02014b50);
    writeUint16(header, 4, 20);
    writeUint16(header, 6, 20);
    writeUint16(header, 8, 0x0800);
    writeUint16(header, 10, 0);
    writeUint16(header, 12, entry.time);
    writeUint16(header, 14, entry.date);
    writeUint32(header, 16, entry.crc);
    writeUint32(header, 20, entry.data.length);
    writeUint32(header, 24, entry.data.length);
    writeUint16(header, 28, entry.nameBytes.length);
    writeUint16(header, 30, 0);
    writeUint16(header, 32, 0);
    writeUint16(header, 34, 0);
    writeUint16(header, 36, 0);
    writeUint32(header, 38, 0);
    writeUint32(header, 42, entry.localHeaderOffset);
    offset += appendBytes(parts, header);
    offset += appendBytes(parts, entry.nameBytes);
  });
  const centralDirectorySize = offset - centralDirectoryOffset;

  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 4, 0);
  writeUint16(end, 6, 0);
  writeUint16(end, 8, entries.length);
  writeUint16(end, 10, entries.length);
  writeUint32(end, 12, centralDirectorySize);
  writeUint32(end, 16, centralDirectoryOffset);
  writeUint16(end, 20, 0);
  appendBytes(parts, end);

  return new Blob(parts, { type: 'application/zip' });
};
