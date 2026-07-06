import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";

type Image = { uri: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: Image[];
  initialIndex?: number;
  productName: string;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

export function ProductLightbox({
  open,
  onOpenChange,
  images,
  initialIndex = 0,
  productName,
}: Props) {
  const { t } = useLocale();
  const list = images.filter((i) => i.uri);
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    active: boolean;
  } | null>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const swipeRef = useRef<{ startX: number; startY: number; active: boolean } | null>(
    null,
  );

  const safeIndex = Math.min(Math.max(index, 0), Math.max(list.length - 1, 0));
  const current = list[safeIndex];

  const resetView = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (open) {
      setIndex(Math.min(Math.max(initialIndex, 0), Math.max(list.length - 1, 0)));
      resetView();
    }
  }, [open, initialIndex, list.length, resetView]);

  const goPrev = useCallback(() => {
    if (list.length <= 1) return;
    setIndex((i) => (i - 1 + list.length) % list.length);
    resetView();
  }, [list.length, resetView]);

  const goNext = useCallback(() => {
    if (list.length <= 1) return;
    setIndex((i) => (i + 1) % list.length);
    resetView();
  }, [list.length, resetView]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setZoom((z) => {
          const next = Math.max(MIN_ZOOM, z - ZOOM_STEP);
          if (next === MIN_ZOOM) setOffset({ x: 0, y: 0 });
          return next;
        });
      } else if (e.key === "0") {
        e.preventDefault();
        resetView();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goPrev, goNext, resetView]);

  const handleZoomToggle = () => {
    if (zoom === MIN_ZOOM) {
      setZoom(2);
    } else {
      resetView();
    }
  };

  const handleZoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  const handleZoomOut = () =>
    setZoom((z) => {
      const next = Math.max(MIN_ZOOM, z - ZOOM_STEP);
      if (next === MIN_ZOOM) setOffset({ x: 0, y: 0 });
      return next;
    });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom > 1) {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: offset.x,
        originY: offset.y,
        active: true,
      };
    } else {
      swipeRef.current = { startX: e.clientX, startY: e.clientY, active: true };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.active) {
      setOffset({
        x: dragRef.current.originX + (e.clientX - dragRef.current.startX),
        y: dragRef.current.originY + (e.clientY - dragRef.current.startY),
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.active) {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      dragRef.current.active = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
        handleZoomToggle();
      }
      return;
    }
    if (swipeRef.current?.active) {
      const dx = e.clientX - swipeRef.current.startX;
      const dy = e.clientY - swipeRef.current.startY;
      swipeRef.current.active = false;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) goNext();
        else goPrev();
      } else if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
        handleZoomToggle();
      }
    }
  };

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = {
        startDist: Math.hypot(dx, dy),
        startZoom: zoom,
      };
    }
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchRef.current.startDist;
      const next = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, pinchRef.current.startZoom * ratio),
      );
      setZoom(next);
      if (next === MIN_ZOOM) setOffset({ x: 0, y: 0 });
    }
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) pinchRef.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.005;
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta));
      if (next === MIN_ZOOM) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  if (!current) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[70] bg-black/95 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[70] flex flex-col outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">
            {t("lightbox.title", { name: productName, current: safeIndex + 1, total: list.length })}
          </DialogPrimitive.Title>

          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 text-white">
            <div className="text-sm tracking-wide opacity-80" data-testid="lightbox-counter">
              {safeIndex + 1} / {list.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= MIN_ZOOM}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40 flex items-center justify-center transition-colors"
                aria-label={t("product.zoomOut")}
                data-testid="button-lightbox-zoom-out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= MAX_ZOOM}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40 flex items-center justify-center transition-colors"
                aria-label={t("product.zoomIn")}
                data-testid="button-lightbox-zoom-in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <DialogPrimitive.Close
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                aria-label={t("checkout.previewCardClose")}
                data-testid="button-lightbox-close"
              >
                <X className="w-4 h-4" />
              </DialogPrimitive.Close>
            </div>
          </div>

          <div
            className="flex-1 relative overflow-hidden select-none touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onWheel={onWheel}
            data-testid="lightbox-stage"
          >
            <img
              src={current.uri}
              alt={productName}
              draggable={false}
              className={cn(
                "absolute inset-0 m-auto max-h-full max-w-full object-contain transition-transform duration-150 ease-out will-change-transform",
                zoom > 1 ? "cursor-zoom-out" : "cursor-zoom-in",
                dragRef.current?.active && "cursor-grabbing",
              )}
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transitionDuration: dragRef.current?.active ? "0ms" : "150ms",
              }}
            />
          </div>

          {list.length > 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                aria-label={t("product.prevImage")}
                data-testid="button-lightbox-prev"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                aria-label={t("product.nextImage")}
                data-testid="button-lightbox-next"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              <div className="absolute bottom-0 left-0 right-0 p-4 flex justify-center gap-2 overflow-x-auto">
                {list.map((img, i) => (
                  <button
                    key={`${img.uri}-${i}`}
                    type="button"
                    onClick={() => {
                      setIndex(i);
                      resetView();
                    }}
                    className={cn(
                      "shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors",
                      i === safeIndex ? "border-white" : "border-white/20 opacity-60 hover:opacity-100",
                    )}
                    aria-label={t("lightbox.showImage", { n: i + 1 })}
                    data-testid={`lightbox-thumb-${i}`}
                  >
                    <img src={img.uri} alt={`${productName} — image ${i + 1}`} className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
