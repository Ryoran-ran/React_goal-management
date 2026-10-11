const localFileSignature = 0x04034b50;
const centralFileSignature = 0x02014b50;
const endSignature = 0x06054b50;
const utf8Flag = 0x0800;
const maxUint32 = 0xffffffff;

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[index] = value >>> 0;
}

async function crc32(blob: Blob) {
  let value = 0xffffffff;
  const reader = blob.stream().getReader();
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    for (const byte of chunk)
      value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
  };
}

function view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return (
    left.length === right.length &&
    left.every((byte, index) => byte === right[index])
  );
}

export async function createSingleFileZip(name: string, file: Blob) {
  if (!name || /[\\/\0]/.test(name))
    throw new Error("ZIP内のファイル名が正しくありません。");
  const encodedName = new TextEncoder().encode(name);
  if (
    encodedName.length > 0xffff ||
    file.size > maxUint32 - 30 - encodedName.length
  )
    throw new Error("バックアップが大きすぎるためZIPに保存できません。");
  const checksum = await crc32(file);
  const modified = dosDateTime(new Date());
  const local = new Uint8Array(30);
  const localView = view(local);
  localView.setUint32(0, localFileSignature, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(6, utf8Flag, true);
  localView.setUint16(8, 0, true);
  localView.setUint16(10, modified.time, true);
  localView.setUint16(12, modified.date, true);
  localView.setUint32(14, checksum, true);
  localView.setUint32(18, file.size, true);
  localView.setUint32(22, file.size, true);
  localView.setUint16(26, encodedName.length, true);

  const central = new Uint8Array(46);
  const centralView = view(central);
  centralView.setUint32(0, centralFileSignature, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint16(8, utf8Flag, true);
  centralView.setUint16(10, 0, true);
  centralView.setUint16(12, modified.time, true);
  centralView.setUint16(14, modified.date, true);
  centralView.setUint32(16, checksum, true);
  centralView.setUint32(20, file.size, true);
  centralView.setUint32(24, file.size, true);
  centralView.setUint16(28, encodedName.length, true);

  const centralOffset = local.length + encodedName.length + file.size;
  const centralSize = central.length + encodedName.length;
  const end = new Uint8Array(22);
  const endView = view(end);
  endView.setUint32(0, endSignature, true);
  endView.setUint16(8, 1, true);
  endView.setUint16(10, 1, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);

  return new Blob([local, encodedName, file, central, encodedName, end], {
    type: "application/zip",
  });
}

export async function readSingleFileZip(archive: Blob) {
  if (archive.size < 30 + 46 + 22)
    throw new Error("ZIPファイルが破損しています。");
  const local = new Uint8Array(await archive.slice(0, 30).arrayBuffer());
  const localView = view(local);
  if (
    localView.getUint32(0, true) !== localFileSignature ||
    localView.getUint16(6, true) !== utf8Flag ||
    localView.getUint16(8, true) !== 0
  )
    throw new Error("このZIP形式には対応していません。");
  const checksum = localView.getUint32(14, true);
  const compressedSize = localView.getUint32(18, true);
  const size = localView.getUint32(22, true);
  const nameLength = localView.getUint16(26, true);
  const extraLength = localView.getUint16(28, true);
  if (!nameLength || compressedSize !== size)
    throw new Error("ZIPファイルの情報が正しくありません。");
  const nameStart = local.length;
  const dataStart = nameStart + nameLength + extraLength;
  const dataEnd = dataStart + size;
  if (dataEnd + 46 + nameLength + 22 !== archive.size)
    throw new Error("ZIPファイルのサイズが一致しません。");
  const nameBytes = new Uint8Array(
    await archive.slice(nameStart, nameStart + nameLength).arrayBuffer(),
  );
  const name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
  if (!name || /[\\/\0]/.test(name))
    throw new Error("ZIP内のファイル名が正しくありません。");

  const central = new Uint8Array(
    await archive.slice(dataEnd, dataEnd + 46).arrayBuffer(),
  );
  const centralView = view(central);
  const centralNameLength = centralView.getUint16(28, true);
  const centralSize = central.length + centralNameLength;
  if (
    centralView.getUint32(0, true) !== centralFileSignature ||
    centralView.getUint16(8, true) !== utf8Flag ||
    centralView.getUint16(10, true) !== 0 ||
    centralView.getUint32(16, true) !== checksum ||
    centralView.getUint32(20, true) !== size ||
    centralView.getUint32(24, true) !== size ||
    centralNameLength !== nameLength ||
    centralView.getUint16(30, true) !== 0 ||
    centralView.getUint16(32, true) !== 0 ||
    centralView.getUint32(42, true) !== 0
  )
    throw new Error("ZIPファイルの索引が正しくありません。");
  const centralName = new Uint8Array(
    await archive
      .slice(dataEnd + central.length, dataEnd + centralSize)
      .arrayBuffer(),
  );
  if (!sameBytes(nameBytes, centralName))
    throw new Error("ZIP内のファイル名が一致しません。");

  const end = new Uint8Array(
    await archive.slice(dataEnd + centralSize).arrayBuffer(),
  );
  const endView = view(end);
  if (
    end.length !== 22 ||
    endView.getUint32(0, true) !== endSignature ||
    endView.getUint16(4, true) !== 0 ||
    endView.getUint16(6, true) !== 0 ||
    endView.getUint16(8, true) !== 1 ||
    endView.getUint16(10, true) !== 1 ||
    endView.getUint32(12, true) !== centralSize ||
    endView.getUint32(16, true) !== dataEnd ||
    endView.getUint16(20, true) !== 0
  )
    throw new Error("ZIPファイルの終端情報が正しくありません。");

  const file = archive.slice(dataStart, dataEnd, "application/octet-stream");
  if ((await crc32(file)) !== checksum)
    throw new Error("ZIP内のバックアップが破損しています。");
  return { name, file };
}

export async function isZipFile(file: Blob) {
  if (file.size < 4) return false;
  const signature = view(
    new Uint8Array(await file.slice(0, 4).arrayBuffer()),
  ).getUint32(0, true);
  return signature === localFileSignature;
}
