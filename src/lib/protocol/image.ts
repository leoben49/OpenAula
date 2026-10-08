/**
 * Screen animation format: a 256-byte header (frame count, then one delay byte
 * per frame, padded with 0xFF) followed by 128x128 RGB565 little-endian frames,
 * zero padded to a multiple of the 4096-byte transfer size.
 */

export const SCREEN_SIZE = 128;
export const FRAME_BYTES = SCREEN_SIZE * SCREEN_SIZE * 2;
export const HEADER_BYTES = 256;
export const CHUNK_BYTES = 4096;
export const MAX_FRAMES = 255;
/**
 * Delay byte unit. Guessed from the driver's "30-500" delay range fitting in a
 * byte; unconfirmed.
 */
export const DELAY_UNIT_MS = 2;

export interface Frame {
  /** RGBA pixels, SCREEN_SIZE x SCREEN_SIZE. */
  rgba: Uint8ClampedArray;
  delayMs: number;
}

export const delayByte = (ms: number) => Math.max(1, Math.min(255, Math.round(ms / DELAY_UNIT_MS)));

export function rgb565(r: number, g: number, b: number): number {
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}

export function encodeAnimation(frames: Frame[]): Uint8Array<ArrayBuffer> {
  if (frames.length === 0) throw new RangeError('no frames');
  if (frames.length > MAX_FRAMES) throw new RangeError(`at most ${MAX_FRAMES} frames`);
  const raw = HEADER_BYTES + frames.length * FRAME_BYTES;
  const out = new Uint8Array(Math.ceil(raw / CHUNK_BYTES) * CHUNK_BYTES);
  out.fill(0xff, 0, HEADER_BYTES);
  out[0] = frames.length;
  frames.forEach((f, i) => {
    out[1 + i] = delayByte(f.delayMs);
    let o = HEADER_BYTES + i * FRAME_BYTES;
    const px = f.rgba;
    for (let j = 0; j < px.length; j += 4) {
      const v = rgb565(px[j], px[j + 1], px[j + 2]);
      out[o++] = v & 0xff;
      out[o++] = v >> 8;
    }
  });
  return out;
}

export function blackFrame(): Frame {
  const rgba = new Uint8ClampedArray(SCREEN_SIZE * SCREEN_SIZE * 4);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  return { rgba, delayMs: 500 };
}

/**
 * Fits a source image into the square screen, letterboxed on black. With
 * original, small images keep their size instead of being scaled up.
 */
function drawFitted(ctx: OffscreenCanvasRenderingContext2D, src: CanvasImageSource, w: number, h: number, original: boolean) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SCREEN_SIZE, SCREEN_SIZE);
  const fit = Math.min(SCREEN_SIZE / w, SCREEN_SIZE / h);
  const scale = original ? Math.min(1, fit) : fit;
  const dw = w * scale;
  const dh = h * scale;
  // Pixel art stays crisp when scaled up by a whole factor.
  ctx.imageSmoothingEnabled = !(scale >= 1 && Number.isInteger(scale));
  ctx.drawImage(src, (SCREEN_SIZE - dw) / 2, (SCREEN_SIZE - dh) / 2, dw, dh);
  return ctx.getImageData(0, 0, SCREEN_SIZE, SCREEN_SIZE).data;
}

/** Decodes a GIF/PNG/JPEG/WebP file into screen-sized frames (needs WebCodecs ImageDecoder). */
export async function decodeImage(file: File, original = false): Promise<Frame[]> {
  const canvas = new OffscreenCanvas(SCREEN_SIZE, SCREEN_SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  if (!('ImageDecoder' in window)) {
    const bmp = await createImageBitmap(file);
    return [{ rgba: drawFitted(ctx, bmp, bmp.width, bmp.height, original), delayMs: 500 }];
  }
  const decoder = new ImageDecoder({ data: file.stream(), type: file.type || 'image/gif' });
  await decoder.tracks.ready;
  const count = Math.min(decoder.tracks.selectedTrack?.frameCount ?? 1, MAX_FRAMES);
  const frames: Frame[] = [];
  for (let i = 0; i < count; i++) {
    const { image } = await decoder.decode({ frameIndex: i });
    frames.push({
      rgba: drawFitted(ctx, image, image.displayWidth, image.displayHeight, original),
      delayMs: (image.duration ?? 100_000) / 1000,
    });
    image.close();
  }
  decoder.close();
  return frames;
}
