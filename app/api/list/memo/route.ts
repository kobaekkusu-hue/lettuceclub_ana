import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { weekStartDate, memo } = body;

        if (!weekStartDate) {
            return NextResponse.json({ error: 'weekStartDate is required' }, { status: 400 });
        }

        // upsertを使用して作成または更新をアトミックに行う
        const list = await prisma.shoppingList.upsert({
            where: { weekStartDate },
            update: { memo },
            create: {
                weekStartDate,
                memo,
                recipesData: '[]',
                activeDates: '[]',
            }
        });

        return NextResponse.json({ success: true, memo: list.memo });
    } catch (error: any) {
        console.error('Error updating memo:', error);
        return NextResponse.json({
            error: 'Failed to update memo',
            details: error.message
        }, { status: 500 });
    }
}
