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
export async function llmResponse(msg: string) {
  try {
    const response = await gemini.invoke([
      ["system", "You are a helpful assistant that finish reposponses always with 'sir'"],
      ["human", msg],
    ]);

    return response.content;
    // console.log(aiMsg.content); 
    // console.log(response.content)
  } catch (error) {
    console.error;
    return "Error: Something went wrong with llm response"
  }
}
