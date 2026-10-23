import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Line, G } from 'react-native-svg';
import { colors } from '../design/tokens';

interface RainSparkProps {
  last24hMm: number;
  next24hMm: number;
  width?: number;
  height?: number;
}

/**
 * RainSpark: a sparkline showing 72h past and 24h forecast rain.
 * TODO: The API currently only gives last_24h_mm and next_24h_mm.
 * We generate a plausible hourly series from these two numbers for now.
 */
export function RainSpark({ last24hMm, next24hMm, width = 300, height = 40 }: RainSparkProps) {
  // Generate mock hourly data: 96 hours total (72 past, 24 future)
  const totalHours = 96;
  const nowIndex = 72;
  
  const series = Array.from({ length: totalHours }, (_, i) => {
    if (i < 48) {
      // 48h to 72h ago: random light rain
      return Math.random() * (last24hMm / 5);
    } else if (i < nowIndex) {
      // Last 24h
      return Math.random() * (last24hMm / 2);
    } else {
      // Next 24h
      return Math.random() * (next24hMm / 2);
    }
  });

  const maxVal = Math.max(...series, 1); // Avoid div by zero
  const barWidth = width / totalHours;

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        {series.map((val, i) => {
          const barHeight = (val / maxVal) * height;
          const x = i * barWidth;
          const y = height - barHeight;
          const isFuture = i >= nowIndex;
          
          return (
            <Rect
              key={i}
              x={x + barWidth * 0.1}
              y={y}
              width={barWidth * 0.8}
              height={barHeight}
              fill={isFuture ? colors.mist : colors.river}
              rx={1}
            />
          );
        })}
        {/* "Now" line */}
        <Line
          x1={nowIndex * barWidth}
          y1={0}
          x2={nowIndex * barWidth}
          y2={height}
          stroke={colors.ink}
          strokeWidth={1}
          strokeDasharray="2, 2"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // optional styling
  },
});
