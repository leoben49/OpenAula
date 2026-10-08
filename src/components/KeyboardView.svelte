<script lang="ts">
  import { KEY_HEIGHT, KEYS, LAYOUT_HEIGHT, LAYOUT_WIDTH, type Key } from '../lib/layout';

  let {
    labelFor = (k: Key) => k.label,
    colourFor,
    changed = () => false,
    selected = null,
    onkey,
  }: {
    labelFor?: (k: Key) => string;
    colourFor?: (k: Key) => string | undefined;
    changed?: (k: Key) => boolean;
    selected?: number | null;
    onkey: (k: Key, e: MouseEvent) => void;
  } = $props();

  const PAD = 10;
</script>

<div class="board" style:aspect-ratio="{LAYOUT_WIDTH + PAD * 2} / {LAYOUT_HEIGHT + PAD * 2}">
  {#each KEYS as k (k.index)}
    {@const colour = colourFor?.(k)}
    <button
      class="key"
      class:changed={changed(k)}
      class:selected={selected === k.index}
      class:lit={!!colour}
      style:left="{((k.x + PAD) / (LAYOUT_WIDTH + PAD * 2)) * 100}%"
      style:top="{((k.y + PAD) / (LAYOUT_HEIGHT + PAD * 2)) * 100}%"
      style:width="{(k.w / (LAYOUT_WIDTH + PAD * 2)) * 100}%"
      style:height="{(KEY_HEIGHT / (LAYOUT_HEIGHT + PAD * 2)) * 100}%"
      style:--glow={colour}
      title={k.label}
      onclick={(e) => onkey(k, e)}><span>{labelFor(k)}</span></button>
  {/each}
</div>

<style>
  .board {
    position: relative;
    width: 100%;
    border-radius: var(--radius);
    background: var(--surface-2);
    border: 1px solid var(--border);
    container-type: inline-size;
  }
  .key {
    position: absolute;
    display: grid;
    place-items: center;
    padding: 0 2px;
    border-radius: 6px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text-2);
    font-size: clamp(8px, 1.45cqi, 12px);
    font-weight: 500;
    line-height: 1.1;
    overflow: hidden;
    transition:
      border-color 0.15s,
      background 0.15s,
      box-shadow 0.15s;
  }
  .key span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .key:hover {
    border-color: var(--text-3);
    color: var(--text);
  }
  .key.changed {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--text);
  }
  .key.lit {
    background: color-mix(in srgb, var(--glow) 38%, var(--surface));
    border-color: var(--glow);
    color: var(--text);
  }
  .key.selected {
    box-shadow:
      0 0 0 2px var(--bg),
      0 0 0 4px var(--accent);
    color: var(--text);
  }
</style>
