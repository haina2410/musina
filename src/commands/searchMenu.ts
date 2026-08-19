import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import type { SearchCandidate } from '../playback/types.js';

const SEARCH_MENU_PREFIX = 'musina-search:v1';
export const SEARCH_MENU_TTL_MS = 300_000;

export function buildSearchMenu(
  candidates: readonly SearchCandidate[],
  requesterId: string,
  createdAt = Date.now(),
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const options = candidates.slice(0, 5).map((candidate) => {
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(candidate.title.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 100) || 'Untitled track')
      .setValue(candidate.url);
    if (candidate.durationSeconds !== null) {
      option.setDescription(formatDuration(candidate.durationSeconds));
    }
    return option;
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${SEARCH_MENU_PREFIX}:${requesterId}:${createdAt.toString(36)}`)
    .setPlaceholder('Choose a YouTube result')
    .addOptions(options);
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
}

export function parseSearchMenuId(
  customId: string,
  now = Date.now(),
): { expired: boolean; requesterId: string } | null {
  const match = /^musina-search:v1:(\d{1,20}):([0-9a-z]+)$/.exec(customId);
  if (!match) return null;
  const createdAt = Number.parseInt(match[2]!, 36);
  if (!Number.isSafeInteger(createdAt)) return null;
  return {
    expired: createdAt > now || now - createdAt >= SEARCH_MENU_TTL_MS,
    requesterId: match[1]!,
  };
}

function formatDuration(secondsInput: number): string {
  const seconds = Math.max(0, Math.floor(secondsInput));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`.slice(0, 100);
}
