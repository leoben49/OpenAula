<script lang="ts">
  import { onMount } from 'svelte';
  import { kb, devlog } from '../lib/state/keyboard.svelte';
  import { loadScreen, saveScreen, type StoredScreen } from '../lib/screen-store';
  import { blackFrame, CHUNK_BYTES, decodeImage, encodeAnimation, SCREEN_SIZE, type Frame } from '../lib/protocol/image';
  import Card from './ui/Card.svelte';

  let frames = $state<Frame[]>([]);
  let fileName = $state('');
  let file: File | null = null;
  let originalSize = $state(false);
  let progress = $state<{ done: number; total: number } | null>(null);
  let status = $state('');
  /** What we last uploaded from this browser, i.e. what the screen should be showing. */
  let onKeyboard = $state<StoredScreen | null>(null);
  /** True while the preview shows `onKeyboard` rather than a newly picked file. */
  let showingStored = $state(false);

  onMount(async () => {
    const stored = await loadScreen();
    if (!stored || file) return;
    onKeyboard = stored;
    if (!stored.file) {
      frames = [blackFrame()];
    } else {
      try {
        frames = await decodeImage(new File([stored.file], stored.name, { type: stored.type }), stored.originalSize);
      } catch {
        return;
      }
    }
    showingStored = true;
  });

  async function decode() {
    if (!file) return;
    status = 'Decoding…';
    try {
      frames = await decodeImage(file, originalSize);
      fileName = file.name;
      showingStored = false;
      status = '';
    } catch (err) {
      status = `Could not read that image: ${err}`;
    }
  }

  function pickFile(e: Event) {
    file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
    void decode();
  }

  async function upload(f: Frame[], black = false) {
    if (!kb.wired || progress) return;
    status = '';
    const source = black ? null : file;
    const payload = encodeAnimation(f);
    const total = payload.length / CHUNK_BYTES;
    progress = { done: 0, total };
    const started = performance.now();
    devlog({ step: 'upload', frames: f.length, chunks: total });
    try {
      // Slot 2 is what the official driver used for the upload that shows on screen.
      await kb.wired.uploadAnimation(payload, 2, (done, t) => (progress = { done, total: t }));
      status = `Uploaded ${f.length} frame${f.length === 1 ? '' : 's'} in ${((performance.now() - started) / 1000).toFixed(1)} s`;
      const stored: StoredScreen = {
        file: source,
        name: source?.name ?? 'Black screen',
        type: source?.type ?? '',
        originalSize,
        uploadedAt: Date.now(),
      };
      onKeyboard = stored;
      await saveScreen(stored);
      if (black) frames = f;
      showingStored = true;
    } catch (err) {
      status = `Upload failed: ${err}`;
      devlog({ step: 'uploadError', error: String(err) });
    } finally {
      progress = null;
    }
  }

  // Animated preview.
  let canvas = $state<HTMLCanvasElement>();
  $effect(() => {
    if (!canvas || frames.length === 0) return;
    const ctx = canvas.getContext('2d')!;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const draw = () => {
      const f = frames[i];
      ctx.putImageData(new ImageData(new Uint8ClampedArray(f.rgba), SCREEN_SIZE, SCREEN_SIZE), 0, 0);
      i = (i + 1) % frames.length;
      if (frames.length > 1) timer = setTimeout(draw, Math.max(20, f.delayMs));
    };
    draw();
    return () => clearTimeout(timer);
  });

  const eta = $derived(frames.length ? Math.ceil((256 + frames.length * SCREEN_SIZE * SCREEN_SIZE * 2) / CHUNK_BYTES / 7) : 0);
</script>

<Card title="Screen" subtitle="Upload a GIF or image to the 128×128 screen. Needs the USB cable (the dongle can't carry screen data).">
  {#if !kb.wired}
    <div class="notice">
      <span>Plug in the cable and switch the keyboard to wired mode, then connect it.</span>
      <button class="btn" onclick={() => kb.connect()}>Connect cable…</button>
    </div>
  {/if}
  <div class="screen">
    <figure>
      <canvas bind:this={canvas} width={SCREEN_SIZE} height={SCREEN_SIZE}></canvas>
      <figcaption class="muted small">
        {#if showingStored && onKeyboard}
          On your keyboard: {onKeyboard.name}
        {:else if frames.length}
          Preview, not uploaded yet
        {:else}
          Nothing uploaded from this browser yet
        {/if}
      </figcaption>
    </figure>
    <div class="controls">
      <label class="btn">
        Choose GIF or image…
        <input type="file" accept="image/gif,image/png,image/jpeg,image/webp" onchange={pickFile} hidden />
      </label>
      {#if fileName && !showingStored}
        <p class="muted small">{fileName}: {frames.length} frame{frames.length === 1 ? '' : 's'} · about {eta} s to upload</p>
        <label class="check muted small">
          <input type="checkbox" bind:checked={originalSize} onchange={decode} />
          Original size (don't enlarge)
        </label>
      {/if}
      <div class="buttons">
        <button class="btn primary" disabled={!kb.wired || !frames.length || !!progress} onclick={() => upload(frames)}>Upload</button>
        <button class="btn" disabled={!kb.wired || !!progress} onclick={() => upload([blackFrame()], true)}>Black screen</button>
      </div>
      {#if progress}
        <div class="meter"><div class="fill" style:width="{(progress.done / progress.total) * 100}%"></div></div>
        <p class="muted small">{progress.done} / {progress.total} chunks. Keep the cable connected.</p>
      {/if}
      {#if status}<p class="small">{status}</p>{/if}
    </div>
  </div>
</Card>

<style>
  .notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 16px;
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-2);
  }
  .screen {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
  }
  figure {
    margin: 0;
    display: grid;
    gap: 8px;
    width: 192px;
  }
  figcaption {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  canvas {
    width: 192px;
    height: 192px;
    image-rendering: pixelated;
    background: #000;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
  }
  .controls {
    flex: 1;
    min-width: 220px;
    display: grid;
    gap: 10px;
    align-content: start;
    justify-items: start;
  }
  .controls p {
    margin: 0;
  }
  .small {
    font-size: 12px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .check input {
    accent-color: var(--accent);
    margin: 0;
  }
  .buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .meter {
    width: 100%;
    height: 8px;
    border-radius: 4px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s var(--ease);
  }
</style>
