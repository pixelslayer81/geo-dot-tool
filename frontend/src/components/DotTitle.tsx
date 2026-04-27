import { useEffect, useRef, useState } from 'react'

// 5-wide × 7-tall dot matrix font
const FONT: Record<string, number[][]> = {
  D: [[1,1,1,0,0],[1,0,0,1,0],[1,0,0,1,0],[1,0,0,1,0],[1,0,0,1,0],[1,0,0,1,0],[1,1,1,0,0]],
  O: [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  T: [[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
  C: [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,1],[0,1,1,1,0]],
  R: [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0],[1,0,1,0,0],[1,0,0,1,0],[1,0,0,0,1]],
  U: [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  S: [[0,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[0,1,1,1,0],[0,0,0,0,1],[0,0,0,0,1],[1,1,1,1,0]],
  H: [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  E: [[1,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
  A: [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
}

const ROWS = 7
const COLS = 5
const CELL = 4.5
const DOT_R = 1.0
const LETTER_GAP = 2

export default function DotTitle({ text, loading = false }: { text: string; loading?: boolean }) {
  const chars = text.toUpperCase().split('')
  const letterCount = chars.length
  const totalCols = letterCount * COLS + (letterCount - 1) * LETTER_GAP
  const svgW = totalCols * CELL
  const svgH = ROWS * CELL

  const dots: { cx: number; cy: number; lit: boolean }[] = []
  chars.forEach((ch, li) => {
    const grid = FONT[ch]
    if (!grid) return
    const xOff = li * (COLS + LETTER_GAP) * CELL
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        dots.push({
          cx: xOff + col * CELL + CELL / 2,
          cy: row * CELL + CELL / 2,
          lit: !!grid[row]?.[col],
        })
      }
    }
  })

  // Indices of lit dots only — these are candidates for the orange flash
  const litIndices = dots.map((d, i) => d.lit ? i : -1).filter(i => i >= 0)

  const [orangeSet, setOrangeSet] = useState<Set<number>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!loading) {
      setOrangeSet(new Set())
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    const tick = () => {
      const count = Math.max(1, Math.floor(litIndices.length * 0.15))
      const shuffled = [...litIndices].sort(() => Math.random() - 0.5)
      setOrangeSet(new Set(shuffled.slice(0, count)))
    }
    tick()
    intervalRef.current = setInterval(tick, 120)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [loading, litIndices.length])

  return (
    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.cx}
          cy={d.cy}
          r={DOT_R}
          fill={orangeSet.has(i) ? '#F4A261' : d.lit ? '#59CEFA' : '#0d3068'}
        />
      ))}
    </svg>
  )
}
