import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

async function sendPush(lineUserId: string, text: string, accessToken: string) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: 'text', text }],
    }),
  });
  if (!res.ok) {
    console.error(`[overtime-check] push error (${lineUserId}):`, await res.text());
  }
  return res.ok;
}

export async function POST(req: NextRequest) {
  try {
    const { user_id, year, month } = await req.json() as {
      user_id: string;
      year: number;
      month: number;
    };

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ success: false, error: 'env not configured' }, { status: 500 });
    }
    if (!accessToken) {
      return NextResponse.json({ success: false, error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ── 勤怠設定を取得 ────────────────────────────────────────
    const { data: settingsRows } = await supabase
      .from('m_settings')
      .select('key, value')
      .in('key', [
        'attendance_standard_daily_hours',
        'attendance_overtime_alert_hours',
        'hr_person_id',
      ]);

    const settings: Record<string, string> = {};
    (settingsRows ?? []).forEach((s: { key: string; value: string }) => {
      settings[s.key] = s.value;
    });

    const standardDailyMinutes  = Number(settings['attendance_standard_daily_hours']  ?? 7)  * 60;
    const alertThresholdMinutes = Number(settings['attendance_overtime_alert_hours']   ?? 30) * 60;
    const hrPersonId            = settings['hr_person_id'] ?? '';

    // ── 今月すでにアラート送信済みか確認 ──────────────────────
    const alertKey = `overtime_alert_sent_${year}_${String(month).padStart(2, '0')}_${user_id}`;
    const { data: alreadySent } = await supabase
      .from('m_settings')
      .select('value')
      .eq('key', alertKey)
      .maybeSingle();

    if (alreadySent?.value === '1') {
      return NextResponse.json({ success: true, alerted: false, reason: 'already_sent' });
    }

    // ── 今月の勤怠データを取得 ────────────────────────────────
    const lastDay   = new Date(year, month, 0).getDate();
    const fromDate  = `${year}-${String(month).padStart(2, '0')}-01`;
    const toDate    = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data: records } = await supabase
      .from('t_attendance')
      .select('total_work_minutes')
      .eq('user_id', user_id)
      .gte('date', fromDate)
      .lte('date', toDate)
      .not('total_work_minutes', 'is', null);

    // ── 残業時間を計算（各日の超過分の合計）────────────────────
    const totalOvertimeMinutes = (records ?? []).reduce((sum, r) => {
      return sum + Math.max(0, (r.total_work_minutes ?? 0) - standardDailyMinutes);
    }, 0);

    if (totalOvertimeMinutes <= alertThresholdMinutes) {
      return NextResponse.json({
        success: true,
        alerted: false,
        overtimeMinutes: totalOvertimeMinutes,
        thresholdMinutes: alertThresholdMinutes,
      });
    }

    // ── アラート送信対象者を収集 ──────────────────────────────
    // ① 本人
    const { data: targetUser } = await supabase
      .from('m_users')
      .select('name, line_user_id')
      .eq('id', user_id)
      .single();

    // ② 管理者全員
    const { data: admins } = await supabase
      .from('m_users')
      .select('line_user_id')
      .eq('role', 'admin')
      .eq('status', 'active');

    // ③ 人事担当者
    let hrLineUserId: string | null = null;
    if (hrPersonId) {
      const { data: hrUser } = await supabase
        .from('m_users')
        .select('line_user_id')
        .eq('id', hrPersonId)
        .single();
      hrLineUserId = hrUser?.line_user_id ?? null;
    }

    // ── LINEメッセージ本文 ────────────────────────────────────
    const overtimeH = Math.floor(totalOvertimeMinutes / 60);
    const overtimeM = totalOvertimeMinutes % 60;
    const alertH    = Math.floor(alertThresholdMinutes / 60);
    const monthLabel = `${year}年${month}月`;
    const userName  = targetUser?.name ?? 'スタッフ';

    const message = [
      `⚠️【残業アラート】`,
      ``,
      `${userName} さんの今月の時間外労働が規定を超えました。`,
      ``,
      `対象者　：${userName}`,
      `今月の残業：${overtimeH}時間${overtimeM > 0 ? `${overtimeM}分` : ''}`,
      `基準時間　：月${alertH}時間以上`,
      `対象期間　：${monthLabel}`,
      ``,
      `早めにご確認ください。`,
    ].join('\n');

    // ── 送信（重複排除）─────────────────────────────────────
    const sentIds = new Set<string>();

    if (targetUser?.line_user_id) {
      await sendPush(targetUser.line_user_id, message, accessToken);
      sentIds.add(targetUser.line_user_id);
    }
    for (const admin of admins ?? []) {
      if (admin.line_user_id && !sentIds.has(admin.line_user_id)) {
        await sendPush(admin.line_user_id, message, accessToken);
        sentIds.add(admin.line_user_id);
      }
    }
    if (hrLineUserId && !sentIds.has(hrLineUserId)) {
      await sendPush(hrLineUserId, message, accessToken);
      sentIds.add(hrLineUserId);
    }

    // ── アラート送信済みフラグをセット（今月は1回のみ通知）──
    await supabase
      .from('m_settings')
      .upsert({ key: alertKey, value: '1' }, { onConflict: 'key' });

    return NextResponse.json({
      success: true,
      alerted: true,
      overtimeMinutes: totalOvertimeMinutes,
      sent: sentIds.size,
    });

  } catch (e) {
    console.error('[overtime-check] error:', e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
