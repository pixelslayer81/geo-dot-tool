import type { ColorConfig } from '../types'
import Collapsible from './Collapsible'

const PALETTES: {
  id: string
  label: string
  color: string
  bg: string
  swatches: { hex: string; name: string }[]
  combos: { name: string; fills: string[] }[]
}[] = [
  {
    id: 'hero-blue',
    label: 'Hero Blue',
    color: '#59CEFA',
    bg: '#03254a',
    swatches: [
      { hex: '#3498C8', name: 'Signal blue' },
      { hex: '#707070', name: 'Graphite' },
      { hex: '#D0D0D0', name: 'Fog' },
      { hex: '#F8F8F8', name: 'Paper' },
      { hex: '#C8D8E8', name: 'Mist blue' },
    ],
    combos: [
      { name: 'Brand',    fills: ['#3498C8', '#707070'] },
      { name: 'Light',    fills: ['#3498C8', '#C8D8E8', '#F8F8F8'] },
      { name: 'Mono',     fills: ['#707070', '#D0D0D0', '#F8F8F8'] },
      { name: 'Dark',     fills: ['#3498C8', '#707070', '#D0D0D0'] },
    ],
  },
  {
    id: 'blue02',
    label: 'Blue 02',
    color: '#D0F2FE',
    bg: '#002060',
    swatches: [
      { hex: '#D0F2FE', name: 'Ice mist' },
      { hex: '#59CEFA', name: 'Sky cyan' },
      { hex: '#7CC3FB', name: 'Soft azure' },
      { hex: '#B0B0F0', name: 'Lavender' },
      { hex: '#084296', name: 'Deep cobalt' },
      { hex: '#002060', name: 'Midnight navy' },
    ],
    combos: [
      { name: 'Light',    fills: ['#D0F2FE', '#59CEFA', '#7CC3FB'] },
      { name: 'Cool',     fills: ['#7CC3FB', '#B0B0F0', '#084296'] },
      { name: 'Deep',     fills: ['#084296', '#002060'] },
      { name: 'Contrast', fills: ['#D0F2FE', '#59CEFA', '#002060'] },
    ],
  },
  {
    id: 'red',
    label: 'Red',
    color: '#FDB8A0',
    bg: '#5E120D',
    swatches: [
      { hex: '#FFF3E8', name: 'Cream' },
      { hex: '#FDB8A0', name: 'Melon' },
      { hex: '#FA946C', name: 'Tangerine' },
      { hex: '#E14C46', name: 'Poppy' },
      { hex: '#BE3231', name: 'Brick' },
      { hex: '#AC262F', name: 'Oxblood' },
      { hex: '#5E120D', name: 'Maroon' },
    ],
    combos: [
      { name: 'Warm',     fills: ['#FFF3E8', '#FDB8A0', '#FA946C'] },
      { name: 'Fire',     fills: ['#FA946C', '#E14C46', '#BE3231'] },
      { name: 'Deep',     fills: ['#BE3231', '#AC262F', '#5E120D'] },
      { name: 'Contrast', fills: ['#FDB8A0', '#E14C46', '#5E120D'] },
    ],
  },
  {
    id: 'sunset',
    label: 'Sunset',
    color: '#FCAD36',
    bg: '#4E1A0A',
    swatches: [
      { hex: '#FCAD36', name: 'Amber gold' },
      { hex: '#F76A32', name: 'Tangerine' },
      { hex: '#F35726', name: 'Blaze orange' },
      { hex: '#ED7364', name: 'Coral' },
      { hex: '#EC8AC5', name: 'Orchid' },
      { hex: '#EEB4E7', name: 'Soft magenta' },
      { hex: '#FDE4C8', name: 'Peach cream' },
      { hex: '#F5D0E8', name: 'Blush' },
      { hex: '#F88630', name: 'Marigold' },
      { hex: '#F1785B', name: 'Salmon' },
      { hex: '#C44A1E', name: 'Rust' },
      { hex: '#8E3214', name: 'Burnt sienna' },
      { hex: '#4E1A0A', name: 'Ember' },
    ],
    combos: [
      { name: 'Classic',  fills: ['#FCAD36', '#F35726', '#EC8AC5'] },
      { name: 'Dusk',     fills: ['#4E1A0A', '#F35726', '#EEB4E7'] },
      { name: 'Pastel',   fills: ['#FDE4C8', '#F1785B', '#8E3214'] },
      { name: 'Warm',     fills: ['#F76A32', '#ED7364', '#EEB4E7'] },
    ],
  },
  {
    id: 'electric',
    label: 'Electric',
    color: '#C0A5EC',
    bg: '#1A1060',
    swatches: [
      { hex: '#EBDEE8', name: 'Pale lilac' },
      { hex: '#C0A5EC', name: 'Soft violet' },
      { hex: '#BA71E4', name: 'Orchid' },
      { hex: '#A172CE', name: 'Amethyst' },
      { hex: '#2D1E9F', name: 'Deep indigo' },
      { hex: '#126CF8', name: 'Electric blue' },
      { hex: '#F4EDF2', name: 'Ghost' },
      { hex: '#E3CBED', name: 'Thistle' },
      { hex: '#A791D1', name: 'Lavender' },
      { hex: '#9F7ED5', name: 'Wisteria' },
      { hex: '#817D8B', name: 'Pewter' },
      { hex: '#083DE5', name: 'Cobalt' },
      { hex: '#1A1060', name: 'Midnight' },
    ],
    combos: [
      { name: 'Purple stack',     fills: ['#EBDEE8', '#BA71E4', '#2D1E9F'] },
      { name: 'Violet + electric', fills: ['#C0A5EC', '#126CF8', '#1A1060'] },
      { name: 'Soft to bold',     fills: ['#F4EDF2', '#A172CE', '#083DE5'] },
      { name: 'Monochrome fade',  fills: ['#E3CBED', '#9F7ED5', '#2D1E9F'] },
    ],
  },
  {
    id: 'mint_rose',
    label: 'Mint Rose',
    color: '#A4E6BD',
    bg: '#0E4420',
    swatches: [
      { hex: '#A4E6BD', name: 'Mint' },
      { hex: '#4DB76C', name: 'Emerald' },
      { hex: '#137B3E', name: 'Forest' },
      { hex: '#D07090', name: 'Dusty rose' },
      { hex: '#E0B080', name: 'Peach sand' },
      { hex: '#1B2F2E', name: 'Dark teal' },
      { hex: '#D4F2E2', name: 'Ice mint' },
      { hex: '#F0B0D0', name: 'Soft pink' },
      { hex: '#64C383', name: 'Jade' },
      { hex: '#A05010', name: 'Burnt orange' },
      { hex: '#905060', name: 'Mauve' },
      { hex: '#107030', name: 'Deep pine' },
      { hex: '#0E4420', name: 'Shadow' },
    ],
    combos: [
      { name: 'Mint + rose',    fills: ['#A4E6BD', '#D07090', '#137B3E'] },
      { name: 'Warm anchor',    fills: ['#E0B080', '#4DB76C', '#1B2F2E'] },
      { name: 'Fresh contrast', fills: ['#D4F2E2', '#D07090', '#0E4420'] },
      { name: 'Playful trio',   fills: ['#F0B0D0', '#64C383', '#A05010'] },
    ],
  },
  {
    id: 'twilight_fade',
    label: 'Twilight Fade',
    color: '#F69DB1',
    bg: '#1A3468',
    swatches: [
      { hex: '#CA7E66', name: 'Terracotta' },
      { hex: '#F69DB1', name: 'Rose pink' },
      { hex: '#DBB2DE', name: 'Lavender' },
      { hex: '#8F8ED4', name: 'Periwinkle' },
      { hex: '#7CA9EA', name: 'Cornflower' },
      { hex: '#4478DE', name: 'Royal blue' },
      { hex: '#FEAACB', name: 'Cotton candy' },
      { hex: '#E8D0E8', name: 'Thistle' },
      { hex: '#B8CCEF', name: 'Baby blue' },
      { hex: '#E38E89', name: 'Salmon' },
      { hex: '#B3714F', name: 'Sienna' },
      { hex: '#2E5299', name: 'Denim' },
      { hex: '#1A3468', name: 'Navy' },
    ],
    combos: [
      { name: 'Dusk horizon',  fills: ['#CA7E66', '#DBB2DE', '#4478DE'] },
      { name: 'Twilight fade', fills: ['#FEAACB', '#8F8ED4', '#1A3468'] },
      { name: 'Warm to cool',  fills: ['#B3714F', '#F69DB1', '#7CA9EA'] },
      { name: 'Soft contrast', fills: ['#E8D0E8', '#E38E89', '#2E5299'] },
    ],
  },
  {
    id: 'tropical',
    label: 'Tropical',
    color: '#EBB539',
    bg: '#286E48',
    swatches: [
      { hex: '#EBB539', name: 'Saffron gold' },
      { hex: '#93B13F', name: 'Olive lime' },
      { hex: '#E7A97A', name: 'Warm peach' },
      { hex: '#DB6B9D', name: 'Rose' },
      { hex: '#3CA56A', name: 'Emerald' },
      { hex: '#DF91C1', name: 'Soft pink' },
      { hex: '#F5DFA0', name: 'Buttercup' },
      { hex: '#F0C8D8', name: 'Blush' },
      { hex: '#B8D480', name: 'Pistachio' },
      { hex: '#CA9F75', name: 'Caramel' },
      { hex: '#A04872', name: 'Mulberry' },
      { hex: '#286E48', name: 'Forest' },
      { hex: '#8A6A18', name: 'Dark amber' },
    ],
    combos: [
      { name: 'Tropical triad', fills: ['#EBB539', '#DB6B9D', '#3CA56A'] },
      { name: 'Garden party',   fills: ['#F5DFA0', '#A04872', '#286E48'] },
      { name: 'Soft spring',    fills: ['#93B13F', '#E7A97A', '#DF91C1'] },
      { name: 'Earth tone',     fills: ['#8A6A18', '#CA9F75', '#3CA56A'] },
    ],
  },
  {
    id: 'neon_party',
    label: 'Neon Party',
    color: '#F99E33',
    bg: '#112584',
    swatches: [
      { hex: '#F99E33', name: 'Amber' },
      { hex: '#F27E43', name: 'Tangerine' },
      { hex: '#D12EA3', name: 'Magenta' },
      { hex: '#8F14C7', name: 'Electric violet' },
      { hex: '#6219CA', name: 'Purple' },
      { hex: '#328DDE', name: 'Azure' },
      { hex: '#FDD6A0', name: 'Peach' },
      { hex: '#E89CD0', name: 'Orchid' },
      { hex: '#A88DE8', name: 'Lavender' },
      { hex: '#7BB8F0', name: 'Sky' },
      { hex: '#2916AD', name: 'Indigo' },
      { hex: '#1A54A8', name: 'Cobalt' },
      { hex: '#112584', name: 'Midnight' },
    ],
    combos: [
      { name: 'Full spectrum', fills: ['#F99E33', '#8F14C7', '#1A54A8'] },
      { name: 'Neon triad',    fills: ['#F27E43', '#D12EA3', '#328DDE'] },
      { name: 'Peach + depth', fills: ['#FDD6A0', '#6219CA', '#112584'] },
      { name: 'Warm bookend',  fills: ['#E89CD0', '#2916AD', '#F99E33'] },
    ],
  },
  {
    id: 'green',
    label: 'Green',
    color: '#B5E883',
    bg: '#0A2A0C',
    swatches: [
      { hex: '#D8F2C2', name: 'Honeydew' },
      { hex: '#B5E883', name: 'Pistachio' },
      { hex: '#77C766', name: 'Fern' },
      { hex: '#3A8838', name: 'Pine' },
      { hex: '#276828', name: 'Hunter' },
      { hex: '#164818', name: 'Deep moss' },
      { hex: '#0A2A0C', name: 'Shadow' },
    ],
    combos: [
      { name: 'Deep',     fills: ['#276828', '#164818', '#0A2A0C'] },
      { name: 'Full',     fills: ['#B5E883', '#77C766', '#3A8838', '#164818'] },
      { name: 'Contrast', fills: ['#D8F2C2', '#3A8838', '#0A2A0C'] },
      { name: 'Canopy',   fills: ['#B5E883', '#276828'] },
    ],
  },
]

interface Props {
  colors: ColorConfig
  onChange: (c: ColorConfig) => void
  onApplySingleColor?: (hex: string) => void
}

export default function ColorOverridePanel({ colors, onChange, onApplySingleColor }: Props) {
  function applyFills(fills: string[]) {
    const c0 = fills[0] ?? '#000000'
    const c1 = fills[1] ?? c0
    const c2 = fills[2] ?? c1
    onChange({
      ...colors,
      colors: fills,
      ratios: fills.map(() => 1 / fills.length),
      fill_colors: fills,
      dot_dot_colors: fills,
      outline_colors: fills,
      outline_color: c0,
      inner_colors: [c2],
      inner_color: c2,
      // background intentionally not changed
    })
  }

  return (
    <section className="space-y-2">
      {PALETTES.map(palette => (
        <Collapsible key={palette.id} title={palette.label} titleColor={palette.color} titleBg={palette.bg} titleBorder={palette.color}>
          <div className="space-y-3">
            {/* Individual swatches */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#7CC3FB] font-semibold mb-2">Single</p>
              <div className="grid grid-cols-7 gap-1">
                {palette.swatches.map(({ hex, name }) => (
                  <button
                    key={hex}
                    title={`${name} ${hex}`}
                    onClick={() => onApplySingleColor ? onApplySingleColor(hex) : applyFills([hex])}
                    className="group flex flex-col items-center gap-1"
                  >
                    <div
                      className="w-full aspect-square rounded border border-[#1E6EB7] group-hover:border-[#59CEFA] transition-colors"
                      style={{ background: hex }}
                    />
                    <span className="text-[8px] text-[#444] group-hover:text-[#59CEFA] transition-colors leading-none font-mono">
                      {name.split(' ')[0]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Combination presets */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#7CC3FB] font-semibold mb-2">Combinations</p>
              <div className="grid grid-cols-2 gap-1.5">
                {palette.combos.map(({ name, fills }) => (
                  <button
                    key={name}
                    onClick={() => applyFills(fills)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded bg-[#0d3068] border border-[#1E6EB7]
                               hover:border-[#59CEFA] transition-colors group"
                  >
                    <div className="flex gap-0.5 flex-shrink-0">
                      {fills.map((c) => (
                        <div key={c} className="w-3 h-5 rounded-sm" style={{ background: c }} />
                      ))}
                    </div>
                    <span className="text-[10px] text-[#666] group-hover:text-[#59CEFA] transition-colors truncate">
                      {name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Collapsible>
      ))}
    </section>
  )
}
