'use client';

import React, { useEffect, useState } from 'react';
import WhopAppLayout from './WhopAppLayout';

type Props = { children: React.ReactNode };

export function WhopClientWrapper({ children }: Props) {
  const [wrap, setWrap] = useState(false);

  useEffect(() => {
    const inIframe =
      typeof window !== 'undefined' && window.self !== window.top;
    const params = new URLSearchParams(window.location.search);
    const embed = params.get('embed');

    setWrap(inIframe || embed === '1' || embed === 'true');
  }, []);

  if (wrap) {
    return <WhopAppLayout>{children}</WhopAppLayout>;
  }

  return <>{children}</>;
}

export default WhopClientWrapper;