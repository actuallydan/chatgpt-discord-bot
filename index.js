import { ChatGPTAPI } from 'chatgpt';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';

dotenv.config();

const INVOKE_TRIGGER = '??';

if (!process.env.DISCORD_BOT_TOKEN || !process.env.OPENAI_TOKEN) {
  throw new Error('No bot token found!');
}

const api = new ChatGPTAPI({ sessionToken: process.env.OPENAI_TOKEN || "" })

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("ready", async () => {

  // ensure the API is properly authenticated (optional)
  await api.ensureAuth()

  console.log("The bot is online"); //message when bot is online

});

client.on("messageCreate", async (message) => {
  console.log(message.content)
  try {
    if (message.content.substring(0, INVOKE_TRIGGER.length) === INVOKE_TRIGGER) {

      const prompt = message.content.substring(INVOKE_TRIGGER.length, message.content.length);

      if (prompt.length === 0) {
        return
      }

      await message.channel.sendTyping();

      // send a message and wait for the response
      const response = await api.sendMessage(
        prompt
      )

      await message.channel.send(response);

    }
  } catch (err) {
    console.error(err);
  }
});

// Wake up 🤖
client.login(process.env.DISCORD_BOT_TOKEN);



