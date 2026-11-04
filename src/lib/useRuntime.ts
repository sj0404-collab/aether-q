import { useEffect, useReducer } from 'react'
import { android } from './runtime'

export function useRuntime() {
  const [, bump] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    const off = android.on(() => bump())
    return () => {
      off()
    }
  }, [])
  return android
}
