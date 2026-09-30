/**
 * AiChat — drop-in AI chat panel powered by Google Gemini vision.
 *
 * Props:
 *   pageHint  {string}  Name of the page/context passed to the model
 *   title     {string}  Header label (default: "AI Assistant")
 *   className {string}  Extra wrapper classes
 *   compact   {boolean} Smaller variant for sidebars (default: false)
 */
import { useRef, useState } from 'react'
import { sendChatMessage, providerLabel, getProvider } from '../../services/chatService'

const SUGGESTIONS = [
  'What can I detect in this image?',
  'Show me the water bodies',
  'Identify vegetation areas',
  'Detect buildings in this image',
]

// Groq caps image-input requests at 20MB; stay safely below after base64 inflation.
const MAX_IMAGE_BYTES = 14 * 1024 * 1024

export default function AiChat({ pageHint = '', title = 'AI Assistant', className = '', compact = false }) {
  const [history, setHistory] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [attachment, setAttachment] = useState(null) // { name, dataUrl }
  const [fileError, setFileError] = useState('')
  const endRef = useRef(null)
  const fileRef = useRef(null)

  function handleAttach(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setFileError('Only image files are supported (PNG, JPEG, WebP).')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setFileError('Image is too large — max 14 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setAttachment({ name: file.name, dataUrl: reader.result })
      setFileError('')
    }
    reader.onerror = () => setFileError('Could not read that file.')
    reader.readAsDataURL(file)
  }

  function removeAttachment() {
    setAttachment(null)
    setFileError('')
  }

  async function send(text) {
    const msg = (text || input).trim()
    if (!msg && !attachment) return
    const image = attachment
    setInput('')
    setAttachment(null)
    setFileError('')

    const userMsg = { role: 'user', text: msg, image: image?.dataUrl }
    const next = [...history, userMsg]
    setHistory(next)
    setLoading(true)

    // scroll after user message
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    try {
      const reply = await sendChatMessage(history, msg, pageHint, image)
      setHistory(h => [...h, { role: 'ai', text: reply }])
    } catch (err) {
      setHistory(h => [...h, { role: 'ai', text: '⚠ Could not reach AI. ' + (err.message || '') }])
    } finally {
      setLoading(false)
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const maxH = compact ? '220px' : '340px'

  return (
    <div className={`flex flex-col border border-white/10 rounded-xl overflow-hidden bg-[#0c0e12] ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10 bg-[#111318] flex-shrink-0">
        <span className="material-symbols-outlined text-[15px] text-[#adc6ff]">smart_toy</span>
        <span className="font-mono text-[10px] font-bold text-[#adc6ff] flex-1">{title}</span>
        <span className={`font-mono text-[9px] flex items-center gap-1 ${getProvider() ? 'text-[#4edea3]' : 'text-[#ffb4ab]'}`}>
          <span className={`w-1.5 h-1.5 rounded-full animate-pulse-dot inline-block ${getProvider() ? 'bg-[#4edea3]' : 'bg-[#ffb4ab]'}`} />
          {attachment ? `Vision · ${providerLabel()}` : providerLabel()}
        </span>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto scroll-thin p-3 flex flex-col gap-2"
        style={{ maxHeight: maxH, minHeight: compact ? '80px' : '120px' }}
      >
        {history.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="w-9 h-9 rounded-xl bg-[#adc6ff]/10 border border-[#adc6ff]/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px] text-[#adc6ff]/60">smart_toy</span>
            </div>
            <p className="font-mono text-[10px] text-[#c2c6d6]/60">Ask anything about satellite imagery</p>
            {!compact && (
              <div className="flex flex-wrap gap-1.5 justify-center mt-1">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="px-2.5 py-1 rounded-full bg-[#adc6ff]/8 border border-[#adc6ff]/20
                               font-mono text-[9px] text-[#adc6ff]/70 hover:bg-[#adc6ff]/15
                               hover:text-[#adc6ff] transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          history.map((m, i) => (
            <div
              key={i}
              className={`text-xs leading-relaxed px-2.5 py-2 rounded-lg max-w-[92%] ${
                m.role === 'ai'
                  ? 'bg-white/[0.04] border border-white/[0.08] text-[#c2c6d6] self-start rounded-tl-none'
                  : 'bg-[#adc6ff]/10 border border-[#adc6ff]/15 text-[#e2e2e8] self-end rounded-tr-none'
              }`}
            >
              {m.role === 'ai' && (
                <span className="font-mono text-[8px] text-[#adc6ff]/60 block mb-1">SatQuery AI</span>
              )}
              {m.image && (
                <img
                  src={m.image}
                  alt="Attached"
                  className="mb-1.5 max-h-28 rounded-md border border-white/10"
                />
              )}
              {m.text}
            </div>
          ))
        )}

        {/* Typing indicator */}
        {loading && (
          <div className="self-start flex items-center gap-1.5 px-2.5 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg rounded-tl-none">
            <span className="w-1.5 h-1.5 rounded-full bg-[#adc6ff]/60 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-[#adc6ff]/60 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-[#adc6ff]/60 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-2.5 flex-shrink-0">
        {(attachment || fileError) && (
          <div className="flex items-center gap-2 mb-2">
            {attachment && (
              <div className="flex items-center gap-2 bg-[#111318] border border-white/10 rounded-lg px-2 py-1.5 flex-1 min-w-0">
                <img src={attachment.dataUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                <span className="font-mono text-[10px] text-[#c2c6d6] truncate flex-1">{attachment.name}</span>
                <button
                  onClick={removeAttachment}
                  disabled={loading}
                  className="material-symbols-outlined text-[14px] text-[#c2c6d6]/50 hover:text-[#ffb4ab] transition-colors disabled:opacity-30"
                  aria-label="Remove attachment"
                >
                  close
                </button>
              </div>
            )}
            {fileError && <span className="font-mono text-[9px] text-[#ffb4ab]">{fileError}</span>}
          </div>
        )}
        <div className="flex items-center gap-2 bg-[#111318] border border-white/10 rounded-lg px-3 py-2 focus-within:border-[#adc6ff]/40 transition-colors">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="material-symbols-outlined text-[16px] text-[#c2c6d6]/60 hover:text-[#adc6ff]
                       transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Attach image"
            title="Attach image"
          >
            add_photo_alternate
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleAttach}
          />
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading}
            placeholder="Ask about this location or image…"
            className="bg-transparent border-none text-xs text-[#e2e2e8] placeholder:text-[#c2c6d6]/40
                       focus:ring-0 focus:outline-none flex-1 disabled:opacity-50"
          />
          <button
            onClick={() => send()}
            disabled={loading || (!input.trim() && !attachment)}
            className="material-symbols-outlined text-[16px] text-[#adc6ff] hover:opacity-80
                       transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            {loading ? 'hourglass_empty' : 'send'}
          </button>
        </div>
        <div className="font-mono text-[9px] text-[#c2c6d6]/30 mt-1 text-right">
          Enter to send · attach an image for visual analysis
        </div>
      </div>
    </div>
  )
}
