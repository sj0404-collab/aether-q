import JSZip from 'jszip'
import { parseAxml, type AxmlNode } from './axml'

export type InflatedView = {
  id: string
  type: string
  className: string
  text: string
  hint: string
  src: string
  orientation: 'vertical' | 'horizontal'
  clickable: boolean
  onClick: string
  background: string
  textSize: string
  textColor: string
  gravity: string
  layoutWidth: string
  layoutHeight: string
  padding: string
  children: InflatedView[]
  attrs: Record<string, string>
}

const VIEW_MAP: Record<string, string> = {
  TextView: 'TextView',
  Button: 'Button',
  ImageButton: 'ImageButton',
  ImageView: 'ImageView',
  EditText: 'EditText',
  CheckBox: 'CheckBox',
  Switch: 'Switch',
  RadioButton: 'RadioButton',
  ProgressBar: 'ProgressBar',
  SeekBar: 'SeekBar',
  ScrollView: 'ScrollView',
  HorizontalScrollView: 'HorizontalScrollView',
  LinearLayout: 'LinearLayout',
  RelativeLayout: 'RelativeLayout',
  FrameLayout: 'FrameLayout',
  ConstraintLayout: 'ConstraintLayout',
  CoordinatorLayout: 'CoordinatorLayout',
  AppBarLayout: 'AppBarLayout',
  Toolbar: 'Toolbar',
  MaterialToolbar: 'Toolbar',
  RecyclerView: 'RecyclerView',
  NestedScrollView: 'ScrollView',
  CardView: 'CardView',
  MaterialButton: 'Button',
  MaterialTextView: 'TextView',
  MaterialCardView: 'CardView',
  FloatingActionButton: 'FAB',
  BottomNavigationView: 'BottomNav',
  TabLayout: 'TabLayout',
  ViewPager: 'ViewPager',
  ViewPager2: 'ViewPager',
  WebView: 'WebView',
  MapView: 'MapView',
  SurfaceView: 'SurfaceView',
  TextureView: 'TextureView',
  VideoView: 'VideoView',
  Spinner: 'Spinner',
  ListView: 'ListView',
  GridView: 'GridView',
  View: 'View',
  Space: 'Space',
  ViewGroup: 'FrameLayout',
  androidx: 'View',
}

function shortType(name: string) {
  const n = name.split('.').pop() || name
  return VIEW_MAP[n] || (n.includes('Layout') ? 'LinearLayout' : n)
}

let idSeq = 1

export function inflate(node: AxmlNode): InflatedView {
  const a = node.attrs
  const type = shortType(node.name)
  const text = a['android:text'] || a.text || ''
  const orientation = (a['android:orientation'] || a.orientation || (type === 'LinearLayout' ? 'vertical' : 'vertical')) as
    | 'vertical'
    | 'horizontal'
  const view: InflatedView = {
    id: a['android:id'] || a.id || `view_${idSeq++}`,
    type,
    className: node.name,
    text,
    hint: a['android:hint'] || a.hint || '',
    src: a['android:src'] || a.src || '',
    orientation: orientation === 'horizontal' ? 'horizontal' : 'vertical',
    clickable: a['android:clickable'] === 'true' || type === 'Button' || type === 'FAB' || type === 'ImageButton',
    onClick: a['android:onClick'] || '',
    background: a['android:background'] || a.background || '',
    textSize: a['android:textSize'] || a.textSize || '',
    textColor: a['android:textColor'] || a.textColor || '',
    gravity: a['android:gravity'] || a.gravity || '',
    layoutWidth: a['android:layout_width'] || a.layout_width || 'match_parent',
    layoutHeight: a['android:layout_height'] || a.layout_height || 'wrap_content',
    padding: a['android:padding'] || '',
    children: node.children.filter((c) => c.name && c.name !== '#text').map(inflate),
    attrs: a,
  }
  return view
}

export async function extractLayouts(zip: JSZip) {
  const files = Object.keys(zip.files).filter((n) => n.startsWith('res/layout') && n.endsWith('.xml'))
  const out: { path: string; root: InflatedView | null; error?: string }[] = []
  for (const path of files.slice(0, 40)) {
    const f = zip.file(path)
    if (!f) continue
    try {
      const buf = await f.async('arraybuffer')
      const node = parseAxml(buf)
      out.push({ path, root: inflate(node) })
    } catch (e) {
      out.push({ path, root: null, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}

export function collectClickHandlers(view: InflatedView, acc: string[] = []) {
  if (view.onClick) acc.push(view.onClick)
  view.children.forEach((c) => collectClickHandlers(c, acc))
  return acc
}

export function flattenViews(view: InflatedView, acc: InflatedView[] = []) {
  acc.push(view)
  view.children.forEach((c) => flattenViews(c, acc))
  return acc
}
