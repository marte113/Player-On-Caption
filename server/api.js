// api.js (또는 utils/api.js)
import "dotenv/config";
import { OpenAiPrompt } from "./prompt.js";
import fetch from "node-fetch";

export async function fetchDeepLTranslation(text) {
  const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
  const url = "https://api-free.deepl.com/v2/translate";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `text=${encodeURIComponent(text)}&target_lang=KO&tag_handling=xml`,
    });

    const rawResponse = await response.text();
    console.log("Raw response from DeepL:", rawResponse);

    if (!response.ok) {
      console.error("DeepL API Error:", rawResponse);
      throw new Error(
        `DeepL API request failed with status ${response.status}`
      );
    }

    return JSON.parse(rawResponse);
  } catch (error) {
    console.error("DeepL Translation error:", error);
    throw error; // 에러를 다시 throw하여 호출자가 처리하도록 함
  }
}

export async function fetchOpenAITranslation(text) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const url = "https://api.openai.com/v1/chat/completions";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: OpenAiPrompt,
          },
          {
            role: "user",
            content: `
Follow the guide, Translate the following English script into Korean:
${text}
`,
          },
        ],
        max_tokens: 2000,
        n: 1,
        stop: null,
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI API Error:", errorData);
      throw new Error(
        `OpenAI API request failed with status ${response.status}`
      );
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("OpenAI Translation error:", error);
    throw error; // 에러를 다시 throw하여 호출자가 처리하도록 함
  }
}
