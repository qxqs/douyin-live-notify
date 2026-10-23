// ============================================================
// Token 管理
// ============================================================

const TOKEN_KEY = 'live_notify_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  // 只保留 ASCII 字符，防止 URL 传参混入非 ASCII 字符导致 Fetch API 报错
  const safe = token.replace(/[^\x00-\x7F]/g, '');
  localStorage.setItem(TOKEN_KEY, safe);
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Local development login; disabled in production builds by Vite.
export async function devLogin(): Promise<boolean> {
  if (!import.meta.env.DEV) return false;

  const openidKey = 'live_notify_dev_openid';
  let openid = localStorage.getItem(openidKey);
  if (!openid) {
    openid = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(openidKey, openid);
  }

  const query = new URLSearchParams({
    openid,
    nickname: '本地开发用户',
  });

  try {
    const resp = await fetch(`/api/wechat/dev-login?${query.toString()}`);
    const result = await resp.json();
    if (result.code === 0 && result.data?.token) {
      setToken(result.data.token);
      return true;
    }
  } catch (err) {
    console.error('[DevLogin] 本地登录失败:', err);
  }

  return false;
}

// ============================================================
// 直播状态
// ============================================================

export function getLiveStatusInfo(status: number) {
  switch (status) {
    case 1:
      return { text: '直播中', color: '#F44336', icon: '🔴' };
    case 2:
      return { text: '已下播', color: '#999999', icon: '⚫' };
    default:
      return { text: '未检测', color: '#C0C4CC', icon: '⭕' };
  }
}

// ============================================================
// 时间格式化
// ============================================================

export function formatTime(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hours}:${minutes}`;
}

// ============================================================
// 环境判断
// ============================================================

export function isWechatBrowser(
  userAgent = navigator.userAgent
): boolean {
  return /micromessenger/i.test(userAgent);
}

export type LoginEnvironment = 'wechat' | 'mobile' | 'desktop';

export function getLoginEnvironment(
  userAgent = navigator.userAgent,
  maxTouchPoints = navigator.maxTouchPoints
): LoginEnvironment {
  if (isWechatBrowser(userAgent)) return 'wechat';

  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
      userAgent
    ) ||
    (maxTouchPoints > 1 && /Macintosh/i.test(userAgent));

  return isMobile ? 'mobile' : 'desktop';
}
