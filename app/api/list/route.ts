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

        // トランザクションを使用して、削除と作成をアトミックに実行する
        const newList = await prisma.$transaction(async (tx) => {
            // 同一週のデータが既に存在する場合は削除
            await tx.shoppingList.deleteMany({
                where: { weekStartDate }
            });

            // 新規作成
            return await tx.shoppingList.create({
                data: {
                    weekStartDate,
                    recipesData: JSON.stringify(recipesData),
                    activeDates: JSON.stringify(activeDates),
                    memo: body.memo,
                    ingredients: {
                        create: ingredients.map((ing: Ingredient) => ({
                            name: ing.name,
                            amount: ing.amount,
                            category: ing.category,
                            usedDays: JSON.stringify(ing.usedDays || []),
                            usedIn: ing.usedIn ? JSON.stringify(ing.usedIn) : null,
                            isChecked: false
                        }))
                    }
                },
                include: {
                    ingredients: true
                }
            });
        });

        // 保存後に、クライアント側で状態同期しやすいようにIDを含めたアイテム情報を返す
        const savedIngredients = newList.ingredients.map((ing: any) => ({
            id: ing.id,
            name: ing.name,
            amount: ing.amount,
            category: ing.category,
            usedDays: JSON.parse(ing.usedDays),
            usedIn: ing.usedIn ? JSON.parse(ing.usedIn) : undefined,
            isChecked: ing.isChecked
        }));

        return NextResponse.json({ success: true, ingredients: savedIngredients });
    } catch (error: any) {
        console.error('Error saving shopping list:', error);
        return NextResponse.json({ error: 'Failed to save shopping list', details: error.message }, { status: 500 });
    }
}
