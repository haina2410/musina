export interface MentionCommand {
  argument: string;
  name: string;
}

export function parseMentionCommand(content: string, botId: string): MentionCommand | null {
  const mention = [`<@${botId}>`, `<@!${botId}>`].find((value) => content.startsWith(value));
  if (!mention) return null;
  const input = content.slice(mention.length).trim();
  const separator = input.search(/\s/);
  if (separator === -1) return { argument: '', name: input.toLowerCase() };
  return {
    argument: input.slice(separator).trim(),
    name: input.slice(0, separator).toLowerCase(),
  };
}
