<script lang="ts">
  import { kb } from '../lib/state/keyboard.svelte';
  import { KEYS } from '../lib/layout';
  import { EFFECTS, MODE_OFF, MODE_USER, type Rgb } from '../lib/protocol/payloads';
  import Card from './ui/Card.svelte';
  import Row from './ui/Row.svelte';
  import Toggle from './ui/Toggle.svelte';
  import Segmented from './ui/Segmented.svelte';
  import KeyboardView from './KeyboardView.svelte';

  const l = $derived(kb.settings.lighting);
  const isEffect = $derived(l.mode !== MODE_OFF && l.mode !== MODE_USER);

  const toHex = ([r, g, b]: Rgb) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  const fromHex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;

  const LEVELS = [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }));
  const DIRECTIONS = [0, 1, 2, 3].map((v) => ({ value: v, label: String(v + 1) }));
  const SWATCHES: Rgb[] = [[255, 0, 0], [255, 120, 0], [255, 220, 0], [0, 255, 0], [0, 255, 255], [0, 80, 255], [170, 0, 255], [255, 255, 255]];

  // Per-key painting.
  let brush = $state('#ff4d00');
  const fill = (h: string) => (h === '#000000' ? undefined : h);

  function paint(index: number) {
    const c = fromHex(brush);
    const current = kb.settings.colours[index];
    const colours = { ...kb.settings.colours };
    if (current && toHex(current) === brush) delete colours[index];
    else colours[index] = c;
    kb.settings.colours = colours;
    kb.applyUserLighting();
  }

  function paintAll(clear: boolean) {
    kb.settings.colours = clear ? {} : Object.fromEntries(KEYS.map((k) => [k.index, fromHex(brush)]));
    kb.applyUserLighting();
  }
</script>

<div class="stack">
  <Card title="Effect">
    <div class="effects">
      <button class:on={l.mode === MODE_OFF} onclick={() => kb.setLighting({ mode: MODE_OFF })}>Off</button>
      {#each EFFECTS as name, i (name)}
        <button class:on={l.mode === i + 1} onclick={() => kb.setLighting({ mode: i + 1 })}>{name}</button>
      {/each}
      <button class:on={l.mode === MODE_USER} onclick={() => kb.applyUserLighting()}>Per-key</button>
    </div>
  </Card>

  {#if isEffect}
    <Card title="Options">
      <Row label="Rainbow colours">
        <Toggle label="Rainbow colours" checked={l.rainbow} onchange={(v) => kb.setLighting({ rainbow: v })} />
      </Row>
      {#if !l.rainbow}
        <Row label="Colour">
          <div class="swatches">
            {#each SWATCHES as s (s.join())}
              <button class="swatch" class:on={toHex(s) === toHex(l.color)} style:background={toHex(s)} aria-label={toHex(s)} onclick={() => kb.setLighting({ color: s })}></button>
            {/each}
            <input type="color" value={toHex(l.color)} oninput={(e) => kb.setLighting({ color: fromHex(e.currentTarget.value) })} aria-label="Custom colour" />
          </div>
        </Row>
      {/if}
      <Row label="Brightness">
        <Segmented label="Brightness" options={LEVELS} value={l.brightness} onchange={(v) => kb.setLighting({ brightness: v })} />
      </Row>
      <Row label="Speed">
        <Segmented label="Speed" options={LEVELS} value={l.speed} onchange={(v) => kb.setLighting({ speed: v })} />
      </Row>
      <Row label="Direction" hint="Only some effects move in a direction.">
        <Segmented label="Direction" options={DIRECTIONS} value={l.direction} onchange={(v) => kb.setLighting({ direction: v })} />
      </Row>
    </Card>
  {:else if l.mode === MODE_USER}
    <Card title="Per-key colours" subtitle="Click keys to paint them; click again with the same colour to clear.">
      {#snippet actions()}
        <div class="tools">
          <input type="color" bind:value={brush} aria-label="Brush colour" />
          <button class="btn" onclick={() => paintAll(false)}>Fill all</button>
          <button class="btn" onclick={() => paintAll(true)}>Clear</button>
        </div>
      {/snippet}
      <KeyboardView colourFor={(k) => (kb.settings.colours[k.index] ? fill(toHex(kb.settings.colours[k.index])) : undefined)} onkey={(k) => paint(k.index)} />
      <div class="brightness">
        <Row label="Brightness">
          <Segmented
            label="Brightness"
            options={LEVELS}
            value={kb.settings.userBrightness}
            onchange={(v) => {
              kb.settings.userBrightness = v;
              kb.applyUserLighting();
            }} />
        </Row>
      </div>
    </Card>
  {/if}
</div>

<style>
  .stack {
    display: grid;
    gap: 16px;
  }
  .effects {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
    gap: 6px;
  }
  .effects button {
    height: 36px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text-2);
    font-weight: 500;
    transition:
      border-color 0.15s,
      color 0.15s,
      background 0.15s;
  }
  .effects button:hover {
    color: var(--text);
    border-color: var(--border-strong);
  }
  .effects button.on {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--text);
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .swatch {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid var(--surface);
    box-shadow: 0 0 0 1px var(--border-strong);
  }
  .swatch.on {
    box-shadow: 0 0 0 2px var(--accent);
  }
  input[type='color'] {
    width: 34px;
    height: 30px;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: none;
    cursor: pointer;
  }
  .tools {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .brightness {
    margin-top: 16px;
  }
</style>
