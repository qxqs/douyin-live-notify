import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    redirect: '/index',
  },
  {
    path: '/index',
    name: 'Home',
    component: () => import('@/pages/index/index.vue'),
  },
  {
    path: '/search',
    name: 'Search',
    component: () => import('@/pages/search/search.vue'),
  },
  {
    path: '/my',
    name: 'My',
    component: () => import('@/pages/my/my.vue'),
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('@/pages/admin/admin.vue'),
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
