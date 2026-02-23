import { GoogleGenerativeAI } from '@google/generative-ai';
import { Ingredient, SHOPPING_CATEGORIES } from '@/app/types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function aggregateIngredients(rawText: string): Promise<Ingredient[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  // 試行するモデルの優先順位
  const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];

  const prompt = `
  複数のレシピの材料リストを解析し、買い物リストとして集計してください。
  【】で囲まれた部分は「日付（曜日）と料理名」です。
  
  出力は必ず以下のJSON形式の配列のみにしてください。説明や挨拶は不要です。
  
  [
    {
      "name": "食材名",
      "amount": "合算した分量",
      "category": "カテゴリ名",
      "usedDays": ["曜日のリスト（例: 月, 水）"],
      "usedIn": [
        { "day": "曜日", "dishTitle": "料理名", "amount": "その料理での使用量" }
      ]
    }
  ]
  
  ルール:
  1. 表記ゆれを統一し、分量を合算してください。
  2. 調味料も全て含めてください。
  3. 「合わせ調味料」は中身を個別に集計してください。
  4. カテゴリは必ず以下から正確に選んでください:
     [野菜・きのこ, 肉・ハム・ベーコン, 魚・海鮮, 卵・豆腐・納豆, 乳製品（牛乳・ヨーグルト・チーズ）, 米・パン・麺類・シリアル, 冷凍食品, 缶詰・瓶詰め・乾物・その他, 飲料・お菓子, 調味料・油]
  5. usedInには各食材の使用箇所（曜日、料理名、その分量）をすべて記録してください。
  
  解析対象テキスト:
  ${rawText}
  `;

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      let retries = 1;
      while (retries >= 0) {
        try {
          const result = await model.generateContent(prompt);
          const response = await result.response;
          const text = response.text().trim();

          // 堅牢なJSON抽出
          let jsonString = text;
          const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
          if (jsonMatch) {
            jsonString = jsonMatch[1].trim();
          }

          // [ または { で始まる部分を探す (余計なテキスト混入対策)
          const startIndex = jsonString.indexOf('[');
          const endIndex = jsonString.lastIndexOf(']');
          if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            jsonString = jsonString.substring(startIndex, endIndex + 1);
          }

          try {
            const ingredients: Ingredient[] = JSON.parse(jsonString);
            if (Array.isArray(ingredients) && ingredients.length > 0) {
              return ingredients;
            }
          } catch (e) {
            console.error(`JSON Parse error for ${modelName}:`, e);
            throw new Error('Invalid JSON structure');
          }
        } catch (genError: any) {
          if ((genError.status === 429 || genError.message?.includes('429')) && retries > 0) {
            await new Promise(r => setTimeout(r, 2000));
            retries--;
            continue;
          }
          throw genError;
        }
      }
    } catch (error: any) {
      console.warn(`Model ${modelName} failed:`, error.message);
      continue;
    }
  }

  // 全モデル失敗時のフォールバック
  console.warn('All AI models failed. Using improved fallback logic.');

  return rawText.split('\n')
    .map(line => line.trim())
    // 空行、ヘッダー、および「分量だけ」に見える行を除外
    .filter(line => {
      if (!line || line.length < 2) return false;
      if (line.startsWith('【')) return false;
      // 「大さじ」「小さじ」「g」などの単位だけで構成される行を簡易除外
      const units = ['大さじ', '小さじ', '各', '少々', '適量', '（', '('];
      if (units.some(u => line === u)) return false;
      return true;
    })
    .map(line => ({
      name: line,
      amount: '',
      category: '缶詰・瓶詰め・乾物・その他',
      usedDays: []
    }));
}
