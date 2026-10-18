// Lossless packing: reflected vertices share six float32 bit patterns. Float
// deltas use separate byte planes; references and indices use signed varints.
const MAGIC = 0x4c4f4733;

export function packMesh(buffer) {
  const header = new Uint32Array(buffer, 0, 4);
  const [, vertexCount, indexCount] = header;
  const positions = new Uint32Array(buffer, 16, vertexCount * 3);
  const normals = new Uint32Array(buffer, 16 + vertexCount * 12, vertexCount * 3);
  const indices = new Uint32Array(buffer, 16 + vertexCount * 24, indexCount);
  const lookup = new Map(), unique = [], references = [];
  for (let i = 0; i < vertexCount; i++) {
    const p = i * 3;
    const row = [positions[p], positions[p + 1], positions[p + 2] & 0x7fffffff,
      normals[p], normals[p + 1], normals[p + 2] & 0x7fffffff];
    const key = row.join(',');
    if (!lookup.has(key)) { lookup.set(key, unique.length / 6); unique.push(...row); }
    references.push(lookup.get(key) * 4 + (positions[p + 2] >>> 31) + 2 * (normals[p + 2] >>> 31));
  }
  const count = unique.length / 6;
  const planes = new Uint8Array(unique.length * 4);
  for (let i = 0; i < unique.length; i++) {
    const delta = (unique[i] - (i >= 6 ? unique[i - 6] : 0)) >>> 0;
    for (let byte = 0; byte < 4; byte++) {
      planes[(i % 6 * 4 + byte) * count + Math.floor(i / 6)] = delta >>> (byte * 8) & 255;
    }
  }
  const variable = [];
  for (const values of [references, indices]) {
    let previous = 0;
    for (const value of values) {
      const delta = value - previous;
      previous = value;
      let encoded = ((delta << 1) ^ (delta >> 31)) >>> 0;
      while (encoded >= 128) { variable.push((encoded & 127) | 128); encoded >>>= 7; }
      variable.push(encoded);
    }
  }
  const result = new Uint8Array(16 + planes.length + variable.length);
  new Uint32Array(result.buffer, 0, 4).set([MAGIC, vertexCount, indexCount, count]);
  result.set(planes, 16);
  result.set(variable, 16 + planes.length);
  return result;
}

export function unpackMesh(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 16) throw new Error('Truncated logo mesh');
  const [magic, vertexCount, indexCount, count] = new Uint32Array(buffer, 0, 4);
  if (magic !== MAGIC || count > vertexCount || vertexCount > 1000000 || indexCount > 6000000 || bytes.length < 16 + count * 24) {
    throw new Error('Invalid packed logo mesh');
  }
  const unique = new Uint32Array(count * 6);
  for (let i = 0; i < unique.length; i++) {
    let delta = 0;
    for (let byte = 0; byte < 4; byte++) {
      delta |= bytes[16 + (i % 6 * 4 + byte) * count + Math.floor(i / 6)] << (byte * 8);
    }
    unique[i] = delta + (i >= 6 ? unique[i - 6] : 0);
  }
  let cursor = 16 + count * 24;
  function readDelta() {
    let value = 0;
    for (let shift = 0; shift <= 28; shift += 7) {
      if (cursor >= bytes.length) throw new Error('Truncated logo mesh');
      const byte = bytes[cursor++];
      value |= (byte & 127) << shift;
      if (!(byte & 128)) return (value >>> 1) ^ -(value & 1);
    }
    throw new Error('Invalid mesh index');
  }
  const result = new ArrayBuffer(16 + vertexCount * 24 + indexCount * 4);
  new Uint32Array(result, 0, 4).set([0x4c4f474f, vertexCount, indexCount, 2]);
  const positions = new Uint32Array(result, 16, vertexCount * 3);
  const normals = new Uint32Array(result, 16 + vertexCount * 12, vertexCount * 3);
  let reference = 0;
  for (let i = 0; i < vertexCount; i++) {
    reference += readDelta();
    if (reference < 0 || reference >= count * 4) throw new Error('Invalid mesh reference');
    const offset = (reference >>> 2) * 6;
    positions.set(unique.subarray(offset, offset + 3), i * 3);
    normals.set(unique.subarray(offset + 3, offset + 6), i * 3);
    positions[i * 3 + 2] ^= (reference & 1) << 31;
    normals[i * 3 + 2] ^= (reference & 2) << 30;
  }
  const indices = new Uint32Array(result, 16 + vertexCount * 24, indexCount);
  let index = 0;
  for (let i = 0; i < indexCount; i++) {
    index += readDelta();
    if (index < 0 || index >= vertexCount) throw new Error('Invalid mesh index');
    indices[i] = index;
  }
  if (cursor !== bytes.length) throw new Error('Unexpected mesh data');
  return result;
}

export async function decodeMesh(buffer) {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return unpackMesh(await new Response(stream).arrayBuffer());
}
