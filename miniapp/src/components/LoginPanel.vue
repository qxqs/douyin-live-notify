<template>
  <div class="login-panel">
    <div class="login-icon" aria-hidden="true">📡</div>
    <div class="login-title">{{ panelTitle }}</div>
    <div class="login-desc">{{ panelDescription }}</div>

    <template v-if="environment === 'desktop'">
      <button
        v-if="qrState === 'expired' || qrState === 'error'"
        type="button"
        class="qr-refresh"
        @click="initQrLogin"
      >
        <van-icon name="replay" />
        重新获取二维码
      </button>
      <div v-else class="qr-frame">
        <van-loading v-if="qrState === 'loading'" size="28px" />
        <img
          v-else-if="qrCode"
          :src="qrCode"
          class="qr-image"
          alt="微信扫码登录二维码"
        />
      </div>
      <div v-if="qrState === 'pending'" class="qr-status">
        二维码有效期 {{ countdownText }}
      </div>
      <div v-else-if="qrState === 'expired'" class="qr-status expired">
        二维码已过期
      </div>
    </template>

    <template v-else-if="environment === 'wechat'">
      <div class="follow-block">
        <van-image
          :src="wechatQrcode"
          width="160"
          height="160"
          fit="contain"
          class="follow-qr"
        />
        <div class="follow-tip">长按识别二维码关注测试号</div>
      </div>
      <van-button
        type="success"
        size="large"
        round
        block
        icon="wechat"
        class="login-button"
        @click="handleWechatLogin"
      >
        微信一键登录
      </van-button>
    </template>

    <template v-else>
      <div class="mobile-guide">
        <van-icon name="wechat" size="40" color="#07c160" />
        <div class="guide-title">请在微信中打开</div>
        <div class="guide-desc">
          微信登录只能在微信客户端内完成，请分享或复制当前链接后前往微信打开。
        </div>
        <van-button
          type="success"
          size="large"
          round
          block
          icon="wechat"
          class="login-button"
          @click="handleMobileOpen"
        >
          {{ canShare ? '分享到微信' : '复制页面链接' }}
        </van-button>
        <button
          v-if="canShare"
          type="button"
          class="copy-link"
          @click="copyPageLink"
        >
          复制页面链接
        </button>
      </div>
    </template>

    <button
      v-if="isDev"
      type="button"
      class="dev-login"
      @click="handleDevLogin"
    >
      本地开发登录
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { createQrLogin, getQrLoginStatus } from '@/api';
import {
  devLogin,
  getLoginEnvironment,
  setToken,
  type LoginEnvironment,
} from '@/utils';
import { showToast } from 'vant';

const emit = defineEmits<{
  success: [];
}>();

const environment = ref<LoginEnvironment>(getLoginEnvironment());
const isDev = import.meta.env.DEV;
const canShare = typeof navigator.share === 'function';
const wechatQrcode =
  import.meta.env.VITE_WECHAT_QRCODE || '/images/qrcode.png';
const qrCode = ref('');
const qrState = ref<'idle' | 'loading' | 'pending' | 'expired' | 'error'>(
  'idle'
);
const remainingSeconds = ref(0);

let pollTimer: ReturnType<typeof setTimeout> | undefined;
let countdownTimer: ReturnType<typeof setInterval> | undefined;
let pollGeneration = 0;

const panelTitle = computed(() => {
  if (environment.value === 'desktop') return '微信扫码登录';
  if (environment.value === 'mobile') return '微信登录';
  return '微信一键登录';
});

const panelDescription = computed(() => {
  if (environment.value === 'desktop') {
    return '使用微信扫码，登录状态会自动同步到电脑';
  }
  if (environment.value === 'mobile') {
    return '当前为移动端浏览器，将前往微信完成授权';
  }
  return '已检测到微信环境，可直接完成登录';
});

const countdownText = computed(() => {
  const minutes = Math.floor(remainingSeconds.value / 60);
  const seconds = remainingSeconds.value % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
});

onMounted(() => {
  if (environment.value === 'desktop') {
    initQrLogin();
  }
});

onBeforeUnmount(() => {
  clearQrTimers();
});

function clearQrTimers() {
  pollGeneration += 1;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = undefined;
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = undefined;
  }
}

async function initQrLogin() {
  clearQrTimers();
  qrCode.value = '';
  remainingSeconds.value = 0;
  qrState.value = 'loading';

  const generation = pollGeneration;
  const resp = await createQrLogin();
  if (generation !== pollGeneration) return;

  if (resp.code !== 0 || !resp.data) {
    qrState.value = 'error';
    return;
  }

  qrCode.value = resp.data.qrCode;
  remainingSeconds.value = resp.data.expiresIn;
  qrState.value = 'pending';

  countdownTimer = setInterval(() => {
    if (remainingSeconds.value > 0) {
      remainingSeconds.value -= 1;
    }
    if (remainingSeconds.value <= 0) {
      qrState.value = 'expired';
      clearQrTimers();
    }
  }, 1000);

  pollQrStatus(resp.data.nonce, generation);
}

async function pollQrStatus(nonce: string, generation: number) {
  if (generation !== pollGeneration) return;

  const resp = await getQrLoginStatus(nonce);
  if (generation !== pollGeneration) return;

  if (resp.code === 0 && resp.data?.status === 'ready' && resp.data.token) {
    setToken(resp.data.token);
    clearQrTimers();
    emit('success');
    return;
  }

  if (
    resp.code !== 0 ||
    !resp.data ||
    resp.data.status === 'expired'
  ) {
    qrState.value = 'expired';
    clearQrTimers();
    return;
  }

  pollTimer = setTimeout(() => {
    pollQrStatus(nonce, generation);
  }, 2000);
}

async function handleWechatLogin() {
  if (await devLogin()) {
    emit('success');
    return;
  }

  const redirect = encodeURIComponent(
    window.location.pathname + window.location.hash
  );
  window.location.href = `/api/wechat/oauth?redirect=${redirect}`;
}

async function handleMobileOpen() {
  if (canShare) {
    try {
      await navigator.share({
        title: '抖音直播提醒',
        text: '请在微信中打开此页面完成登录',
        url: window.location.href,
      });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
    }
  }

  await copyPageLink();
}

async function copyPageLink() {
  const url = window.location.href;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const input = document.createElement('textarea');
      input.value = url;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    showToast('链接已复制，请前往微信打开');
  } catch (err) {
    console.error('[Login] 复制链接失败:', err);
    showToast('复制失败，请长按地址栏复制链接');
  }
}

async function handleDevLogin() {
  if (await devLogin()) {
    emit('success');
  }
}
</script>

<style scoped>
.login-panel {
  width: 100%;
  text-align: center;
}

.login-icon {
  margin-bottom: 12px;
  font-size: 52px;
  line-height: 1;
}

.login-title {
  color: #1f2329;
  font-size: 20px;
  font-weight: 600;
}

.login-desc {
  margin-top: 6px;
  color: #8a8f99;
  font-size: 13px;
  line-height: 1.6;
}

.qr-frame {
  width: 236px;
  height: 236px;
  display: grid;
  place-items: center;
  margin: 24px auto 12px;
  overflow: hidden;
  border: 1px solid #e7e8eb;
  border-radius: 8px;
  background: #fff;
}

.qr-image {
  display: block;
  width: 100%;
  height: 100%;
}

.qr-refresh {
  width: 236px;
  height: 236px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 24px auto 12px;
  border: 1px dashed #d8dadd;
  border-radius: 8px;
  background: #fff;
  color: #57606a;
  font-size: 14px;
  cursor: pointer;
}

.qr-status {
  color: #8a8f99;
  font-size: 12px;
}

.qr-status.expired {
  color: #ee4d38;
}

.follow-block {
  margin: 20px auto 18px;
}

.follow-qr {
  overflow: hidden;
  border: 1px solid #eceef1;
  border-radius: 8px;
}

.follow-tip {
  margin-top: 8px;
  color: #8a8f99;
  font-size: 12px;
}

.login-button {
  margin-top: 18px;
}

.mobile-guide {
  padding-top: 24px;
}

.guide-title {
  margin-top: 12px;
  color: #1f2329;
  font-size: 18px;
  font-weight: 600;
}

.guide-desc {
  margin: 8px 0 20px;
  color: #8a8f99;
  font-size: 13px;
  line-height: 1.7;
}

.copy-link {
  margin-top: 16px;
  border: 0;
  background: transparent;
  color: #07c160;
  font-size: 13px;
  cursor: pointer;
}

.dev-login {
  margin-top: 16px;
  border: 0;
  background: transparent;
  color: #8a8f99;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}
</style>
