import type { APIButtonComponent } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { buildQueueButtons, parseQueueButtonId } from '../src/commands/queueButtons.js';

describe('queue buttons', () => {
  it('renders requester-bound previous and next targets', () => {
    const [row] = buildQueueButtons('123456789', 1, 3);
    const [previous, next] = row!.toJSON().components as APIButtonComponent[];

    expect(previous).toMatchObject({ custom_id: 'musina-queue:v1:123456789:0', disabled: false });
    expect(next).toMatchObject({ custom_id: 'musina-queue:v1:123456789:2', disabled: false });
  });

  it('disables boundaries and omits controls for one page', () => {
    const [first] = buildQueueButtons('123', 0, 2)[0]!.toJSON().components as APIButtonComponent[];
    const [, last] = buildQueueButtons('123', 1, 2)[0]!.toJSON().components as APIButtonComponent[];

    expect(first.disabled).toBe(true);
    expect(last.disabled).toBe(true);
    expect(buildQueueButtons('123', 0, 1)).toEqual([]);
    expect(buildQueueButtons('123', 0, 0)).toEqual([]);
  });

  it('parses valid IDs and rejects malformed or unsafe pages', () => {
    expect(parseQueueButtonId('musina-queue:v1:123:4')).toEqual({ requesterId: '123', page: 4 });
    expect(parseQueueButtonId('other:v1:123:4')).toBeNull();
    expect(parseQueueButtonId('musina-queue:v1:user:4')).toBeNull();
    expect(parseQueueButtonId('musina-queue:v1:123:999999999999999999999')).toBeNull();
  });
});
