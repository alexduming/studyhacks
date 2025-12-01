'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cloud, Smartphone, Tablet, Monitor, Download, Upload, RefreshCw, CheckCircle, AlertCircle, Wifi, WifiOff, Server, Shield, Settings, Clock, Users } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';

interface SyncDevice {
  id: string;
  name: string;
  type: 'desktop' | 'mobile' | 'tablet';
  platform: string;
  lastSync: Date;
  status: 'online' | 'offline' | 'syncing';
  storage: {
    used: number;
    total: number;
  };
}

interface SyncData {
  notes: number;
  flashcards: number;
  quizzes: number;
  podcasts: number;
  lastBackup?: Date;
}

const SyncApp = () => {
  const [devices, setDevices] = useState<SyncDevice[]>([
    {
      id: '1',
      name: 'MacBook Pro',
      type: 'desktop',
      platform: 'macOS',
      lastSync: new Date(Date.now() - 300000),
      status: 'online',
      storage: {
        used: 256,
        total: 1024
      }
    },
    {
      id: '2',
      name: 'iPhone 14 Pro',
      type: 'mobile',
      platform: 'iOS',
      lastSync: new Date(Date.now() - 1800000),
      status: 'online',
      storage: {
        used: 128,
        total: 512
      }
    },
    {
      id: '3',
      name: 'iPad Air',
      type: 'tablet',
      platform: 'iPadOS',
      lastSync: new Date(Date.now() - 7200000),
      status: 'offline',
      storage: {
        used: 200,
        total: 512
      }
    }
  ]);

  const [syncData, setSyncData] = useState<SyncData>({
    notes: 156,
    flashcards: 89,
    quizzes: 23,
    podcasts: 12,
    lastBackup: new Date(Date.now() - 86400000)
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<'devices' | 'data' | 'settings'>('devices');
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [wifiOnly, setWifiOnly] = useState(true);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'desktop': return Monitor;
      case 'mobile': return Smartphone;
      case 'tablet': return Tablet;
      default: return Monitor;
    }
  };

  /**
   * 非程序员解释：
   * - 这个函数只是负责“给不同状态贴不同颜色的小标签”，不影响业务逻辑。
   * - 为了和全站 turbo 主题统一，我们用 primary 表示“同步中”，不用单独的蓝色主色。
   */
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'text-green-400 bg-green-400/10';
      case 'syncing':
        return 'text-primary/80 bg-primary/10';
      case 'offline':
        return 'text-gray-400 bg-gray-400/10';
      default:
        return 'text-gray-400 bg-gray-400/10';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online': return '在线';
      case 'syncing': return '同步中';
      case 'offline': return '离线';
      default: return '未知';
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncProgress(0);

    // 模拟同步过程
    const syncInterval = setInterval(() => {
      setSyncProgress(prev => {
        if (prev >= 100) {
          clearInterval(syncInterval);
          setIsSyncing(false);
          setNotificationMessage('所有设备已成功同步');
          setShowNotification(true);
          setTimeout(() => setShowNotification(false), 3000);
          return 100;
        }
        return prev + Math.random() * 20;
      });
    }, 500);

    // 更新设备状态
    setDevices(prevDevices =>
      prevDevices.map(device => ({
        ...device,
        status: Math.random() > 0.3 ? 'syncing' : device.status,
        lastSync: new Date()
      }))
    );

    setTimeout(() => {
      setDevices(prevDevices =>
        prevDevices.map(device => ({
          ...device,
          status: 'online',
          lastSync: new Date()
        }))
      );
    }, 3000);
  };

  const handleBackup = () => {
    setNotificationMessage('数据备份已开始，完成后将通知您');
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return '刚刚';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
    return `${Math.floor(seconds / 86400)} 天前`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-primary/5 to-gray-950">
      {/* 背景装饰：统一为 primary 色系的柔和光晕，避免单独蓝色光斑抢主色 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-12">
        <ScrollAnimation>
          <div className="text-center mb-12">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              {/* 标题渐变：从白色平滑过渡到 primary，和首页 Hero 的主色气质一致 */}
              <h1 className="bg-gradient-to-r from-white via-primary/80 to-primary/60 bg-clip-text text-4xl font-bold text-transparent md:text-5xl mb-6">
                跨平台同步
              </h1>
              <p className="text-gray-300 text-lg md:text-xl max-w-3xl mx-auto">
                在任何设备上无缝访问您的学习资料，实时同步，随时随地学习
              </p>
            </motion.div>
          </div>
        </ScrollAnimation>

        {/* 功能标签页 */}
        <ScrollAnimation delay={0.2}>
          <div className="max-w-4xl mx-auto mb-8">
            <div className="flex justify-center">
              <div className="inline-flex rounded-lg border border-primary/20 bg-gray-900/50 backdrop-blur-sm p-1">
                {[
                  { id: 'devices', label: '设备管理', icon: Smartphone },
                  { id: 'data', label: '同步数据', icon: Cloud },
                  { id: 'settings', label: '同步设置', icon: Settings },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-2 px-6 py-3 rounded-md transition-all duration-300 ${
                        activeTab === tab.id
                          ? 'bg-gradient-to-r from-primary to-primary/70 text-white shadow-lg'
                          : 'text-gray-400 hover:text-white hover:bg-primary/10'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </ScrollAnimation>

        {/* 设备管理 */}
        {activeTab === 'devices' && (
          <ScrollAnimation delay={0.3}>
            <div className="max-w-6xl mx-auto">
              <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-primary/20 p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-bold text-white mb-2">已连接设备</h3>
                    <p className="text-gray-400">管理您的所有学习设备和同步设置</p>
                  </div>
                  <Button
                    onClick={handleManualSync}
                    disabled={isSyncing}
                    className="bg-gradient-to-r from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80 disabled:opacity-50"
                  >
                    {isSyncing ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        同步中...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        手动同步
                      </>
                    )}
                  </Button>
                </div>

                {isSyncing && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
                      <span>同步进度</span>
                      <span>{Math.round(syncProgress)}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <motion.div
                        className="bg-gradient-to-r from-primary to-primary/70 h-2 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${syncProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {devices.map((device) => {
                    const Icon = getDeviceIcon(device.type);
                    return (
                      <motion.div
                        key={device.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="bg-gray-800/50 rounded-xl border border-gray-700 p-6"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-primary to-primary/70 rounded-xl flex items-center justify-center">
                              <Icon className="h-6 w-6 text-white" />
                            </div>
                            <div>
                              <h4 className="text-white font-medium">{device.name}</h4>
                              <p className="text-gray-400 text-sm">{device.platform}</p>
                            </div>
                          </div>
                          <div className={`px-2 py-1 rounded-full text-xs ${getStatusColor(device.status)}`}>
                            {getStatusText(device.status)}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">最后同步</span>
                            <span className="text-white">{formatTimeAgo(device.lastSync)}</span>
                          </div>

                          <div>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-gray-400">存储空间</span>
                              <span className="text-white">{formatBytes(device.storage.used)}/{formatBytes(device.storage.total)}</span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-2">
                              <div
                                className="bg-gradient-to-r from-primary to-primary/70 h-2 rounded-full"
                                style={{ width: `${(device.storage.used / device.storage.total) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 mt-4">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 border-primary/30 text-primary/80 hover:border-primary/50"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            拉取
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 border-primary/30 text-primary/80 hover:border-primary/50"
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            推送
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                <div className="mt-8 flex justify-center">
                  <Button variant="outline" className="border-primary/30 text-primary/80 hover:border-primary/50">
                    <Plus className="h-4 w-4 mr-2" />
                    添加新设备
                  </Button>
                </div>
              </div>
            </div>
          </ScrollAnimation>
        )}

        {/* 同步数据 */}
        {activeTab === 'data' && (
          <ScrollAnimation delay={0.3}>
            <div className="max-w-4xl mx-auto">
              <div className="grid md:grid-cols-2 gap-6">
                {/* 数据统计 */}
                <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-primary/20 p-8">
                  <h3 className="text-xl font-bold text-white mb-6">数据概览</h3>

                  <div className="space-y-4">
                    {[
                      { label: '笔记', count: syncData.notes, icon: '📝', color: 'text-primary' },
                      // 闪卡数量同样使用 primary，避免“部分蓝、部分紫”的割裂感
                      { label: '闪卡', count: syncData.flashcards, icon: '🗂️', color: 'text-primary' },
                      { label: '测验', count: syncData.quizzes, icon: '📋', color: 'text-green-400' },
                      { label: '播客', count: syncData.podcasts, icon: '🎧', color: 'text-yellow-400' }
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{item.icon}</span>
                          <span className="text-gray-300">{item.label}</span>
                        </div>
                        <span className={`text-2xl font-bold ${item.color}`}>{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 备份信息 */}
                <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-primary/20 p-8">
                  <h3 className="text-xl font-bold text-white mb-6">备份与恢复</h3>

                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Cloud className="h-5 w-5 text-primary" />
                        <div>
                          <p className="text-white font-medium">自动备份</p>
                          <p className="text-gray-400 text-sm">上次备份: {syncData.lastBackup ? formatTimeAgo(syncData.lastBackup) : '从未备份'}</p>
                        </div>
                      </div>
                      <CheckCircle className="h-5 w-5 text-green-400" />
                    </div>

                    <div className="p-4 bg-gray-800/50 rounded-lg">
                      <div className="flex items-center gap-3 mb-3">
                        <Server className="h-5 w-5 text-primary" />
                        <p className="text-white font-medium">云存储状态</p>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">已使用空间</span>
                          <span className="text-white">2.3 GB / 10 GB</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div className="bg-gradient-to-r from-primary to-primary/70 h-2 rounded-full" style={{ width: '23%' }} />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        onClick={handleBackup}
                        className="flex-1 bg-gradient-to-r from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        立即备份
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 border-primary/30 text-primary/80 hover:border-primary/50"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        恢复数据
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 同步历史 */}
              <div className="mt-8 bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-primary/20 p-8">
                <h3 className="text-xl font-bold text-white mb-6">同步历史</h3>

                <div className="space-y-3">
                  {[
                    { time: '5 分钟前', action: '自动同步', device: 'iPhone 14 Pro', status: 'success' },
                    { time: '1 小时前', action: '手动同步', device: 'MacBook Pro', status: 'success' },
                    { time: '3 小时前', action: '自动同步', device: 'iPad Air', status: 'partial' },
                    { time: '昨天', action: '完全备份', device: '所有设备', status: 'success' }
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className={`w-2 h-2 rounded-full ${
                          item.status === 'success' ? 'bg-green-400' :
                          item.status === 'partial' ? 'bg-yellow-400' : 'bg-red-400'
                        }`} />
                        <div>
                          <p className="text-white font-medium">{item.action}</p>
                          <p className="text-gray-400 text-sm">{item.device} • {item.time}</p>
                        </div>
                      </div>
                      <span className={`text-sm ${
                        item.status === 'success' ? 'text-green-400' :
                        item.status === 'partial' ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {item.status === 'success' ? '成功' :
                         item.status === 'partial' ? '部分成功' : '失败'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollAnimation>
        )}

        {/* 同步设置 */}
        {activeTab === 'settings' && (
          <ScrollAnimation delay={0.3}>
            <div className="max-w-4xl mx-auto">
              <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-primary/20 p-8">
                <h3 className="text-2xl font-bold text-white mb-6">同步设置</h3>

                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <RefreshCw className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-white font-medium">自动同步</p>
                        <p className="text-gray-400 text-sm">在有网络连接时自动同步数据</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        autoSyncEnabled ? 'bg-primary' : 'bg-gray-600'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        autoSyncEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Wifi className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-white font-medium">仅在 Wi-Fi 下同步</p>
                        <p className="text-gray-400 text-sm">避免使用移动数据进行同步</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setWifiOnly(!wifiOnly)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        wifiOnly ? 'bg-primary' : 'bg-gray-600'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        wifiOnly ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5 text-green-400" />
                      <div>
                        <p className="text-white font-medium">端到端加密</p>
                        <p className="text-gray-400 text-sm">您的数据在传输过程中始终加密</p>
                      </div>
                    </div>
                    <CheckCircle className="h-5 w-5 text-green-400" />
                  </div>

                  <div className="p-4 bg-gray-800/50 rounded-lg">
                    <div className="flex items-center gap-3 mb-3">
                      <Clock className="h-5 w-5 text-yellow-400" />
                      <p className="text-white font-medium">同步频率</p>
                    </div>
                    <select className="w-full p-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:border-primary focus:outline-none">
                      <option>实时同步</option>
                      <option>每 5 分钟</option>
                      <option>每 15 分钟</option>
                      <option>每 30 分钟</option>
                      <option>每小时</option>
                      <option>手动同步</option>
                    </select>
                  </div>
                </div>

                <div className="mt-8 flex justify-center">
                  <Button className="bg-gradient-to-r from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80">
                    保存设置
                  </Button>
                </div>
              </div>
            </div>
          </ScrollAnimation>
        )}

        {/* 功能特色 */}
        <ScrollAnimation delay={0.5}>
          <div className="max-w-6xl mx-auto mt-16">
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-primary/20 p-8">
              <h3 className="text-2xl font-bold text-white mb-6 text-center">同步功能特色</h3>
              <div className="grid md:grid-cols-3 gap-6">
                {[
                  {
                    icon: Cloud,
                    title: '云端存储',
                    description: '所有数据安全存储在云端，支持多设备访问'
                  },
                  {
                    icon: RefreshCw,
                    title: '实时同步',
                    description: '修改即时同步，确保所有设备数据一致'
                  },
                  {
                    icon: Shield,
                    title: '安全保障',
                    description: '端到端加密，保护您的学习隐私和数据安全'
                  },
                  {
                    icon: Wifi,
                    title: '离线访问',
                    description: '支持离线查看和编辑，联网后自动同步'
                  },
                  {
                    icon: Server,
                    title: '智能备份',
                    description: '自动备份重要数据，防止意外丢失'
                  },
                  {
                    icon: Users,
                    title: '协作同步',
                    description: '共享内容的变更会实时同步给所有协作者'
                  }
                ].map((feature, idx) => {
                  const Icon = feature.icon;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: idx * 0.1 }}
                      className="text-center"
                    >
                      <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/70 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Icon className="h-8 w-8 text-white" />
                      </div>
                      <h4 className="text-lg font-semibold text-white mb-2">{feature.title}</h4>
                      <p className="text-gray-400 text-sm">{feature.description}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </ScrollAnimation>
      </div>

      {/* 通知提示 */}
      <AnimatePresence>
        {showNotification && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 right-8 bg-gray-900/90 backdrop-blur-sm border border-primary/30 rounded-lg p-4 flex items-center gap-3 z-50"
          >
            <CheckCircle className="h-5 w-5 text-green-400" />
            <span className="text-white">{notificationMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SyncApp;