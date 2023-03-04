import { ChatGPTAPI } from 'chatgpt'

import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';
import { createClient } from 'redis';

dotenv.config();

const INVOKE_TRIGGER = '??';
const promptPrefix = `You are SkyNot, a helpful and friendly AI assistant. You respond to messages in a friendly manner. When asked to provide a response, you are thorough and do not include previous responses unless asked.`;
const RESET_TRIGGER = 'CONVERSATION_RESET';

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

  return conversation;
}

async function clearConversationForChannelId(channelId) {
  await redis.del(channelId)
}

function log(args = "") {
  console.log(`${new Date().toISOString()} | ${args}`)
}

async function setConversationForChannelId({ channelId, parentMessageId }) {
  await redis.set(channelId, parentMessageId)
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
        return;
      }

      if(message.content.includes(RESET_TRIGGER)){
        await clearConversationForChannelId(message.channel.id);
        log(`Conversation reset for channel ${message.channel.id}!`)
        return;
      }

      await message.channel.sendTyping();

      const conversationStore = await getConversationFromChannelId(message.channel.id);

      let res = null;

      // this is where the magic happens
      // call to OpenAI API with either a new conversation or an existing one

      if (conversationStore) {
        res = await api.sendMessage(prompt, {
          parentMessageId: conversationStore.parentMessageId,
          systemMessage: promptPrefix
        });
      } else {
        res = await api.sendMessage(prompt, {
          systemMessage: promptPrefix
        })
      }

      // console.log(res)
      log(`OUTPUT: ${res.text}`)
      log(`parentMessageId: ${res.parentMessageId}`)
      log();

      await setConversationForChannelId({
        channelId: message.channel.id,
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



