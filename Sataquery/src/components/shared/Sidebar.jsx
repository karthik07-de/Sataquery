import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../../services/api'
import Logo from './Logo'


const NAV = [
  { icon: 'chat_bubble', label: 'Neural Chat', to: '/dashboard' },
  { icon: 'history',     label: 'History',     to: '/missions' },
  { icon: 'layers',      label: 'Layers',      to: '/layers' },
  { icon: 'bar_chart',   label: 'Analytics',   to: '/analytics' },
  { icon: 'folder',      label: 'Projects',    to: '/projects' },
]

export default function Sidebar({ activeKey }) {
  const { pathname } = useLocation()
  const [backendConnected, setBackendConnected] = useState(false)

  useEffect(() => {
    let mounted = true

    const check = () => {
      api.health().then(({ ok }) => mounted && setBackendConnected(ok)).catch(() => mounted && setBackendConnected(false))
    }

    check() // immediate check
    const interval = setInterval(check, 5000) // retry every 5 seconds
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  return (
    <aside className="w-[220px] min-w-[220px] border-r border-white/10 bg-[#0c0e12] flex flex-col overflow-hidden flex-shrink-0 relative z-[9999]" style={{ pointerEvents: 'auto' }}>
      {/* Brand block */}
      <div className="px-3 py-2.5 border-b border-white/10 flex items-center gap-2">
        <Logo px={28} />
        <div className="leading-tight">
          <div className="font-mono text-[11px] font-bold text-[#e2e2e8]">
            SatQuery<span className="text-[#adc6ff]">AI</span>
          </div>
          <div className="font-mono text-[9px] text-[#c2c6d6]/50">Orbital Intelligence</div>
        </div>
      </div>

      {/* New Analysis */}
      <div className="p-3">
        <Link
          to="/missions"
          className="flex items-center justify-center gap-2 w-full py-2
                     bg-[#adc6ff]/10 hover:bg-[#adc6ff]/20 border border-[#adc6ff]/20
                     rounded-lg font-mono text-xs text-[#adc6ff] transition-colors"
        >              <span className="material-symbols-outlined text-[16px]">add</span>
          New Analysis
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 flex flex-col gap-0.5 overflow-y-auto scroll-thin">
        {NAV.map(item => {
          const active = activeKey
            ? activeKey === item.label
            : pathname === item.to
          return (
            <Link
              key={item.label}
              to={item.to}
              onClick={(e) => e.stopPropagation()}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                active
                  ? 'bg-[#adc6ff]/12 text-[#adc6ff]'
                  : 'text-[#c2c6d6] hover:bg-white/[0.06] hover:text-[#e2e2e8]'
              }`}
              style={{ pointerEvents: 'auto', position: 'relative', zIndex: 9999 }}
            >
              <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Status badge — hidden in development mode */}
      {import.meta.env.VITE_APP_ENV !== 'development' && (
      <div className="px-2 pb-1">
        {backendConnected
          ? <div className="flex items-center gap-2 px-2 py-1.5 bg-[#4edea3]/10 border border-[#4edea3]/20 rounded font-mono text-[9px] text-[#4edea3]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse-dot" />
              AI ANALYSIS READY
            </div>
          : <div className="flex items-center gap-2 px-2 py-1.5 bg-[#ffb4ab]/10 border border-[#ffb4ab]/20 rounded font-mono text-[9px] text-[#ffb4ab]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab] animate-pulse-dot" />
              BACKEND OFFLINE
            </div>
        }
      </div>
      )}

      {/* Footer */}
      <div className="px-4 pb-3 pt-3 border-t border-white/10 flex flex-col gap-1.5">
        <a href="#" className="flex items-center gap-2 text-[11px] text-[#c2c6d6]/60 hover:text-[#c2c6d6] transition-colors">
          <span className="material-symbols-outlined text-[14px]">help_outline</span> Support
        </a>
        <a href="#" className="flex items-center gap-2 text-[11px] text-[#c2c6d6]/60 hover:text-[#c2c6d6] transition-colors">
          <span className="material-symbols-outlined text-[14px]">wifi_tethering</span> System Status
        </a>
      </div>
    </aside>
  )
}
