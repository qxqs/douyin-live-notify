<template>
  <div class="page">
    <van-nav-bar title="订阅用户列表" left-text="返回" left-arrow @click-left="$router.back()" />

    <van-loading v-if="loading" class="loading" />

    <template v-else>
      <!-- 统计 -->
      <div class="stats-bar">
        <span>总关注者：<strong>{{ data.total }}</strong> 人</span>
      </div>

      <!-- 按博主分组 -->
      <van-collapse v-model="activeNames">
        <van-collapse-item
          v-for="group in data.byBlogger"
          :key="group.blogger"
          :name="group.blogger"
        >
          <template #title>
            <span>{{ group.blogger }}</span>
            <van-tag
              :type="group.liveStatus === 1 ? 'danger' : 'default'"
              style="margin-left: 8px"
            >
              {{ group.liveStatus === 1 ? '直播中' : '已下播' }}
            </van-tag>
            <span style="color: #999; font-size: 12px; margin-left: auto">
              {{ group.subscribers.length }} 人
            </span>
          </template>

          <van-cell
            v-for="sub in group.subscribers"
            :key="sub.openid"
            :title="sub.nickname"
            :label="'订阅时间: ' + sub.subscribedAt"
          />
        </van-collapse-item>
      </van-collapse>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getToken } from '@/utils';

const loading = ref(true);
const activeNames = ref<string[]>([]);
const data = ref<any>({ total: 0, byBlogger: [], list: [] });

onMounted(async () => {
  try {
    const token = getToken();
    const resp = await fetch('/api/admin/subscribers', {
      headers: { Authorization: 'Bearer ' + token },
    });
    const json = await resp.json();
    if (json.code === 0) {
      data.value = json.data;
      // 默认展开所有
      activeNames.value = json.data.byBlogger.map((g: any) => g.blogger);
    }
  } catch (e) {
    console.error(e);
  }
  loading.value = false;
});
</script>

<style lang="scss" scoped>
@use '@/styles/vars.scss' as *;

.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 50px;
}

.loading {
  display: block;
  margin: 80px auto;
}

.stats-bar {
  padding: 16px;
  font-size: 15px;
  background: #fff;
  border-bottom: 1px solid #eee;
}
</style>
