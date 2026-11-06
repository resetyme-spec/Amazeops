import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

export default function PullToRefresh({ onRefresh, isRefreshing, children }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startYRef = useRef(0);
  const containerRef = useRef(null);

  const PULL_THRESHOLD = 65;
  const MAX_PULL = 110;

  const handleTouchStart = (e) => {
    if (isRefreshing) return;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    if (scrollY <= 2) {
      startYRef.current = e.touches[0].clientY;
      setIsPulling(true);
    } else {
      setIsPulling(false);
    }
  };

  const handleTouchMove = (e) => {
    if (!isPulling || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;

    if (diff > 0 && scrollY <= 2) {
      const distance = Math.min(diff * 0.45, MAX_PULL);
      setPullDistance(distance);
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling || isRefreshing) return;
    setIsPulling(false);

    if (pullDistance >= PULL_THRESHOLD) {
      setPullDistance(52);
      try {
        if (onRefresh) {
          await onRefresh();
        }
      } catch (err) {
        console.error('[PullToRefresh] Refresh failed:', err);
      } finally {
        setTimeout(() => setPullDistance(0), 400);
      }
    } else {
      setPullDistance(0);
    }
  };

  useEffect(() => {
    if (!isRefreshing && pullDistance > 0 && !isPulling) {
      const timer = setTimeout(() => setPullDistance(0), 300);
      return () => clearTimeout(timer);
    }
  }, [isRefreshing, pullDistance, isPulling]);

  const rotation = Math.min((pullDistance / PULL_THRESHOLD) * 360, 360);
  const ready = pullDistance >= PULL_THRESHOLD;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ position: 'relative', minHeight: '100%', WebkitOverflowScrolling: 'touch' }}
    >
      {/* Floating Pull Spinner Indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          style={{
            position: 'fixed',
            top: `calc(env(safe-area-inset-top, 0px) + ${Math.max(16, pullDistance)}px)`,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99999,
            width: 40,
            height: 40,
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.18), 0 1px 4px rgba(0,0,0,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: isPulling ? 'none' : 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            border: ready || isRefreshing ? '2px solid #6366f1' : '1px solid #e2e8f0',
            opacity: Math.min(pullDistance / 25, 1),
          }}
        >
          <RefreshCw
            size={20}
            color={ready || isRefreshing ? '#4f46e5' : '#64748b'}
            className={isRefreshing ? 'spinning' : ''}
            style={{
              transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
              transition: isRefreshing ? undefined : 'transform 0.1s linear',
            }}
          />
        </div>
      )}

      {/* Screen Content with subtle elastic stretch */}
      <div
        style={{
          transform: pullDistance > 0 && isPulling ? `translateY(${pullDistance * 0.35}px)` : undefined,
          transition: isPulling ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
