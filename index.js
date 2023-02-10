import { ChatGPTAPI } from 'chatgpt';

import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';
import { createClient } from 'redis';

dotenv.config();

const INVOKE_TRIGGER = '??';
const promptPrefix = `You are SkyNot, a helpful and friendly AI assistant. You respond to messages in a friendly manner. When asked to provide a response, you are thorough and do not include previous responses unless asked.`;

if (!process.env.DISCORD_BOT_TOKEN || !process.env.OPENAI_TOKEN) {
  throw new Error('No bot token found!');
}

const redis = createClient({
  url: process.env.REDIS_URI
});

redis.on("error", err => console.error("Redis client error: ", err))

const api = new ChatGPTAPI({
  apiKey: process.env.OPENAI_TOKEN
});

async function getConversationFromChannelId(channelId) {
  const conversation = await redis.get(channelId);

  if (!conversation) {
    return null
  }

  return JSON.parse(conversation)
}

function log(args = "") {
  console.log(`${new Date().toISOString()} | ${args}`)
}

async function setConversationForChannelId({ channelId, conversationId, parentMessageId }) {
  await redis.set(channelId, JSON.stringify({ conversationId, parentMessageId }))
}
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
  log("The bot is online");
});


client.on("messageCreate", async (message) => {

  try {
    if (message.content.substring(0, INVOKE_TRIGGER.length) === INVOKE_TRIGGER) {

      log(`INPUT: ${message.content}`)
      const prompt = message.content.substring(INVOKE_TRIGGER.length, message.content.length);

      if (prompt.length === 0) {
        return
      }

      await message.channel.sendTyping();

      const conversationStore = await getConversationFromChannelId(message.channel.id);

      let res = null;

      // this is where the magic happens
      // call to OpenAI API with either a new conversation or an existing one

      if (conversationStore) {
        res = await api.sendMessage(prompt, {
          conversationId: conversationStore.conversationId,
          parentMessageId: conversationStore.parentMessageId,
          promptPrefix: promptPrefix
        });
      } else {
        res = await api.sendMessage(prompt, {
          promptPrefix: promptPrefix
        })
      }

      // console.log(res)
      log(`OUTPUT: ${res.text}`)
      log(`conversationId: ${res.conversationId}`)
      log(`parentMessageId: ${res.parentMessageId}`)
      log();
      
      await setConversationForChannelId({
        channelId: message.channel.id,
        conversationId: res.conversationId,
        parentMessageId: res.parentMessageId
      })

      const chunks = splitString(res.text);

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



