'use client';

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';

import { getAuthClient, useSession } from '@/core/auth/client';
import { useRouter } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { User } from '@/shared/models/user';

export interface ContextValue {
  user: User | null;
  isCheckSign: boolean;
  isShowSignModal: boolean;
  setIsShowSignModal: (show: boolean) => void;
  isShowPaymentModal: boolean;
  setIsShowPaymentModal: (show: boolean) => void;
  configs: Record<string, string>;
  fetchUserCredits: () => Promise<void>;
  fetchUserInfo: () => Promise<void>;
}

const AppContext = createContext({} as ContextValue);

export const useAppContext = () => useContext(AppContext);

export const AppContextProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const [configs, setConfigs] = useState<Record<string, string>>({});

  // sign user
  const [user, setUser] = useState<User | null>(null);

  // session
  const { data: session, isPending } = useSession();

  // is check sign (true during SSR and initial render to avoid hydration mismatch when auth is enabled)
  const [isCheckSign, setIsCheckSign] = useState(!!envConfigs.auth_secret);

  // show sign modal
  const [isShowSignModal, setIsShowSignModal] = useState(false);

  // show payment modal
  const [isShowPaymentModal, setIsShowPaymentModal] = useState(false);

  const fetchConfigs = async function () {
    try {
      // 添加超时控制：如果5秒内没有响应，直接放弃（避免页面卡死）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const resp = await fetch('/api/config/get-configs', {
        method: 'POST',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        throw new Error(`fetch failed with status: ${resp.status}`);
      }
      const { code, message, data } = await resp.json();
      if (code !== 0) {
        throw new Error(message);
      }

      setConfigs(data);
    } catch (e) {
      // 静默处理错误：配置获取失败不影响页面正常显示
      // 页面会使用环境变量中的默认配置
      if ((e as Error).name !== 'AbortError') {
        console.warn('[AppContext] 获取配置失败，使用默认配置:', e);
      }
      // 即使失败也设置空对象，避免后续逻辑出错
      setConfigs({});
    }
  };

  const fetchUserCredits = useCallback(async function () {
    try {
      if (!user) {
        return;
      }

      const resp = await fetch('/api/user/get-user-credits', {
        method: 'POST',
      });
      if (!resp.ok) {
        throw new Error(`fetch failed with status: ${resp.status}`);
      }
      const { code, message, data } = await resp.json();
      if (code !== 0) {
        throw new Error(message);
      }

      // 只有当积分真的发生变化时才更新 user 状态
      // 避免因为引用变化导致 useEffect 死循环
      if (JSON.stringify(user.credits) !== JSON.stringify(data)) {
         setUser(prev => prev ? { ...prev, credits: data } : null);
      }

    } catch (e) {
      console.log('fetch user credits failed:', e);
    }
  }, [user?.id]); // 只在 userId 变化时重新生成函数，或者在 user 为空时。注意不要依赖 user 整个对象，否则会死循环。

  const fetchUserInfo = async function () {
    try {
      const resp = await fetch('/api/user/get-user-info', {
        method: 'POST',
      });
      if (!resp.ok) {
        throw new Error(`fetch failed with status: ${resp.status}`);
      }
      const { code, message, data } = await resp.json();
      if (code !== 0) {
        throw new Error(message);
      }

      setUser(data);
    } catch (e) {
      console.log('fetch user info failed:', e);
    }
  };

  const showOneTap = async function (configs: Record<string, string>) {
    try {
      const authClient = getAuthClient(configs);
      await authClient.oneTap({
        callbackURL: '/',
        onPromptNotification: (notification: any) => {
          // Handle prompt dismissal silently
          // This callback is triggered when the prompt is dismissed or skipped
          console.log('One Tap prompt notification:', notification);
        },
        // fetchOptions: {
        //   onSuccess: () => {
        //     router.push('/');
        //   },
        // },
      });
    } catch (error) {
      // Silently handle One Tap cancellation errors
      // These errors occur when users close the prompt or decline to sign in
      // Common errors: FedCM NetworkError, AbortError, etc.
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  useEffect(() => {
    if (session && session.user) {
      // 只有当 session.user.id 和当前 user.id 不一致时才更新
      // 或者 user 为空时更新
      if (!user || user.id !== session.user.id) {
         setUser(session.user as User);
         fetchUserInfo();
      }
    } else {
      setUser(null);
    }
  }, [session, user?.id]); // 依赖 session 和 user.id

  useEffect(() => {
    if (
      configs &&
      configs.google_client_id &&
      configs.google_one_tap_enabled === 'true' &&
      !session &&
      !isPending
    ) {
      showOneTap(configs);
    }
  }, [configs, session, isPending]);

  // Removed the problematic useEffect that was triggering infinite loops
  // useEffect(() => {
  //   if (user && !user.credits) {
  //     // fetchUserCredits();
  //   }
  // }, [user]);

  useEffect(() => {
    setIsCheckSign(isPending);
  }, [isPending]);

  return (
    <AppContext.Provider
      value={{
        user,
        isCheckSign,
        isShowSignModal,
        setIsShowSignModal,
        isShowPaymentModal,
        setIsShowPaymentModal,
        configs,
        fetchUserCredits,
        fetchUserInfo,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
