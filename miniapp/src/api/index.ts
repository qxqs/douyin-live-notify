import { getToken, removeToken } from '@/utils';

// ============================================================
// API 封装
// ============================================================

interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

async function request<T = any>(
  url: string,
  options: {
    method?: string;
    data?: any;
    auth?: boolean;
  } = {}
): Promise<ApiResponse<T>> {
  const { method = 'GET', data, auth = true } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (auth) {
    const token = getToken();
    if (token) {
      // 过滤非 ASCII 字符，避免浏览器 Fetch API 报错
      // (JWT 本身是 base64url 编码，但 URL 传参时可能混入非 ASCII 字符)
      const safe = token.replace(/[^\x00-\x7F]/g, '');
      if (safe) {
        headers['Authorization'] = `Bearer ${safe}`;
      }
    }
  }

  try {
    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (data && method !== 'GET') {
      fetchOptions.body = JSON.stringify(data);
    }

    const resp = await fetch(url, fetchOptions);
    const result: ApiResponse<T> = await resp.json();

    // Token 过期后回到当前页，由登录面板按设备类型选择登录方式
    if (result.code === -1 && result.message?.includes('登录')) {
      removeToken();
      window.location.reload();
    }

    return result;
  } catch (err: any) {
    console.error('[API] 请求失败:', url, err);
    return {
      code: -1,
      message: err.message || '网络请求失败',
    };
  }
}

// ============================================================
// 接口方法
// ============================================================

export function getUserInfo() {
  return request<{
    openid: string;
    nickname: string;
    avatarUrl: string;
    createdAt: string;
    isAdmin: boolean;
  }>('/api/user/info');
}

export function searchBlogger(input: string) {
  return request<{
    id: number;
    roomId: string;
    nickname: string;
    avatarUrl: string;
    liveStatus: number;
    liveTitle: string;
    isSubscribed: boolean;
  }>('/api/bloggers/search', { method: 'POST', data: { input } });
}

export function getBloggerStatus(bloggerId: number) {
  return request<{
    isLive: boolean;
    liveTitle: string;
    nickname: string;
  }>(`/api/bloggers/${bloggerId}/status`);
}

export function subscribe(bloggerId: number, displayName?: string) {
  return request<{ subscribed: boolean }>('/api/subscriptions', {
    method: 'POST',
    data: { bloggerId, displayName },
  });
}

export function unsubscribe(bloggerId: number) {
  return request(`/api/subscriptions/${bloggerId}`, { method: 'DELETE' });
}

export function getSubscriptions() {
  return request<
    Array<{
      id: number;
      roomId: string;
      nickname: string;
      avatarUrl: string;
      liveStatus: number;
      liveTitle: string;
      lastCheckedAt: string;
      subscribedAt: string;
    }>
  >('/api/subscriptions');
}

export interface QrLoginSession {
  nonce: string;
  qrCode: string;
  expiresIn: number;
}

export interface QrLoginStatus {
  status: 'pending' | 'ready' | 'expired';
  token?: string;
}

export function createQrLogin() {
  return request<QrLoginSession>('/api/wechat/qr-login', { auth: false });
}

export function getQrLoginStatus(nonce: string) {
  return request<QrLoginStatus>(
    `/api/wechat/qr-status?nonce=${encodeURIComponent(nonce)}`,
    { auth: false }
  );
}
