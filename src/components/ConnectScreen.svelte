<script lang="ts">
  import { kb } from '../lib/state/keyboard.svelte';

  const supported = 'hid' in navigator;
</script>

<div class="connect">
  <svg width="72" height="44" viewBox="0 0 24 14" aria-hidden="true">
    <rect x="1" y="1" width="22" height="12" rx="3" fill="none" stroke="var(--accent)" stroke-width="1.4" />
    <path d="M5 5h2M9 5h2M13 5h2M17 5h2M7 9h10" stroke="var(--accent)" stroke-width="1.4" stroke-linecap="round" />
  </svg>
  <h1>Connect your F75 Max</h1>
  {#if supported}
    <p class="muted">
      Plug in the 2.4 GHz dongle or the USB cable. Bluetooth can't be configured. Close the AULA software first so the two don't
      talk to the keyboard at the same time.
    </p>
    <button class="btn primary" onclick={() => kb.connect()}>Connect…</button>
    {#if kb.error}<p class="error">{kb.error}</p>{/if}
  {:else}
    <p class="muted">This browser doesn't support WebHID. Use Chrome, Edge or Brave on desktop.</p>
  {/if}
</div>

<style>
  .connect {
    display: grid;
    justify-items: center;
    gap: 14px;
    text-align: center;
    margin-top: 14vh;
  }
  h1 {
    margin: 8px 0 0;
    font-size: 22px;
    letter-spacing: -0.02em;
  }
  p {
    margin: 0;
    max-width: 420px;
  }
  .error {
    color: var(--bad);
    font-size: 13px;
  }
</style>
