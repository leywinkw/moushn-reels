'use client';

import { useEffect } from 'react';
import { startController, type ControllerData } from '@/lib/client/controller';
import type { Timeline } from '@/lib/timeline';

/** Единственный клиентский компонент: разметка сцен не гидрируется, контроллер берёт её из DOM. */
export default function Boot({ tl, data }: { tl: Timeline; data: Omit<ControllerData, 'tl'> }) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.exp');
    if (!root) return;
    return startController(root, { tl, ...data });
  }, [tl, data]);
  return null;
}
