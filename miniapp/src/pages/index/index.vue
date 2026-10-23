<template>
  <div class="page">
    <!-- 头部 -->
    <div class="header">
      <div class="header-title">📡 直播提醒</div>
      <div class="header-sub">你关注的主播动态</div>
    </div>

    <!-- 未登录 -->
    <div v-if="!isLoggedIn" class="login-box">
      <LoginPanel @success="handleLoginSuccess" />
    </div>

    <!-- 已登录 -->
    <template v-else>
      <!-- 加载中 -->
      <div v-if="loading" class="loading-box">
        <van-loading size="32px" />
        <span>加载中...</span>
      </div>

      <!-- 无订阅 -->
      <van-empty
        v-else-if="subscriptions.length === 0"
        image="search"
        description="还没有关注任何博主"
      >
        <van-button type="primary" round @click="$router.push('/search')">
          去添加博主
        </van-button>
      </van-empty>

      <!-- 订阅列表 -->
      <div v-else class="list">
        <div
          v-for="item in subscriptions"
          :key="item.id"
          class="live-card"
          :class="{ 'is-live': item.liveStatus === 1 }"
        >
          <!-- 状态标签 -->
          <div class="card-status">
            <van-tag
              :type="item.liveStatus === 1 ? 'danger' : item.liveStatus === 2 ? 'default' : 'warning'"
              size="medium"
            >
              {{ statusIcon(item.liveStatus) }} {{ statusText(item.liveStatus) }}
            </van-tag>
          </div>

          <!-- 主播信息 -->
          <div class="card-body">
            <div class="avatar">
              <van-image
                v-if="item.avatarUrl"
                :src="item.avatarUrl"
                width="48"
                height="48"
                round
                fit="cover"
              />
              <div v-else class="avatar-placeholder">📺</div>
            </div>
            <div class="info">
              <div class="name">{{ item.nickname || '直播间 ' + item.roomId }}</div>
              <div class="room-id">ID: {{ item.roomId }}</div>
              <div v-if="item.liveTitle" class="title">{{ item.liveTitle }}</div>
              <div class="time">最后检测: {{ formatTime(item.lastCheckedAt) || '未检测' }}</div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="card-actions">
            <van-button
              size="small"
              type="default"
              plain
              round
              @click.stop="handleUnsubscribe(item)"
            >
              取消订阅
            </van-button>
          </div>

          <!-- 直播特效边框 -->
          <div v-if="item.liveStatus === 1" class="live-border"></div>
        </div>

        <div class="refresh-tip">每 {{ pollMinutes }} 分钟自动刷新</div>
      </div>
    </template>

    <!-- TabBar -->
    <van-tabbar v-model="activeTab" :fixed="true" :border="true" active-color="#FF5722" @change="onTabChange">
      <van-tabbar-item icon="home-o" to="/index">首页</van-tabbar-item>
      <van-tabbar-item icon="add-o" to="/search">添加</van-tabbar-item>
      <van-tabbar-item icon="user-o" to="/my">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getSubscriptions, unsubscribe } from '@/api';
import { getToken, getLiveStatusInfo, formatTime } from '@/utils';
import LoginPanel from '@/components/LoginPanel.vue';
import { showToast, showConfirmDialog } from 'vant';

const isLoggedIn = ref(false);
const loading = ref(true);
const subscriptions = ref<any[]>([]);
const activeTab = ref(0);
const pollMinutes = 2;

const statusText = (s: number) => getLiveStatusInfo(s).text;
const statusIcon = (s: number) => getLiveStatusInfo(s).icon;

onMounted(async () => {
  const token = getToken();
  if (token) {
    isLoggedIn.value = true;
    await loadSubscriptions();
  } else {
    isLoggedIn.value = false;
    loading.value = false;
  }
});

async function loadSubscriptions() {
  loading.value = true;
  const resp = await getSubscriptions();
  if (resp.code === 0) {
    subscriptions.value = resp.data || [];
  }
  loading.value = false;
}

function handleLoginSuccess() {
  window.location.reload();
}

async function handleUnsubscribe(item: any) {
  try {
    await showConfirmDialog({
      title: '取消订阅',
      message: `确定取消订阅「${item.nickname || '此博主'}」吗？`,
    });
  } catch {
    return; // 用户取消
  }
  const resp = await unsubscribe(item.id);
  if (resp.code === 0) {
    showToast('已取消订阅');
    subscriptions.value = subscriptions.value.filter((s) => s.id !== item.id);
  } else {
    showToast(resp.message || '操作失败');
  }
}

function onTabChange(index: number) {
  activeTab.value = index;
}
</script>

<style lang="scss" scoped>
@use '@/styles/vars.scss' as *;

.page {
  min-height: 100vh;
  padding-bottom: 100px;
  background: #f5f5f5;
}

// ---- 头部 ----
.header {
  background: linear-gradient(135deg, $primary, $primary-dark);
  padding: 32px 20px 28px;
  color: #fff;
}
.header-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 4px;
}
.header-sub {
  font-size: 14px;
  opacity: 0.85;
}

// ---- 登录 ----
.login-box {
  padding: 40px 24px;
}

// ---- 加载 ----
.loading-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 0;
  color: #999;
  gap: 12px;
}

// ---- 列表 ----
.list {
  padding: 12px 16px;
}

.live-card {
  position: relative;
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.06);
  overflow: hidden;
  cursor: pointer;

  &.is-live {
    box-shadow: 0 2px 16px rgba(255, 87, 34, 0.15);
  }
}

.live-border {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  border: 2px solid $primary;
  border-radius: 12px;
  pointer-events: none;
  animation: borderPulse 2s ease-in-out infinite;
}
@keyframes borderPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.card-status {
  margin-bottom: 12px;
}

.card-body {
  display: flex;
  gap: 12px;
}

.avatar {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
}
.avatar-placeholder {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.info {
  flex: 1;
  min-width: 0;
}
.name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 2px;
}
.room-id {
  font-size: 12px;
  color: #c0c4cc;
  margin-bottom: 4px;
}
.title {
  font-size: 14px;
  color: #666;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.time {
  font-size: 12px;
  color: #c0c4cc;
}

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  justify-content: flex-end;
}

.refresh-tip {
  text-align: center;
  padding: 16px;
  color: #c0c4cc;
  font-size: 12px;
}
</style>
