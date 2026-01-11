"use client"

import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer'
import QuantumChat from './QuantumChat'

interface ChatFABProps {
  selectedBookId: string | null
  books: any[]
}

export default function ChatFAB({ selectedBookId, books }: ChatFABProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* Floating Action Button - Mobile Only */}
      <button
        onClick={() => setIsOpen(true)}
        className="md:hidden fixed bottom-20 right-4 h-14 w-14 bg-emerald-500 rounded-full z-50 flex items-center justify-center shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-colors"
        aria-label="Open chat"
      >
        <Sparkles className="w-6 h-6 text-zinc-950" />
      </button>

      {/* Chat Drawer - Mobile Only */}
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerContent className="h-[85vh] bg-zinc-950 border-t border-zinc-800 flex flex-col">
          <DrawerHeader className="border-b border-zinc-800 bg-zinc-900/50 pb-3 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <DrawerTitle className="text-zinc-50 font-mono text-sm">Quantum Chat</DrawerTitle>
                <DrawerDescription className="text-zinc-400 text-xs mt-1">
                  {selectedBookId 
                    ? books.find(b => b.id === selectedBookId)?.title || 'Chat with book'
                    : 'Chat with all books'}
                </DrawerDescription>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors ml-4 flex-shrink-0"
                aria-label="Close chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </DrawerHeader>
          
          {/* Chat Content - flex-1 min-h-0 allows scrolling to work */}
          <div className="flex-1 min-h-0 flex flex-col">
            <QuantumChat selectedBookId={selectedBookId} books={books} />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
