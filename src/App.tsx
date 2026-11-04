import { useEffect } from 'react'
import { Workbench } from './components/Workbench'
import { audio } from './lib/audio'
import { tts } from './lib/tts'

export default function App() {
  useEffect(() => {
    const unlock = () => {
      void audio.unlock()
      tts.refreshVoices()
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])
  return <Workbench />
}

