import type { APIStringSelectComponent } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { buildSearchMenu, parseSearchMenuId } from '../src/commands/searchMenu.js';

describe('search menu', () => {
  it('renders five bounded options in a requester-bound menu', () => {
    const candidates = Array.from({ length: 5 }, (_, index) => ({
      durationSeconds: index === 0 ? 185 : null,
      title: `${'Title '.repeat(30)}${index}`,
      url: `https://youtu.be/abcdefghij${index}`,
    }));

    const [row] = buildSearchMenu(candidates, '123456789', 1_700_000_000_000);
    const component = row!.toJSON().components[0] as APIStringSelectComponent;

    expect(component.custom_id).toBe(
      `musina-search:v1:123456789:${(1_700_000_000_000).toString(36)}`,
    );
    expect(component.options).toHaveLength(5);
    expect(component.options[0]).toMatchObject({
      description: '3:05',
      value: 'https://youtu.be/abcdefghij0',
    });
    expect(component.options.every((option) => option.label.length <= 100)).toBe(true);
  });

  it('parses ownership and expires at five minutes', () => {
    const createdAt = 1_700_000_000_000;
    const id = `musina-search:v1:123:${createdAt.toString(36)}`;

    expect(parseSearchMenuId(id, createdAt + 299_999)).toEqual({
      expired: false,
      requesterId: '123',
    });
    expect(parseSearchMenuId(id, createdAt + 300_000)).toEqual({
      expired: true,
      requesterId: '123',
    });
  });

  it('treats a future creation timestamp as expired', () => {
    const createdAt = 1_700_000_000_000;
    const id = `musina-search:v1:123:${createdAt.toString(36)}`;

    expect(parseSearchMenuId(id, createdAt - 1)).toEqual({
      expired: true,
      requesterId: '123',
    });
  });

  it.each([
    'other:v1:123:abc',
    'musina-search:v1:not-a-user:abc',
    'musina-search:v1:123:!',
  ])('ignores malformed custom id %s', (id) => {
    expect(parseSearchMenuId(id)).toBeNull();
  });
});
