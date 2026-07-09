import { NextResponse } from 'next/server';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';
import { extractViaAIVision } from '@/lib/ocrFallback';
// @ts-ignore - pdf-parse has no bundled types for this import path
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

// Fluid Compute (free on Vercel's Hobby plan) raises the max duration ceiling to 300s.
// Without it enabled, Hobby caps at 10s and this route WILL time out on scanned PDFs.
// See README "Vercel setup" section — you must toggle Fluid Compute on in project settings.
export const maxDuration = 120;

// Above this page count, OCR fallback risks running past the time budget even with
// Fluid Compute's 300s ceiling — better to fail fast with a clear message than time out silently.
const MAX_OCR_PAGES = 40;

export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { materialId } = await req.json();
  if (!materialId) {
    return NextResponse.json({ error: 'materialId required' }, { status: 400 });
  }

  const supa = supabaseServer();

  const { data: material, error: materialError } = await supa
    .from('materials')
    .select('id, storage_path, user_id')
    .eq('id', materialId)
    .single();

  if (materialError || !material || material.user_id !== user.id) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 });
  }

  // Download the file from Supabase Storage
  const { data: fileData, error: downloadError } = await supa.storage
    .from('materials')
    .download(material.storage_path);

  if (downloadError || !fileData) {
    await supa.from('materials').update({ status: 'failed' }).eq('id', materialId);
    return NextResponse.json({ error: 'Could not download uploaded file' }, { status: 500 });
  }

  try {
    const isPdf = material.storage_path.toLowerCase().endsWith('.pdf');
    let text = '';
    let pageCount: number | undefined;
    let usedOcrFallback = false;

    if (isPdf) {
      const buffer = Buffer.from(await fileData.arrayBuffer());
      const parsed = await pdfParse(buffer);
      text = parsed.text;
      pageCount = parsed.numpages;

      // If pdf-parse found almost nothing, this is likely a scanned/image-only PDF.
      // Fall back to Claude reading the pages directly (acts as OCR).
      if (text.trim().length < 200) {
        if (pageCount && pageCount > MAX_OCR_PAGES) {
          await supa.from('materials').update({ status: 'failed' }).eq('id', materialId);
          return NextResponse.json(
            {
              error: `This looks like a scanned document with ${pageCount} pages — that's too long to process reliably in one go. Try splitting it into smaller files (under ${MAX_OCR_PAGES} pages each) and uploading separately.`,
            },
            { status: 422 }
          );
        }
        try {
          text = await extractViaAIVision(buffer);
          usedOcrFallback = true;
        } catch (ocrErr) {
          console.error('OCR fallback failed:', ocrErr);
          // fall through — trimmed.length check below will still catch this
        }
      }
    } else {
      // Plain text / markdown notes
      text = await fileData.text();
    }

    const trimmed = text.trim();

    if (trimmed.length < 200) {
      await supa.from('materials').update({ status: 'failed' }).eq('id', materialId);
      return NextResponse.json(
        {
          error:
            'Could not extract enough readable text, even with OCR. Try a clearer scan or a text-based PDF.',
        },
        { status: 422 }
      );
    }

    await supa
      .from('materials')
      .update({ extracted_text: trimmed, page_count: pageCount, status: 'ready' })
      .eq('id', materialId);

    return NextResponse.json({ status: 'ready', characterCount: trimmed.length, pageCount, usedOcrFallback });
  } catch (err) {
    console.error('Extraction error:', err);
    await supa.from('materials').update({ status: 'failed' }).eq('id', materialId);
    return NextResponse.json({ error: 'Failed to extract text from file' }, { status: 500 });
  }
}
