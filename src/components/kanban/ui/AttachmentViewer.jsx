import { useEffect } from 'react'

const AttachmentViewer = ({ isOpen, onClose, attachment, attachments, onNavigate }) => {
  if (!isOpen || !attachment) return null
  
  const fileName = attachment.file_name || ''
  const fileUrl = attachment.file_url || ''
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)
  const isPdf = ext === 'pdf'
  const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(ext)
  const isAudio = ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)
  const isOfficeDoc = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)
  const isEmail = ['eml', 'msg'].includes(ext)
  
  const currentIndex = attachments?.findIndex(a => a.id === attachment.id) ?? -1
  const hasMultiple = attachments && attachments.length > 1
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < (attachments?.length || 0) - 1
  
  const handlePrev = () => {
    if (hasPrev && onNavigate) {
      onNavigate(attachments[currentIndex - 1])
    }
  }
  
  const handleNext = () => {
    if (hasNext && onNavigate) {
      onNavigate(attachments[currentIndex + 1])
    }
  }
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasPrev) handlePrev()
      if (e.key === 'ArrowRight' && hasNext) handleNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentIndex, attachments])
  
  return (
    <div className="fixed inset-0 z-[310] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-white/80 text-sm truncate max-w-[300px]">{fileName}</span>
          {hasMultiple && (
            <span className="text-white/50 text-sm">
              {currentIndex + 1} / {attachments.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={fileUrl}
            download={fileName}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            title="Download"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </a>
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            title="Open in new tab"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <button
            onClick={onClose}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Navigation arrows */}
      {hasMultiple && (
        <>
          <button
            onClick={handlePrev}
            disabled={!hasPrev}
            className={`absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full transition-all ${
              hasPrev ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-white/5 text-white/30 cursor-not-allowed'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={handleNext}
            disabled={!hasNext}
            className={`absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full transition-all ${
              hasNext ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-white/5 text-white/30 cursor-not-allowed'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}
      
      {/* Content */}
      <div className="relative max-w-[90vw] max-h-[85vh] flex items-center justify-center">
        {isImage && (
          <img
            src={fileUrl}
            alt={fileName}
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
          />
        )}
        
        {isPdf && (
          <iframe
            src={fileUrl}
            title={fileName}
            className="w-[90vw] h-[85vh] max-w-4xl rounded-lg bg-white"
          />
        )}
        
        {isVideo && (
          <video
            src={fileUrl}
            controls
            autoPlay
            className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
          >
            Your browser does not support video playback.
          </video>
        )}
        
        {isAudio && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-2xl text-center">
            <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 rounded-full flex items-center justify-center">
              <span className="text-4xl">🎵</span>
            </div>
            <p className="text-gray-700 dark:text-gray-300 font-medium mb-4">{fileName}</p>
            <audio src={fileUrl} controls autoPlay className="w-full max-w-md">
              Your browser does not support audio playback.
            </audio>
          </div>
        )}
        
        {isOfficeDoc && (
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`}
            title={fileName}
            className="w-[90vw] h-[85vh] max-w-5xl rounded-lg bg-white"
          />
        )}
        
        {isEmail && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-2xl text-center max-w-md">
            <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/50 dark:to-indigo-900/50 rounded-full flex items-center justify-center">
              <span className="text-4xl">✉️</span>
            </div>
            <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">{fileName}</p>
            <p className="text-gray-500 dark:text-gray-300 text-sm mb-6">Email files can be opened in your email client</p>
            <a
              href={fileUrl}
              download={fileName}
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Email
            </a>
          </div>
        )}
        
        {!isImage && !isPdf && !isVideo && !isAudio && !isOfficeDoc && !isEmail && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-2xl text-center max-w-md">
            <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded-full flex items-center justify-center">
              <span className="text-4xl">📄</span>
            </div>
            <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">{fileName}</p>
            <p className="text-gray-500 dark:text-gray-300 text-sm mb-6">Preview not available for this file type</p>
            <a
              href={fileUrl}
              download={fileName}
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download File
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export default AttachmentViewer
