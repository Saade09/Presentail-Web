import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from "react-native";
import { AppText } from "@/components/AppText";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/hooks/useT";

// Singleton: only one tooltip may be open at a time.
let _currentClose: (() => void) | null = null;

const TEAL = "#0F766E";
const POPOVER_PADDING = 12;
const POINTER_SIZE = 8;
/**
 * Maximum popover width. Kept narrow (200 pt) so the text wraps to ~2 lines
 * and the popup stays comfortably within the card on any mobile screen width.
 */
const MAX_POPOVER_WIDTH = 200;
/** Minimum gap between the popover edge and the screen/viewport edge. */
const SCREEN_MARGIN = 8;

type Props = {
  /** Called once when the popover transitions closed → open. */
  onOpen?: () => void;
  /** Called every time open state changes, so the parent can show a spacer. */
  onOpenChange?: (open: boolean) => void;
  /**
   * Ref to the PhoneField outer container. Used ONLY to read its width via
   * measureInWindow as a secondary width source when containerWidth is 0.
   * Left-position is never derived from this ref — see positioning notes below.
   */
  containerRef?: React.RefObject<View | null>;
  /**
   * Width of the PhoneField container from onLayout in PhoneField. This is the
   * primary source for popover width — onLayout is synchronous and reliable on
   * every platform including Expo Web, unlike measureInWindow which can return
   * stale or zero values.
   */
  containerWidth?: number;
};

export function PhoneInfoTooltip({
  onOpen,
  onOpenChange,
  containerRef,
  containerWidth,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [popoverTop, setPopoverTop] = useState(0);
  const [popoverLeft, setPopoverLeft] = useState(0);
  const [popoverWidth, setPopoverWidth] = useState(0);
  const [pointerLeft, setPointerLeft] = useState(0);
  const triggerRef = useRef<View>(null);
  const colors = useColors();
  const t = useT();
  const { isRTL } = useLanguage();
  const { width: screenWidth } = useWindowDimensions();

  const close = useCallback(() => {
    setVisible(false);
    onOpenChange?.(false);
    if (_currentClose === closeRef.current) {
      _currentClose = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onOpenChange]);

  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    return () => {
      if (_currentClose === closeRef.current) {
        _currentClose = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePress = () => {
    if (visible) {
      close();
      return;
    }
    if (_currentClose) _currentClose();
    _currentClose = closeRef.current;

    triggerRef.current?.measureInWindow((ix, iy, iw, ih) => {
      const iconCenterX = ix + iw / 2;

      // ── Width ──────────────────────────────────────────────────────────────
      // Prefer the onLayout value (always correct); fall back to a secondary
      // measureInWindow on the container ref, then to a screen-relative value.
      const resolveWidth = (secondaryWidth: number) => {
        const base =
          (containerWidth && containerWidth > 0) ? containerWidth :
          (secondaryWidth > 0)                  ? secondaryWidth :
          screenWidth - SCREEN_MARGIN * 2;
        return Math.min(base, MAX_POPOVER_WIDTH);
      };

      // ── Left position ──────────────────────────────────────────────────────
      // Anchor the popup's RIGHT edge near the icon (icon at ~right-20% of
      // popup), so it extends leftward and stays within the card on narrow
      // screens. Hard-clamp to [SCREEN_MARGIN, screenWidth-pw-SCREEN_MARGIN]
      // as the final safety net so it can never overflow on either side.
      // We deliberately do NOT use containerRef.measureInWindow for the left
      // edge: on some platforms it returns the icon's own x, turning it into
      // a minLeft that pins the popup right of the icon and causes overflow.
      const resolveLeft = (pw: number) => {
        // Place right edge of popup ~20 px right of icon center.
        const ideal = iconCenterX - pw + 20;
        return Math.max(SCREEN_MARGIN, Math.min(ideal, screenWidth - pw - SCREEN_MARGIN));
      };

      // ── Pointer ────────────────────────────────────────────────────────────
      // Always computed from the measured icon center so it tracks the trigger
      // correctly in both LTR and RTL.
      const resolvePointer = (pl: number, pw: number) => {
        const raw = iconCenterX - pl - POINTER_SIZE;
        return Math.min(Math.max(raw, 8), pw - POINTER_SIZE * 2 - 8);
      };

      const commit = (secondaryWidth: number) => {
        const pw = resolveWidth(secondaryWidth);
        const pl = resolveLeft(pw);
        const ptr = resolvePointer(pl, pw);
        setPopoverTop(iy + ih + POINTER_SIZE + 2);
        setPopoverLeft(pl);
        setPopoverWidth(pw);
        setPointerLeft(ptr);
        setVisible(true);
        onOpenChange?.(true);
        onOpen?.();
      };

      // Try to get a secondary width from the container ref.
      if (containerRef?.current) {
        containerRef.current.measureInWindow((_cx, _cy, cw) => commit(cw));
      } else {
        commit(0);
      }
    });
  };

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={t.phoneInfoTooltipA11yLabel}
        accessibilityState={{ expanded: visible }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Feather name="info" size={14} color={colors.mutedForeground} />
      </Pressable>

      {visible ? (
        <Modal
          transparent
          animationType="none"
          visible={visible}
          onRequestClose={close}
          statusBarTranslucent
        >
          <TouchableWithoutFeedback onPress={close}>
            <View style={StyleSheet.absoluteFill}>
              <Pressable
                onPress={() => { /* absorb tap, keep open */ }}
                style={[
                  styles.popover,
                  { top: popoverTop, left: popoverLeft, width: popoverWidth },
                ]}
              >
                <View style={[styles.pointer, { left: pointerLeft }]} />
                <AppText
                  style={{
                    color: "#fff",
                    fontSize: 13,
                    lineHeight: 19,
                    textAlign: isRTL ? "right" : "left",
                  }}
                >
                  {t.phoneInfoTooltipBody}
                </AppText>
              </Pressable>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  popover: {
    position: "absolute",
    backgroundColor: TEAL,
    borderRadius: 10,
    padding: POPOVER_PADDING,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 6,
  },
  pointer: {
    position: "absolute",
    top: -POINTER_SIZE,
    width: 0,
    height: 0,
    borderLeftWidth: POINTER_SIZE,
    borderRightWidth: POINTER_SIZE,
    borderBottomWidth: POINTER_SIZE,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: TEAL,
  },
});
