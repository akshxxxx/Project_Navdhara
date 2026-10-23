import React, { useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View } from 'react-native';
import GorhomBottomSheet, {
  type BottomSheetProps as GorhomProps,
} from '@gorhom/bottom-sheet';
import { colors, radii, shadows } from '../design/tokens';

interface BottomSheetProps {
  children: React.ReactNode;
  /** Initial snap index (0=peek, 1=half, 2=full). Default 0. */
  initialIndex?: number;
  onChange?: (index: number) => void;
}

export interface BottomSheetRef {
  snapToIndex: (index: number) => void;
  close: () => void;
}

/**
 * BottomSheet wrapper around @gorhom/bottom-sheet.
 * Three snap points: peek (~168dp), half, full.
 * 16px radius top corners, "sheet" shadow from tokens.
 */
export const BottomSheet = forwardRef<BottomSheetRef, BottomSheetProps>(
  function BottomSheet({ children, initialIndex = 0, onChange }, ref) {
    const sheetRef = useRef<GorhomBottomSheet>(null);

    const snapPoints = useMemo(() => [168, '50%', '90%'], []);

    useImperativeHandle(ref, () => ({
      snapToIndex: (index: number) => sheetRef.current?.snapToIndex(index),
      close: () => sheetRef.current?.close(),
    }));

    const handleSheetChange = useCallback(
      (index: number) => {
        onChange?.(index);
      },
      [onChange],
    );

    return (
      <GorhomBottomSheet
        ref={sheetRef}
        index={initialIndex}
        snapPoints={snapPoints}
        onChange={handleSheetChange}
        handleIndicatorStyle={styles.handle}
        backgroundStyle={styles.background}
        style={styles.sheet}
      >
        <View style={styles.content}>{children}</View>
      </GorhomBottomSheet>
    );
  },
);

const styles = StyleSheet.create({
  sheet: {
    ...shadows.sheet,
  },
  background: {
    backgroundColor: colors.snow,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  handle: {
    backgroundColor: colors.mist,
    width: 32,
    height: 4,
    borderRadius: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
});
