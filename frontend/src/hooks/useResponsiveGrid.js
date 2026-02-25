import { useState, useEffect, useRef } from 'react';

/**
 * Computes responsive column count based on container width.
 * @param {number} minItemWidth - Minimum width per item (default: 320)
 * @param {Array} deps - Additional dependencies to trigger recalculation
 * @returns {{ gridRef: React.RefObject, gridCols: number }}
 */
export function useResponsiveGrid(minItemWidth = 320, deps = []) {
  const gridRef = useRef(null);
  const [gridCols, setGridCols] = useState(3);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const calcCols = () => {
      const parent = el.parentElement;
      const width = (parent?.getBoundingClientRect()?.width)
        ?? (el.getBoundingClientRect()?.width)
        ?? el.clientWidth
        ?? 0;
      const cols = Math.max(1, Math.floor(width / minItemWidth));
      setGridCols(cols);
    };

    // Initial calculation
    calcCols();

    const ro = new ResizeObserver(() => {
      calcCols();
    });
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener('resize', calcCols);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', calcCols);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minItemWidth, ...deps]);

  return { gridRef, gridCols };
}
