// Qwen provider tests — a fake OpenAI-compatible endpoint drives the
// tool loop to verify: session-scoped tool execution, PREPARE-only
// authority, argument validation, and graceful degradation.

import { beforeEach, describe, expect, it } from 'vitest';

import { runAgentTurn } from '../src/agent/agent.js';
import type { QwenConfig } from '../src/agent/qwen.js';
import { resolveSession } from '../src/authz.js';
import type { Stdb } from '../src/stdb/client.js';
import { getTestStdb } from './helpers.js';

delete process.env.AGENT_MODE;

let db: Stdb;
beforeEach(async () => {
  db = await getTestStdb();
  await db.call((r) => r.devReset({ confirm: 'RESET-KAMI' }));
});

type FakeTurn = (body: any) => object; // returns the assistant message

function fakeQwen(turns: FakeTurn[]): QwenConfig {
  let i = 0;
  const fetchFn = (async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    const turn = turns[Math.min(i, turns.length - 1)];
    i += 1;
    return new Response(JSON.stringify({ choices: [{ message: turn(body) }] }), { status: 200 });
  }) as typeof fetch;
  return { baseUrl: 'http://fake/v1', model: 'qwen-test', fetchFn };
}

const devAuth = { verifier: null, devAuthAllowed: true };
const owner = () => resolveSession(db, devAuth, { 'x-user-id': 'u-rohan' });
const teen = () => resolveSession(db, devAuth, { 'x-user-id': 'u-maya' });

describe('Qwen tool loop', () => {
  it('runs a READ tool and returns the final text', async () => {
    const cfg = fakeQwen([
      () => ({
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call-1', type: 'function', function: { name: 'get_member_spending', arguments: '{"memberId":"m-maya"}' } },
        ],
      }),
      (body) => {
        // The tool result must have been fed back with the matching id
        const toolMsg = body.messages.find((m: any) => m.role === 'tool');
        expect(toolMsg.tool_call_id).toBe('call-1');
        const data = JSON.parse(toolMsg.content);
        expect(data.remaining).toBe(1680);
        return { role: 'assistant', content: 'Maya has ₹1,680 left this month.' };
      },
    ]);

    const result = await runAgentTurn(db, await owner(), [{ role: 'user', content: 'how much does maya have left' }], undefined, cfg);
    expect(result.mode).toBe('llm');
    expect(result.text).toContain('1,680');
    expect(result.prepared).toHaveLength(0);
  });

  it('PREPARE tool stages an action without executing, and returns it', async () => {
    const expiry = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
    const cfg = fakeQwen([
      () => ({
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-2',
            type: 'function',
            function: {
              name: 'prepare_temp_allowance',
              arguments: JSON.stringify({ memberId: 'm-maya', amountInr: 1000, expiresAtIso: expiry }),
            },
          },
        ],
      }),
      () => ({ role: 'assistant', content: 'Ready for your review — confirm in the app to apply.' }),
    ]);

    const result = await runAgentTurn(db, await owner(), [{ role: 'user', content: 'give maya 1000 more' }], undefined, cfg);
    expect(result.mode).toBe('llm');
    expect(result.prepared).toHaveLength(1);
    expect(result.prepared[0].kind).toBe('temp_allowance');

    // Nothing executed
    expect(db.db.members.id.find('m-maya')?.tempAllowanceAmount).toBeUndefined();
  });

  it('rejects invalid tool arguments without crashing or mutating', async () => {
    const cfg = fakeQwen([
      () => ({
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call-3', type: 'function', function: { name: 'prepare_temp_allowance', arguments: '{"memberId":"m-maya","amountInr":-5}' } },
        ],
      }),
      (body) => {
        const toolMsg = body.messages.find((m: any) => m.role === 'tool');
        expect(JSON.parse(toolMsg.content).error).toBe('invalid_arguments');
        return { role: 'assistant', content: 'That amount is not valid.' };
      },
    ]);

    const result = await runAgentTurn(db, await owner(), [{ role: 'user', content: 'give maya -5' }], undefined, cfg);
    expect(result.prepared).toHaveLength(0);
  });

  it('teen sessions stay scoped even through the model', async () => {
    const cfg = fakeQwen([
      () => ({
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call-4', type: 'function', function: { name: 'get_member_spending', arguments: '{"memberId":"m-arjun"}' } },
        ],
      }),
      (body) => {
        const toolMsg = body.messages.find((m: any) => m.role === 'tool');
        expect(JSON.parse(toolMsg.content).error).toBe('permission_denied');
        return { role: 'assistant', content: 'You can only view your own activity.' };
      },
    ]);

    const result = await runAgentTurn(db, await teen(), [{ role: 'user', content: "show arjun's spending" }], undefined, cfg);
    expect(result.mode).toBe('llm');
    expect(result.prepared).toHaveLength(0);
  });

  it('degrades to scripted mode when the endpoint is unreachable, cancelling orphans', async () => {
    const failing: QwenConfig = {
      baseUrl: 'http://fake/v1',
      model: 'qwen-test',
      fetchFn: (async () => {
        throw new Error('connect ECONNREFUSED');
      }) as typeof fetch,
    };
    const result = await runAgentTurn(
      db,
      await owner(),
      [{ role: 'user', content: 'Give Maya ₹1,000 more until Sunday' }],
      undefined,
      failing,
    );
    expect(result.mode).toBe('scripted');
    expect(result.degraded).toBe(true);
    expect(result.prepared).toHaveLength(1); // scripted still prepared it
  });
});
