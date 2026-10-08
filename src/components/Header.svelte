<script lang="ts">
  import { kb } from '../lib/state/keyboard.svelte';

  const level = $derived(kb.battery == null ? null : Math.max(0, Math.min(100, kb.battery)));
  const tone = $derived(level == null ? '' : level <= 15 ? 'low' : level <= 30 ? 'mid' : 'ok');
</script>

<header>
  <div class="brand">
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="3" fill="none" stroke="var(--accent)" stroke-width="2" />
      <path d="M6 10h2M10 10h2M14 10h4M7 14h10" stroke="var(--accent)" stroke-width="2" />
    </svg>
    <span>Open<b>Aula</b></span>
  </div>

  {#if kb.link}
    <div class="status">
      <span class="sync {kb.sync}" aria-live="polite">
        {#if kb.sync === 'saving'}Saving…{:else if kb.sync === 'saved'}Saved{:else if kb.sync === 'error'}Not saved{/if}
      </span>
      {#if kb.wired}<span class="pill" title="Settings are sent over the cable"><i></i>Cable</span>{/if}
      {#if kb.dongle}
        <span
          class="pill"
          class:idle={!!kb.wired || kb.dongleAwake === false}
          title={kb.wired ? 'Dongle idle while the cable is connected' : kb.dongleAwake === false ? 'Keyboard not answering over 2.4 GHz' : 'Connected over 2.4 GHz'}
          ><i></i>2.4 GHz</span>
      {/if}
      {#if kb.dongle && kb.dongleAwake !== false && !kb.wired}
        <span class="pill battery {tone}" title="Battery">
          <svg width="22" height="12" viewBox="0 0 26 14" aria-hidden="true">
            <rect x="0.75" y="0.75" width="21.5" height="12.5" rx="3.5" fill="none" stroke="currentColor" stroke-opacity="0.45" stroke-width="1.5" />
            <rect x="23.5" y="4.5" width="2" height="5" rx="1" fill="currentColor" fill-opacity="0.45" />
            <rect class="fill" x="3" y="3" height="8" rx="1.5" width={(17 * (level ?? 0)) / 100} />
          </svg>
          {level == null ? '—' : `${level}%`}
        </span>
      {/if}
      {#if !kb.wired || !kb.dongle}
        <button class="add" title="Connect the other connection" onclick={() => kb.connect()}>+</button>
      {/if}
    </div>
  {/if}
</header>

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    height: 64px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 650;
    font-size: 16px;
    letter-spacing: -0.01em;
  }
  .brand b {
    font-weight: inherit;
    color: var(--accent);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 12px;
    border-radius: 16px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    font-weight: 500;
    white-space: nowrap;
  }
  .pill i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--good);
    box-shadow: 0 0 0 3px rgb(52 199 89 / 0.18);
  }
  .pill.idle {
    color: var(--text-3);
  }
  .pill.idle i {
    background: var(--text-3);
    box-shadow: none;
  }
  .battery {
    color: var(--text);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .fill {
    fill: var(--good);
    transition: width 0.4s var(--ease);
  }
  .mid .fill {
    fill: var(--warn);
  }
  .low .fill {
    fill: var(--bad);
  }
  .add {
    width: 32px;
    height: 32px;
    border-radius: 16px;
    border: 1px dashed var(--border-strong);
    background: none;
    color: var(--text-2);
    font-size: 16px;
  }
  .add:hover {
    color: var(--text);
    border-color: var(--text-3);
  }
  .sync {
    font-size: 13px;
    color: var(--text-3);
  }
  .sync.saved {
    animation: fade 2.5s forwards;
  }
  .sync.error {
    color: var(--bad);
  }
  @keyframes fade {
    70% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  @media (max-width: 560px) {
    .brand span,
    .sync {
      display: none;
    }
  }
</style>
