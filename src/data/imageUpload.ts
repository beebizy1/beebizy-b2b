const MAX_UPLOAD_BYTES = 4_000_000;
const TARGET_UPLOAD_BYTES = 3_700_000;
const MAX_INPUT_BYTES = 30_000_000;
const MAX_IMAGE_EDGE = 2_400;

export type ImageTranscoder = (file: File) => Promise<File>;

export function fitImageDimensions(width: number, height: number, maxEdge = MAX_IMAGE_EDGE): { width: number; height: number } {
  if (width <= maxEdge && height <= maxEdge) return { width, height };
  const scale = maxEdge / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function outputName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "") || "image"}.webp`;
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("This browser could not resize the image.")),
    "image/webp",
    quality,
  ));
}

async function browserTranscode(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This image format could not be opened. Please use a JPG, PNG, or WebP image.");
  }

  try {
    let dimensions = fitImageDimensions(bitmap.width, bitmap.height);
    let lastBlob: Blob | null = null;

    for (let sizePass = 0; sizePass < 4; sizePass += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser could not prepare the image.");
      context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);

      for (const quality of [0.86, 0.74, 0.62, 0.5]) {
        lastBlob = await canvasBlob(canvas, quality);
        if (lastBlob.size <= TARGET_UPLOAD_BYTES) {
          return new File([lastBlob], outputName(file.name), { type: "image/webp", lastModified: file.lastModified });
        }
      }

      dimensions = {
        width: Math.max(640, Math.round(dimensions.width * 0.8)),
        height: Math.max(640, Math.round(dimensions.height * 0.8)),
      };
    }

    if (lastBlob && lastBlob.size <= MAX_UPLOAD_BYTES) {
      return new File([lastBlob], outputName(file.name), { type: "image/webp", lastModified: file.lastModified });
    }
    throw new Error("The image is still too large after resizing. Please choose a smaller image.");
  } finally {
    bitmap.close();
  }
}

export async function prepareImageForUpload(file: File, transcode: ImageTranscoder = browserTranscode): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a JPG, PNG, WebP, or another image file.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("Choose an image smaller than 30 MB.");
  if (file.size <= MAX_UPLOAD_BYTES) return file;

  const prepared = await transcode(file);
  if (!prepared.type.startsWith("image/") || prepared.size > MAX_UPLOAD_BYTES) {
    throw new Error("The image could not be reduced below the 4 MB upload limit.");
  }
  return prepared;
}
