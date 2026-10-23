import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Svg, {
  Rect,
  Defs,
  Pattern,
  Line,
  G,
  Text as SvgText,
} from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { riskColourFor, nightRisk, nightRiskClosed, colors, radii, severeHatch } from '../design/tokens';
import type { Segment } from '../api/types';
import type { Town } from '../data/towns';

interface RoadStripProps {
  segments: Segment[];
  towns: Town[];
  orientation?: 'horizontal' | 'vertical';
  /** km range to highlight (dim everything outside) */
  range?: { start: number; end: number };
  selectedId?: string | null;
  youAreAt?: number; // km
  onSelect?: (segmentId: string) => void;
  night?: boolean;
  width?: number;
  height?: number;
}

/** The strip has already animated this session – skip on subsequent mounts */
let hasAnimatedThisSession = false;

/**
 * RoadStrip – the signature component.
 * NH-7 drawn as a single line from Rishikesh to Joshimath, split into
 * stretches coloured by risk, with towns as ticks.
 *
 * Blocks are proportional to km with 1px gap and 2px radius.
 * Severe and Closed blocks get a diagonal hatch using an SVG Pattern.
 * Town ticks with Condensed 12px labels.
 * Dimmed outside "range".
 * 700ms strip-draw animation (once per session, skipped if reduce-motion).
 */
export function RoadStrip({
  segments,
  towns,
  orientation = 'horizontal',
  range,
  selectedId,
  youAreAt,
  onSelect,
  night: isNight = false,
  width: propWidth,
  height: propHeight,
}: RoadStripProps) {
  const { i18n } = useTranslation();
  const isHindi = i18n.language === 'hi';
  const isHorizontal = orientation === 'horizontal';
  const [reduceMotion, setReduceMotion] = React.useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      setReduceMotion(enabled);
    });
  }, []);

  const totalKm = segments.reduce(
    (max, s) => Math.max(max, s.km_end),
    0,
  );
  const startKm = segments.reduce(
    (min, s) => Math.min(min, s.km_start),
    Infinity,
  );

  const stripWidth = propWidth ?? (isHorizontal ? 340 : 12);
  const stripHeight = propHeight ?? (isHorizontal ? 60 : 400);
  const blockThickness = isHorizontal ? 14 : 12;
  const gap = 1;
  const blockRadius = radii.xs;
  const labelOffset = isHorizontal ? 30 : 24;

  const svgWidth = isHorizontal ? stripWidth : blockThickness + labelOffset + 80;
  const svgHeight = isHorizontal ? blockThickness + labelOffset + 14 : stripHeight;

  const animProgress = useSharedValue(
    hasAnimatedThisSession || reduceMotion ? 1 : 0,
  );

  useEffect(() => {
    if (!hasAnimatedThisSession && !reduceMotion) {
      animProgress.value = withTiming(1, {
        duration: 700,
        easing: Easing.out(Easing.cubic),
      });
      hasAnimatedThisSession = true;
    }
  }, [reduceMotion]);

  const animatedClipStyle = useAnimatedStyle(() => {
    return {
      width: isHorizontal ? animProgress.value * svgWidth : svgWidth,
      height: !isHorizontal ? animProgress.value * svgHeight : svgHeight,
      overflow: 'hidden' as const,
    };
  });

  function getBlockPosition(seg: Segment): {
    x: number; y: number; w: number; h: number;
  } {
    const totalRange = totalKm - startKm;
    if (isHorizontal) {
      const availableWidth = stripWidth - 2;
      const x = 1 + ((seg.km_start - startKm) / totalRange) * availableWidth;
      const w = Math.max(4, ((seg.km_end - seg.km_start) / totalRange) * availableWidth - gap);
      return { x, y: 2, w, h: blockThickness };
    } else {
      const availableHeight = stripHeight - 2;
      const y = 1 + ((seg.km_start - startKm) / totalRange) * availableHeight;
      const h = Math.max(4, ((seg.km_end - seg.km_start) / totalRange) * availableHeight - gap);
      return { x: 0, y, w: blockThickness, h };
    }
  }

  function getTownTickPosition(town: Town): { x: number; y: number } {
    const totalRange = totalKm - startKm;
    if (isHorizontal) {
      const availableWidth = stripWidth - 2;
      const x = 1 + ((town.km - startKm) / totalRange) * availableWidth;
      return { x, y: blockThickness + 6 };
    } else {
      const availableHeight = stripHeight - 2;
      const y = 1 + ((town.km - startKm) / totalRange) * availableHeight;
      return { x: blockThickness + 6, y };
    }
  }

  const isDimmed = (seg: Segment): boolean => {
    if (!range) return false;
    return seg.km_end <= range.start || seg.km_start >= range.end;
  };

  return (
    <View
      style={[
        styles.container,
        {
          width: svgWidth,
          height: svgHeight,
        },
      ]}
      accessibilityRole="list"
      accessibilityLabel="Road risk strip showing risk levels along NH-7"
    >
      <Animated.View style={animatedClipStyle}>
        <Svg width={svgWidth} height={svgHeight}>
          <Defs>
            {/* Severe/Closed diagonal hatch pattern */}
            <Pattern
              id="severe-hatch"
              patternUnits="userSpaceOnUse"
              width={severeHatch.stripeWidth + severeHatch.gapWidth}
              height={severeHatch.stripeWidth + severeHatch.gapWidth}
              patternTransform={`rotate(${severeHatch.angle})`}
            >
              <Line
                x1={0}
                y1={0}
                x2={0}
                y2={severeHatch.stripeWidth + severeHatch.gapWidth}
                stroke={severeHatch.color}
                strokeWidth={severeHatch.stripeWidth}
              />
            </Pattern>
          </Defs>

        {/* Segment blocks */}
        {segments.map(seg => {
          const pos = getBlockPosition(seg);
          const fill = isNight 
            ? (seg.effectiveLevel === 'closed' ? nightRiskClosed : nightRisk[seg.level])
            : riskColourFor(seg.effectiveLevel).fill;
            
          const dimmed = isDimmed(seg);
          const isSelected = selectedId === seg.id;
          const opacity = dimmed ? 0.25 : 1;

          return (
            <G
              key={seg.id}
              opacity={opacity}
              onPress={() => onSelect?.(seg.id)}
            >
              {/* Main colour block */}
              <Rect
                x={pos.x}
                y={pos.y}
                width={pos.w}
                height={pos.h}
                rx={blockRadius}
                ry={blockRadius}
                fill={fill}
              />
              {/* Severe or closed hatch overlay */}
              {(seg.effectiveLevel === 3 || seg.effectiveLevel === 'closed') && (
                <Rect
                  x={pos.x}
                  y={pos.y}
                  width={pos.w}
                  height={pos.h}
                  rx={blockRadius}
                  ry={blockRadius}
                  fill="url(#severe-hatch)"
                />
              )}
              {/* Selection ring */}
              {isSelected && (
                <Rect
                  x={pos.x - 1}
                  y={pos.y - 1}
                  width={pos.w + 2}
                  height={pos.h + 2}
                  rx={blockRadius + 1}
                  ry={blockRadius + 1}
                  fill="none"
                  stroke={colors.ink}
                  strokeWidth={2}
                />
              )}
            </G>
          );
        })}

        {/* Town ticks and labels */}
        {towns.map(town => {
          const tickPos = getTownTickPosition(town);
          const townName = isHindi ? town.name_hi : town.name_en;
          const townFont = isHindi
            ? 'IBMPlexSansDevanagari_500Medium'
            : 'IBMPlexSansCondensed_500Medium';

          return (
            <G key={town.id}>
              {isHorizontal ? (
                <>
                  <Line
                    x1={tickPos.x}
                    y1={2}
                    x2={tickPos.x}
                    y2={blockThickness + 4}
                    stroke={colors.granite}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={tickPos.x}
                    y={tickPos.y + 10}
                    fontSize={10}
                    fontFamily={townFont}
                    fill={colors.granite}
                    textAnchor="middle"
                  >
                    {townName}
                  </SvgText>
                </>
              ) : (
                <>
                  <Line
                    x1={0}
                    y1={tickPos.y}
                    x2={blockThickness + 4}
                    y2={tickPos.y}
                    stroke={colors.granite}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={tickPos.x}
                    y={tickPos.y + 4}
                    fontSize={10}
                    fontFamily={townFont}
                    fill={colors.granite}
                    textAnchor="start"
                  >
                    {townName}
                  </SvgText>
                </>
              )}
            </G>
          );
        })}

        {/* "You are here" marker */}
        {youAreAt != null && (() => {
          const totalRange = totalKm - startKm;
          if (isHorizontal) {
            const x = 1 + ((youAreAt - startKm) / totalRange) * (stripWidth - 2);
            return (
              <G>
                <Line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={blockThickness + 4}
                  stroke={colors.river}
                  strokeWidth={2}
                />
              </G>
            );
          } else {
            const y = 1 + ((youAreAt - startKm) / totalRange) * (stripHeight - 2);
            return (
              <G>
                <Line
                  x1={0}
                  y1={y}
                  x2={blockThickness + 4}
                  y2={y}
                  stroke={colors.river}
                  strokeWidth={2}
                />
              </G>
            );
          }
        })()}
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
