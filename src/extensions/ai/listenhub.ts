/**
 * ListenHub AI Provider - 播客生成服务
 * @docs https://blog.listenhub.ai/openapi-docs
 *
 * 非程序员解释：
 * - ListenHub 是一个专业的 AI 播客生成平台
 * - 支持多种播客模式（速听、深度、辩论）
 * - 支持多种语言和音色选择
 * - 可以从文本、文件或链接生成播客
 */

import {
  AIConfigs,
  AIGenerateParams,
  AIMediaType,
  AIProvider,
  AITaskResult,
  AITaskStatus,
} from '.';

/**
 * ListenHub API 配置接口
 */
export interface ListenHubConfigs extends AIConfigs {
  apiKey: string;
  baseUrl?: string;
}

/**
 * 播客模式类型
 * - quick: 速听模式（1-2分钟，快速生成）
 * - deep: 深度模式（2-4分钟，内容质量高）
 * - debate: 辩论模式（2-4分钟，双主持人辩论形式）
 */
export type PodcastMode = 'quick' | 'deep' | 'debate';

/**
 * 说话者配置接口（根据 ListenHub 官方文档）
 */
export interface Speaker {
  speakerId: string; // 说话者ID，如 "CN-Man-Beijing-V2"
}

/**
 * 音色信息接口
 */
export interface ListenHubSpeaker {
  speakerId: string;
  speakerName: string;
  language: string;
  gender?: string;
  demoAudioUrl?: string; // 音色试听URL
  tags?: string[];
}

/**
 * 播客生成参数接口（根据 ListenHub 官方文档）
 */
export interface PodcastGenerateOptions {
  mode?: PodcastMode; // 播客模式: quick, deep, debate
  language?: string; // 语言（如 'zh', 'en', 'ja' 等）
  speakers?: Speaker[]; // 说话者数组
  query?: string; // 播客内容查询（文本、链接等）
}

/**
 * ListenHub API 响应格式（根据官方文档）
 */
export interface ListenHubResponse {
  code: number; // 状态码，0 表示成功
  message?: string; // 错误信息
  data: {
    episodeId?: string; // 单集ID
    processStatus?: string; // 处理状态: pending, processing, success, failed
    audioUrl?: string; // 音频文件URL
    duration?: number; // 播客时长（秒）
    transcript?: string; // 播客文本稿
    message?: string; // 状态消息
    failCode?: number; // 失败代码
    title?: string; // AI 生成的播客标题
    outline?: string; // 播客大纲
    cover?: string; // 封面图片URL
    scripts?: Array<{
      // 播客脚本
      speakerId: string;
      speakerName: string;
      content: string;
    }>;
  };
}

/**
 * 预置音色列表（ListenHub 官方音色，2025-01-01 更新）
 * 数据来源：GET /openapi/v1/speakers/list API
 */
const PRESET_SPEAKERS: ListenHubSpeaker[] = [
  // ===== 中文音色 (28个) =====
  {
    speakerId: 'chat-girl-105-cn',
    speakerName: '晓曼',
    language: 'zh',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/chat-girl-105-cn_pending_1761140378494.mp3',
  },
  {
    speakerId: 'suzhe-45bbbe54',
    speakerName: '苏哲',
    language: 'zh',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/suzhe-45bbbe54_pending_1761140378388.mp3',
  },
  {
    speakerId: 'gaoqing3-bfb5c88a',
    speakerName: '高晴',
    language: 'zh',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/gaoqing3-bfb5c88a_pending_1761140378495.mp3',
  },
  {
    speakerId: 'CN-Man-Beijing-V2',
    speakerName: '原野 (推荐)',
    language: 'zh',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/CN-Man-Beijing-V2_pending_1761140378252.mp3',
  },
  {
    speakerId: 'liyan2-ef9401ec',
    speakerName: '国栋',
    language: 'zh',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/liyan2-ef9401ec_pending_1761140378388.mp3',
  },
  {
    speakerId: 'liyan3-f74976d9',
    speakerName: '子墨',
    language: 'zh',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/liyan3-f74976d9_pending_1761140378112.mp3',
  },
  {
    speakerId: 'zhibonusheng-7b0dbae2',
    speakerName: '直播雪姐',
    language: 'zh',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/zhibonusheng-7b0dbae2_pending_1761204468716.mp3',
  },
  {
    speakerId: 'shuoshurennan-fdfa85f9',
    speakerName: '常四爷',
    language: 'zh',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/shuoshurennan-fdfa85f9_pending_1761140378113.mp3',
  },
  {
    speakerId: 'pingshu-c7c18f5a',
    speakerName: '古今先生',
    language: 'zh',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/pingshu-c7c18f5a_pending_1761140378252.mp3',
  },
  {
    speakerId: 'midnightaxing-0bf9d7a5',
    speakerName: '冥想阿星',
    language: 'zh',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/midnightaxing-0bf9d7a5_pending_1761140378712.mp3',
  },
  {
    speakerId: 'midnightalan-cb312cb6',
    speakerName: '冥想阿岚',
    language: 'zh',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/midnightalan-cb312cb6_pending_1761140378713.mp3',
  },
  {
    speakerId: 'zhibonansheng-80bf8621',
    speakerName: '直播浩哥',
    language: 'zh',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/zhibonansheng-80bf8621_pending_1761140378253.mp3',
  },
  {
    speakerId: 'huibennulaoshi-bf2bbe1f',
    speakerName: '故事云舒',
    language: 'zh',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/huibennulaoshi-bf2bbe1f_pending_1761140377976.mp3',
  },
  {
    speakerId: 'gushijingling-720c0ae5',
    speakerName: '故事精灵',
    language: 'zh',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/gushijingling-720c0ae5_pending_1761205947072.mp3',
  },
  {
    speakerId: 'dp-6cc9831f',
    speakerName: '约翰大叔',
    language: 'zh',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/dp-6cc9831f_demo_audio.mp3',
  },
  {
    speakerId: 'sam-34cf3074',
    speakerName: '山姆大叔',
    language: 'zh',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/sam-34cf3074_demo_audio.mp3',
  },
  {
    speakerId: 'voice-clone-69412c2e05707c916796efd1',
    speakerName: '笑笑',
    language: 'zh',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/voice-clone-69412c2e05707c916796efd1_pending_1765881683002.mp3',
  },
  {
    speakerId: 'bajie-4f6ab1a8',
    speakerName: '八戒',
    language: 'zh',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/bajie-4f6ab1a8_pending_1761140377975.mp3',
  },
  {
    speakerId: 'houge-ce107859',
    speakerName: '猴哥',
    language: 'zh',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/houge-ce107859_pending_1761140377976.mp3',
  },
  {
    speakerId: 'xinyi6',
    speakerName: '诗涵',
    language: 'zh',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/xinyi6_pending_1761140378113.mp3',
  },
  {
    speakerId: 'nanzhongyin-4897116a',
    speakerName: '振松',
    language: 'zh',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/nanzhongyin-4897116a_pending_1761140378495.mp3',
  },
  {
    speakerId: 'xiaoyun',
    speakerName: '若云',
    language: 'zh',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/xiaoyun_pending_1761140378113.mp3',
  },
  {
    speakerId: 'nvdiyin-7b293152',
    speakerName: '暮歌',
    language: 'zh',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/nvdiyin-7b293152_pending_1761140378253.mp3',
  },
  {
    speakerId: 'shuoshurennan-b09f844f',
    speakerName: '柳飞霜',
    language: 'zh',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/shuoshurennan-b09f844f_pending_1761140378253.mp3',
  },
  {
    speakerId: 'ASMR-Male-CN',
    speakerName: '远舟 (ASMR)',
    language: 'zh',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/ASMR-Male-CN_pending_1761140378494.mp3',
  },
  {
    speakerId: 'ASMR-Female-CN',
    speakerName: '宛星 (ASMR)',
    language: 'zh',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/ASMR-Female-CN_pending_1761140378494.mp3',
  },
  {
    speakerId: '1luoxiaohei1vocals-88bfc421',
    speakerName: '小花妖',
    language: 'zh',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/1luoxiaohei1vocals-88bfc421_demo_audio.mp3',
  },
  {
    speakerId: 'hajimi-427f918d',
    speakerName: '哈基米',
    language: 'zh',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/hajimi-427f918d_demo_audio.mp3',
  },

  // ===== 英文音色 (30个) =====
  {
    speakerId: 'travel-girl-english',
    speakerName: 'Mia',
    language: 'en',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/travel-girl-english_pending_1761140367713.mp3',
  },
  {
    speakerId: 'leo-9328b6d2',
    speakerName: 'Leo',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/leo-9328b6d2_demo_audio.mp3',
  },
  {
    speakerId: 'Marcus-9aa6846b',
    speakerName: 'Marcus',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/Marcus-9aa6846b_demo_audio.mp3',
  },
  {
    speakerId: 'en-us-chirp3-hd-aoede-72845d1a',
    speakerName: 'Aoede',
    language: 'en',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/en-us-chirp3-hd-aoede-72845d1a_pending_1761140641548.mp3',
  },
  {
    speakerId: 'lowman-51dbcc05',
    speakerName: 'David',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/lowman-51dbcc05_pending_1761140641404.mp3',
  },
  {
    speakerId: 'lowwoman-687103f5',
    speakerName: 'Reed',
    language: 'en',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/lowwoman-687103f5_pending_1761140641403.mp3',
  },
  {
    speakerId: 'middlewoman-3731593b',
    speakerName: 'Sarah',
    language: 'en',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/middlewoman-3731593b_pending_1761140641549.mp3',
  },
  {
    speakerId: 'Ashley-f5de473a',
    speakerName: 'Ashley',
    language: 'en',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/Ashley-f5de473a_demo_audio.mp3',
  },
  {
    speakerId: 'en-us-chirp3-hd-leda-e801b185',
    speakerName: 'Leda',
    language: 'en',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/en-us-chirp3-hd-leda-e801b185_pending_1761140641548.mp3',
  },
  {
    speakerId: 'cozy-man-english',
    speakerName: 'Mars',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/cozy-man-english_pending_1761140641549.mp3',
  },
  {
    speakerId: 'catherine-fd3c96a2',
    speakerName: 'Catherine',
    language: 'en',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/catherine-fd3c96a2_demo_audio.mp3',
  },
  {
    speakerId: 'arthur-2ae006aa',
    speakerName: 'Arthur',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/arthur-2ae006aa_pending_1761141343203.mp3',
  },
  {
    speakerId: 'famalepodcastemmawatsonrp-e0342a5a',
    speakerName: 'Iris',
    language: 'en',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/famalepodcastemmawatsonrp-e0342a5a_demo_audio.mp3',
  },
  {
    speakerId: 'livefemale2-778526f2',
    speakerName: 'Host Maya',
    language: 'en',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/livefemale2-778526f2_pending_1761139015044.mp3',
  },
  {
    speakerId: 'hostsam-dab52696',
    speakerName: 'Host Sam',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/hostsam-dab52696_demo_audio.mp3',
  },
  {
    speakerId: 'livemale-576eef6f',
    speakerName: 'Host John',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/livemale-576eef6f_pending_1761139015044.mp3',
  },
  {
    speakerId: 'livefemale-cc42c5bf',
    speakerName: 'Host Claire',
    language: 'en',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/livefemale-cc42c5bf_pending_1761139015045.mp3',
  },
  {
    speakerId: 'midnightnate-e48a5b5f',
    speakerName: 'Meditation Nate',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/midnightnate-e48a5b5f_pending_1761139015158.mp3',
  },
  {
    speakerId: 'minight-kate-d4b925d0',
    speakerName: 'Meditation Kate',
    language: 'en',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/minight-kate-d4b925d0_pending_1761139015158.mp3',
  },
  {
    speakerId: 'storypixie-e70ddb42',
    speakerName: 'Story Pixie',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/storypixie-e70ddb42_pending_1761139014676.mp3',
  },
  {
    speakerId: 'vividstoryteachermale-8a369b48',
    speakerName: 'Storyteller Finn',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/vividstoryteachermale-8a369b48_pending_1761139014849.mp3',
  },
  {
    speakerId: 'ASMR-Male-EN',
    speakerName: 'Eliot (ASMR)',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/ASMR-Male-EN_pending_1761139015045.mp3',
  },
  {
    speakerId: 'English-Whispering-girl-v3',
    speakerName: 'Lily (ASMR)',
    language: 'en',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/English-Whispering-girl-v3_pending_1761139015157.mp3',
  },
  {
    speakerId: 'en-us-chirp3-hd-charon-9f952104',
    speakerName: 'Charon',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/en-us-chirp3-hd-charon-9f952104_pending_1761139014946.mp3',
  },
  {
    speakerId: 'es-es-chirp3-hd-orus-3941b176',
    speakerName: 'Orus',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/es-es-chirp3-hd-orus-3941b176_pending_1761140641711.mp3',
  },
  {
    speakerId: 'malechrishemsworthpodcastaus-723dad64',
    speakerName: 'Noah',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/malechrishemsworthpodcastaus-723dad64_demo_audio.mp3',
  },
  {
    speakerId: 'English-Gentle-voiced-man',
    speakerName: 'Michael',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/English-Gentle-voiced-man_pending_1761140641403.mp3',
  },
  {
    speakerId: 'Daniel',
    speakerName: 'Daniel',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/Daniel_pending_1761140641550.mp3',
  },
  {
    speakerId: 'English-GentleTeacher',
    speakerName: 'Owen',
    language: 'en',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/English-GentleTeacher_pending_1761140641404.mp3',
  },
  {
    speakerId: 'English-compelling-lady1',
    speakerName: 'Olivia',
    language: 'en',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/English-compelling-lady1_pending_1761139014946.mp3',
  },

  // ===== 日文音色 (8个) =====
  {
    speakerId: 'tianzhongdunzi-5d612542',
    speakerName: 'なぎ',
    language: 'ja',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/tianzhongdunzi-5d612542_demo_audio.mp3',
  },
  {
    speakerId: '1shenguhaoshivocals-c002bc47',
    speakerName: 'そうた',
    language: 'ja',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/1shenguhaoshivocals-c002bc47_demo_audio.mp3',
  },
  {
    speakerId: 'riyunanganyin-907ccc94',
    speakerName: 'はると',
    language: 'ja',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/riyunanganyin-907ccc94_demo_audio.mp3',
  },
  {
    speakerId: '1dinggongyouyinlevocals-092ff4c8',
    speakerName: 'ゆい',
    language: 'ja',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/1dinggongyouyinlevocals-092ff4c8_demo_audio.mp3',
  },
  {
    speakerId: 'yingjingxiaohong-e248ab9a',
    speakerName: 'いおり',
    language: 'ja',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/yingjingxiaohong-e248ab9a_demo_audio.mp3',
  },
  {
    speakerId: 'Newsgirl-6be25905',
    speakerName: 'まゆみ',
    language: 'ja',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/Newsgirl-6be25905_demo_audio.mp3',
  },
  {
    speakerId: 'riyunanganyin-0f2be722',
    speakerName: 'かいと',
    language: 'ja',
    gender: 'male',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/riyunanganyin-0f2be722_demo_audio.mp3',
  },
  {
    speakerId: 'zaojianshazhi-cd141f8d',
    speakerName: 'あやか',
    language: 'ja',
    gender: 'female',
    demoAudioUrl:
      'https://assets.listenhub.ai/listenhub-public-prod/audios/zaojianshazhi-cd141f8d_demo_audio.mp3',
  },
];

/**
 * ListenHub AI Provider
 *
 * 非程序员解释：
 * - 这个类负责与 ListenHub API 通信
 * - 提供播客生成、查询和音色列表获取功能
 * - 支持多种输入方式（文本、文件、链接）
 */
export class ListenHubProvider implements AIProvider {
  // 提供商名称
  readonly name = 'listenhub';

  // 提供商配置
  configs: ListenHubConfigs;

  // API基础URL
  private baseUrl: string;

  // 初始化提供商
  constructor(configs: ListenHubConfigs) {
    this.configs = configs;
    // 默认 Base URL 设为 https://api.marswave.ai（ListenHub 官方 API 地址）
    // 如果用户在环境变量中配置了 LISTENHUB_BASE_URL，则使用环境变量的值
    this.baseUrl = configs.baseUrl || 'https://api.marswave.ai';
  }

  /**
   * 获取音色列表
   *
   * 非程序员解释：
   * - 从 ListenHub 获取所有可用的音色
   * - 支持按语言筛选（如只获取中文音色）
   *
   * @param language - 语言代码 (zh, en)
   */
  async getSpeakers(language?: string): Promise<ListenHubSpeaker[]> {
    // 1. 获取预置音色
    let speakers = PRESET_SPEAKERS.filter(
      (s) => !language || s.language === language || language === 'auto'
    );

    try {
      let queryUrl = `${this.baseUrl}/openapi/v1/speakers/list`;
      if (language && language !== 'auto') {
        queryUrl += `?language=${language}`;
      }

      console.log('🔍 ListenHub - 获取音色列表:', queryUrl);

      const response = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.configs.apiKey}`,
        },
      });

      if (response.ok) {
        const result = await response.json();

        if (result.code === 0 && Array.isArray(result.data)) {
          // 2. 合并 API 返回的音色（去重）
          const apiSpeakers: ListenHubSpeaker[] = result.data;

          apiSpeakers.forEach((apiSpeaker) => {
            const exists = speakers.some(
              (s) => s.speakerId === apiSpeaker.speakerId
            );
            if (!exists) {
              speakers.push(apiSpeaker);
            } else {
              // 更新现有音色的信息（例如名称可能更准确）
              const index = speakers.findIndex(
                (s) => s.speakerId === apiSpeaker.speakerId
              );
              if (index !== -1) {
                speakers[index] = { ...speakers[index], ...apiSpeaker };
              }
            }
          });
        }
      }
    } catch (error) {
      console.error('❌ ListenHub - 获取音色列表失败，使用预置列表:', error);
    }

    return speakers;
  }

  /**
   * 生成播客
   *
   * 非程序员解释：
   * - 这个方法发送播客生成请求到 ListenHub API
   * - 根据用户选择的模式、语言和音色生成播客
   * - API是异步的，返回任务ID后需要轮询查询结果
   *
   * @param params - AI生成参数
   * @returns 任务结果，包含任务ID和状态
   */
  async generate({
    params,
  }: {
    params: AIGenerateParams;
  }): Promise<AITaskResult> {
    // 只支持语音生成
    if (params.mediaType !== AIMediaType.SPEECH) {
      throw new Error('ListenHub only supports podcast/speech generation');
    }

    try {
      // 从 options 中获取播客参数
      const options = (params.options as PodcastGenerateOptions) || {};

      const {
        mode = 'deep', // 默认使用深度模式
        language = 'zh', // 默认中文
        speakers, // 说话者配置
        query, // 内容查询
      } = options;

      // 验证必填参数
      if (!query) {
        throw new Error('Must provide query parameter');
      }

      if (!speakers || speakers.length === 0) {
        throw new Error('Must provide at least one speaker');
      }

      // 准备请求体（严格按照官方文档格式）
      const requestBody = {
        query,
        speakers,
        language,
        mode,
      };

      const requestUrl = `${this.baseUrl}/openapi/v1/podcast/episodes`;
      console.log('🔄 ListenHub - 发送播客生成请求:', {
        url: requestUrl,
        mode,
        language,
        speakersCount: speakers.length,
        queryLength: query.length,
      });

      // 调用 ListenHub API
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.configs.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const result: ListenHubResponse = await response.json();

      // 检查 API 返回的状态码
      if (result.code !== 0) {
        console.error('❌ ListenHub API 错误:', {
          url: requestUrl,
          code: result.code,
          message: result.message,
        });
        throw new Error(
          `ListenHub API error: ${result.message || 'Unknown error'}`
        );
      }

      const episodeId = result.data.episodeId;
      if (!episodeId) {
        throw new Error('No episodeId returned from API');
      }

      console.log('✅ ListenHub - 任务创建成功, episodeId:', episodeId);

      // ListenHub 是异步API，返回任务ID
      return {
        taskStatus: AITaskStatus.PENDING,
        taskId: episodeId,
        taskInfo: {
          status: 'pending',
        },
        taskResult: result,
      };
    } catch (error: any) {
      console.error('❌ ListenHub - 生成失败:', error);

      return {
        taskStatus: AITaskStatus.FAILED,
        taskId: `listenhub-error-${Date.now()}`,
        taskInfo: {
          status: 'failed',
          errorMessage: error.message,
        },
      };
    }
  }

  /**
   * 查询播客任务状态
   *
   * 非程序员解释：
   * - ListenHub 是异步API，需要轮询查询结果
   * - 当任务完成后，会返回音频URL和播客信息
   *
   * @param taskId - 任务ID（即 episode_id）
   * @returns 任务结果，包含音频URL和状态
   */
  async query({ taskId }: { taskId: string }): Promise<AITaskResult> {
    try {
      console.log('🔍 ListenHub - 查询任务状态, episodeId:', taskId);

      const queryUrl = `${this.baseUrl}/openapi/v1/podcast/episodes/${taskId}`;
      const response = await fetch(queryUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.configs.apiKey}`,
        },
      });

      const result: ListenHubResponse = await response.json();

      // 检查 API 返回的状态码
      if (result.code !== 0) {
        console.error('❌ ListenHub 查询错误:', {
          code: result.code,
          message: result.message,
        });
        throw new Error(
          `ListenHub query error: ${result.message || 'Unknown error'}`
        );
      }

      const processStatus = result.data.processStatus;

      // 详细日志：显示完整的 API 响应
      console.log('📊 ListenHub - 查询响应详情:', {
        episodeId: taskId,
        processStatus,
        hasAudioUrl: !!result.data.audioUrl,
        message: result.data.message,
        failCode: result.data.failCode,
        fullData: result.data,
      });

      // 根据任务状态返回结果
      // ListenHub 的状态: processing, success, failed
      if (processStatus === 'success' && result.data.audioUrl) {
        console.log('✅ ListenHub - 任务完成，音频URL:', result.data.audioUrl);
        console.log('📝 ListenHub - 播客标题:', result.data.title);

        return {
          taskStatus: AITaskStatus.SUCCESS,
          taskId,
          taskInfo: {
            status: 'completed',
          },
          taskResult: {
            audioUrl: result.data.audioUrl,
            duration: result.data.duration,
            transcript: result.data.transcript,
            title: result.data.title, // AI 生成的标题
            outline: result.data.outline, // 播客大纲
            cover: result.data.cover, // 封面图片
            scripts: result.data.scripts, // 播客脚本
          },
        };
      } else if (processStatus === 'failed' || result.data.failCode) {
        // 任务失败：检查 processStatus 或 failCode
        const errorMessage = result.data.message || '播客生成失败';
        console.error('❌ ListenHub - 任务失败:', {
          message: errorMessage,
          failCode: result.data.failCode,
        });

        return {
          taskStatus: AITaskStatus.FAILED,
          taskId,
          taskInfo: {
            status: 'failed',
            errorMessage,
          },
          taskResult: result.data,
        };
      } else if (
        processStatus === 'processing' ||
        processStatus === 'pending'
      ) {
        // 任务处理中或等待中
        console.log(
          `⏳ ListenHub - 任务${processStatus === 'pending' ? '等待' : '处理'}中...`
        );

        return {
          taskStatus: AITaskStatus.PROCESSING,
          taskId,
          taskInfo: {
            status: processStatus,
          },
          taskResult: result.data,
        };
      } else {
        // 其他未知状态
        console.warn('⚠️ ListenHub - 未知状态:', processStatus);

        return {
          taskStatus: AITaskStatus.PROCESSING,
          taskId,
          taskInfo: {
            status: processStatus || 'unknown',
          },
          taskResult: result.data,
        };
      }
    } catch (error: any) {
      console.error('❌ ListenHub - 查询失败:', error);

      return {
        taskStatus: AITaskStatus.FAILED,
        taskId,
        taskInfo: {
          status: 'failed',
          errorMessage: error.message,
        },
      };
    }
  }

  /**
   * 获取支持的播客模式
   *
   * 非程序员解释：
   * - quick: 快速模式，1-2分钟，适合新闻快报、时效性内容
   * - deep: 深度模式，2-4分钟，内容质量高，适合专业知识分享
   * - debate: 辩论模式，2-4分钟，双主持人辩论形式，适合观点讨论
   */
  static getSupportedModes() {
    return [
      {
        id: 'quick',
        name: '速听模式',
        name_en: 'Quick Mode',
        description: '快速生成，效率优先',
        description_en: 'Fast generation, efficiency first',
        duration: '1-2 分钟',
        duration_en: '1-2 minutes',
        features: ['快速生成', '时效性内容'],
        features_en: ['Fast generation', 'Time-sensitive content'],
      },
      {
        id: 'deep',
        name: '深度模式',
        name_en: 'Deep Mode',
        description: '深度分析，内容质量高',
        description_en: 'In-depth analysis, high quality',
        duration: '2-4 分钟',
        duration_en: '2-4 minutes',
        features: ['专业知识分享', '深度解读'],
        features_en: ['Professional knowledge', 'Deep analysis'],
      },
      {
        id: 'debate',
        name: '辩论模式',
        name_en: 'Debate Mode',
        description: '双主持人辩论形式',
        description_en: 'Dual-host debate format',
        duration: '2-4 分钟',
        duration_en: '2-4 minutes',
        features: ['观点讨论', '多角度分析'],
        features_en: ['Opinion discussion', 'Multi-angle analysis'],
      },
    ];
  }

  /**
   * 获取支持的语言列表
   *
   * 非程序员解释：
   * - ListenHub API 目前只支持三种语言：en (英文), zh (中文), ja (日语)
   */
  static getSupportedLanguages() {
    return [
      { code: 'zh', name: '中文', name_en: 'Chinese' },
      { code: 'en', name: '英文', name_en: 'English' },
      { code: 'ja', name: '日语', name_en: 'Japanese' },
    ];
  }
}
