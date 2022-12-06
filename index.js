import { ChatGPTAPI } from '@actuallydan/chatgpt';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';
import { createClient } from 'redis';

dotenv.config();

async function getConversationFromChannelId(channelId) {
  const conversation = await redis.get(channelId);

  if (!conversation) {
    return null
  }

  return JSON.parse(conversation)
}

async function setConversationForChannelId({ channelId, conversationId, parentMessageId }) {
  await redis.set(channelId, JSON.stringify({ conversationId, parentMessageId }))
}

const INVOKE_TRIGGER = '??';

if (!process.env.DISCORD_BOT_TOKEN || !process.env.OPENAI_TOKEN) {
  throw new Error('No bot token found!');
}

const redis = createClient({
  url: process.env.REDIS_URI
});

redis.on("error", err => console.error("Redis client error: ", err))

const api = new ChatGPTAPI({ sessionToken: process.env.OPENAI_TOKEN || "" })

function splitString(str) {
  let chunks = [];
  const maxLength = 2000;

  for (let i = 0; i < str.length / maxLength; i++) {
    chunks.push(str.substring(i * maxLength, i * maxLength + maxLength));
  }

  return chunks
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("ready", async () => {

  await redis.connect();

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

      const conversationStore = await getConversationFromChannelId(message.channel.id);
      console.log({ conversationStore })
      let conversation = !conversationStore ? api.getConversation() : api.getConversation({ ...conversationStore })

      // send a message and wait for the response
      const response = await conversation.sendMessage(
        prompt
      )

      await setConversationForChannelId({
        channelId: message.channel.id,
        conversationId: conversation.conversationId,
        parentMessageId: conversation.parentMessageId
      })

      const chunks = splitString(response);

      const starterPromise = Promise.resolve(null);
      await chunks.reduce(
        async (p, chunk) => {
          return p.then(() => message.channel.send(chunk))
        },
        starterPromise
      );

    }
  } catch (err) {
    console.error(err);
  }
});

// Wake up 🤖
client.login(process.env.DISCORD_BOT_TOKEN);



