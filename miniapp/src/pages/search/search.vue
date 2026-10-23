<template>
  <div class="page">
    <!-- 搜索区域 -->
    <div class="search-section">
      <div class="search-title">🔍 添加你要关注的博主</div>
      <div class="search-desc">粘贴抖音直播间链接或房间号</div>

      <div class="search-row">
        <van-search
          v-model="searchInput"
          placeholder="粘贴抖音分享的内容（自动搜索）"
          shape="round"
          background="transparent"
          class="search-input-wrap"
          @search="handleSearch"
        />
        <van-button
          type="primary"
          round
          size="normal"
          class="search-btn"
          :loading="searching"
          @click="handleSearch"
        >
          搜索
        </van-button>
      </div>

      <div class="search-hints">
        <div class="hint-title">📋 操作方法</div>
        <div class="hint-item">抖音 APP → 博主主页 → 右上角分享 → 复制链接</div>
        <div class="hint-item">然后把复制的内容直接粘贴到搜索框即可</div>
        <div class="hint-divider"></div>
        <div class="hint-item hint-sub">支持：分享文案中的短链接 / 主页链接 / 直播间链接</div>
      </div>
    </div>

    <!-- 搜索结果 -->
    <div v-if="searchResult" class="result-section">
      <van-cell-group inset title="搜索结果">
        <div class="result-card">
          <div class="result-header">
            <div class="result-avatar">
              <van-image
                v-if="searchResult.avatarUrl"
                :src="searchResult.avatarUrl"
                width="40"
                height="40"
                round
                fit="cover"
              />
              <div v-else class="avatar-placeholder">📺</div>
            </div>
            <div class="result-info">
              <div class="result-name">{{ searchResult.nickname || '未知主播' }}</div>
              <div class="result-id">{{ searchResult.secUid ? '用户ID: ' + searchResult.secUid.slice(0, 20) + '...' : '房间号: ' + searchResult.roomId }}</div>
            </div>
            <van-tag
              :type="searchResult.liveStatus === 1 ? 'danger' : 'default'"
              size="medium"
            >
              {{ searchResult.liveStatus === 1 ? '🔴 直播中' : '状态未知' }}
            </van-tag>
          </div>

          <!-- 备注名输入 -->
          <van-field
            v-model="displayName"
            label="备注名"
            placeholder="给博主起个名字（选填）"
            :border="true"
            clearable
            style="margin-bottom: 12px"
          />

          <van-button
            :type="subscribed ? 'default' : 'primary'"
            size="large"
            round
            block
            :loading="subscribing"
            @click="handleSubscribe"
          >
            {{ subscribed ? '✅ 已订阅（点击取消）' : '📢 订阅开播提醒' }}
          </van-button>
        </div>
      </van-cell-group>
    </div>

    <!-- 搜索错误 -->
    <div v-if="searchError" class="error-box">
      <van-cell-group inset>
        <van-cell :title="searchError" label="请检查后重试" />
      </van-cell-group>
    </div>

    <!-- 未登录提示 -->
    <div v-if="!isLoggedIn" class="login-tip">
      <van-notice-bar :scrollable="false">
        请先在「我的」页面登录后再添加博主
      </van-notice-bar>
    </div>

    <!-- TabBar -->
    <van-tabbar v-model="activeTab" :fixed="true" active-color="#FF5722" @change="onTabChange">
      <van-tabbar-item icon="home-o" to="/index">首页</van-tabbar-item>
      <van-tabbar-item icon="add-o" to="/search">添加</van-tabbar-item>
      <van-tabbar-item icon="user-o" to="/my">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { searchBlogger, subscribe, unsubscribe, getSubscriptions } from '@/api';
import { getToken } from '@/utils';
import { showToast } from 'vant';

const searchInput = ref('');
const searching = ref(false);
const searchResult = ref<any>(null);
const searchError = ref('');
const subscribed = ref(false);
const subscribing = ref(false);
const isLoggedIn = ref(false);
const activeTab = ref(1);
const displayName = ref('');

onMounted(() => {
  isLoggedIn.value = !!getToken();
});

// 粘贴内容后自动搜索（检测到抖音链接特征时触发）
let pasteTimer: any = null;
watch(searchInput, (val) => {
  if (!val || !val.trim()) return;
  // 检测是否包含抖音链接特征
  if (/douyin\.com|v\.douyin|iesdouyin/i.test(val)) {
    clearTimeout(pasteTimer);
    pasteTimer = setTimeout(() => handleSearch(), 300);
  }
});

function onPaste() {
  // 保留但不依赖，由 watch 处理
}

async function handleSearch() {
  const input = searchInput.value.trim();
  if (!input) {
    searchError.value = '请输入直播间链接或房间号';
    return;
  }

  searchError.value = '';
  searchResult.value = null;
  searching.value = true;

  const resp = await searchBlogger(input);
  searching.value = false;

  if (resp.code === 0 && resp.data) {
    searchResult.value = resp.data;
    // 检查是否已订阅
    const subsResp = await getSubscriptions();
    const subscribedIds = (subsResp.data || []).map((s: any) => s.id);
    subscribed.value = subscribedIds.includes(resp.data.id);
    searchError.value = '';
  } else {
    searchError.value = resp.message || '搜索失败，请重试';
    searchResult.value = null;
  }
}

async function handleSubscribe() {
  if (!searchResult.value) return;

  if (!isLoggedIn.value) {
    showToast('请先登录');
    return;
  }

  subscribing.value = true;

  if (subscribed.value) {
    const resp = await unsubscribe(searchResult.value.id);
    if (resp.code === 0) {
      subscribed.value = false;
      showToast('已取消订阅');
    } else {
      showToast(resp.message || '操作失败');
    }
  } else {
    const resp = await subscribe(searchResult.value.id, displayName.value.trim());
    if (resp.code === 0) {
      subscribed.value = true;
      showToast('🎉 订阅成功！开播时会收到通知');
    } else {
      showToast(resp.message || '操作失败');
    }
  }

  subscribing.value = false;
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

// ---- 搜索 ----
.search-section {
  background: linear-gradient(135deg, $primary, $primary-dark);
  padding: 20px 0 24px;
  color: #fff;

  .search-title {
    padding: 0 20px;
    font-size: 20px;
    font-weight: 700;
  }
  .search-desc {
    padding: 4px 20px 0;
    font-size: 13px;
    opacity: 0.85;
  }
}

.search-row {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 16px;
}
.search-input-wrap {
  flex: 1;
  padding: 8px 0;
}
.search-btn {
  flex-shrink: 0;
  margin-left: 8px;
  height: 36px;
  font-size: 14px;
}

// Vant Search 在深色背景上的适配
:deep(.van-search) {
  padding: 8px 16px;
}
:deep(.van-search__content) {
  background: rgba(255,255,255,0.95);
}

.search-hints {
  padding: 16px 20px 0;
  font-size: 12px;
  opacity: 0.8;
  line-height: 1.8;
}
.hint-title {
  margin-bottom: 2px;
}
.hint-item {
  opacity: 0.8;
}
.hint-divider {
  height: 1px;
  background: rgba(255,255,255,0.2);
  margin: 6px 0;
}
.hint-sub {
  opacity: 0.65;
  font-size: 11px;
}

// ---- 搜索结果 ----
.result-section {
  margin-top: 16px;
}
.result-card {
  padding: 16px;
}
.result-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.result-avatar {
  flex-shrink: 0;
}
.avatar-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}
.result-info {
  flex: 1;
  min-width: 0;
}
.result-name {
  font-size: 16px;
  font-weight: 600;
}
.result-id {
  font-size: 12px;
  color: #c0c4cc;
}

// ---- 错误 ----
.error-box {
  margin-top: 16px;
}

// ---- 登录提示 ----
.login-tip {
  margin-top: 24px;
}
</style>
