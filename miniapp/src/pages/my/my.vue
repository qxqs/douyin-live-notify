<template>
  <div class="page">
    <!-- 用户信息 -->
    <div class="user-header">
      <div class="user-avatar">
        <van-image
          v-if="userInfo.avatarUrl"
          :src="userInfo.avatarUrl"
          width="56"
          height="56"
          round
          fit="cover"
        />
        <div v-else class="avatar-placeholder">👤</div>
      </div>
      <div class="user-info">
        <div class="user-name">{{ isLoggedIn ? (userInfo.nickname || '微信用户') : '未登录' }}</div>
        <div class="user-id">{{ isLoggedIn ? '已绑定微信' : '登录后才能接收开播提醒' }}</div>
      </div>
    </div>

    <!-- 未登录 -->
    <div v-if="!isLoggedIn" class="login-section">
      <LoginPanel @success="handleLoginSuccess" />
    </div>

    <!-- 已登录 -->
    <template v-else>
      <!-- 统计 -->
      <van-grid :column-num="3" :border="false" :gutter="12" style="margin: 16px">
        <van-grid-item>
          <van-icon name="friends-o" size="24" color="#FF5722" />
          <div class="stat-num">{{ subscriptionCount }}</div>
          <div class="stat-label">订阅博主</div>
        </van-grid-item>
        <van-grid-item>
          <van-icon name="play-circle-o" size="24" color="#F44336" />
          <div class="stat-num">{{ liveCount }}</div>
          <div class="stat-label">正在直播</div>
        </van-grid-item>
        <van-grid-item>
          <van-icon name="bell" size="24" color="#07C160" />
          <div class="stat-num">{{ todayNotify }}</div>
          <div class="stat-label">今日通知</div>
        </van-grid-item>
      </van-grid>

      <!-- 操作菜单 -->
      <van-cell-group inset>
        <van-cell title="我的订阅" icon="records-o" is-link to="/index" />
        <van-cell title="添加博主" icon="add-o" is-link to="/search" />
        <van-cell title="刷新状态" icon="replay" is-link @click="handleRefresh" />
        <van-cell v-if="isAdmin" title="管理用户" icon="manager-o" is-link to="/admin" />
      </van-cell-group>

      <!-- 使用说明 -->
      <van-cell-group inset title="📖 使用说明" style="margin-top: 16px">
        <van-cell title="1. 在「添加」页面粘贴抖音直播间链接" label="" />
        <van-cell title="2. 确认订阅后，系统自动定时检测" />
        <van-cell title="3. 博主开播时收到微信模板消息提醒" />
        <van-cell title="⚠️ 请务必先关注微信测试号" label="否则无法收到通知" />
      </van-cell-group>

      <!-- 退出 -->
      <div style="padding: 32px 16px">
        <van-button type="default" size="large" round block @click="handleLogout">
          退出登录
        </van-button>
      </div>
    </template>

    <!-- TabBar -->
    <van-tabbar v-model="activeTab" :fixed="true" active-color="#FF5722" @change="onTabChange">
      <van-tabbar-item icon="home-o" to="/index">首页</van-tabbar-item>
      <van-tabbar-item icon="add-o" to="/search">添加</van-tabbar-item>
      <van-tabbar-item icon="user-o" to="/my">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getUserInfo, getSubscriptions } from '@/api';
import { getToken, removeToken } from '@/utils';
import LoginPanel from '@/components/LoginPanel.vue';
import { showToast } from 'vant';

const isLoggedIn = ref(false);
const userInfo = ref<any>({});
const subscriptionCount = ref(0);
const liveCount = ref(0);
const todayNotify = ref(0);
const activeTab = ref(2);
const isAdmin = ref(false);

onMounted(async () => {
  const token = getToken();
  if (!token) {
    isLoggedIn.value = false;
    return;
  }

  isLoggedIn.value = true;

  const resp = await getUserInfo();
  if (resp.code === 0) {
    userInfo.value = resp.data || {};
    isAdmin.value = resp.data?.isAdmin === true;
  }

  const subResp = await getSubscriptions();
  if (subResp.code === 0) {
    const subs = subResp.data || [];
    subscriptionCount.value = subs.length;
    liveCount.value = subs.filter((s) => s.liveStatus === 1).length;
  }
});

function handleLoginSuccess() {
  window.location.reload();
}

function handleLogout() {
  removeToken();
  isLoggedIn.value = false;
  userInfo.value = {};
  showToast('已退出登录');
}

function handleRefresh() {
  showToast('已刷新');
  window.location.reload();
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

.login-section {
  padding: 40px 24px;
}

// ---- 用户信息 ----
.user-header {
  background: linear-gradient(135deg, $primary, $primary-dark);
  padding: 36px 20px 30px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.avatar-placeholder {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255,255,255,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  border: 2px solid rgba(255,255,255,0.5);
}
.user-info { flex: 1; }
.user-name { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 2px; }
.user-id { font-size: 12px; color: rgba(255,255,255,0.75); }

// ---- 统计 ----
.stat-num {
  font-size: 22px;
  font-weight: 700;
  color: #333;
  margin-top: 4px;
}
.stat-label {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}
</style>
