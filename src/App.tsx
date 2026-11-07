import { useEffect, useState } from 'react'

// Phase 1 placeholder: confirms the generated data loads. The game UI arrives in Phase 2.
export default function App() {
  const [status, setStatus] = useState('Loading data…')

  useEffect(() => {
    fetch('/data/prompts.json')
      .then((r) => r.json())
      .then((d: { prompts: unknown[]; dataThrough: number }) =>
        setStatus(`${d.prompts.length} prompts loaded (data through ${d.dataThrough})`),
      )
      .catch((e: Error) => setStatus(`Failed to load data: ${e.message}`))
  }, [])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-2 bg-slate-950 text-slate-100">
      <h1 className="text-3xl font-bold">Hail Mary</h1>
      <p className="text-slate-400">{status}</p>
    </main>
  )
}
