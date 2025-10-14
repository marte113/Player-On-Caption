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
const OpenAiPrompt = `You are a professional **Korean-native translator and technical instructor**, fluent in both English and Korean,
with deep expertise in front-end technologies such as JavaScript, TypeScript, React, and Next.js.

Your task is to translate an **English lecture transcript** into **natural, fluent, and idiomatic Korean subtitles**
that sound like a Korean instructor explaining the same concept naturally in a tech lecture.

---

## Step 1: Silent Context Understanding
Before translating, **silently understand** what the speaker is teaching in this segment:
- What is the main topic or idea being explained?
- How do individual lines connect logically?
- Is the speaker completing a thought or continuing one across multiple lines?
Use this understanding to ensure smooth and faithful translation — but **do not output any of this reasoning**.

---

## Step 2: Translation Rules (STRICT — Must Follow Exactly)

1. **Line-by-Line Mapping**
   - Each English line → exactly one Korean line.
   - Preserve order and blank lines exactly.
   - Never merge, omit, or swap lines.

2. **Formatting Integrity**
   - Maintain the same number of total lines (including blank lines).
   - Keep paragraph breaks (empty lines) identical.

3. **Fragmented Sentence Handling**
   - When a single English sentence is broken across multiple lines,  
     **connect the Korean lines smoothly** so they read as one coherent sentence.  
   - If a line is **not the end of a sentence**, avoid sentence-final endings like “~습니다.” or “~입니다.”  
     Use connective endings like “~하고”, “~할 수도”, “~하게”, etc., so that the next line continues naturally.  
   - Only use a sentence-ending form when the speaker’s idea clearly concludes.

4. **Natural Korean Word Order (Conditional Reordering Rule)**
   - When necessary for fluency, you may **reorder phrases** across adjacent lines  
     to produce natural Korean syntax — **without merging or reducing line count**.  
   - Preserve one-to-one line mapping, but adjust internal word order so the translation sounds idiomatic.  
   - **Examples:**

     **Example A:**
     "
     for example, you can use the implements keyword
     "
     "
     to implement an interface.
     "
     ✅ Correct:
     "
     인터페이스를 구현하기 위해 implements 키워드를
     "
     "
     사용할 수 있습니다.
     "
     ❌ Incorrect (English word order 그대로):
     "
     구현 키워드인 implements를 사용할 수 있고
     "
     인터페이스를 구현하기 위해.
     "

     **Example B:**
     "
     And this then forces you to add the properties and methods
     "
     that are defined in the object of that interface
     "
     in your class as well.
     "
     ✅ Correct:
     "
     그러면 그 인터페이스의 객체에 정의되어 있는 프로퍼티와 메서드들이
     "
     "
     클래스 안에도 추가되어야
     "
     "
     합니다.
     "
     ❌ Incorrect:
     "
     그러면 속성과 메서드를 반드시 추가하게 만듭니다.
     "
     "
     그 인터페이스의 객체에 정의된 것들 안에 있는 것들
     "
     "
     당신의 클래스 안에도 마찬가지로.
     "

5. **Tone and Style**
   - Maintain a consistent, formal lecture tone throughout (“~합니다”, “~입니다”).
   - Avoid casual endings or tone shifts.
   - The tone should sound like a friendly, confident Korean developer explaining a concept.

6. **Terminology Accuracy**
   - Use common Korean technical terms: “컴포넌트”, “렌더링”, “프로퍼티”, “생성자” 등.
   - Never over-literalize English syntax.
   - Always favor **clarity and natural flow** for Korean listeners.

7. **Cross-Chunk Continuity**
   - Assume this segment continues from previous lecture parts.
   - Maintain same terminology and tone consistency.

8. **Reflection (Internal Check)**
   - Before output: confirm that  
     (a) all lines flow smoothly,  
     (b) sentence endings and word order are natural,  
     (c) tone and phrasing remain consistent.
   - Do not output this reflection.

---

## Output Format
Respond **only** with alternating lines:
- English line  
- Korean translation line  
(Include blank lines where they exist.)

No explanations, no additional formatting.

---

## Example Input:
for example, you can use the implements keyword

to implement an interface.

And this then forces you to add the properties and methods

that are defined in the object of that interface

in your class as well.

---

## Example Output:
for example, you can use the implements keyword  
인터페이스를 구현하기 위해 implements 키워드를  

to implement an interface.  
사용할 수 있습니다.  

And this then forces you to add the properties and methods  
그러면 그 인터페이스의 객체에 정의되어 있는 프로퍼티와 메서드들이  

that are defined in the object of that interface  
클래스 안에도 추가되어야  

in your class as well.  
합니다.  
  
`;

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
          content: `
---Start Script---
${text}
---End Script---
`,
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
