<template>
  <van-config-provider theme="light">
    <router-view />
  </van-config-provider>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { getToken, setToken } from '@/utils';

onMounted(() => {
  // 微信 OAuth 回调后 URL 会带 token 参数
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || window.location.search);
  const token = urlParams.get('token');
  if (token) {
    setToken(token);
    console.log('[App] 已从 URL 获取 token');
    // 清理 URL
    window.history.replaceState({}, '', '/');
  }
});
</script>
