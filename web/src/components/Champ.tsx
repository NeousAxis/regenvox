import type { ReactNode } from 'react'

export function Aide({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-sm text-dark-light leading-relaxed">
      {children}
    </p>
  )
}

export function MessageErreur({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null
  return (
    <p id={id} className="mt-1.5 text-sm font-medium text-alerte flex gap-1.5 items-start">
      <svg aria-hidden="true" viewBox="0 0 20 20" className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor">
        <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-.9 4h1.8v5.2H9.1V6Zm0 6.6h1.8v1.8H9.1v-1.8Z" />
      </svg>
      <span>{children}</span>
    </p>
  )
}

// Construit la liste des identifiants pour aria-describedby.
export function decritPar(...ids: (string | false | undefined | null)[]): string | undefined {
  const liste = ids.filter(Boolean).join(' ')
  return liste || undefined
}
