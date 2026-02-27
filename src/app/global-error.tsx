'use client';

import { useEffect } from 'react';
import { RefreshCcw } from 'lucide-react';
import NextTopLoader from 'nextjs-toploader';

// 最小化的全局错误处理组件，不依赖复杂 UI 库，确保在极端情况下也能渲染
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 记录错误到控制台
    console.error('[Global Error]', error);
  }, [error]);

  return (
    <html>
      <body>
        <NextTopLoader color="#6466F1" />
        <div
          style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            fontFamily: 'system-ui, sans-serif',
            backgroundColor: '#f9fafb',
            color: '#111827',
          }}
        >
          <div
            style={{
              maxWidth: '500px',
              textAlign: 'center',
              backgroundColor: 'white',
              padding: '40px',
              borderRadius: '12px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h2
              style={{
                fontSize: '24px',
                fontWeight: 'bold',
                marginBottom: '16px',
              }}
            >
              出了一点小问题
            </h2>
            <p
              style={{
                fontSize: '16px',
                color: '#6b7280',
                marginBottom: '24px',
                lineHeight: '1.5',
              }}
            >
              我们的服务器可能正在进行短暂的维护，或者您的网络连接不稳定。请稍后重试。
            </p>
            <div
              style={{
                backgroundColor: '#f3f4f6',
                padding: '12px',
                borderRadius: '8px',
                marginBottom: '24px',
                textAlign: 'left',
                fontSize: '14px',
                color: '#4b5563',
                overflow: 'auto',
                maxHeight: '100px',
              }}
            >
              Error: {error.message || 'Unknown error'}
              {error.digest && <div style={{ fontSize: '12px', marginTop: '4px', color: '#9ca3af' }}>ID: {error.digest}</div>}
            </div>
            <button
              onClick={() => reset()}
              style={{
                backgroundColor: '#6466F1',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'background-color 0.2s',
              }}
            >
              <RefreshCcw size={18} />
              重试一下
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

