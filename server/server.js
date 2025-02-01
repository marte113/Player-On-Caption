// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fetchDeepLTranslation, fetchOpenAITranslation } from './api.js'; // api.js에서 함수들을 import

const app = express();
const port = process.env.PORT || 5004;

app.use(cors());
app.use(express.json());

app.post('/translate', async (req, res) => {
  try {
    const { text, api } = req.body; // API 선택 파라미터 추가

    let translatedData;
    if (api === 'deepl') {
      translatedData = await fetchDeepLTranslation(text);
    } else if (api === 'openai') {
      translatedData = await fetchOpenAITranslation(text);
    } else {
      throw new Error('Invalid API specified');
    }

    res.json(translatedData);
  } catch (error) {
    console.error("Translation error:", error);
    res.status(500).json({ error: "Translation failed" });
  }
});

app.listen(port, () => {
  console.log(`Proxy server listening at http://localhost:${port}`);
});