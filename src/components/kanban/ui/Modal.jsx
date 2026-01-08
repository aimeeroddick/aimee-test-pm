import { useEffect } from 'react'

const Modal = ({ isOpen, onClose, title, children, wide, fullScreenMobile }) => {
  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      <div className={`relative bg-white dark:bg-gray-900 shadow-2xl w-full flex flex-col animate-modalSlideUp ${
        fullScreenMobile 
          ? 'h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-2xl sm:mx-4' 
          : 'rounded-t-2xl sm:rounded-2xl sm:mx-4 max-h-[95vh] sm:max-h-[90vh]'
      } ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className={`flex-shrink-0 flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 z-20 ${fullScreenMobile ? 'pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pt-4 rounded-none sm:rounded-t-2xl' : 'rounded-t-2xl'}`}>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-3 -mr-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-600 dark:text-gray-300 touch-manipulation"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 sm:px-6 sm:py-4 overscroll-contain">{children}</div>
      </div>
    </div>
  )
}

export default Modal
