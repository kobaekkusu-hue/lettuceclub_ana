export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const audioDir = path.join(process.cwd(), 'public', 'audio');
        
        // ディレクトリが存在しない場合は空配列を返す
        if (!fs.existsSync(audioDir)) {
            return NextResponse.json([]);
        }

        const files = fs.readdirSync(audioDir);
        
        // .mp3 ファイルのみを抽出し、トラックオブジェクトを作成
        const tracks = files
            .filter(file => file.toLowerCase().endsWith('.mp3'))
            .map(file => {
                const name = path.basename(file, path.extname(file));
                return {
                    id: name,
                    name: name, // ファイル名（拡張子なし）をそのままタイトルに
                    url: `/audio/${encodeURIComponent(file)}`, // URLエンコードしてスペースなどの文字化けを防止
                    type: 'music' as const
                };
            });

        return NextResponse.json(tracks);
    } catch (error) {
        console.error('Failed to read audio directory:', error);
        return NextResponse.json({ error: 'Failed to load audio files' }, { status: 500 });
    }
}
