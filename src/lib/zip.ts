type ZipEntry = {
  name: string;
  content: string;
};

type EncodedEntry = {
  name: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
};

const encoder = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const day =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();

  return { time, date: day };
}

function header(size: number) {
  return new Uint8Array(size);
}

function set16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function set32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

export function createZip(entries: ZipEntry[]): Blob {
  const now = dosDateTime(new Date());
  const localChunks: Uint8Array[] = [];
  const encoded: EncodedEntry[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const crc = crc32(data);

    const local = header(30);
    const view = new DataView(local.buffer);

    set32(view, 0, 0x04034b50);
    set16(view, 4, 20);
    set16(view, 6, 0x0800);
    set16(view, 8, 0);
    set16(view, 10, now.time);
    set16(view, 12, now.date);
    set32(view, 14, crc);
    set32(view, 18, data.length);
    set32(view, 22, data.length);
    set16(view, 26, name.length);
    set16(view, 28, 0);

    encoded.push({ name, data, crc, offset: localOffset });
    localChunks.push(local, name, data);
    localOffset += local.length + name.length + data.length;
  }

  const centralChunks: Uint8Array[] = [];
  let centralSize = 0;

  for (const entry of encoded) {
    const central = header(46);
    const view = new DataView(central.buffer);

    set32(view, 0, 0x02014b50);
    set16(view, 4, 20);
    set16(view, 6, 20);
    set16(view, 8, 0x0800);
    set16(view, 10, 0);
    set16(view, 12, now.time);
    set16(view, 14, now.date);
    set32(view, 16, entry.crc);
    set32(view, 20, entry.data.length);
    set32(view, 24, entry.data.length);
    set16(view, 28, entry.name.length);
    set16(view, 30, 0);
    set16(view, 32, 0);
    set16(view, 34, 0);
    set16(view, 36, 0);
    set32(view, 38, 0);
    set32(view, 42, entry.offset);

    centralChunks.push(central, entry.name);
    centralSize += central.length + entry.name.length;
  }

  const end = header(22);
  const endView = new DataView(end.buffer);

  set32(endView, 0, 0x06054b50);
  set16(endView, 4, 0);
  set16(endView, 6, 0);
  set16(endView, 8, encoded.length);
  set16(endView, 10, encoded.length);
  set32(endView, 12, centralSize);
  set32(endView, 16, localOffset);
  set16(endView, 20, 0);

  const bytes = concat([...localChunks, ...centralChunks, end]);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "application/zip" });
}
