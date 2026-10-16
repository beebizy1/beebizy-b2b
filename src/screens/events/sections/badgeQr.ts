import QRCode from "qrcode";

export interface BadgeQrMatrix {
  size: number;
  dark(row: number, column: number): boolean;
}

export function badgeQrMatrix(value: string): BadgeQrMatrix {
  const code = QRCode.create(value, { errorCorrectionLevel: "M" });
  return {
    size: code.modules.size,
    dark: (row, column) => code.modules.data[row * code.modules.size + column] === 1,
  };
}

export function badgeQrSvgDataUrl(value: string): string {
  const matrix = badgeQrMatrix(value);
  const quiet = 4;
  const size = matrix.size + quiet * 2;
  const cells: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (matrix.dark(row, column)) cells.push(`<rect x="${column + quiet}" y="${row + quiet}" width="1" height="1"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><g fill="black">${cells.join("")}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
