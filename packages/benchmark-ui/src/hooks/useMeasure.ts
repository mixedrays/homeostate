import { useEffect, useRef, useState, type RefObject } from 'react';

/** Width of the referenced element, kept current through a ResizeObserver. */
export const useMeasure = <T extends HTMLElement>(): [RefObject<T>, number] => {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
};
