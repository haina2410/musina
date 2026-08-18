import { REST, Routes } from 'discord.js';
import { commandDefinitions } from '../src/commands/definitions.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig();
const rest = new REST().setToken(config.token);
const route = config.guildId
  ? Routes.applicationGuildCommands(config.clientId, config.guildId)
  : Routes.applicationCommands(config.clientId);

await rest.put(route, { body: commandDefinitions });
console.log(`Registered ${commandDefinitions.length} commands ${config.guildId ? 'for the development guild' : 'globally'}.`);
