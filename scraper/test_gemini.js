import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'YOUR_API_KEY');

async function check() {
  try {
    const model = genAI.getGenerativeModel({ model: 'models/antigravity-preview-05-2026' });
    const result = await model.generateContent('Generate 1 MP Police GK MCQ in JSON format with question_text, options array, and correct_option_index.');
    console.log('Success Antigravity:', result.response.text());
  } catch (e) {
    console.error('Error Antigravity:', e.message);
  }
}
check();
