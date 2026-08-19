import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const QUEUE_BUTTON_PREFIX = 'musina-queue:v1';

export function buildQueueButtons(requesterId: string, page: number, totalPages: number) {
  if (totalPages <= 1) return [];
  const previousPage = Math.max(0, page - 1);
  const nextPage = Math.min(totalPages - 1, page + 1);
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${QUEUE_BUTTON_PREFIX}:${requesterId}:${previousPage}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`${QUEUE_BUTTON_PREFIX}:${requesterId}:${nextPage}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= totalPages - 1),
  )];
}

export function parseQueueButtonId(customId: string) {
  const match = /^musina-queue:v1:(\d{1,20}):(\d+)$/.exec(customId);
  if (!match) return null;
  const page = Number(match[2]);
  if (!Number.isSafeInteger(page)) return null;
  return { requesterId: match[1]!, page };
}
