import { GoogleGenerativeAI } from '@google/generative-ai';
import { Ingredient, SHOPPING_CATEGORIES } from '@/app/types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function aggregateIngredients(rawText: string): Promise<Ingredient[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  // 試行するモデルの優先順位
  const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash'];

  const categoriesList = SHOPPING_CATEGORIES.join('、');

  const prompt = `
  以下のテキストは、複数のレシピの材料リストを結合したものです。
  【】で囲まれた部分は、そのレシピの日付（曜日）と料理名を示しています。

  これを解析し、買い物リストとして使えるように、同じ食材の分量を合算してまとめてください。
  また、その食材が「何曜日の献立に使われているか」もリスト化してください。
  
  以下のJSON形式で結果を出力してください。思考プロセスなどの余計なテキストは含めないでください。
  
  出力形式:
  \`\`\`json
  [
    {
      "name": "食材名（例: 玉ねぎ）",
      "amount": "合算した分量（例: 2個）",
      "category": "カテゴリ名",
      "usedDays": ["月", "水"],
      "usedIn": [
        { "day": "月", "dishTitle": "料理名A", "amount": "使用量（例: 1/2個）" },
        { "day": "水", "dishTitle": "料理名B", "amount": "使用量（例: 1.5個）" }
      ]
    }
  ]
  \`\`\`
  
  ルール:
  1. 表記ゆれは統一してください（例: "鶏もも肉"と"とり肉" -> "鶏もも肉"）。
  
  2. 分量は可能な限り計算して合算してください（例: "1/2個" + "1.5個" -> "2個"）。
     - 分量が明記されていない飲料（牛乳など）やパック商品は、「1本」「1パック」などの適切な単位でカウントしてください（デフォルト値として「1本」を使用して構いません）。

  3. **重要: 調味料も全て集計してください。** 家にある基本的な調味料も含めてリストアップしてください。

  4. **「合わせ調味料」は集計しないでください。** 代わりに、その中身（構成する調味料）を集計してください。

  5. カテゴリは必ず指定されたリストから選んでください。

  6. usedDaysには、その食材が登場する曜日のリストを重複なく含めてください。

  7. **重要: usedInには、その食材がどの曜日のどの料理（【曜日の料理名】の見出しにある料理名）に、どのくらいの量（その料理セクションに記載されている分量）使われているかを正確に記録してください。**
     - 【】で囲まれた見出しの直後にある材料はその料理に紐付けてください。
     - 1つの食材が複数の料理に使われる場合は、それぞれの料理名と分量をすべてリストアップしてください。
     - usedDaysに含まれるすべての曜日について、必ず1つ以上のusedIn要素が存在するようにしてください。
  
  入力テキスト:
  ${rawText}
  `;

  // モデルごとのループ
  for (const modelName of MODELS) {
    try {
      console.log(`Trying model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });

      // リトライループ (最大2回リトライ)
      let retries = 2;
      while (retries >= 0) {
        try {
          const result = await model.generateContent(prompt);
          const response = await result.response;
          const text = response.text();

          // JSONパース (大文字小文字を区別せず、余分な空白も考慮)
          const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

          if (jsonMatch && jsonMatch[1]) {
            const jsonString = jsonMatch[1].trim();
            const ingredients: Ingredient[] = JSON.parse(jsonString);
            return ingredients;
          }

          // JSONブロックが見つからない場合
          try {
            const ingredients: Ingredient[] = JSON.parse(text.trim());
            return ingredients;
          } catch (e) {
            // JSONパース失敗時もリトライ対象にするためエラーを投げる
            throw new Error('Valid JSON block not found');
          }

        } catch (genError: any) {
          console.error(`Error with ${modelName}:`, genError.message);

          const isRateLimit = genError.status === 429 || genError.message?.includes('429');
          const isServerErr = genError.status === 503 || genError.message?.includes('503');
          // JSONパースエラーなども含めて一時的なエラーとみなしてリトライする運用にするか、
          // 明確なAPIエラー以外は即次モデルへ行くか。
          // ここではレート制限・サーバーエラーのみリトライ待機を入れる。

          if ((isRateLimit || isServerErr) && retries > 0) {
            // 待機時間を短縮 (2s -> 5s)
            const waitTime = (3 - retries) * 2000 + 1000; // 3000ms, 5000ms
            console.log(`Retrying ${modelName} in ${waitTime / 1000}s...`);
            await new Promise(r => setTimeout(r, waitTime));
            retries--;
            continue;
          }

          // リトライなし、または致命的エラーならこのモデルは諦める
          throw genError;
        }
      }

    } catch (error: any) {
      console.warn(`Model ${modelName} failed. Trying next model...`);
      // 次のモデルへループ継続
      continue;
    }
  }

  // 全モデル失敗時のフォールバック
  console.warn('All models failed or fatal error. Falling back to raw text parsing.');

  // 生テキストをそのまま返すのではなく、少し整形して返す
  // 材料リストっぽい行だけ抽出する簡易ロジック
  const fallbackList: Ingredient[] = rawText.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('【')) // ヘッダー行を除外
    .map((line, index) => ({
      name: line.length > 20 ? line.substring(0, 20) + '...' : line,
      amount: '',
      category: '缶詰・瓶詰め・乾物・その他',
      usedDays: []
    }));

  return fallbackList;
}
