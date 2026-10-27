import { useEffect } from 'react'

export function useTitre(titre: string): void {
  useEffect(() => {
    document.title = titre ? `${titre} | RegenVox` : 'RegenVox'
  }, [titre])
}
