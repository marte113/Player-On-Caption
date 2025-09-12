chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
});
// 확장 프로그램이 실행되자 마자, 브라우저의 현재 탭에 content.js 스크립트를 삽입하는 역할을 수행.

// ===== 번역 처리 로직: OpenAI/DeepL API를 백그라운드에서 직접 호출 =====

// OpenAI 시스템 프롬프트 (server/prompt.js와 동일한 규칙 유지)
const OpenAiPrompt = `You are a professional translator with deep expertise in front-end technologies such as JavaScript, TypeScript, React, and Next.js.

## Task
Translate an English lecture transcript into natural and fluent Korean, line by line, for use as synchronized subtitles.
A key requirement is that even when English sentences are broken across multiple lines due to speaker pauses or script formatting, the corresponding Korean translation lines must flow together smoothly and grammatically, preserving the intended continuous meaning. All formatting rules (line breaks, blank lines) must be strictly followed.

## Translation Rules (STRICT - Must Follow Exactly)

1.  The English script is formatted with **line breaks**.
    Each line represents a segment of spoken text.
    **You MUST translate it line by line**, without combining lines or skipping any.

2.  **Each English line MUST be immediately followed by exactly one Korean translation line.**
    - Maintain a strict one-to-one mapping.
    - Do NOT merge multiple English lines into one Korean line.
    - Do NOT translate multiple Korean lines for one English line.
    - Each pair must preserve line integrity.

3.  **Do NOT alter or remove any blank lines between paragraphs.**
    - If there is a blank line (empty line) between English sentences in the input, you must preserve that exact position with a blank line in your output.
    - Blank lines indicate paragraph breaks and must remain as-is.

4.  **Preserve the order and structure exactly.**
    - The total number of lines (including blank lines) must be identical between input and output.
    - Translation lines must follow the same line breaks as the English source.

5.  **Maintain Contextual and Grammatical Cohesion for Spoken Language:**
    - English lecture scripts often have lines broken where a speaker might pause, even if it's mid-sentence.
    - While each English line MUST be translated into exactly one Korean line (as per Rule 2), the Korean translation for these fragmented lines SHOULD connect logically and grammatically to form a coherent and natural-sounding sentence or idea for the listener.
    - Imagine the speaker is uttering a complete thought that happens to be transcribed across multiple lines; your Korean translation should reflect that underlying continuity.
    - **Example of desired cohesion:**
      If English lines are:
      This is an example of a pattern
      that we often see in React.
      
      The Korean translation should be structured like:
      이것은 하나의 패턴 예시인데
      저희가 리액트에서 자주 볼 수 있는 것입니다.
      (Note: The Korean lines, though separate, form a natural connection. Avoid translations like "이것은 하나의 패턴 예시입니다. / 그것은 저희가 리액트에서 자주 볼 수 있습니다." which might sound too disjointed.)

6.  Use technical terms and expressions commonly accepted in the Korean front-end development community. 

7.  **Strive for Natural, Idiomatic, and Engaging Korean Expressions:**
    - Translate fluently and clearly to help the listener understand the concept.
    - **Crucially, avoid overly literal (word-for-word) translations of English expressions that might sound awkward, unnatural, or like "번역투" (translationese) in Korean.** Instead, aim to convey the original meaning using expressions and phrasings that a native Korean speaker would naturally use in a similar educational or technical context. The language should feel authentic and relatable to a Korean audience.
    - Prioritize accuracy and technical clarity for each individual line. However, this accuracy should be achieved *while ensuring* the natural flow, grammatical correctness, and **idiomatic naturalness of Korean**. This is especially important when a sentence spans multiple lines. The goal is to produce translations that are not only correct but also engaging and easy to follow for Korean listeners, avoiding any choppiness or awkwardness caused by overly rigid adherence to English sentence structure or phrasing.
    
## Output Format
Respond ONLY with alternating lines:
- English line  
- Korean translation line  
(Repeat for all lines in order, including empty lines where applicable.)

DO NOT add any comments, explanations, or extra formatting.

## Why this matters
This translation will be used in a program that pairs each English line with its Korean translation using a strict key-value structure.  
If your output merges, skips, or rearranges lines or paragraph breaks, the program will fail.

## Example Input:
In this video we want to talk about polymorphic react components.

So what is a polymorphic component and how is it useful.

Well basically uh this pattern provides the uh component consumers with the flexibility to specify what

kind of element a child component should render.

## Example Output:
In this video we want to talk about polymorphic react components.  
이번 비디오에서는 다형성 리액트 컴포넌트에 대해 이야기하겠습니다.  

So what is a polymorphic component and how is it useful.  
그렇다면 다형성 컴포넌트란 무엇이며 어떻게 유용할까요?  

Well basically uh this pattern provides the uh component consumers with the flexibility to specify what  
기본적으로 이 패턴은 컴포넌트 소비자에게 구체적으로  

kind of element a child component should render.  
어떤 요소를 자식 컴포넌트가 렌더링하게 할지 지정할 수 있습니다.`;

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEEPL_URL = "https://api-free.deepl.com/v2/translate";

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items));
  });
}

async function translateWithOpenAI(text) {
  const { OPENAI_API_KEY, OPENAI_MODEL } = await storageGet([
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
  ]);
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set in Options");
  const model = OPENAI_MODEL || "gpt-5-nano";

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
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
      max_output_tokens: 15000,
      store: true,
      parallel_tool_calls: false,
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${raw}`);
  }

  const data = await response.json();
  if (typeof data.output_text === "string" && data.output_text.length) {
    return data.output_text;
  }
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
  return JSON.stringify(data);
}

async function translateWithDeepL(text) {
  const { DEEPL_API_KEY } = await storageGet(["DEEPL_API_KEY"]);
  if (!DEEPL_API_KEY) throw new Error("DEEPL_API_KEY is not set in Options");

  const response = await fetch(DEEPL_URL, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `text=${encodeURIComponent(text)}&target_lang=KO&tag_handling=xml`,
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`DeepL API error: ${response.status} ${raw}`);
  }
  return JSON.parse(raw);
}

// content.js -> background로 번역을 위임하는 메시지 처리기
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.action === "translateChunk") {
    (async () => {
      try {
        if (request.api === "deepl") {
          const data = await translateWithDeepL(request.text || "");
          sendResponse({ ok: true, data });
          return;
        }
        if (request.api === "openai") {
          const data = await translateWithOpenAI(request.text || "");
          sendResponse({ ok: true, data });
          return;
        }
        throw new Error("Invalid API specified");
      } catch (err) {
        console.error("Background translation error:", err);
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    // 비동기 응답을 위해 true 반환
    return true;
  }
});
