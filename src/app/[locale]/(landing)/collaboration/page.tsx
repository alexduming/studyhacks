'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Share2, Edit3, MessageCircle, Clock, Eye, Plus, Copy, CheckCircle, AlertCircle, UserPlus, Settings } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';

interface Collaborator {
  id: string;
  name: string;
  email: string;
  avatar: string;
  status: 'online' | 'offline' | 'busy';
  role: 'owner' | 'editor' | 'viewer';
  lastSeen: Date;
}

interface SharedNote {
  id: string;
  title: string;
  content: string;
  owner: string;
  collaborators: Collaborator[];
  createdAt: Date;
  lastModified: Date;
  isPublic: boolean;
}

interface CollaborationSession {
  id: string;
  noteId: string;
  participants: Collaborator[];
  isActive: boolean;
  startedAt: Date;
}

const CollaborationApp = () => {
  const [sharedNotes, setSharedNotes] = useState<SharedNote[]>([
    {
      id: '1',
      title: '机器学习基础概念',
      content: '# 机器学习基础概念\n\n## 监督学习\n监督学习是机器学习的一种方法，其中算法从标记的训练数据中学习...',
      owner: '李明',
      collaborators: [
        {
          id: '1',
          name: '李明',
          email: 'liming@example.com',
          avatar: '/avatars/user1.png',
          status: 'online',
          role: 'owner',
          lastSeen: new Date()
        },
        {
          id: '2',
          name: '王芳',
          email: 'wangfang@example.com',
          avatar: '/avatars/user2.png',
          status: 'online',
          role: 'editor',
          lastSeen: new Date()
        }
      ],
      createdAt: new Date(Date.now() - 86400000),
      lastModified: new Date(Date.now() - 3600000),
      isPublic: false
    },
    {
      id: '2',
      title: '数据结构复习笔记',
      content: '# 数据结构复习笔记\n\n## 数组\n数组是一种线性数据结构，存储相同类型的元素...',
      owner: '张伟',
      collaborators: [
        {
          id: '3',
          name: '张伟',
          email: 'zhangwei@example.com',
          avatar: '/avatars/user3.png',
          status: 'offline',
          role: 'owner',
          lastSeen: new Date(Date.now() - 7200000)
        }
      ],
      createdAt: new Date(Date.now() - 172800000),
      lastModified: new Date(Date.now() - 86400000),
      isPublic: true
    }
  ]);

  const [activeSessions, setActiveSessions] = useState<CollaborationSession[]>([
    {
      id: 'session1',
      noteId: '1',
      participants: [
        {
          id: '1',
          name: '李明',
          email: 'liming@example.com',
          avatar: '/avatars/user1.png',
          status: 'online',
          role: 'owner',
          lastSeen: new Date()
        },
        {
          id: '2',
          name: '王芳',
          email: 'wangfang@example.com',
          avatar: '/avatars/user2.png',
          status: 'online',
          role: 'editor',
          lastSeen: new Date()
        }
      ],
      isActive: true,
      startedAt: new Date(Date.now() - 1800000)
    }
  ]);

  const [selectedNote, setSelectedNote] = useState<SharedNote | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [activeTab, setActiveTab] = useState<'notes' | 'sessions' | 'invite'>('notes');
  const [copiedLink, setCopiedLink] = useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'busy': return 'bg-yellow-500';
      case 'offline': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  /**
   * 非程序员解释：
   * - 这里为「拥有者 / 编辑者 / 只读查看者」加上不同的颜色标签。
   * - 为了和 turbo 主站的配色统一，我们只用 primary + 灰色系来区分，
   *   不再单独引入一整套蓝色主色，避免出现“两个品牌色”的感觉。
   */
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner':
        // 产品主色，用 primary 表示“拥有者/管理员”
        return 'text-primary bg-primary/10';
      case 'editor':
        // 编辑者：用更亮一些的 primary 变体，而不是蓝色
        return 'text-primary/80 bg-primary/5';
      case 'viewer':
        return 'text-gray-400 bg-gray-400/10';
      default:
        return 'text-gray-400 bg-gray-400/10';
    }
  };

  const handleInviteCollaborator = () => {
    if (!inviteEmail.trim() || !selectedNote) return;

    const newCollaborator: Collaborator = {
      id: Date.now().toString(),
      name: inviteEmail.split('@')[0],
      email: inviteEmail,
      avatar: '/avatars/default.png',
      status: 'offline',
      role: 'editor',
      lastSeen: new Date()
    };

    setSharedNotes(notes =>
      notes.map(note =>
        note.id === selectedNote.id
          ? { ...note, collaborators: [...note.collaborators, newCollaborator] }
          : note
      )
    );

    setInviteEmail('');
    setShowInviteModal(false);
  };

  const handleCopyShareLink = (noteId: string) => {
    const shareLink = `${window.location.origin}/collaboration/note/${noteId}`;
    navigator.clipboard.writeText(shareLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleJoinSession = (sessionId: string) => {
    // 这里应该加入协作会话的逻辑
    console.log('Joining session:', sessionId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-primary/5 to-gray-950">
      {/* 背景装饰：统一为 primary 色系的柔和光晕，避免单独的蓝色大光斑 */}
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
              {/* 标题渐变从白色过渡到 primary，整体与 Hero 主题保持一致 */}
              <h1 className="bg-gradient-to-r from-white via-primary/80 to-primary/60 bg-clip-text text-4xl font-bold text-transparent md:text-5xl mb-6">
                实时协作学习
              </h1>
              <p className="text-gray-300 text-lg md:text-xl max-w-3xl mx-auto">
                与同学一起学习，实时共享笔记，协同编辑，让学习更有效率
              </p>
            </motion.div>
          </div>
        </ScrollAnimation>

        {/* 功能标签页 */}
        <ScrollAnimation delay={0.2}>
          <div className="max-w-6xl mx-auto mb-8">
            <div className="flex justify-center">
              <div className="inline-flex rounded-lg border border-primary/20 bg-gray-900/50 backdrop-blur-sm p-1">
                {[
                  { id: 'notes', label: '共享笔记', icon: Edit3 },
                  { id: 'sessions', label: '活跃会话', icon: Users },
                  { id: 'invite', label: '邀请协作', icon: UserPlus },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-2 px-6 py-3 rounded-md transition-all duration-300 ${
                        activeTab === tab.id
                          ? // 选中标签统一使用 primary 深浅渐变，不再混用蓝色终点
                            'bg-gradient-to-r from-primary to-primary/70 text-white shadow-lg'
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

        {/* 共享笔记列表 */}
        {activeTab === 'notes' && (
          <ScrollAnimation delay={0.3}>
            <div className="max-w-6xl mx-auto">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sharedNotes.map((note) => (
                  <motion.div
                    key={note.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-primary/20 p-6 hover:border-primary/40 transition-all duration-300"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-white mb-2">{note.title}</h3>
                        <p className="text-gray-400 text-sm">创建者: {note.owner}</p>
                      </div>
                      {note.isPublic && (
                        <div className="bg-green-500/10 text-green-400 px-2 py-1 rounded-full text-xs">
                          公开
                        </div>
                      )}
                    </div>

                    <div className="mb-4">
                      <p className="text-gray-300 text-sm line-clamp-3">
                        {note.content.replace(/[#*]/g, '').substring(0, 150)}...
                      </p>
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <div className="flex -space-x-2">
                        {note.collaborators.slice(0, 3).map((collaborator) => (
                          <div
                            key={collaborator.id}
                            className="relative"
                          >
                            {/* 协作者头像底色：使用 primary 深浅渐变，移除额外蓝色主色 */}
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white text-xs font-medium">
                              {collaborator.name.charAt(0)}
                            </div>
                            <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full ${getStatusColor(collaborator.status)}`} />
                          </div>
                        ))}
                        {note.collaborators.length > 3 && (
                          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 text-xs font-medium">
                            +{note.collaborators.length - 3}
                          </div>
                        )}
                      </div>
                      <div className="text-gray-400 text-xs">
                        {note.collaborators.length} 位协作者
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => setSelectedNote(note)}
                        variant="outline"
                        size="sm"
                        className="flex-1 border-primary/30 text-primary/80 hover:border-primary/50"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        查看详情
                      </Button>
                      <Button
                        onClick={() => handleCopyShareLink(note.id)}
                        variant="outline"
                        size="sm"
                        // 分享按钮也改为 primary 语义色，避免另一套 “purple-500” 直写色板
                        className="border-primary/30 text-primary/80 hover:border-primary/50"
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {copiedLink && (
                      <div className="mt-2 text-green-400 text-xs flex items-center">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        链接已复制
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>

              {sharedNotes.length === 0 && (
                <div className="text-center py-16">
                  <Edit3 className="h-20 w-20 text-gray-600 mx-auto mb-6" />
                  <h3 className="text-xl font-semibold text-white mb-4">还没有共享笔记</h3>
                  <p className="text-gray-400 mb-6">创建您的第一个共享笔记，邀请同学一起协作学习</p>
                  <Button className="bg-gradient-to-r from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80">
                    <Plus className="h-4 w-4 mr-2" />
                    创建共享笔记
                  </Button>
                </div>
              )}
            </div>
          </ScrollAnimation>
        )}

        {/* 活跃会话 */}
        {activeTab === 'sessions' && (
          <ScrollAnimation delay={0.3}>
            <div className="max-w-4xl mx-auto">
              <div className="space-y-4">
                {activeSessions.map((session) => {
                  const note = sharedNotes.find(n => n.id === session.noteId);
                  return (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.5 }}
                      className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-primary/20 p-6"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold text-white mb-2">{note?.title}</h3>
                          <div className="flex items-center gap-4 text-gray-400 text-sm">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              {session.participants.length} 位参与者
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              进行中 {Math.floor((Date.now() - session.startedAt.getTime()) / 60000)} 分钟
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex -space-x-2">
                            {session.participants.map((participant) => (
                              <div
                                key={participant.id}
                                className="relative"
                              >
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white text-sm font-medium">
                                  {participant.name.charAt(0)}
                                </div>
                                <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full ${getStatusColor(participant.status)}`} />
                              </div>
                            ))}
                          </div>
                          <Button
                            onClick={() => handleJoinSession(session.id)}
                            className="bg-gradient-to-r from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80"
                          >
                            加入会话
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {activeSessions.length === 0 && (
                <div className="text-center py-16">
                  <Users className="h-20 w-20 text-gray-600 mx-auto mb-6" />
                  <h3 className="text-xl font-semibold text-white mb-4">暂无活跃会话</h3>
                  <p className="text-gray-400">当有协作者在线编辑笔记时，会话会显示在这里</p>
                </div>
              )}
            </div>
          </ScrollAnimation>
        )}

        {/* 邀请协作 */}
        {activeTab === 'invite' && (
          <ScrollAnimation delay={0.3}>
            <div className="max-w-2xl mx-auto">
              <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-primary/20 p-8">
                <div className="text-center mb-8">
                  <UserPlus className="h-16 w-16 text-primary mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-white mb-2">邀请协作者</h3>
                  <p className="text-gray-400">邀请同学一起编辑和学习笔记</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-white mb-2">选择要分享的笔记</label>
                    <select
                      value={selectedNote?.id || ''}
                      onChange={(e) => setSelectedNote(sharedNotes.find(n => n.id === e.target.value) || null)}
                      className="w-full p-3 bg-gray-800/50 border border-gray-600 rounded-lg text-white focus:border-primary focus:outline-none"
                    >
                      <option value="">请选择笔记</option>
                      {sharedNotes.map((note) => (
                        <option key={note.id} value={note.id}>
                          {note.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-white mb-2">协作者邮箱</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="输入协作者的邮箱地址"
                      className="w-full p-3 bg-gray-800/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-primary focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={handleInviteCollaborator}
                      disabled={!selectedNote || !inviteEmail.trim()}
                      className="flex-1 bg-gradient-to-r from-primary to-primary/70 hover:from-primary/90 hover:to-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      发送邀请
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (selectedNote) {
                          handleCopyShareLink(selectedNote.id);
                        }
                      }}
                      disabled={!selectedNote}
                      className="border-primary/30 text-primary/80 hover:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      复制链接
                    </Button>
                  </div>
                </div>

                {selectedNote && (
                  <div className="mt-8 p-4 bg-gray-800/30 rounded-lg">
                    <h4 className="text-white font-medium mb-3">当前协作者</h4>
                    <div className="space-y-2">
                      {selectedNote.collaborators.map((collaborator) => (
                        <div key={collaborator.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white text-xs font-medium">
                                {collaborator.name.charAt(0)}
                              </div>
                              <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full ${getStatusColor(collaborator.status)}`} />
                            </div>
                            <div>
                              <p className="text-white text-sm">{collaborator.name}</p>
                              <p className="text-gray-400 text-xs">{collaborator.email}</p>
                            </div>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs ${getRoleColor(collaborator.role)}`}>
                            {collaborator.role === 'owner' ? '创建者' : collaborator.role === 'editor' ? '编辑者' : '查看者'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ScrollAnimation>
        )}

        {/* 功能介绍 */}
        <ScrollAnimation delay={0.5}>
          <div className="max-w-6xl mx-auto mt-16">
            <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-primary/20 p-8">
              <h3 className="text-2xl font-bold text-white mb-6 text-center">协作功能特色</h3>
              <div className="grid md:grid-cols-3 gap-6">
                {[
                  {
                    icon: Edit3,
                    title: '实时协同编辑',
                    description: '多人同时编辑同一份笔记，实时同步更改，支持冲突解决'
                  },
                  {
                    icon: MessageCircle,
                    title: '内置聊天功能',
                    description: '在笔记中直接与协作者交流讨论，让学习更加高效'
                  },
                  {
                    icon: Settings,
                    title: '权限管理',
                    description: '灵活的权限控制，支持创建者、编辑者、查看者等不同角色'
                  },
                  {
                    icon: Share2,
                    title: '轻松分享',
                    description: '一键生成分享链接，通过邮箱或链接邀请同学加入协作'
                  },
                  {
                    icon: Clock,
                    title: '版本历史',
                    description: '自动保存所有修改历史，随时查看和恢复之前的版本'
                  },
                  {
                    icon: Users,
                    title: '团队管理',
                    description: '创建学习小组，管理团队成员，追踪参与度和贡献'
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
    </div>
  );
};

export default CollaborationApp;