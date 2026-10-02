/**
 * Lightweight, zero-dependency QR Code (Byte mode, Error Correction Level L/M)
 * Generates an SVG matrix representation of a URL or string.
 */

// GF(256) tables for Reed-Solomon computation
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = val;
    GF_LOG[val] = i;
    val = (val << 1) ^ (val & 0x80 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMultiply(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x] + GF_LOG[y]];
}

function rsCompute(data: number[], ecCount: number): number[] {
  let poly = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMultiply(poly[j], factor);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }

  const result = new Array(ecCount).fill(0);
  for (let i = 0; i < data.length; i++) {
    const m = result[0] ^ data[i];
    result.shift();
    result.push(0);
    if (m !== 0) {
      for (let j = 0; j < ecCount; j++) {
        result[j] ^= gfMultiply(poly[j], m);
      }
    }
  }
  return result;
}

// Version configs for Low error correction (L)
interface QrVersionConfig {
  version: number;
  size: number;
  dataCapacity: number;
  ecCount: number;
  alignments: number[];
}

const QR_CONFIGS: QrVersionConfig[] = [
  { version: 1, size: 21, dataCapacity: 19, ecCount: 7, alignments: [] },
  { version: 2, size: 25, dataCapacity: 34, ecCount: 10, alignments: [6, 18] },
  { version: 3, size: 29, dataCapacity: 55, ecCount: 15, alignments: [6, 22] },
  { version: 4, size: 33, dataCapacity: 80, ecCount: 20, alignments: [6, 26] },
  { version: 5, size: 37, dataCapacity: 108, ecCount: 26, alignments: [6, 30] },
  { version: 6, size: 41, dataCapacity: 136, ecCount: 36, alignments: [6, 34] },
];

export function generateQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  // Pick smallest fitting version
  const config = QR_CONFIGS.find((c) => c.dataCapacity >= bytes.length + 3) || QR_CONFIGS[QR_CONFIGS.length - 1];
  const { size, dataCapacity, ecCount, alignments } = config;

  // 1. Bitstream packaging: Mode (4 bits: 0100) + Length (8 bits) + Bytes + Terminator (0000)
  const bits: number[] = [];
  const pushBits = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) {
      bits.push((value >> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, 8); // Character count
  for (let i = 0; i < bytes.length; i++) {
    pushBits(bytes[i], 8);
  }
  // Terminator
  const maxDataBits = dataCapacity * 8;
  const termLength = Math.min(4, maxDataBits - bits.length);
  pushBits(0, termLength);
  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Convert to data bytes
  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataBytes.push(b);
  }

  // Pad with alternating 0xEC and 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataBytes.length < dataCapacity) {
    dataBytes.push(padBytes[padIdx % 2]);
    padIdx++;
  }

  // Error correction
  const ecBytes = rsCompute(dataBytes, ecCount);
  const finalCodewords = [...dataBytes, ...ecBytes];

  // 2. Build grid
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (r: number, c: number, val: boolean) => {
    matrix[r][c] = val;
    isFunction[r][c] = true;
  };

  // Finder patterns
  const drawFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = top + r;
        const nc = left + c;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          const isBlack =
            (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
            (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          setModule(nr, nc, isBlack);
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Alignment patterns
  if (alignments.length > 0) {
    for (const ar of alignments) {
      for (const ac of alignments) {
        // Skip if overlaps finder
        if (
          (ar === 6 && ac === 6) ||
          (ar === 6 && ac === size - 7) ||
          (ar === size - 7 && ac === 6)
        ) {
          continue;
        }
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            const isBlack = Math.max(Math.abs(r), Math.abs(c)) !== 1;
            setModule(ar + r, ac + c, isBlack);
          }
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!isFunction[6][i]) setModule(6, i, i % 2 === 0);
    if (!isFunction[i][6]) setModule(i, 6, i % 2 === 0);
  }

  // Dark module
  setModule(size - 8, 8, true);

  // Format info (Level L, Mask 0: (r+c)%2 === 0 -> format bits 0x77c4 ^ 0x5412 = 0x23d6)
  const formatBits = 0x23d6;
  const getFormatBit = (idx: number) => ((formatBits >> idx) & 1) === 1;

  for (let i = 0; i <= 5; i++) setModule(8, i, getFormatBit(i));
  setModule(8, 7, getFormatBit(6));
  setModule(8, 8, getFormatBit(7));
  setModule(7, 8, getFormatBit(8));
  for (let i = 9; i <= 14; i++) setModule(14 - i, 8, getFormatBit(i));

  for (let i = 0; i <= 7; i++) setModule(size - 1 - i, 8, getFormatBit(i));
  for (let i = 8; i <= 14; i++) setModule(8, size - 15 + i, getFormatBit(i));

  // 3. Zig-zag data placement with Mask 0
  let codewordBitIdx = 0;
  const totalBits = finalCodewords.length * 8;
  const getNextBit = () => {
    if (codewordBitIdx >= totalBits) return false;
    const byte = finalCodewords[Math.floor(codewordBitIdx / 8)];
    const bitPos = 7 - (codewordBitIdx % 8);
    codewordBitIdx++;
    return ((byte >> bitPos) & 1) === 1;
  };

  let upwards = true;
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c--; // Skip vertical timing column
    const rows = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const col of [c, c - 1]) {
        if (!isFunction[r][col]) {
          const bit = getNextBit();
          const masked = (r + col) % 2 === 0 ? !bit : bit; // Mask pattern 0
          matrix[r][col] = masked;
        }
      }
    }
    upwards = !upwards;
  }

  return matrix;
}
