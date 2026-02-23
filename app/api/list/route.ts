export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Ingredient } from '@/app/types';

// 買い物リストの取得
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const weekStartDate = searchParams.get('weekStartDate');

    if (!weekStartDate) {
        return NextResponse.json({ error: 'weekStartDate is required' }, { status: 400 });
    }

    try {
        const list = await prisma.shoppingList.findUnique({
            where: { weekStartDate },
            include: {
                ingredients: true
            }
        });

        if (!list) {
            return NextResponse.json({ found: false });
        }

        // JSON文字列をパースして返す
        return NextResponse.json({
            found: true,
            data: {
                recipes: JSON.parse(list.recipesData),
                activeDates: JSON.parse(list.activeDates),
                memo: list.memo,
                ingredients: list.ingredients.map((ing: any) => ({
                    id: ing.id,
                    name: ing.name,
                    amount: ing.amount,
                    category: ing.category,
                    usedDays: JSON.parse(ing.usedDays),
                    usedIn: ing.usedIn ? JSON.parse(ing.usedIn) : undefined,
                    isChecked: ing.isChecked
                }))
            }
        });
    } catch (error: any) {
        console.error('Error fetching shopping list:', error);
        return NextResponse.json({ error: 'Failed to fetch shopping list', details: error.message }, { status: 500 });
    }
}

// 買い物リストの保存
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { weekStartDate, recipesData, activeDates, ingredients } = body;

        if (!weekStartDate || !recipesData || !activeDates || !ingredients) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // トランザクションを使用して、リストの基本情報と材料リストをアトミックに更新する
        const savedIngredients = await prisma.$transaction(async (tx) => {
            // 1. ShoppingList 自体を upsert (存在すれば更新、なければ作成)
            const list = await tx.shoppingList.upsert({
                where: { weekStartDate },
                update: {
                    recipesData: JSON.stringify(recipesData),
                    activeDates: JSON.stringify(activeDates),
                    memo: body.memo !== undefined ? body.memo : undefined
                },
                create: {
                    weekStartDate,
                    recipesData: JSON.stringify(recipesData),
                    activeDates: JSON.stringify(activeDates),
                    memo: body.memo || ''
                }
            });

            // 2. 既存の材料を削除
            await tx.ingredientItem.deleteMany({
                where: { listId: list.id }
            });

            // 3. 新しい材料を登録
            // 外部キー制約の関係で一つずつ登録するか、createManyが使えるならそれを使用
            // ここでは types.ts の Ingredient 形式から DB の IngredientItem 形式へ変換
            const ingredientsToCreate = ingredients.map((ing: Ingredient) => ({
                listId: list.id,
                name: ing.name,
                amount: ing.amount,
                category: ing.category,
                usedDays: JSON.stringify(ing.usedDays || []),
                usedIn: ing.usedIn ? JSON.stringify(ing.usedIn) : null,
                isChecked: false
            }));

            // createMany は PostgreSQL で実行可能
            await tx.ingredientItem.createMany({
                data: ingredientsToCreate
            });

            // 保存後のデータを再度取得して返す (IDを含めるため)
            const allIngredients = await tx.ingredientItem.findMany({
                where: { listId: list.id }
            });

            return allIngredients.map((ing: any) => ({
                id: ing.id,
                name: ing.name,
                amount: ing.amount,
                category: ing.category,
                usedDays: JSON.parse(ing.usedDays),
                usedIn: ing.usedIn ? JSON.parse(ing.usedIn) : undefined,
                isChecked: ing.isChecked
            }));
        });

        return NextResponse.json({ success: true, ingredients: savedIngredients });
    } catch (error: any) {
        console.error('Error saving shopping list:', error);
        return NextResponse.json({ error: 'Failed to save shopping list', details: error.message }, { status: 500 });
    }
}
