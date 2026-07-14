"use client"

import { useState, useEffect } from "react"

interface IconLine {
  x1: number
  y1: number
  x2: number
  y2: number
  opacity?: number
}

interface IconDefinition {
  lines: [IconLine, IconLine, IconLine]
  rotation?: number
}

const CENTER = 7

const collapsed: IconLine = {
  x1: CENTER,
  y1: CENTER,
  x2: CENTER,
  y2: CENTER,
  opacity: 0,
}

// Icon definitions
const shieldIcon: IconDefinition = {
  lines: [
    { x1: 3, y1: 3, x2: 11, y2: 3 },
    { x1: 11, y1: 3, x2: 11, y2: 10 },
    { x1: 11, y1: 10, x2: 3, y2: 10 },
  ],
}

const lockIcon: IconDefinition = {
  lines: [
    { x1: 3, y1: 8, x2: 11, y2: 8 },
    { x1: 5, y1: 5, x2: 5, y2: 3 },
    { x1: 9, y1: 5, x2: 9, y2: 3 },
  ],
}

const zapIcon: IconDefinition = {
  lines: [
    { x1: 7, y1: 2, x2: 4, y2: 10 },
    { x1: 10, y1: 4, x2: 7, y2: 10 },
    { x1: 7, y1: 10, x2: 7, y2: 12 },
  ],
}

const checkIcon: IconDefinition = {
  lines: [
    { x1: 2, y1: 7.5, x2: 5.5, y2: 11 },
    { x1: 5.5, y1: 11, x2: 12, y2: 3 },
    collapsed,
  ],
}

interface MorphingIconProps {
  from: IconDefinition
  to: IconDefinition
  progress: number
  size?: number
  color?: string
}

function interpolateLine(
  from: IconLine,
  to: IconLine,
  progress: number
): IconLine {
  const opacity1 = from.opacity ?? 1
  const opacity2 = to.opacity ?? 1

  return {
    x1: from.x1 + (to.x1 - from.x1) * progress,
    y1: from.y1 + (to.y1 - from.y1) * progress,
    x2: from.x2 + (to.x2 - from.x2) * progress,
    y2: from.y2 + (to.y2 - from.y2) * progress,
    opacity: opacity1 + (opacity2 - opacity1) * progress,
  }
}

export function MorphingIcon({
  from,
  to,
  progress,
  size = 24,
  color = "currentColor",
}: MorphingIconProps) {
  const lines = [
    interpolateLine(from.lines[0], to.lines[0], progress),
    interpolateLine(from.lines[1], to.lines[1], progress),
    interpolateLine(from.lines[2], to.lines[2], progress),
  ]

  const rotation =
    (from.rotation ?? 0) +
    ((to.rotation ?? 0) - (from.rotation ?? 0)) * progress

  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
      }}
    >
      {lines.map((line, i) => (
        <line
          key={i}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          opacity={line.opacity ?? 1}
          style={{
            transition: "opacity 0.3s ease-out",
          }}
        />
      ))}
    </svg>
  )
}

interface AnimatedMorphingIconProps {
  icons: IconDefinition[]
  current: number
  size?: number
  color?: string
  duration?: number
}

export function AnimatedMorphingIcon({
  icons,
  current,
  size = 24,
  color = "currentColor",
  duration = 600,
}: AnimatedMorphingIconProps) {
  const [progress, setProgress] = useState(0)
  const [displayCurrent, setDisplayCurrent] = useState(current)

  useEffect(() => {
    if (displayCurrent === current) {
      setProgress(1)
      return
    }

    let animationFrame: number
    const startTime = Date.now()

    const animate = () => {
      const elapsed = Date.now() - startTime
      const newProgress = Math.min(elapsed / duration, 1)
      setProgress(newProgress)

      if (newProgress < 1) {
        animationFrame = requestAnimationFrame(animate)
      } else {
        setDisplayCurrent(current)
        setProgress(0)
      }
    }

    animationFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrame)
  }, [current, displayCurrent, duration])

  const from = icons[displayCurrent]
  const to = icons[current]

  return (
    <MorphingIcon
      from={from}
      to={to}
      progress={progress}
      size={size}
      color={color}
    />
  )
}

export { shieldIcon, lockIcon, zapIcon, checkIcon }
