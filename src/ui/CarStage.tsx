import { useEffect, useRef, type CSSProperties } from 'react';
import { CarViewer, type Paint } from '../garage/carViewer';

/** React wrapper for the three.js garage car. three.js is loaded lazily on first mount. */
export function CarStage({ paint, style }: { paint: Paint; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const viewer = useRef<CarViewer | null>(null);
  const first = useRef(paint);

  useEffect(() => {
    const v = new CarViewer(ref.current!, first.current);
    viewer.current = v;
    return () => { v.dispose(); viewer.current = null; };
  }, []);

  useEffect(() => { viewer.current?.setPaint(paint); }, [paint.color, paint.dark, paint.accent, paint.livery]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={ref} aria-label="3D car preview, drag to spin" role="img" style={{ position: 'absolute', touchAction: 'pan-y', ...style }} />;
}
