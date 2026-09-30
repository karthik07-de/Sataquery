import { Link, useLocation } from 'react-router-dom'
import Logo from './Logo'

const APP_TABS = [
  { label: 'Dashboard',  to: '/dashboard' },
  { label: 'Missions',   to: '/missions' },
  { label: 'Analytics',  to: '/analytics' },
  { label: 'Projects',   to: '/projects' },
  { label: 'Archive',    to: '/change-detection' },
]

export default function Navbar() {
  const { pathname } = useLocation()

  return (
    <header
      style={{ height: 48, minHeight: 48, maxHeight: 48, flexShrink: 0, zIndex: 9999, overflow: 'hidden' }}
      className="border-b border-white/10 bg-[#0c0e12] flex items-center px-4 gap-4 relative z-[9999]"
    >
      {/* ── Brand (small, fixed size) ── */}
      <Link to="/" className="flex items-center gap-2 mr-2 group" style={{ textDecoration: 'none' }}>
        <Logo px={28} />
        <span
          className="font-mono font-bold text-[#e2e2e8] group-hover:text-[#adc6ff] transition-colors"
          style={{ fontSize: 13, lineHeight: 1, whiteSpace: 'nowrap' }}
        >
          SatQuery<span className="text-[#adc6ff]">AI</span>
        </span>
      </Link>

      {/* ── Page tabs ── */}
      <nav className="flex items-center gap-0.5 ml-2">
        {APP_TABS.map(tab => {
          const active =
            pathname === tab.to ||
            (tab.to !== '/dashboard' && pathname.startsWith(tab.to))
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`px-3 py-1.5 font-mono text-xs transition-colors ${
                active ? 'nav-tab-active' : 'text-[#c2c6d6] hover:text-[#e2e2e8]'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>

      {/* ── Right controls ── */}
      <div className="flex items-center gap-3 ml-auto">
        <button
          onClick={() => alert('Location search: use the map search box or navigate to /dashboard to search locations')}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#111318] border border-white/10
                     rounded-lg font-mono text-xs text-[#c2c6d6] hover:border-[#adc6ff]/30
                     hover:text-[#adc6ff] transition-colors cursor-pointer"
          aria-label="Search locations"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>search</span>
          Search any location…
        </button>

        <button
          onClick={() => alert('Notifications: connect backend notification/presence endpoint')}
          className="flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors relative cursor-pointer"
          style={{ width: 32, height: 32 }}
        >
          <span className="material-symbols-outlined text-[#c2c6d6]" style={{ fontSize: 18 }}>notifications</span>
          <span
            className="absolute bg-[#ffb95f] rounded-full border border-[#0c0e12]"
            style={{ width: 8, height: 8, top: 4, right: 4 }}
          />
        </button>

        <button
          onClick={() => alert('Settings: connect backend user/preferences endpoint')}
          className="flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          style={{ width: 32, height: 32 }}
        >
          <span className="material-symbols-outlined text-[#c2c6d6]" style={{ fontSize: 18 }}>settings</span>
        </button>

        <div
          className="rounded-full bg-gradient-to-br from-[#adc6ff] to-[#4edea3] flex items-center
                     justify-center font-bold text-[#002e6a]"
          style={{ width: 32, height: 32, fontSize: 12 }}
        >
          A
        </div>
      </div>
    </header>
  )
}
