'use client';

import React, { useEffect, useState } from 'react';

type Props = { children: React.ReactNode };

export function WhopAppLayout({ children }: Props) {
  const [isIframe, setIsIframe] = useState(false);

  useEffect(() => {
    const inIframe =
      typeof window !== 'undefined' && window.self !== window.top;

    setIsIframe(inIframe);

    if (!inIframe) return;

    try {
      document.documentElement.style.background = '#09090b';
      document.body.style.background = '#09090b';
      document.body.style.overflow = 'auto';
    } catch {}

    const postSize = () => {
      try {
        const height = document.body.scrollHeight;
        window.parent.postMessage(
          { type: 'whop:app:height', height },
          '*'
        );
      } catch {}
    };

    postSize();

    const ro = new ResizeObserver(() => postSize());
    ro.observe(document.body);
    window.addEventListener('load', postSize);

    return () => {
      try {
        ro.disconnect();
        window.removeEventListener('load', postSize);
      } catch {}
    };
  }, []);

  return (
    <div
      data-whop-app
      className={isIframe ? 'p-0 max-w-full' : 'p-4 sm:p-6 lg:p-8'}
      style={{
        minHeight: '100vh',
        background: '#09090b',
        backgroundColor: '#09090b',
        color: 'inherit',
      }}
    >
      {children}
    </div>
  );
}

export default WhopAppLayout;
