import React from 'react';
import Svg, { Circle, Polygon, Rect } from 'react-native-svg';
import { riskColourFor, nightRisk, nightRiskClosed, type EffectiveLevel } from '../design/tokens';

interface RiskIconProps {
  level: EffectiveLevel;
  size?: number;
  night?: boolean;
}

/**
 * Five custom SVG shapes:
 * 0=circle, 1=triangle, 2=diamond, 3=octagon, closed=square-with-bar.
 *
 * Colour is never the only carrier of risk: shape + word always appear.
 */
export function RiskIcon({ level, size = 16, night: isNight = false }: RiskIconProps) {
  const fill = isNight 
    ? (level === 'closed' ? nightRiskClosed : nightRisk[level])
    : riskColourFor(level).fill;
    
  const halfSize = size / 2;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {level === 0 && (
        <Circle cx={halfSize} cy={halfSize} r={halfSize * 0.85} fill={fill} />
      )}
      {level === 1 && (
        <Polygon
          points={`${halfSize},${size * 0.08} ${size * 0.92},${size * 0.88} ${size * 0.08},${size * 0.88}`}
          fill={fill}
        />
      )}
      {level === 2 && (
        <Polygon
          points={`${halfSize},${size * 0.05} ${size * 0.95},${halfSize} ${halfSize},${size * 0.95} ${size * 0.05},${halfSize}`}
          fill={fill}
        />
      )}
      {level === 3 && (() => {
        // Octagon: 8 vertices
        const inset = size * 0.29;
        const pts = [
          `${inset},0`,
          `${size - inset},0`,
          `${size},${inset}`,
          `${size},${size - inset}`,
          `${size - inset},${size}`,
          `${inset},${size}`,
          `0,${size - inset}`,
          `0,${inset}`,
        ].join(' ');
        return <Polygon points={pts} fill={fill} />;
      })()}
      {level === 'closed' && (
        <>
          <Rect x={size * 0.1} y={size * 0.1} width={size * 0.8} height={size * 0.8} fill={fill} />
          <Rect x={size * 0.2} y={size * 0.42} width={size * 0.6} height={size * 0.16} fill="#FFFFFF" />
        </>
      )}
    </Svg>
  );
}
