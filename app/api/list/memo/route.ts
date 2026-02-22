import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { weekStartDate, memo } = body;

        if (!weekStartDate) {
            return NextResponse.json({ error: 'weekStartDate is required' }, { status: 400 });
        }

        // 存在確認
        const existing = await prisma.shoppingList.findUnique({
            where: { weekStartDate }
        });

        let list;
        if (existing) {
            list = await prisma.shoppingList.update({
                where: { weekStartDate },
                data: { memo }
            });
        } else {
            list = await prisma.shoppingList.create({
                data: {
                    weekStartDate,
                    memo,
                    recipesData: '[]',
                    activeDates: '[]',
                }
            });
        }

        return NextResponse.json({ success: true, memo: list.memo });
    } catch (error: any) {
        console.error('Error updating memo:', error);
        return NextResponse.json({
            error: 'Failed to update memo',
            details: error.message
        }, { status: 500 });
    }
}
