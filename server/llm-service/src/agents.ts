// import { ModelMessage, streamText } from 'ai';
// import 'dotenv/config';
// import * as readline from 'node:readline/promises';
// import { createDeepSeek } from '@ai-sdk/deepseek';

// const deepseek = createDeepSeek({
//   apiKey: process.env.DEEPSEEK_API_KEY ?? '',
// });

// const terminal = readline.createInterface({
//   input: process.stdin,
//   output: process.stdout,
// });

// const messages: ModelMessage[] = [];

// async function main() {
//   while (true) {
//     const userInput = await terminal.question('You: ');

//     messages.push({ role: 'user', content: userInput });

//     const result = streamText({
//       model: deepseek('deepseek-chat'),
//       messages,
//     });


//     let fullResponse = '';
//     process.stdout.write('\nAssistant: ');
//     for await (const delta of result.textStream) {
//       fullResponse += delta;
//       process.stdout.write(delta);
//     }
//     process.stdout.write('\n\n');

//     messages.push({ role: 'assistant', content: fullResponse });
//   }
// }

// main().catch(console.error);
import 'dotenv/config';
import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"


const seekChat = new ChatDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY ?? '', // Default value.
  model: "deepseek-chat",
});

const seekReason = new ChatDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY ?? '', // Default value.
  model: "deepseek-chat",
});

const gemini = new ChatGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY ?? '',
  model: "gemini-2.5-flash-lite",
})


// Simple invocation
async function main() {
  const aiMsg = await gemini.invoke([
    ["system", "You are a helpful assistant that translates English to French."],
    ["human", "I love programming."],
  ]);
  const response = await gemini.invoke("Why do parrots talk?");

  console.log(aiMsg.content); // Output: "J'adore la programmation."
  console.log(response.content)
}

main().catch(console.error);