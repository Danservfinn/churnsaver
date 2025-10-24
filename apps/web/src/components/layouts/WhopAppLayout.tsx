'use client';

import React, { useEffect } from 'react';

type Props = { children: React.ReactNode };

export function WhopAppLayout({ children }: Props) {
  useEffect(() => {
    const inIframe =
      typeof window !== 'undefined' && window.self !== window.top;

    if (!inIframe) return;

    try {
      document.documentElement.style.background = 'transparent';
      document.body.style.background = 'transparent';
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
      style={{
        minHeight: '100vh',
        backgroundColor: 'transparent',
        color: 'inherit',
      }}
    >
      {children}
    </div>
  );
}

export default WhopAppLayout;