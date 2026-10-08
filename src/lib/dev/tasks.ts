/**
 * Dev server only: runs protocol-exploration tasks dropped into
 * .devlog/task.json against the connected keyboard and logs the replies to
 * .devlog/log.jsonl. Never bundled into production builds.
 *
 * Task shapes (bytes as hex strings, spaces allowed):
 *   { "op": "cmd", "bytes": "04 f0" }                    command + ack
 *   { "op": "read", "bytes": "04 f5 00 … 09", "count": 9 } command, ack, then `count` feature reads
 *   { "op": "txn", "target": 23, "sub": 1, "data": "…", "packets": 1, "begin": 24 }
 *   { "op": "dongle", "bytes": "20 01" }                 dongle request + reply
 *   { "op": "note", "text": "Test 1" }                   show a caption in the page
 *   { "op": "wait", "ms": 3000 }
 *   { "op": "seq", "tasks": [ … ], "gapMs": 200 }        several in order
 */
import { kb, devlog } from '../state/keyboard.svelte';

type Task =
  | { op: 'cmd'; bytes: string }
  | { op: 'read'; bytes: string; count: number }
  | { op: 'txn'; target: number; sub: number; data: string; packets?: number; begin?: number }
  | { op: 'dongle'; bytes: string }
  | { op: 'note'; text: string }
  | { op: 'wait'; ms: number }
  | { op: 'seq'; tasks: Task[]; gapMs?: number };

const parse = (s: string) => (s.replace(/[^0-9a-f]/gi, '').match(/../g) ?? []).map((h) => parseInt(h, 16));
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').replace(/(00)+$/, '…');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(task: Task): Promise<unknown> {
  switch (task.op) {
    case 'cmd': {
      if (!kb.wired) throw new Error('cable not connected');
      return { ack: hex(await kb.wired.command(parse(task.bytes))) };
    }
    case 'read': {
      if (!kb.wired) throw new Error('cable not connected');
      const ack = hex(await kb.wired.command(parse(task.bytes)));
      const data: string[] = [];
      for (let i = 0; i < task.count; i++) data.push(hex(await kb.wired.readFeature()));
      return { ack, data };
    }
    case 'txn': {
      if (!kb.wired) throw new Error('cable not connected');
      const packets = task.packets ?? 1;
      const data = new Uint8Array(packets * 64);
      data.set(parse(task.data).slice(0, data.length));
      await kb.wired.rawTransaction(task.target, task.sub, data, task.begin ?? 0x18);
      return { ok: true };
    }
    case 'dongle': {
      if (!kb.dongle) throw new Error('dongle not connected');
      return { reply: hex(await kb.dongle.request(parse(task.bytes))) };
    }
    case 'note': {
      // Shown as the page toast so the user can match what they see to a probe.
      kb.notice = task.text;
      return { shown: task.text };
    }
    case 'wait': {
      await sleep(task.ms);
      return { waited: task.ms };
    }
    case 'seq': {
      const out = [];
      for (const t of task.tasks) {
        try {
          out.push({ task: t, result: await run(t) });
        } catch (e) {
          out.push({ task: t, error: String(e) });
        }
        await sleep(task.gapMs ?? 150);
      }
      return out;
    }
  }
}

export function startTasks() {
  // HMR can start a second runner; only the newest keeps polling.
  const w = window as unknown as { __taskGen?: number };
  const gen = (w.__taskGen = (w.__taskGen ?? 0) + 1);
  const tick = async () => {
    if (w.__taskGen !== gen) return;
    const res = await fetch('/__task').catch(() => null);
    if (res?.status === 200) {
      const task = (await res.json()) as Task & { id?: string };
      devlog({ step: 'task', id: task.id, task });
      try {
        devlog({ step: 'taskResult', id: task.id, result: await run(task) });
      } catch (e) {
        devlog({ step: 'taskError', id: task.id, error: String(e) });
      }
    }
    setTimeout(tick, 700);
  };
  void tick();
}
