// verify_jwt = false is only allowed where the handler authenticates itself (reply, quota) or is
// public by design (health). Imported as text: no file-read permission needed.
import { assertEquals } from 'jsr:@std/assert@1';
import configToml from '../../config.toml' with { type: 'text' };

function functionsConfig(toml: string): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  let current: Record<string, string> | null = null;
  for (const raw of toml.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    const section = /^\[functions\.([a-z0-9-]+)\]$/.exec(line);
    if (section) {
      current = {};
      out.set(section[1]!, current);
      continue;
    }
    if (line.startsWith('[')) {
      current = null;
      continue;
    }
    const kv = /^([a-z_]+)\s*=\s*(.+)$/.exec(line);
    if (current && kv) current[kv[1]!] = kv[2]!;
  }
  return out;
}

Deno.test('config.toml: only reply, quota and health skip the gateway JWT check', () => {
  const fns = functionsConfig(configToml);
  const open = [...fns]
    .filter(([, c]) => c.verify_jwt !== 'true')
    .map(([name]) => name)
    .sort();
  assertEquals(open, ['health', 'quota', 'reply']);
  for (const [name, c] of fns) assertEquals(c.import_map, '"./functions/deno.json"', name);
});
