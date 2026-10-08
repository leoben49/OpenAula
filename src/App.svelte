<script lang="ts">
  import { onMount } from 'svelte';
  import { kb } from './lib/state/keyboard.svelte';
  import Header from './components/Header.svelte';
  import ConnectScreen from './components/ConnectScreen.svelte';
  import LightingTab from './components/LightingTab.svelte';
  import KeysTab from './components/KeysTab.svelte';
  import MacrosTab from './components/MacrosTab.svelte';
  import ScreenTab from './components/ScreenTab.svelte';
  import SystemTab from './components/SystemTab.svelte';

  const TABS = [
    { id: 'lighting', label: 'Lighting', component: LightingTab },
    { id: 'keys', label: 'Keys', component: KeysTab },
    { id: 'macros', label: 'Macros', component: MacrosTab },
    { id: 'screen', label: 'Screen', component: ScreenTab },
    { id: 'system', label: 'System', component: SystemTab },
  ] as const;
  type TabId = (typeof TABS)[number]['id'];

  const TAB_KEY = 'openaula.tab';
  let tab = $state<TabId>('lighting');
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (TABS.some((t) => t.id === saved)) tab = saved as TabId;
  } catch {}

  function select(id: TabId) {
    tab = id;
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {}
  }

  const Current = $derived(TABS.find((t) => t.id === tab)!.component);

  const INTRO_KEY = 'openaula.introDismissed';
  let showIntro = $state(true);
  try {
    showIntro = !localStorage.getItem(INTRO_KEY);
  } catch {}

  function dismissIntro() {
    showIntro = false;
    try {
      localStorage.setItem(INTRO_KEY, '1');
    } catch {}
  }

  onMount(() => {
    void kb.restore();
    // Dev server only: lets the console (and Claude's browser checks) poke at state.
    if (import.meta.env.DEV) {
      (window as unknown as { kb: typeof kb }).kb = kb;
      void import('./lib/dev/tasks').then((t) => t.startTasks());
    }
  });
</script>

<div class="shell">
  <Header />

  {#if !kb.link}
    <ConnectScreen />
  {:else}
    <div class="tabs" role="tablist" aria-label="Sections">
      {#each TABS as t (t.id)}
        <button role="tab" aria-selected={tab === t.id} class:on={tab === t.id} onclick={() => select(t.id)}>{t.label}</button>
      {/each}
    </div>
    {#if kb.dongle && !kb.wired && kb.dongleAwake === false}
      <div class="banner info" role="status">
        <span>The keyboard isn’t answering over 2.4 GHz. It may be asleep (press a key), or switched to wired or Bluetooth.</span>
        <button class="btn" onclick={() => kb.connect()}>Connect cable…</button>
      </div>
    {:else if kb.sync === 'error' && kb.error}
      <div class="banner" role="alert">Couldn’t save to the keyboard: {kb.error}</div>
    {/if}
    {#if kb.notice}
      <div class="toast" role="status">{kb.notice}</div>
    {/if}
    {#if showIntro}
      <div class="intro" role="note">
        <div>
          <strong>OpenAula starts from default settings</strong>
          <p class="muted">
            The keyboard can't report what it's set to, so the options shown here may not match it yet. Anything you change is sent
            straight away and remembered in this browser. To make the keyboard match everything shown here, use
            <b>System → Send all</b>.
          </p>
        </div>
        <button class="btn" onclick={dismissIntro}>Got it</button>
      </div>
    {/if}
    <main>
      <Current />
    </main>
  {/if}
</div>

<style>
  .shell {
    max-width: 920px;
    margin: 0 auto;
    padding: 0 24px 64px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    margin: 8px 0 20px;
    box-shadow: inset 0 -1px var(--border);
    overflow-x: auto;
  }
  .tabs button {
    position: relative;
    height: 40px;
    padding: 0 14px;
    border: 0;
    background: none;
    color: var(--text-2);
    font-weight: 500;
    white-space: nowrap;
    transition: color 0.15s;
  }
  .tabs button:hover,
  .tabs button.on {
    color: var(--text);
  }
  .tabs button.on::after {
    content: '';
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 0;
    height: 2px;
    border-radius: 1px;
    background: var(--accent);
  }
  .banner {
    margin-bottom: 16px;
    padding: 12px 16px;
    border-radius: var(--radius-sm);
    background: rgb(255 69 58 / 0.1);
    border: 1px solid rgb(255 69 58 / 0.3);
    color: var(--bad);
    font-size: 13px;
  }
  .intro {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
    padding: 14px 16px;
    border-radius: var(--radius);
    background: var(--accent-soft);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  }
  .intro .btn {
    flex: none;
  }
  .intro p {
    margin: 4px 0 0;
    font-size: 13px;
  }
  .intro b {
    color: var(--text);
    font-weight: 600;
  }
  .banner.info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    background: var(--surface-2);
    border-color: var(--border-strong);
    color: var(--text-2);
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 10;
    padding: 10px 16px;
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow);
    font-size: 13px;
    animation: rise 0.25s var(--ease);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
  }
  @media (max-width: 560px) {
    .shell {
      padding: 0 16px 48px;
    }
  }
</style>
