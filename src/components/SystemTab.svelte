<script lang="ts">
  import { kb } from '../lib/state/keyboard.svelte';
  import { SLEEP_OPTIONS } from '../lib/protocol/payloads';
  import Card from './ui/Card.svelte';
  import Row from './ui/Row.svelte';
  import Toggle from './ui/Toggle.svelte';
  import Segmented from './ui/Segmented.svelte';

  const s = $derived(kb.settings.system);
  const LEVELS = [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }));
  let busy = $state(false);
  let confirmReset = $state(false);

  async function sendAll() {
    busy = true;
    await kb.sendAll();
    busy = false;
  }

  let backupStatus = $state('');
  let imported = $state(false);

  function exportBackup() {
    const url = URL.createObjectURL(new Blob([kb.exportSettings()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `openaula-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    backupStatus = 'Backup saved.';
  }

  async function importBackup(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      kb.importSettings(await file.text());
      backupStatus = `Restored ${file.name}.`;
      imported = true;
    } catch (err) {
      backupStatus = `Couldn't restore: ${err instanceof Error ? err.message : err}`;
      imported = false;
    }
  }
</script>

<div class="stack">
  <Card title="Power">
    <Row label="Sleep after" hint="How long the keyboard waits with no key presses before sleeping (wireless).">
      <Segmented label="Sleep after" options={[...SLEEP_OPTIONS]} value={s.sleep} onchange={(v) => kb.setSystem({ sleep: v })} />
    </Row>
  </Card>

  <Card title="Typing">
    <Row label="Key response time" hint="Debounce level. Lower is faster; raise it if keys chatter (double-type).">
      <Segmented label="Key response time" options={LEVELS} value={s.responseLevel} onchange={(v) => kb.setSystem({ responseLevel: v })} />
    </Row>
    <Row label="Disable Windows key">
      <Toggle label="Disable Windows key" checked={s.disableWin} onchange={(v) => kb.setSystem({ disableWin: v })} />
    </Row>
    <Row label="Disable Alt + F4">
      <Toggle label="Disable Alt + F4" checked={s.disableAltF4} onchange={(v) => kb.setSystem({ disableAltF4: v })} />
    </Row>
    <Row label="Disable Alt + Tab">
      <Toggle label="Disable Alt + Tab" checked={s.disableAltTab} onchange={(v) => kb.setSystem({ disableAltTab: v })} />
    </Row>
  </Card>

  <Card title="Backup" subtitle="Save OpenAula's settings to a file, or restore them on another PC or after clearing browser data.">
    <Row label="Export" hint="Lighting, per-key colours, keymaps, macros and system settings. The screen image isn't included.">
      <button class="btn" onclick={exportBackup}>Save backup…</button>
    </Row>
    <Row label="Restore" hint="Replaces OpenAula's stored settings with the file's. Send them to apply on the keyboard.">
      <label class="btn">
        Restore from file…
        <input type="file" accept="application/json,.json" onchange={importBackup} hidden />
      </label>
    </Row>
    {#if backupStatus}
      <div class="backup-status">
        <span class="muted">{backupStatus}</span>
        {#if imported}
          <button class="btn primary" disabled={busy || !kb.link} onclick={() => ((imported = false), sendAll())}>Send to keyboard</button>
        {/if}
      </div>
    {/if}
  </Card>

  <Card title="Settings sync" subtitle="The keyboard can't report its settings, so OpenAula remembers what it sent from this browser.">
    <Row label="Send all settings" hint="Re-sends lighting, keys, macros and system settings. Useful after using the official software.">
      <button class="btn" disabled={busy || !kb.link} onclick={sendAll}>{busy ? 'Sending…' : 'Send all'}</button>
    </Row>
    <Row label="Forget stored settings" hint="Resets OpenAula's copy to defaults. Doesn't change the keyboard until you send.">
      {#if confirmReset}
        <button class="btn" onclick={() => ((confirmReset = false), kb.resetStored())}>Yes, forget</button>
        <button class="btn" onclick={() => (confirmReset = false)}>Cancel</button>
      {:else}
        <button class="btn" onclick={() => (confirmReset = true)}>Forget…</button>
      {/if}
    </Row>
  </Card>
</div>

<style>
  .stack {
    display: grid;
    gap: 16px;
  }
  .backup-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
    font-size: 13px;
  }
</style>
