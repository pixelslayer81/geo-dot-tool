import { useState } from 'react'

interface Props {
  title: string | React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  titleColor?: string
  titleBg?: string
  titleBorder?: string
}

export default function Collapsible({ title, children, defaultOpen = false, titleColor, titleBg, titleBorder }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-2 border-b border-[#0a2555] mb-3 group"
        style={titleBorder ? { borderBottomColor: titleBorder } : undefined}
      >
        <span
          className="text-[10px] uppercase tracking-widest font-semibold transition-colors"
          style={{ color: open ? '#F4A261' : (titleColor ?? '#7CC3FB') }}
        >
          {title}
        </span>
        <svg
          className={`w-2.5 h-2.5 transition-transform ${open ? '' : '-rotate-90'}`}
          style={{ color: open ? '#F4A261' : (titleColor ?? '#7CC3FB') }}
          fill="none" viewBox="0 0 10 6" stroke="currentColor" strokeWidth={2}
        >
          <path d="M1 1l4 4 4-4" strokeLinecap="square" strokeLinejoin="miter" />
        </svg>
      </button>
      {open && <div className="mb-1">{children}</div>}
    </div>
  )
}
