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
  // gpt-5-nano는 Responses API를 사용해야 합니다.
  const url = "https://api.openai.com/v1/responses";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-nano",
        // Responses API는 messages 대신 input을 사용합니다.
        input: [
          { role: "system", content: OpenAiPrompt },
          {
            role: "user",
            content: `Here is the English script. Each line must be followed by its Korean translation.
Do NOT change or merge line breaks. Maintain one-to-one line structure.
This translation will be used in a program that pairs each English line with its Korean translation using a strict key-value structure.  
If your output merges, skips, or rearranges lines or paragraph breaks, the program will fail.
When a single English sentence is fragmented across multiple lines,
first translate it into one complete and natural Korean sentence.
Then, split the Korean translation to match the original line breaks.
This is to maintain the strict one-to-one line structure.

--- START OF SCRIPT ---
${text}
--- END OF SCRIPT ---`,
          },
        ],
        // 토큰 한도는 max_output_tokens를 사용합니다.
        max_output_tokens: 30000,
        temperature: 1,
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      console.error("OpenAI API Error (raw):", raw);
      throw new Error(
        `OpenAI API request failed with status ${response.status}`
      );
    }

    const data = await response.json();
    console.log("data : ", data);
    // 편의 필드 우선 사용
    if (typeof data.output_text === "string" && data.output_text.length) {
      return data.output_text;
    }
    // 구조화된 출력에서 텍스트 추출
    if (Array.isArray(data.output)) {
      const parts = [];
      for (const item of data.output) {
        if (item && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c && c.type === "output_text" && typeof c.text === "string") {
              parts.push(c.text);
            }
            if (c && c.type === "text" && typeof c.text === "string") {
              parts.push(c.text);
            }
          }
        }
      }
      if (parts.length) return parts.join("");
    }
    // 마지막 수단: 원본 응답을 문자열로 반환하여 가시성 확보
    return JSON.stringify(data);
  } catch (error) {
    console.error("OpenAI Translation error:", error);
    throw error; // 에러를 다시 throw하여 호출자가 처리하도록 함
  }
}
