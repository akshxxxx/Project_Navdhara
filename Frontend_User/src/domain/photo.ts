// A road photo for a report, chosen from the computer or taken with a phone's camera through the file picker.
// It is shrunk and re-saved as JPEG in the browser, which drops the original file's metadata (EXIF),
// including where it was taken; the report already carries its place on NH-7. Same rules as App/src/domain/photo.ts.

export interface ReportPhoto {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

const MAX_SIDE = 1600;
/** The backend refuses anything over 3 MB */
const MAX_BYTES = 3 * 1024 * 1024;

export async function prepareReportPhoto(file: File): Promise<ReportPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('not-image');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('not-image');
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.75));
  if (!blob) throw new Error('canvas');
  if (blob.size > MAX_BYTES) throw new Error('too-big');
  return { blob, url: URL.createObjectURL(blob), width, height };
}
