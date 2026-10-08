<script lang="ts">
  import { KEY_HEIGHT, KEYS, LAYOUT_HEIGHT, LAYOUT_WIDTH, type Key } from '../lib/layout';
  import { keyName, legendFor } from '../lib/legends';

  let {
    remapFor,
    colourFor,
    selected = null,
    onkey,
  }: {
    /** New function to show on a remapped key; undefined keeps the printed legend. */
    remapFor?: (k: Key) => string | undefined;
    colourFor?: (k: Key) => string | undefined;
    selected?: number | null;
    onkey: (k: Key, e: MouseEvent) => void;
  } = $props();

  // Case padding around the keys, in the layout's pixel units.
  const PAD = 12;
  const W = LAYOUT_WIDTH + PAD * 2;
  const H = LAYOUT_HEIGHT + PAD * 2;
  const pos = (x: number, y: number, w: number, h: number) =>
    `left:${((x + PAD) / W) * 100}%;top:${((y + PAD) / H) * 100}%;width:${(w / W) * 100}%;height:${(h / H) * 100}%`;

  // The screen and knob sit right of F12, above the Delete column (as on the real board).
  const F12 = KEYS.find((k) => k.usage === 0x45)!;
  const DEL = KEYS.find((k) => k.usage === 0x4c)!;
  const screenX = F12.x + F12.w + 10;
</script>

<div class="case" style:aspect-ratio="{W} / {H}">
  <div class="screen" style={pos(screenX, 0, DEL.x - screenX - 8, KEY_HEIGHT)} aria-hidden="true"></div>
  <div class="knob" style={pos(DEL.x, 0, DEL.w, KEY_HEIGHT)} aria-hidden="true"><span></span></div>

  {#each KEYS as k (k.index)}
    {@const legend = legendFor(k)}
    {@const remap = remapFor?.(k)}
    {@const colour = colourFor?.(k)}
    <button
      class="key {legend.kind}"
      class:remapped={!!remap}
      class:selected={selected === k.index}
      class:lit={!!colour}
      style={pos(k.x, k.y, k.w, KEY_HEIGHT)}
      style:--glow={colour}
      title={remap ? `${keyName(k)} → ${remap}` : keyName(k)}
      aria-label={remap ? `${keyName(k)}, remapped to ${remap}` : keyName(k)}
      onclick={(e) => onkey(k, e)}>
      <span class="cap">
        {#if legend.kind === 'dual'}
          <span class="legend"><span>{legend.top}</span><span>{legend.bottom}</span></span>
        {:else if legend.kind !== 'blank'}
          <span class="legend">{legend.text}</span>
        {/if}
        {#if remap}<span class="remap">{remap}</span>{/if}
      </span>
    </button>
  {/each}
</div>

<style>
  .case {
    position: relative;
    width: 100%;
    border-radius: calc(var(--radius) + 2px);
    background: linear-gradient(180deg, var(--surface-3), var(--surface-2));
    border: 1px solid var(--border-strong);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.04),
      var(--shadow);
    container-type: inline-size;
    user-select: none;
  }
  .screen {
    position: absolute;
    border-radius: 3px;
    background: #050506;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);
  }
  .knob {
    position: absolute;
    display: grid;
    place-items: center;
  }
  .knob span {
    height: 92%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, var(--surface-3), var(--surface) 70%);
    box-shadow:
      0 0 0 1px var(--border-strong),
      inset 0 -2px 3px rgb(0 0 0 / 0.25);
  }

  /* Keycap: the button is the cap's skirt, .cap the slightly inset top. */
  .key {
    position: absolute;
    padding: 0;
    border: 0;
    border-radius: 0.6cqi;
    background: var(--border-strong);
    box-shadow: 0 0.15cqi 0 rgb(0 0 0 / 0.35);
    color: var(--text-2);
    cursor: pointer;
    transition:
      transform 0.08s,
      box-shadow 0.15s;
  }
  .key:active {
    transform: translateY(0.1cqi);
  }
  .cap {
    position: absolute;
    inset: 0.12cqi 0.25cqi 0.4cqi;
    border-radius: 0.5cqi;
    background: linear-gradient(180deg, color-mix(in srgb, var(--surface) 70%, var(--surface-3)), var(--surface));
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.05);
    overflow: hidden;
    transition: background 0.15s;
  }
  .key:hover .cap {
    background: var(--surface-2);
  }
  .legend {
    position: absolute;
    top: 0.35cqi;
    left: 0.5cqi;
    right: 0.4cqi;
    display: grid;
    gap: 0.05cqi;
    font-size: clamp(7px, 1.05cqi, 11px);
    font-weight: 500;
    line-height: 1.05;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .char .legend {
    font-size: clamp(9px, 1.45cqi, 15px);
  }
  .dual .legend {
    font-size: clamp(8px, 1.2cqi, 13px);
    line-height: 1.1;
  }
  .arrow .legend {
    inset: 0;
    display: grid;
    place-items: center;
    font-size: clamp(9px, 1.5cqi, 15px);
  }

  /* Remapped: printed legend fades, new function in the accent colour. */
  .remapped .legend {
    opacity: 0.4;
  }
  .remapped .cap {
    background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 22%, var(--surface)), color-mix(in srgb, var(--accent) 12%, var(--surface)));
  }
  .remap {
    position: absolute;
    left: 0.4cqi;
    right: 0.4cqi;
    bottom: 0.3cqi;
    color: var(--accent);
    font-size: clamp(7px, 1.05cqi, 11px);
    font-weight: 650;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Per-key colour preview: light shining through the cap. */
  .lit .cap {
    background: linear-gradient(180deg, color-mix(in srgb, var(--glow) 45%, var(--surface)), color-mix(in srgb, var(--glow) 28%, var(--surface)));
    color: var(--text);
  }
  .lit {
    box-shadow:
      0 0.15cqi 0 rgb(0 0 0 / 0.35),
      0 0 1.2cqi color-mix(in srgb, var(--glow) 55%, transparent);
  }

  .selected {
    box-shadow:
      0 0 0 2px var(--surface-2),
      0 0 0 4px var(--accent);
    z-index: 1;
  }
  .selected .legend {
    color: var(--text);
  }
  .key:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--surface-2),
      0 0 0 4px var(--accent);
  }
</style>
