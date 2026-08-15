import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { StudioShell } from '@/components/tile-studio/studio-shell'

export default function App() {
  return (
    <TooltipProvider delay={200}>
      <StudioShell />
      <Toaster />
    </TooltipProvider>
  )
}
