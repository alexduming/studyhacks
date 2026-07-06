/**
 * 批量更新音色列表，添加 demoAudioUrl
 * 根据之前获取的 API 数据生成完整的音色列表
 */

const speakersData = {
  zh: [
    { name: '晓曼', speakerId: 'chat-girl-105-cn', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/chat-girl-105-cn_pending_1761140378494.mp3', gender: 'female', language: 'zh' },
    { name: '苏哲', speakerId: 'suzhe-45bbbe54', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/suzhe-45bbbe54_pending_1761140378388.mp3', gender: 'male', language: 'zh' },
    { name: '高晴', speakerId: 'gaoqing3-bfb5c88a', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/gaoqing3-bfb5c88a_pending_1761140378495.mp3', gender: 'female', language: 'zh' },
    { name: '原野', speakerId: 'CN-Man-Beijing-V2', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/CN-Man-Beijing-V2_pending_1761140378252.mp3', gender: 'male', language: 'zh' },
    { name: '国栋', speakerId: 'liyan2-ef9401ec', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/liyan2-ef9401ec_pending_1761140378388.mp3', gender: 'male', language: 'zh' },
    { name: '子墨', speakerId: 'liyan3-f74976d9', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/liyan3-f74976d9_pending_1761140378112.mp3', gender: 'male', language: 'zh' },
    { name: '直播雪姐', speakerId: 'zhibonusheng-7b0dbae2', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/zhibonusheng-7b0dbae2_pending_1761204468716.mp3', gender: 'female', language: 'zh' },
    { name: '常四爷', speakerId: 'shuoshurennan-fdfa85f9', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/shuoshurennan-fdfa85f9_pending_1761140378113.mp3', gender: 'male', language: 'zh' },
    { name: '古今先生', speakerId: 'pingshu-c7c18f5a', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/pingshu-c7c18f5a_pending_1761140378252.mp3', gender: 'male', language: 'zh' },
    { name: '冥想阿星', speakerId: 'midnightaxing-0bf9d7a5', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/midnightaxing-0bf9d7a5_pending_1761140378712.mp3', gender: 'male', language: 'zh' },
    { name: '冥想阿岚', speakerId: 'midnightalan-cb312cb6', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/midnightalan-cb312cb6_pending_1761140378713.mp3', gender: 'female', language: 'zh' },
    { name: '直播浩哥', speakerId: 'zhibonansheng-80bf8621', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/zhibonansheng-80bf8621_pending_1761140378253.mp3', gender: 'male', language: 'zh' },
    { name: '故事云舒', speakerId: 'huibennulaoshi-bf2bbe1f', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/huibennulaoshi-bf2bbe1f_pending_1761140377976.mp3', gender: 'female', language: 'zh' },
    { name: '故事精灵', speakerId: 'gushijingling-720c0ae5', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/gushijingling-720c0ae5_pending_1761205947072.mp3', gender: 'male', language: 'zh' },
    { name: '约翰大叔', speakerId: 'dp-6cc9831f', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/dp-6cc9831f_demo_audio.mp3', gender: 'male', language: 'zh' },
    { name: '山姆大叔', speakerId: 'sam-34cf3074', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/sam-34cf3074_demo_audio.mp3', gender: 'male', language: 'zh' },
    { name: '笑笑', speakerId: 'voice-clone-69412c2e05707c916796efd1', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/voice-clone-69412c2e05707c916796efd1_pending_1765881683002.mp3', gender: 'female', language: 'zh' },
    { name: '八戒', speakerId: 'bajie-4f6ab1a8', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/bajie-4f6ab1a8_pending_1761140377975.mp3', gender: 'male', language: 'zh' },
    { name: '猴哥', speakerId: 'houge-ce107859', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/houge-ce107859_pending_1761140377976.mp3', gender: 'male', language: 'zh' },
    { name: '诗涵', speakerId: 'xinyi6', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/xinyi6_pending_1761140378113.mp3', gender: 'female', language: 'zh' },
    { name: '振松', speakerId: 'nanzhongyin-4897116a', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/nanzhongyin-4897116a_pending_1761140378495.mp3', gender: 'male', language: 'zh' },
    { name: '若云', speakerId: 'xiaoyun', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/xiaoyun_pending_1761140378113.mp3', gender: 'female', language: 'zh' },
    { name: '暮歌', speakerId: 'nvdiyin-7b293152', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/nvdiyin-7b293152_pending_1761140378253.mp3', gender: 'female', language: 'zh' },
    { name: '柳飞霜', speakerId: 'shuoshurennan-b09f844f', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/shuoshurennan-b09f844f_pending_1761140378253.mp3', gender: 'female', language: 'zh' },
    { name: '远舟 (ASMR)', speakerId: 'ASMR-Male-CN', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/ASMR-Male-CN_pending_1761140378494.mp3', gender: 'male', language: 'zh' },
    { name: '宛星 (ASMR)', speakerId: 'ASMR-Female-CN', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/ASMR-Female-CN_pending_1761140378494.mp3', gender: 'female', language: 'zh' },
    { name: '小花妖', speakerId: '1luoxiaohei1vocals-88bfc421', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/1luoxiaohei1vocals-88bfc421_demo_audio.mp3', gender: 'female', language: 'zh' },
    { name: '哈基米', speakerId: 'hajimi-427f918d', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/hajimi-427f918d_demo_audio.mp3', gender: 'female', language: 'zh' },
  ],
  en: [
    { name: 'Mia', speakerId: 'travel-girl-english', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/travel-girl-english_pending_1761140367713.mp3', gender: 'female', language: 'en' },
    { name: 'Leo', speakerId: 'leo-9328b6d2', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/leo-9328b6d2_demo_audio.mp3', gender: 'male', language: 'en' },
    { name: 'Marcus', speakerId: 'Marcus-9aa6846b', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/Marcus-9aa6846b_demo_audio.mp3', gender: 'male', language: 'en' },
    { name: 'Aoede', speakerId: 'en-us-chirp3-hd-aoede-72845d1a', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/en-us-chirp3-hd-aoede-72845d1a_pending_1761140641548.mp3', gender: 'female', language: 'en' },
    { name: 'David', speakerId: 'lowman-51dbcc05', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/lowman-51dbcc05_pending_1761140641404.mp3', gender: 'male', language: 'en' },
    { name: 'Reed', speakerId: 'lowwoman-687103f5', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/lowwoman-687103f5_pending_1761140641403.mp3', gender: 'female', language: 'en' },
    { name: 'Sarah', speakerId: 'middlewoman-3731593b', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/middlewoman-3731593b_pending_1761140641549.mp3', gender: 'female', language: 'en' },
    { name: 'Ashley', speakerId: 'Ashley-f5de473a', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/Ashley-f5de473a_demo_audio.mp3', gender: 'female', language: 'en' },
    { name: 'Leda', speakerId: 'en-us-chirp3-hd-leda-e801b185', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/en-us-chirp3-hd-leda-e801b185_pending_1761140641548.mp3', gender: 'female', language: 'en' },
    { name: 'Mars', speakerId: 'cozy-man-english', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/cozy-man-english_pending_1761140641549.mp3', gender: 'male', language: 'en' },
    { name: 'Catherine', speakerId: 'catherine-fd3c96a2', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/catherine-fd3c96a2_demo_audio.mp3', gender: 'female', language: 'en' },
    { name: 'Arthur', speakerId: 'arthur-2ae006aa', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/arthur-2ae006aa_pending_1761141343203.mp3', gender: 'male', language: 'en' },
    { name: 'Iris', speakerId: 'famalepodcastemmawatsonrp-e0342a5a', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/famalepodcastemmawatsonrp-e0342a5a_demo_audio.mp3', gender: 'female', language: 'en' },
    { name: 'Host Maya', speakerId: 'livefemale2-778526f2', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/livefemale2-778526f2_pending_1761139015044.mp3', gender: 'female', language: 'en' },
    { name: 'Host Sam', speakerId: 'hostsam-dab52696', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/hostsam-dab52696_demo_audio.mp3', gender: 'male', language: 'en' },
    { name: 'Host John', speakerId: 'livemale-576eef6f', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/livemale-576eef6f_pending_1761139015044.mp3', gender: 'male', language: 'en' },
    { name: 'Host Claire', speakerId: 'livefemale-cc42c5bf', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/livefemale-cc42c5bf_pending_1761139015045.mp3', gender: 'female', language: 'en' },
    { name: 'Meditation Nate', speakerId: 'midnightnate-e48a5b5f', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/midnightnate-e48a5b5f_pending_1761139015158.mp3', gender: 'male', language: 'en' },
    { name: 'Meditation Kate', speakerId: 'minight-kate-d4b925d0', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/minight-kate-d4b925d0_pending_1761139015158.mp3', gender: 'female', language: 'en' },
    { name: 'Story Pixie', speakerId: 'storypixie-e70ddb42', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/storypixie-e70ddb42_pending_1761139014676.mp3', gender: 'male', language: 'en' },
    { name: 'Storyteller Finn', speakerId: 'vividstoryteachermale-8a369b48', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/vividstoryteachermale-8a369b48_pending_1761139014849.mp3', gender: 'male', language: 'en' },
    { name: 'Eliot (ASMR)', speakerId: 'ASMR-Male-EN', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/ASMR-Male-EN_pending_1761139015045.mp3', gender: 'male', language: 'en' },
    { name: 'Lily (ASMR)', speakerId: 'English-Whispering-girl-v3', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/English-Whispering-girl-v3_pending_1761139015157.mp3', gender: 'female', language: 'en' },
    { name: 'Charon', speakerId: 'en-us-chirp3-hd-charon-9f952104', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/en-us-chirp3-hd-charon-9f952104_pending_1761139014946.mp3', gender: 'male', language: 'en' },
    { name: 'Orus', speakerId: 'es-es-chirp3-hd-orus-3941b176', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/es-es-chirp3-hd-orus-3941b176_pending_1761140641711.mp3', gender: 'male', language: 'en' },
    { name: 'Noah', speakerId: 'malechrishemsworthpodcastaus-723dad64', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/malechrishemsworthpodcastaus-723dad64_demo_audio.mp3', gender: 'male', language: 'en' },
    { name: 'Michael', speakerId: 'English-Gentle-voiced-man', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/English-Gentle-voiced-man_pending_1761140641403.mp3', gender: 'male', language: 'en' },
    { name: 'Daniel', speakerId: 'Daniel', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/Daniel_pending_1761140641550.mp3', gender: 'male', language: 'en' },
    { name: 'Owen', speakerId: 'English-GentleTeacher', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/English-GentleTeacher_pending_1761140641404.mp3', gender: 'male', language: 'en' },
    { name: 'Olivia', speakerId: 'English-compelling-lady1', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/English-compelling-lady1_pending_1761139014946.mp3', gender: 'female', language: 'en' },
  ],
  ja: [
    { name: 'なぎ', speakerId: 'tianzhongdunzi-5d612542', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/tianzhongdunzi-5d612542_demo_audio.mp3', gender: 'female', language: 'ja' },
    { name: 'そうた', speakerId: '1shenguhaoshivocals-c002bc47', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/1shenguhaoshivocals-c002bc47_demo_audio.mp3', gender: 'male', language: 'ja' },
    { name: 'はると', speakerId: 'riyunanganyin-907ccc94', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/riyunanganyin-907ccc94_demo_audio.mp3', gender: 'male', language: 'ja' },
    { name: 'ゆい', speakerId: '1dinggongyouyinlevocals-092ff4c8', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/1dinggongyouyinlevocals-092ff4c8_demo_audio.mp3', gender: 'female', language: 'ja' },
    { name: 'いおり', speakerId: 'yingjingxiaohong-e248ab9a', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/yingjingxiaohong-e248ab9a_demo_audio.mp3', gender: 'male', language: 'ja' },
    { name: 'まゆみ', speakerId: 'Newsgirl-6be25905', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/Newsgirl-6be25905_demo_audio.mp3', gender: 'female', language: 'ja' },
    { name: 'かいと', speakerId: 'riyunanganyin-0f2be722', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/riyunanganyin-0f2be722_demo_audio.mp3', gender: 'male', language: 'ja' },
    { name: 'あやか', speakerId: 'zaojianshazhi-cd141f8d', demoAudioUrl: 'https://assets.listenhub.ai/listenhub-public-prod/audios/zaojianshazhi-cd141f8d_demo_audio.mp3', gender: 'female', language: 'ja' },
  ],
};

// 生成 TypeScript 代码
function generateSpeakersCode() {
  const allSpeakers = [...speakersData.zh, ...speakersData.en, ...speakersData.ja];
  
  console.log('const PRESET_SPEAKERS: ListenHubSpeaker[] = [');
  
  // 中文
  console.log('  // ===== 中文音色 (28个) =====');
  speakersData.zh.forEach((speaker, index) => {
    const isRecommended = speaker.speakerId === 'CN-Man-Beijing-V2';
    const displayName = isRecommended ? `${speaker.name} (推荐)` : speaker.name;
    console.log(`  {`);
    console.log(`    speakerId: '${speaker.speakerId}',`);
    console.log(`    speakerName: '${displayName}',`);
    console.log(`    language: '${speaker.language}',`);
    console.log(`    gender: '${speaker.gender}',`);
    console.log(`    demoAudioUrl: '${speaker.demoAudioUrl}',`);
    console.log(`  },`);
  });
  
  console.log('');
  console.log('  // ===== 英文音色 (30个) =====');
  speakersData.en.forEach((speaker) => {
    console.log(`  {`);
    console.log(`    speakerId: '${speaker.speakerId}',`);
    console.log(`    speakerName: '${speaker.name}',`);
    console.log(`    language: '${speaker.language}',`);
    console.log(`    gender: '${speaker.gender}',`);
    console.log(`    demoAudioUrl: '${speaker.demoAudioUrl}',`);
    console.log(`  },`);
  });
  
  console.log('');
  console.log('  // ===== 日文音色 (8个) =====');
  speakersData.ja.forEach((speaker) => {
    console.log(`  {`);
    console.log(`    speakerId: '${speaker.speakerId}',`);
    console.log(`    speakerName: '${speaker.name}',`);
    console.log(`    language: '${speaker.language}',`);
    console.log(`    gender: '${speaker.gender}',`);
    console.log(`    demoAudioUrl: '${speaker.demoAudioUrl}',`);
    console.log(`  },`);
  });
  
  console.log('];');
}

generateSpeakersCode();

