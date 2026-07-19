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
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getUserToken() {
  try {
    let token = localStorage.getItem('exhibition_user_token');
    if (!token) {
      token = generateUUID();
      localStorage.setItem('exhibition_user_token', token);
    }
    return token;
  } catch (err) {
    console.error('[messaging] localStorageへのアクセスに失敗しました:', err);
    return generateUUID();
  }
}
// ------------------------------------------------------
// 「飛行機」「シャボン玉」それぞれ1回だけ投稿できたかの判定
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
const NG_WORDS = [
  '死ね', 'しね', 'ﾀﾋね', 'バカ', 'ばか', '馬鹿', 'カス', 'かす',
  'ブス', 'ぶす', 'キモい', 'きもい', 'クズ', 'くず', 'うざい', 'ウザい',
  'fuck', 'shit', 'bitch', '殺す','ころす', '消えろ', '失せろ',
  'アホ','あほ', 'ゴミ','ごみ', 'デブ','でぶ', 'ハゲ','はげ',
  'チビ','ちび', 'キモ','きも', '最低', '無能', '障害者', '知恵遅れ',
  '池沼', 'fucking', 'asshole', 'idiot', 'moron', 'kill yourself', 'kys',
];

function containsNGWord(text) {
  const normalized = text.toLowerCase();
  return NG_WORDS.some(word => normalized.includes(word.toLowerCase()));
}

export async function submitMessage({ photoId, type, name, message }) {
  if (containsNGWord(message) || (name && containsNGWord(name))) {
    throw new Error('NG_WORD_DETECTED');
  }

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

  // ★修正箇所：ここに閉じタグと処理を追加
  markSubmitted(type);
}

// ------------------------------------------------------
// 飛行機メッセージ：全件取得
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
// シャボン玉メッセージ：直近30件のみ取得
// ------------------------------------------------------
export async function fetchBubbleMessages(limit = 20) {
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