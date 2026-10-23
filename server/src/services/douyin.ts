import axios from 'axios';

// ============================================================
// 抖音 Cookie 管理 & API 调用
// ============================================================

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// cookie 缓存
let cookieJar = '';
let cookieExpiry = 0;

/**
 * 确保有有效的 cookie（访问 live.douyin.com 获取 ttwid）
 */
async function ensureCookies(): Promise<string> {
  if (cookieJar && Date.now() < cookieExpiry) {
    return cookieJar;
  }

  try {
    // 从 live.douyin.com 获取 cookie（比 www.douyin.com 的更完整）
    const resp = await axios.get('https://live.douyin.com/', {
      timeout: 10000,
      headers: { 'User-Agent': UA },
      maxRedirects: 5,
    });

    // 收集所有 cookie
    const setCookie = resp.headers['set-cookie'] || [];
    const cookieList: string[] = [];
    for (const c of Array.isArray(setCookie) ? setCookie : [setCookie]) {
      cookieList.push(String(c).split(';')[0]);
    }

    cookieJar = cookieList.join('; ');
    cookieExpiry = Date.now() + 30 * 60 * 1000;

    console.log(`[抖音] Cookie 已刷新 (${cookieList.length} 条)`);
    return cookieJar;
  } catch (err: any) {
    console.error('[抖音] 获取 cookie 失败:', err.message);
    return cookieJar;
  }
}

async function apiGet(url: string, referer: string): Promise<any> {
  const cookie = await ensureCookies();
  const resp = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent': UA,
      Referer: referer,
      Cookie: cookie,
    },
  });
  return resp.data;
}

// ============================================================
// URL 解析
// ============================================================

const PATTERNS = {
  liveRoom: /live\.douyin\.com\/(\d+)/,
  userProfile: /(?:douyin|iesdouyin)\.com\/user\/([A-Za-z0-9_-]+)/,
  shareUser: /(?:douyin|iesdouyin)\.com\/share\/user\/([A-Za-z0-9_-]+)/,
  secUidParam: /[?&]sec_uid=([A-Za-z0-9_-]+)/,
  shortLink: /v\.douyin\.com\/([A-Za-z0-9_-]+)/,
  pureDigits: /^(\d{6,})$/,
};

export interface ParsedInput {
  type: 'room_id' | 'sec_uid' | 'short_link' | 'unknown';
  value: string;
}

export interface BloggerInfo {
  nickname: string;
  avatarUrl: string;
  secUid: string;
  currentRoomId: string;
}

export interface LiveCheckResult {
  isLive: boolean;
  title: string;
  nickname: string;
  roomId: string;
}

export function parseDouyinInput(input: string): ParsedInput {
  const trimmed = input.trim();

  const userMatch = trimmed.match(PATTERNS.userProfile);
  if (userMatch) return { type: 'sec_uid', value: userMatch[1] };

  const shareMatch = trimmed.match(PATTERNS.shareUser);
  if (shareMatch) return { type: 'sec_uid', value: shareMatch[1] };

  const paramMatch = trimmed.match(PATTERNS.secUidParam);
  if (paramMatch) return { type: 'sec_uid', value: paramMatch[1] };

  const liveMatch = trimmed.match(PATTERNS.liveRoom);
  if (liveMatch) return { type: 'room_id', value: liveMatch[1] };

  const shortMatch = trimmed.match(PATTERNS.shortLink);
  if (shortMatch) return { type: 'short_link', value: shortMatch[1] };

  const digitMatch = trimmed.match(PATTERNS.pureDigits);
  if (digitMatch) return { type: 'room_id', value: digitMatch[1] };

  return { type: 'unknown', value: trimmed };
}

// ============================================================
// 短链接解析
// ============================================================

export async function resolveShortLink(shortId: string): Promise<ParsedInput> {
  try {
    const resp = await axios.get(`https://v.douyin.com/${shortId}/`, {
      timeout: 15000,
      headers: { 'User-Agent': UA },
      maxRedirects: 10,
      validateStatus: (s) => s < 400,
    });

    const finalUrl = resp.request?.res?.responseUrl || '';
    if (finalUrl) {
      console.log(`[抖音] 短链接 ${shortId} → ${finalUrl.slice(0, 100)}...`);
      const parsed = parseDouyinInput(finalUrl);
      if (parsed.type !== 'unknown') return parsed;
    }

    // 兜底：从 URL 参数中再试
    return parseDouyinInput(finalUrl);
  } catch (err: any) {
    console.error(`[抖音] 短链接解析失败:`, err.message);
    return { type: 'unknown', value: shortId };
  }
}

// ============================================================
// 用户信息 API（aweme）
// ============================================================

export async function getUserProfile(secUid: string): Promise<{
  nickname: string;
  avatarUrl: string;
  secUid: string;
  isLive: boolean;
  roomId: string;
  liveTitle: string;
} | null> {
  try {
    const data = await apiGet(
      `https://www.douyin.com/aweme/v1/web/user/profile/other/?sec_user_id=${secUid}&source=channel_pc_web`,
      'https://www.douyin.com/'
    );

    const user = data?.user;
    if (!user) {
      console.log(`[抖音] API 未返回用户数据`);
      return null;
    }

    const nickname = user.nickname || '';
    const avatarUrl =
      user.avatar_medium?.url_list?.[0] ||
      user.avatar_thumb?.url_list?.[0] ||
      '';
    // live_status 在 user 对象顶层，不是 user.live_info 里
    const isLive = user.live_status === 1 || !!user.room_id;
    const roomId = String(user.room_id || '');
    const liveTitle = user.live_title || user.room_data?.title || '';

    console.log(
      `[抖音] ${nickname} (${user.unique_id || '无抖音号'}): ` +
      `${isLive ? '🔴 直播中 room=' + roomId : '⚫ 未开播'}` +
      `${user.anchor_info?.scheduled_time_text ? ' 预告: ' + user.anchor_info.scheduled_time_text : ''}`
    );

    return { nickname, avatarUrl, secUid, isLive, roomId, liveTitle };
  } catch (err: any) {
    console.error(`[抖音] API 获取用户失败:`, err.message);
    return null;
  }
}

// ============================================================
// 直播状态检测
// ============================================================

export async function checkLiveRoom(roomId: string): Promise<LiveCheckResult> {
  try {
    // webcast API —— 用于获取直播间信息
    const data = await apiGet(
      `https://live.douyin.com/webcast/room/web/enter/?aid=6383&app_name=douyin_web&live_id=1&device_platform=web&language=zh-CN&web_rid=${roomId}`,
      'https://live.douyin.com/'
    );

    const room = data?.data?.room || data?.room || {};
    const isLive = room.status === 2;
    const title = room.title || '';
    const nickname = room.owner?.nickname || data?.data?.anchor?.nickname || '';

    console.log(
      `[抖音] 房间 ${roomId}: ${isLive ? '🔴 直播中' : '⚫ 已下播'} ${title}`
    );

    return { isLive, title, nickname, roomId };
  } catch (err: any) {
    console.error(`[抖音] 房间检测失败:`, err.message);
    return { isLive: false, title: '', nickname: '', roomId };
  }
}

/**
 * 统一检测入口
 */
export async function checkLiveStatus(blogger: {
  roomId?: string;
  secUid?: string;
}): Promise<LiveCheckResult> {
  // 优先级 1: 有 room_id → 直接查直播间
  if (blogger.roomId) {
    const result = await checkLiveRoom(blogger.roomId);
    if (result.isLive) return result;
    // 未开播也不一定准，继续用 sec_uid 验证
  }

  // 优先级 2: 有 sec_uid → 通过 API 获取最新状态（含 room_id）
  if (blogger.secUid) {
    const profile = await getUserProfile(blogger.secUid);
    if (!profile) {
      return { isLive: false, title: '', nickname: '', roomId: '' };
    }

    if (profile.isLive && profile.roomId) {
      // 用户正在直播，进一步从直播间获取标题等信息
      const live = await checkLiveRoom(profile.roomId);
      return {
        isLive: true,
        title: live.title || profile.liveTitle,
        nickname: profile.nickname || live.nickname,
        roomId: profile.roomId,
      };
    }

    return {
      isLive: false,
      title: '',
      nickname: profile.nickname,
      roomId: '',
    };
  }

  return { isLive: false, title: '', nickname: '', roomId: '' };
}
