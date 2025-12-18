import { envConfigs } from '..';

export const localeNames: any = {
  en: 'English',
  zh: '中文',
};

export const locales = ['en', 'zh'];

export const defaultLocale = envConfigs.locale;

export const localePrefix = 'as-needed';

export const localeDetection = false;

export const localeMessagesRootPath = '@/config/locale/messages';

// 这里列出需要预加载的多语言 JSON 文件路径（不含语言前缀），会在服务端启动时一次性合并到 messages 中
// 非程序员理解版：只要把某个页面/模块的 key 写到这个数组里，对应的中英文文案 JSON 就会被自动加载，前端才不会显示“ai-note-taker.title”这种键名
export const localeMessagesPaths = [
  'common',
  'landing',
  // Landing 子工具页：AI 笔记 / 闪卡 / 测验 / 播客
  'ai-note-taker',
  // AI 信息图
  'infographic',
  'flashcards',
  'quiz',
  'podcast',
  'showcases',
  'blog',
  'pricing',
  'settings/sidebar',
  'settings/profile',
  'settings/security',
  'settings/billing',
  'settings/payments',
  'settings/credits',
  'settings/invitation',
  'settings/apikeys',
  'admin/sidebar',
  'admin/users',
  'admin/roles',
  'admin/permissions',
  'admin/categories',
  'admin/posts',
  'admin/payments',
  'admin/subscriptions',
  'admin/credits',
  'admin/settings',
  'admin/apikeys',
  'admin/ai-tasks',
  'admin/chats',
  'ai/music',
  'ai/chat',
  'ai/image',
  'library/sidebar',
  'library/ai-tasks',
  'library/chats',
  'aippt',
];
