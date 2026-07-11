import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabaseConfig.js';

// ======================================================================
// core/messaging.js
// 飛行機(letter)・シャボン玉(bubble)のメッセージ投稿・取得を扱う。
// ======================================================================

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ------------------------------------------------------
// 端末を識別するためのトークン(匿名)
// ------------------------------------------------------
function getUserToken() {
  let token = localStorage.getItem('exhibition_user_token');
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem('exhibition_user_token', token);
  }
  return token;
}

// ------------------------------------------------------
// 「飛行機」「シャボン玉」それぞれ1回だけ投稿できたかの判定
// (localStorageベースの緩やかな制限。展示の性質上これで十分)
// ------------------------------------------------------
export function hasSubmitted(type) {
  return localStorage.getItem(`exhibition_submitted_${type}`) === '1';
}

function markSubmitted(type) {
  localStorage.setItem(`exhibition_submitted_${type}`, '1');
}

// ------------------------------------------------------
// メッセージ投稿
// ------------------------------------------------------
export async function submitMessage({ photoId, type, name, message }) {
  const userToken = getUserToken();

  const { error } = await supabase.from('messages').insert({
    photo_id: String(photoId),
    type,
    name: name && name.trim() ? name.trim() : null,
    message: message.trim(),
    user_token: userToken,
  });

  if (error) {
    console.error('[messaging] 投稿に失敗しました:', error);
    throw error;
  }

  markSubmitted(type);
}

// ------------------------------------------------------
// 飛行機メッセージ：全件取得(残り続ける)
// ------------------------------------------------------
export async function fetchLetterMessages() {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('type', 'letter')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[messaging] 飛行機メッセージの取得に失敗しました:', error);
    return [];
  }
  return data;
}

// ------------------------------------------------------
// シャボン玉メッセージ：直近30件のみ取得(古いものは表示から外れる)
// ------------------------------------------------------
export async function fetchBubbleMessages(limit = 30) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('type', 'bubble')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[messaging] シャボン玉メッセージの取得に失敗しました:', error);
    return [];
  }
  return data;
}