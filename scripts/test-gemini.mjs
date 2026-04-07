import { GoogleGenerativeAI } from '@google/generative-ai';

const key = process.env.GEMINI_API_KEY || 'AIzaSyDIENdj_HPP-dmwOWjVQxJ-zOXnSlHnQ0o';
const genAI = new GoogleGenerativeAI(key);

// Test 1: basic text
try {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const r = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: 'say hello' }] }], generationConfig: { maxOutputTokens: 50 } });
  console.log('gemini-2.5-flash OK:', r.response.text().slice(0, 80));
} catch(e) {
  console.error('gemini-2.5-flash ERR:', e.message?.slice(0, 200), 'status:', e?.status);
}

// Test 2: with responseMimeType
try {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const r = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: 'return json: {"ok":true}' }] }], generationConfig: { maxOutputTokens: 50, responseMimeType: 'application/json' } });
  console.log('JSON mode OK:', r.response.text().slice(0, 80));
} catch(e) {
  console.error('JSON mode ERR:', e.message?.slice(0, 200), 'status:', e?.status);
}
