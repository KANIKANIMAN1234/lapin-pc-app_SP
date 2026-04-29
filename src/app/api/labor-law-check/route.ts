/**
 * 労働基準法コンプライアンスチェック API
 *
 * 実施するチェック（2024年最新 労基法・36協定上限規制準拠）:
 * 1. 休憩時間不足    労基法34条: 6h超→45分, 8h超→60分
 * 2. 深夜退勤       労基法37条: 22:00以降退勤で深夜割増の周知
 * 3. 勤務間インターバル 労時設定改善法: 11時間未満は努力義務違反の懸念
 * 4. 月45時間超残業  36協定原則上限（注意）
 * 5. 月80時間超残業  複数月平均の過労死ライン（警告）
 * 6. 月100時間超残業 単月の絶対上限・厳重警告（緊急）
 * 7. 連続勤務       労基法35条: 週1日の法定休日確保（6日以上連続で警告）
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase generated types が未設定の環境でも型エラーを回避するための型エイリアス
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = ReturnType<typeof createClient<any>>;
function makeClient(url: string, key: string): SupabaseClient {
  return createClient(url, key);
}

// ── 定数 ────────────────────────────────────────────────────────────
const BREAK_6H_MIN  = 45;   // 6時間超の最低休憩分
const BREAK_8H_MIN  = 60;   // 8時間超の最低休憩分
const INTERVAL_MIN  = 11 * 60; // 勤務間インターバル推奨（分）
const CONSECUTIVE_WARN = 6; // 連続勤務警告日数

// ── 通知レベル ──────────────────────────────────────────────────────
type Level = 'info' | 'warning' | 'critical';

interface CheckResult {
  key: string;
  level: Level;
  message: string;
}

// ── LINE送信 ──────────────────────────────────────────────────────
async function sendPush(lineUserId: string, text: string, accessToken: string) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) console.error(`[labor-law] push error (${lineUserId}):`, await res.text());
  return res.ok;
}

// ── 送信済みフラグ確認・セット ──────────────────────────────────
async function isAlreadyNotified(
  supabase: SupabaseClient,
  key: string
): Promise<boolean> {
  const { data } = await supabase
    .from('m_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  return (data as { value: string } | null)?.value === '1';
}

async function markNotified(
  supabase: SupabaseClient,
  key: string
) {
  await supabase
    .from('m_settings')
    .upsert({ key, value: '1' }, { onConflict: 'key' });
}

// ── LINEアラート送信（本人・管理者・人事担当者） ────────────────
async function sendAlert(
  supabase: SupabaseClient,
  targetLineUserId: string | null,
  hrPersonId: string,
  accessToken: string,
  message: string
) {
  const sentIds = new Set<string>();

  if (targetLineUserId) {
    await sendPush(targetLineUserId, message, accessToken);
    sentIds.add(targetLineUserId);
  }

  const { data: admins } = await supabase
    .from('m_users')
    .select('line_user_id')
    .eq('role', 'admin')
    .eq('status', 'active');
  for (const a of (admins ?? []) as { line_user_id: string }[]) {
    if (a.line_user_id && !sentIds.has(a.line_user_id)) {
      await sendPush(a.line_user_id, message, accessToken);
      sentIds.add(a.line_user_id);
    }
  }

  if (hrPersonId) {
    const { data: hrRaw } = await supabase
      .from('m_users')
      .select('line_user_id')
      .eq('id', hrPersonId)
      .single();
    const hr = hrRaw as { line_user_id: string } | null;
    if (hr?.line_user_id && !sentIds.has(hr.line_user_id)) {
      await sendPush(hr.line_user_id, message, accessToken);
      sentIds.add(hr.line_user_id);
    }
  }

  return sentIds.size;
}

// ── POST ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const {
      user_id,
      date,       // "YYYY-MM-DD"
      clock_in,   // "HH:MM"
      clock_out,  // "HH:MM"
      break_start,
      break_end,
      total_work_minutes,
    } = await req.json() as {
      user_id: string;
      date: string;
      clock_in?: string;
      clock_out?: string;
      break_start?: string;
      break_end?: string;
      total_work_minutes?: number;
    };

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!supabaseUrl || !serviceKey || !accessToken) {
      return NextResponse.json({ success: false, error: 'env not configured' }, { status: 500 });
    }

    const supabase = makeClient(supabaseUrl, serviceKey);

    // ── 設定取得 ───────────────────────────────────────────────
    const { data: settingsRaw } = await supabase
      .from('m_settings')
      .select('key, value')
      .in('key', [
        'attendance_standard_daily_hours',
        'hr_person_id',
        'labor_law_check_enabled',
        'labor_overtime_warn',
        'labor_overtime_alert',
        'labor_overtime_critical',
      ]);
    const settingsRows = (settingsRaw ?? []) as { key: string; value: string }[];

    const s: Record<string, string> = {};
    settingsRows.forEach((r) => { s[r.key] = r.value; });

    if (s['labor_law_check_enabled'] === '0') {
      return NextResponse.json({ success: true, skipped: true });
    }

    const standardDailyMinutes = Number(s['attendance_standard_daily_hours'] ?? 7) * 60;
    const hrPersonId = s['hr_person_id'] ?? '';
    const overtimeWarnH    = Number(s['labor_overtime_warn']    ?? 45);
    const overtimeAlertH   = Number(s['labor_overtime_alert']   ?? 80);
    const overtimeCriticalH = Number(s['labor_overtime_critical'] ?? 100);

    // ── 対象ユーザー情報 ──────────────────────────────────────
    const { data: targetUserRaw } = await supabase
      .from('m_users')
      .select('name, line_user_id')
      .eq('id', user_id)
      .single();
    const targetUser = targetUserRaw as { name: string; line_user_id: string } | null;
    const userName = targetUser?.name ?? 'スタッフ';
    const targetLine = targetUser?.line_user_id ?? null;

    const [year, month] = date.split('-').map(Number);
    const checks: CheckResult[] = [];
    const notified: string[] = [];

    // ──────────────────────────────────────────────────────────
    // ① 休憩時間不足チェック（労基法34条）
    // ──────────────────────────────────────────────────────────
    if (total_work_minutes != null && clock_out) {
      const breakMinutes =
        break_start && break_end
          ? (() => {
              const toMin = (t: string) => {
                const [h, m] = t.slice(0, 5).split(':').map(Number);
                return h * 60 + m;
              };
              return Math.max(0, toMin(break_end) - toMin(break_start));
            })()
          : 0;

      const actualWork = total_work_minutes + breakMinutes; // 実勤務＋休憩
      let required = 0;
      if (actualWork > 8 * 60) required = BREAK_8H_MIN;
      else if (actualWork > 6 * 60) required = BREAK_6H_MIN;

      if (required > 0 && breakMinutes < required) {
        const key = `labor_break_${date}_${user_id}`;
        if (!(await isAlreadyNotified(supabase, key))) {
          checks.push({
            key,
            level: 'critical',
            message: [
              `🚨【労基法違反の疑い】休憩時間不足`,
              ``,
              `対象者：${userName}（${date}）`,
              `実勤務時間：${Math.floor(actualWork / 60)}時間${actualWork % 60}分`,
              `休憩時間：${breakMinutes}分（法定最低：${required}分）`,
              ``,
              `労働基準法第34条：6時間超→45分以上、8時間超→60分以上の休憩が必要です。`,
              `至急ご確認ください。`,
            ].join('\n'),
          });
        }
      }
    }

    // ──────────────────────────────────────────────────────────
    // ② 深夜退勤チェック（労基法37条・22:00以降）
    // ──────────────────────────────────────────────────────────
    if (clock_out) {
      const coH = Number(clock_out.slice(0, 2));
      const coM = Number(clock_out.slice(3, 5));
      const coTotal = coH * 60 + coM;
      if (coTotal >= 22 * 60 || coTotal < 5 * 60) {
        const key = `labor_night_${date}_${user_id}`;
        if (!(await isAlreadyNotified(supabase, key))) {
          checks.push({
            key,
            level: 'info',
            message: [
              `🌙【深夜労働の確認】22時以降の退勤`,
              ``,
              `対象者：${userName}（${date}）`,
              `退勤時刻：${clock_out.slice(0, 5)}`,
              ``,
              `労働基準法第37条：22:00〜翌5:00の深夜労働は25%以上の割増賃金が必要です。`,
              `賃金計算をご確認ください。`,
            ].join('\n'),
          });
        }
      }
    }

    // ──────────────────────────────────────────────────────────
    // ③ 勤務間インターバルチェック（労時設定改善法・努力義務11時間）
    // ──────────────────────────────────────────────────────────
    if (clock_in) {
      // 前日の退勤を取得
      const prevDate = new Date(date);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().slice(0, 10);
      const { data: prevAttRaw } = await supabase
        .from('t_attendance')
        .select('clock_out')
        .eq('user_id', user_id)
        .eq('date', prevDateStr)
        .maybeSingle();
      const prevAtt = prevAttRaw as { clock_out: string } | null;

      if (prevAtt?.clock_out) {
        const toMinOfDay = (t: string) => {
          const [h, m] = t.slice(0, 5).split(':').map(Number);
          return h * 60 + m;
        };
        const prevOut = toMinOfDay(prevAtt.clock_out);
        const todayIn = toMinOfDay(clock_in) + 24 * 60; // 翌日なので+24h
        const interval = todayIn - prevOut;

        if (interval < INTERVAL_MIN) {
          const key = `labor_interval_${date}_${user_id}`;
          if (!(await isAlreadyNotified(supabase, key))) {
            checks.push({
              key,
              level: 'warning',
              message: [
                `⚠️【勤務間インターバル不足】`,
                ``,
                `対象者：${userName}（${prevDateStr} → ${date}）`,
                `インターバル：${Math.floor(interval / 60)}時間${interval % 60}分（推奨：11時間以上）`,
                `前日退勤：${prevAtt.clock_out.slice(0, 5)} → 当日出勤：${clock_in.slice(0, 5)}`,
                ``,
                `勤務間インターバル制度（努力義務）：退勤〜翌出勤まで11時間以上の確保が推奨されています。`,
                `従業員の健康管理にご注意ください。`,
              ].join('\n'),
            });
          }
        }
      }
    }

    // ──────────────────────────────────────────────────────────
    // ④ 連続勤務チェック（労基法35条・週1休日）
    // ──────────────────────────────────────────────────────────
    {
      const checkDate = new Date(date);
      const past7 = [];
      for (let i = 1; i <= 7; i++) {
        const d = new Date(checkDate);
        d.setDate(d.getDate() - i);
        past7.push(d.toISOString().slice(0, 10));
      }
      const { data: recentAttRaw } = await supabase
        .from('t_attendance')
        .select('date')
        .eq('user_id', user_id)
        .in('date', past7)
        .not('clock_in', 'is', null);
      const recentAtt = (recentAttRaw ?? []) as { date: string }[];

      const workedDays = new Set(recentAtt.map((r) => r.date));
      let consecutive = 1;
      for (let i = 1; i <= 7; i++) {
        const d = new Date(checkDate);
        d.setDate(d.getDate() - i);
        if (workedDays.has(d.toISOString().slice(0, 10))) consecutive++;
        else break;
      }

      if (consecutive >= CONSECUTIVE_WARN) {
        const key = `labor_consecutive_${date}_${user_id}`;
        if (!(await isAlreadyNotified(supabase, key))) {
          checks.push({
            key,
            level: consecutive >= 7 ? 'critical' : 'warning',
            message: [
              `⚠️【連続勤務${consecutive}日】`,
              ``,
              `対象者：${userName}（${date}まで）`,
              `連続勤務：${consecutive}日`,
              ``,
              `労働基準法第35条：使用者は週1日以上の法定休日を与えなければなりません。`,
              `${consecutive >= 7 ? '🚨 法定休日が確保されていない可能性があります。至急確認してください。' : '早めに休日を確保することをお勧めします。'}`,
            ].join('\n'),
          });
        }
      }
    }

    // ──────────────────────────────────────────────────────────
    // ⑤⑥⑦ 月次残業チェック（36協定上限）
    // ──────────────────────────────────────────────────────────
    {
      const lastDay = new Date(year, month, 0).getDate();
      const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const toDate   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const { data: monthRecordsRaw } = await supabase
        .from('t_attendance')
        .select('total_work_minutes')
        .eq('user_id', user_id)
        .gte('date', fromDate)
        .lte('date', toDate)
        .not('total_work_minutes', 'is', null);
      const monthRecords = (monthRecordsRaw ?? []) as { total_work_minutes: number }[];

      const totalOvertimeMin = monthRecords.reduce((sum, r) => {
        return sum + Math.max(0, (r.total_work_minutes ?? 0) - standardDailyMinutes);
      }, 0);
      const totalOvertimeH = totalOvertimeMin / 60;
      const monthLabel = `${year}年${month}月`;

      const overtimeStr = `${Math.floor(totalOvertimeH)}時間${Math.round((totalOvertimeH % 1) * 60)}分`;

      // ⑦ 月100時間超（絶対上限・緊急）
      if (totalOvertimeH >= overtimeCriticalH) {
        const key = `labor_ot_critical_${year}_${String(month).padStart(2, '0')}_${user_id}`;
        if (!(await isAlreadyNotified(supabase, key))) {
          checks.push({
            key,
            level: 'critical',
            message: [
              `🚨【緊急】月間残業が上限を超えました`,
              ``,
              `対象者：${userName}（${monthLabel}）`,
              `今月の残業時間：${overtimeStr}`,
              ``,
              `36協定特別条項の上限：月100時間未満（休日労働含む）`,
              `これは労働基準法違反となる可能性があります。`,
              `直ちに業務の見直しと当該労働者の健康管理を行ってください。`,
              `（罰則：6ヶ月以下の懲役または30万円以下の罰金）`,
            ].join('\n'),
          });
        }
      }
      // ⑥ 月80時間超（過労死ライン・警告）
      else if (totalOvertimeH >= overtimeAlertH) {
        const key = `labor_ot_alert_${year}_${String(month).padStart(2, '0')}_${user_id}`;
        if (!(await isAlreadyNotified(supabase, key))) {
          checks.push({
            key,
            level: 'warning',
            message: [
              `🔴【過労死ライン警告】月間残業が80時間を超えました`,
              ``,
              `対象者：${userName}（${monthLabel}）`,
              `今月の残業時間：${overtimeStr}`,
              ``,
              `36協定：複数月平均80時間は過労死認定の基準（過労死ライン）です。`,
              `産業医への面接指導（月80時間超は義務）を実施してください。`,
              `業務量の見直しが必要です。`,
            ].join('\n'),
          });
        }
      }
      // ⑤ 月45時間超（原則上限・注意）
      else if (totalOvertimeH >= overtimeWarnH) {
        const key = `labor_ot_warn_${year}_${String(month).padStart(2, '0')}_${user_id}`;
        if (!(await isAlreadyNotified(supabase, key))) {
          checks.push({
            key,
            level: 'info',
            message: [
              `🟡【残業時間注意】月間残業が45時間を超えました`,
              ``,
              `対象者：${userName}（${monthLabel}）`,
              `今月の残業時間：${overtimeStr}`,
              ``,
              `36協定の原則上限：月45時間・年360時間`,
              `月45時間超は年6回が限度です。引き続き残業時間の管理をお願いします。`,
            ].join('\n'),
          });
        }
      }
    }

    // ── 通知送信 ──────────────────────────────────────────────
    let totalSent = 0;
    for (const check of checks) {
      const sent = await sendAlert(supabase, targetLine, hrPersonId, accessToken, check.message);
      await markNotified(supabase, check.key);
      totalSent += sent;
      notified.push(check.key);
    }

    return NextResponse.json({
      success: true,
      checks: checks.length,
      notified,
      totalSent,
    });

  } catch (e) {
    console.error('[labor-law-check] error:', e);
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
