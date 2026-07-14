import React, { useMemo } from "react"

type Props = {
  points?: number
  width?: number
  height?: number
  small?: boolean
  seed?: number
  data?: number[]
}

function rand(seed: number) {
  // simple pseudo-random deterministic generator
  let x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

export default function TradingChart({
  points = 60,
  width = 300,
  height = 80,
  small = false,
  seed = 1,
  data: customData,
}: Props) {
  const data = useMemo(() => {
    if (customData) return customData
    const arr: number[] = []
    let v = 100 + (rand(seed) - 0.5) * 10
    for (let i = 0; i < points; i++) {
      const noise = (rand(seed + i) - 0.5) * 4
      v = Math.max(1, v + noise)
      arr.push(v)
    }
    return arr
  }, [customData, points, seed])

  const min = Math.min(...data)
  const max = Math.max(...data)
  const vw = width
  const vh = height
  const stepX = vw / (data.length - 1)

  const path = data
    .map((d, i) => {
      const x = i * stepX
      const y = vh - ((d - min) / (max - min || 1)) * vh
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(" ")

  const stroke =
    data[data.length - 1] >= data[0] ? "text-green-400" : "text-red-400"

  return (
    <svg
      width={small ? 120 : vw}
      height={vh}
      viewBox={`0 0 ${vw} ${vh}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(99,102,241,0.12)" />
          <stop offset="100%" stopColor="rgba(99,102,241,0)" />
        </linearGradient>
      </defs>
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className={stroke}
      />
      <path
        d={`${path} L ${vw} ${vh} L 0 ${vh} Z`}
        fill="url(#g1)"
        opacity={0.6}
      />
    </svg>
  )
}
