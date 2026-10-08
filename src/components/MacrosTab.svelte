<script lang="ts">
  import { kb } from '../lib/state/keyboard.svelte';
  import { keyLabel, usageForCode, MOUSE_MASK_FOR_BUTTON, MOUSE_BUTTON_LABELS } from '../lib/protocol/hid-keys';
  import { macroBytes, macroSpaceUsed, MACRO_MEMORY, type Macro, type MacroStep } from '../lib/protocol/payloads';
  import Card from './ui/Card.svelte';

  const DEFAULT_DELAY = 10;

  let editing = $state<number | null>(null);
  let draft = $state<Macro | null>(null);
  let recording = $state(false);
  let fixedDelay = $state<number | null>(null);
  let last = 0;

  const macros = $derived(kb.settings.macros);
  const others = $derived(macros.filter((_, i) => i !== editing));
  const used = $derived(macroSpaceUsed(draft ? [...others, draft] : macros));
  const tooBig = $derived(used > MACRO_MEMORY);

  function edit(i: number | null) {
    recording = false;
    editing = i;
    draft = i == null ? { name: `Macro ${macros.length + 1}`, steps: [] } : structuredClone($state.snapshot(macros[i]));
  }

  function save() {
    if (!draft || tooBig) return;
    const list = [...$state.snapshot(macros)] as Macro[];
    if (editing == null) list.push($state.snapshot(draft) as Macro);
    else list[editing] = $state.snapshot(draft) as Macro;
    kb.setMacros(list);
    draft = null;
    editing = null;
  }

  function remove(i: number) {
    const list = ($state.snapshot(macros) as Macro[]).filter((_, j) => j !== i);
    kb.setMacros(list, i);
    if (editing === i) draft = null;
  }

  function push(step: MacroStep) {
    if (!draft) return;
    const now = performance.now();
    const steps = draft.steps;
    // The delay belongs after the previous input.
    if (steps.length) steps.push({ kind: 'delay', ms: fixedDelay ?? Math.max(1, Math.round(now - last)) });
    steps.push(step);
    last = now;
  }

  function stop() {
    recording = false;
    if (draft?.steps.length && draft.steps.at(-1)!.kind !== 'delay') draft.steps.push({ kind: 'delay', ms: DEFAULT_DELAY });
  }

  function onKey(e: KeyboardEvent, down: boolean) {
    if (!recording || e.repeat) return;
    e.preventDefault();
    const usage = usageForCode(e.code);
    if (usage != null) push({ kind: 'key', usage, down });
  }

  function onMouse(e: MouseEvent, down: boolean) {
    if (!recording) return;
    e.preventDefault();
    push({ kind: 'mouse', button: MOUSE_MASK_FOR_BUTTON[e.button] ?? 1, down });
  }

  const stepLabel = (s: MacroStep) =>
    s.kind === 'key' ? keyLabel(s.usage) : s.kind === 'mouse' ? (MOUSE_BUTTON_LABELS[s.button] ?? 'Mouse') : '';
</script>

<svelte:window onkeydown={(e) => onKey(e, true)} onkeyup={(e) => onKey(e, false)} />

<div class="stack">
  <Card title="Macros" subtitle="Stored on the keyboard; assign them to keys in the Keys tab.">
    {#snippet actions()}
      <button class="btn primary" disabled={!!draft} onclick={() => edit(null)}>New macro</button>
    {/snippet}
    <div class="meter" class:over={tooBig}>
      <div class="bar"><div style:width="{Math.min(100, ((used - 400) / (MACRO_MEMORY - 400)) * 100)}%"></div></div>
      <span class="muted small">{used - 400} / {MACRO_MEMORY - 400} bytes of macro memory</span>
    </div>
    {#if macros.length}
      <ul class="list">
        {#each macros as m, i (i)}
          <li>
            <span class="name">{m.name || `Macro ${i + 1}`}</span>
            <span class="muted small">{m.steps.filter((s) => s.kind !== 'delay').length} inputs · {macroBytes(m)} bytes</span>
            <span class="spacer"></span>
            <button class="btn" disabled={!!draft} onclick={() => edit(i)}>Edit</button>
            <button class="btn" onclick={() => remove(i)}>Delete</button>
          </li>
        {/each}
      </ul>
    {:else if !draft}
      <p class="muted">No macros yet.</p>
    {/if}
  </Card>

  {#if draft}
    <Card title={editing == null ? 'New macro' : 'Edit macro'}>
      <div class="editor">
        <input class="name-input" bind:value={draft.name} maxlength="24" aria-label="Macro name" />

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="recorder"
          class:on={recording}
          onmousedown={(e) => onMouse(e, true)}
          onmouseup={(e) => onMouse(e, false)}
          oncontextmenu={(e) => recording && e.preventDefault()}>
          {#if recording}
            <strong>Recording…</strong>
            <span class="muted small">Type keys, or click inside this box to record mouse buttons.</span>
            <button class="btn" onmousedown={(e) => e.stopPropagation()} onmouseup={(e) => e.stopPropagation()} onclick={stop}>Stop</button>
          {:else}
            <button
              class="btn primary"
              onclick={() => {
                last = performance.now();
                recording = true;
              }}>{draft.steps.length ? 'Record more' : 'Start recording'}</button>
            <label class="muted small check">
              <input type="checkbox" checked={fixedDelay != null} onchange={(e) => (fixedDelay = e.currentTarget.checked ? 20 : null)} />
              Use a fixed delay
            </label>
            {#if fixedDelay != null}
              <input type="number" min="1" max="60000" bind:value={fixedDelay} aria-label="Fixed delay in ms" /> <span class="muted small">ms</span>
            {/if}
          {/if}
        </div>

        {#if draft.steps.length}
          <ol class="steps">
            {#each draft.steps as s, i (i)}
              <li class={s.kind}>
                {#if s.kind === 'delay'}
                  <span class="muted">wait</span>
                  <input type="number" min="1" max="60000" bind:value={s.ms} aria-label="Delay in ms" />
                  <span class="muted small">ms</span>
                {:else}
                  <span class="arrow" class:down={s.down}>{s.down ? '↓' : '↑'}</span>
                  <span>{stepLabel(s)}</span>
                {/if}
                <button class="x" aria-label="Remove step" onclick={() => draft!.steps.splice(i, 1)}>×</button>
              </li>
            {/each}
          </ol>
        {/if}

        <div class="actions">
          <button class="btn primary" disabled={tooBig || recording || !draft.steps.length} onclick={save}>Save to keyboard</button>
          <button class="btn" onclick={() => ((draft = null), (editing = null), (recording = false))}>Cancel</button>
          {#if tooBig}<span class="error small">Too long for the keyboard's memory. Remove some steps.</span>{/if}
        </div>
      </div>
    </Card>
  {/if}
</div>

<style>
  .stack {
    display: grid;
    gap: 16px;
  }
  .small {
    font-size: 12px;
  }
  .meter {
    display: grid;
    gap: 6px;
    margin-bottom: 16px;
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .bar div {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s var(--ease);
  }
  .meter.over .bar div {
    background: var(--bad);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .name {
    font-weight: 500;
  }
  .spacer {
    flex: 1;
  }
  .editor {
    display: grid;
    gap: 14px;
  }
  .name-input,
  input[type='number'] {
    height: 36px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    padding: 0 10px;
  }
  .name-input {
    max-width: 280px;
  }
  input[type='number'] {
    width: 84px;
  }
  .recorder {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    border: 1px dashed var(--border-strong);
  }
  .recorder.on {
    border-color: var(--accent);
    background: var(--accent-soft);
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
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 6px 0 10px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .steps li.delay {
    background: none;
  }
  .steps li.delay input {
    height: 26px;
    width: 70px;
  }
  .arrow {
    color: var(--text-3);
  }
  .arrow.down {
    color: var(--accent);
  }
  .x {
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--text-3);
  }
  .x:hover {
    background: var(--surface-3);
    color: var(--text);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .error {
    color: var(--bad);
  }
</style>
