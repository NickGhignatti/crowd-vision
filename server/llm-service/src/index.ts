import { ModelMessage, streamText } from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { createDeepSeek } from '@ai-sdk/deepseek';

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
});

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const messages: ModelMessage[] = [];

async function main() {
  while (true) {
    console.log(process.env.DEEPSEEK_API_KEY ?? 'ahhbooh')
    console.log("AAAAAAAAAAAAAAa")
    const userInput = await terminal.question('You: ');

    messages.push({ role: 'user', content: userInput });

    const result = streamText({
      model: deepseek('deepseek-chat'),
      messages,
    });


    let fullResponse = '';
    process.stdout.write('\nAssistant: ');
    for await (const delta of result.textStream) {
      fullResponse += delta;
      process.stdout.write(delta);
    }
    process.stdout.write('\n\n');

    messages.push({ role: 'assistant', content: fullResponse });
  }
}

main().catch(console.error);