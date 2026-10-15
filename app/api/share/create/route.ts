import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';

// Creates (or returns the existing) public share link for one of the caller's
// CBT question sets. Pass { revoke: true } to switch the link off.
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { questionSetId, revoke } = await req.json();
  if (!questionSetId) {
    return NextResponse.json({ error: 'questionSetId required' }, { status: 400 });
  }

  const supa = supabaseServer();
  const { data: set } = await supa
    .from('question_sets')
    .select('id, user_id, exam_mode, share_token')
    .eq('id', questionSetId)
    .maybeSingle();

  if (!set || set.user_id !== user.id) {
    return NextResponse.json({ error: 'Set not found' }, { status: 404 });
  }
  if (set.exam_mode !== 'cbt') {
    return NextResponse.json({ error: 'Only CBT sets can be shared by link right now.' }, { status: 400 });
  }

  if (revoke) {
    await supa.from('question_sets').update({ is_shared: false }).eq('id', set.id);
    return NextResponse.json({ status: 'revoked' });
  }

  const token = set.share_token || randomBytes(8).toString('base64url');
  const { error } = await supa
    .from('question_sets')
    .update({ share_token: token, is_shared: true })
    .eq('id', set.id);

  if (error) {
    console.error('share create error:', error);
    return NextResponse.json({ error: 'Could not create share link' }, { status: 500 });
  }

  return NextResponse.json({ token });
}
