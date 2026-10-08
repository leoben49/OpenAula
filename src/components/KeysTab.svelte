<script lang="ts">
  import { kb } from '../lib/state/keyboard.svelte';
  import { FN_INDEX, KEYS, type Key } from '../lib/layout';
  import { usageForCode, keyLabel } from '../lib/protocol/hid-keys';
  import { MODIFIERS, type Action } from '../lib/protocol/payloads';
  import { describe, MACRO_MODES, MEDIA, MOUSE, shortLabel } from '../lib/actions';
  import type { Layer } from '../lib/protocol/device';
  import Card from './ui/Card.svelte';
  import Segmented from './ui/Segmented.svelte';
  import KeyboardView from './KeyboardView.svelte';
  import { keyName } from '../lib/legends';

  let layer = $state<Layer>('top');
  let selected = $state<number | null>(null);
  let capturing = $state(false);

  const map = $derived(kb.settings.keymap[layer]);
  const key = $derived(KEYS.find((k) => k.index === selected) ?? null);
  const action = $derived<Action>((selected != null && map[selected]) || { kind: 'default' });

  const KINDS = [
    { value: 'default', label: 'Default' },
    { value: 'key', label: 'Key' },
    { value: 'consumer', label: 'Media' },
    { value: 'mouse', label: 'Mouse' },
    { value: 'macro', label: 'Macro' },
  ] as const;
  type Kind = (typeof KINDS)[number]['value'];

  function set(a: Action) {
    if (selected != null) kb.setAction(layer, selected, a);
  }

  function setKind(kind: Kind) {
    if (!key) return;
    if (kind === 'default') set({ kind: 'default' });
    else if (kind === 'key') set({ kind: 'key', usage: key.usage, mods: 0 });
    else if (kind === 'consumer') set({ kind: 'consumer', usage: MEDIA[0].usage });
    else if (kind === 'mouse') set({ kind: 'mouse', button: 1 });
    else if (kb.settings.macros.length) set({ kind: 'macro', slot: 0, mode: 0, count: 1 });
  }

  function onCaptureKey(e: KeyboardEvent) {
    if (!capturing) return;
    e.preventDefault();
    const usage = usageForCode(e.code);
    // Ignore modifiers on their own so combos like Ctrl+C can be captured.
    if (usage == null || (usage >= 0xe0 && usage <= 0xe7)) return;
    const mods = (e.ctrlKey ? 1 : 0) | (e.shiftKey ? 2 : 0) | (e.altKey ? 4 : 0) | (e.metaKey ? 8 : 0);
    set({ kind: 'key', usage, mods });
    capturing = false;
  }

  const remapFor = (k: Key) => {
    const a = map[k.index];
    return a ? shortLabel(a, kb.settings.macros) : undefined;
  };
</script>

<svelte:window onkeydown={onCaptureKey} />

<div class="stack">
  <Card title="Key remapping" subtitle="Select a key, then choose what it does. Changes are sent straight away.">
    {#snippet actions()}
      <Segmented
        label="Layer"
        options={[
          { value: 'top', label: 'Normal' },
          { value: 'fn', label: 'Fn layer' },
        ]}
        value={layer}
        onchange={(v) => (layer = v)} />
    {/snippet}
    <KeyboardView {remapFor} {selected} onkey={(k) => (selected = k.index === FN_INDEX ? null : k.index)} />
    <p class="hint muted">{layer === 'fn' ? 'Fn layer: what a key does while Fn is held.' : 'The Fn key itself can’t be remapped.'}</p>
  </Card>

  {#if key}
    <Card title="{layer === 'fn' ? 'Fn + ' : ''}{keyName(key)}" subtitle="Currently: {describe(action, kb.settings.macros)}">
      <div class="editor">
        <Segmented label="Action type" options={[...KINDS]} value={action.kind} onchange={setKind} />

        {#if action.kind === 'key'}
          <div class="field">
            <button class="btn" class:primary={capturing} onclick={() => (capturing = !capturing)}>
              {capturing ? 'Press a key or combo…' : `Key: ${keyLabel(action.usage)}`}
            </button>
            <div class="mods">
              {#each MODIFIERS as m (m.bit)}
                {@const a = action}
                <label class="check">
                  <input type="checkbox" checked={!!(a.mods & m.bit)} onchange={(e) => set({ ...a, mods: e.currentTarget.checked ? a.mods | m.bit : a.mods & ~m.bit })} />
                  {m.label}
                </label>
              {/each}
            </div>
          </div>
        {:else if action.kind === 'consumer'}
          {@const a = action}
          <select value={a.usage} onchange={(e) => set({ kind: 'consumer', usage: Number(e.currentTarget.value) })}>
            {#each MEDIA as m (m.usage)}<option value={m.usage}>{m.label}</option>{/each}
          </select>
        {:else if action.kind === 'mouse'}
          {@const a = action}
          <select value={a.button} onchange={(e) => set({ kind: 'mouse', button: Number(e.currentTarget.value) })}>
            {#each MOUSE as m (m.button)}<option value={m.button}>{m.label}</option>{/each}
          </select>
          {#if a.button !== 1}<p class="hint muted">Only left click has been confirmed on this keyboard so far.</p>{/if}
        {:else if action.kind === 'macro'}
          {@const a = action}
          <div class="field">
            <select value={a.slot} onchange={(e) => set({ ...a, slot: Number(e.currentTarget.value) })}>
              {#each kb.settings.macros as m, i (i)}<option value={i}>{m.name || `Macro ${i + 1}`}</option>{/each}
            </select>
            <select value={a.mode} onchange={(e) => set({ ...a, mode: Number(e.currentTarget.value) as 0 | 1 | 2 | 3 })}>
              {#each MACRO_MODES as m (m.value)}<option value={m.value}>{m.label}</option>{/each}
            </select>
            {#if a.mode === 1}
              <input type="number" min="1" max="255" value={a.count} onchange={(e) => set({ ...a, count: Math.max(1, Math.min(255, Number(e.currentTarget.value) || 1)) })} />
            {/if}
          </div>
        {/if}
        {#if !kb.settings.macros.length}<p class="hint muted">To assign a macro, create one in the Macros tab first.</p>{/if}
      </div>
    </Card>
  {/if}
</div>

<style>
  .stack {
    display: grid;
    gap: 16px;
  }
  .hint {
    margin: 10px 0 0;
    font-size: 13px;
  }
  .editor {
    display: grid;
    gap: 14px;
    justify-items: start;
  }
  .field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .mods {
    display: flex;
    gap: 12px;
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
  select,
  input[type='number'] {
    height: 36px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    padding: 0 10px;
  }
  input[type='number'] {
    width: 80px;
  }
</style>
