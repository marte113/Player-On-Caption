// api.js (또는 utils/api.js)
import "dotenv/config";
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
            content: `Role:Act as a translator with professional competence in front-end technologies such as JavaScript, TypeScript, React, and NextJS.

-Context:
Translate the script of a lecture on advanced front-end development topics filmed in English into natural and smooth Korean.
When translating, keep the line breaks of the English script as they are and use technical terms commonly used in the Korean developer community.
Prioritize the flow of explanation and accurate delivery of concepts.

- Input Values:
English script (original line breaks retained)

- Instructions:
Write the corresponding Korean translation for the line-break sentences in the provided English script.
Make sure the English script and translation correspond well.
Translate naturally and smoothly, but use expressions commonly used in the Korean developer community for technical terms.
Translate in consideration of the flow of explanation so that the concept delivery is clear.

- Constraints:
Do not change the line break structure.
Maintain the translation quality at the level of the provided translation example.
Provide the translation in the same order as the English script.
A line from the English script must be paired with a line from the translation.
Input and output should always have the same format as the example.

- Input Example:
In this video we want to talk about polymorphic react components.

So what is a polymorphic component and how is it useful.

Well basically uh this pattern provides the uh component consumers with the flexibility to specify what

kind of element a child component should render.

- Output examples:
In this video we want to talk about polymorphic react components.
이번 비디오에서는 다형성 리액트 컴포넌트에 대해 이야기하겠습니다.

So what is a polymorphic component and how is it useful.
그렇다면 다형성 컴포넌트란 무엇이며 어떻게 유용할까요?

Well basically uh this pattern provides the uh component consumers with the flexibility to specify what
기본적으로 이 패턴은 컴포넌트 소비자에게 구체적으로

kind of element a child component should render.
어떤 요소를 자식 컴포넌트가 렌더링하게 할지 지정할 수 있습니다.
`,
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
