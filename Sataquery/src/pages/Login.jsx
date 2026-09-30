import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Logo from '../components/shared/Logo'

export default function Login() {
  const navigate = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('Please fill in all fields.'); return }
    setLoading(true)
    // ── Backend not connected yet – simulate auth delay ──
    await new Promise(r => setTimeout(r, 800))
    setLoading(false)
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#0b0c10] flex flex-col items-center justify-center relative overflow-hidden bg-grid">
      {/* Ambient blobs */}
      <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-[#4d8eff]/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full bg-[#4edea3]/5 blur-[100px] pointer-events-none" />

      {/* Corner telemetry */}
      <div className="absolute top-6 left-8 font-mono text-[10px] text-[#c2c6d6]/40 hidden md:block">
        SYS: AUTH_GATEWAY_v3 | TLS: 1.3
      </div>
      <div className="absolute top-6 right-8 font-mono text-[10px] text-[#c2c6d6]/40 hidden md:block">
        NODE: EU-WEST-2 | PING: 12ms
      </div>

      {/* Logo */}
      <Link to="/" className="flex items-center gap-3 mb-8 group">
        <Logo size={9} className="rounded-lg" />
        <span className="font-mono font-bold text-lg text-[#e2e2e8] group-hover:text-[#adc6ff] transition-colors">
          SatQuery<span className="text-[#adc6ff]">AI</span>
        </span>
      </Link>

      {/* Card */}
      <div className="glass-panel w-full max-w-md mx-4 rounded-xl p-8 flex flex-col gap-6
                      shadow-[0_0_40px_rgba(77,142,255,0.12),0_0_80px_rgba(77,142,255,0.06)]">

        <div className="text-center flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-[#e2e2e8] tracking-tight">Welcome back</h1>
          <p className="text-sm text-[#c2c6d6]">Sign in to access orbital intelligence</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 bg-[#ffb4ab]/10 border border-[#ffb4ab]/30 rounded-lg">
            <span className="material-symbols-outlined text-[16px] text-[#ffb4ab]">error</span>
            <span className="font-mono text-xs text-[#ffb4ab]">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[10px] text-[#c2c6d6] tracking-widest uppercase">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] text-[#c2c6d6]/50">
                mail
              </span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="analyst@enterprise.com"
                autoComplete="email"
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg pl-10 pr-4 py-3 text-sm
                           text-[#e2e2e8] placeholder:text-[#c2c6d6]/35 focus:ring-0 focus:outline-none
                           focus:border-[#adc6ff]/50 transition-colors font-sans"
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="font-mono text-[10px] text-[#c2c6d6] tracking-widest uppercase">
                Password
              </label>
              <a href="#" className="font-mono text-[10px] text-[#adc6ff] hover:underline">
                Forgot password?
              </a>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] text-[#c2c6d6]/50">
                lock
              </span>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg pl-10 pr-12 py-3 text-sm
                           text-[#e2e2e8] placeholder:text-[#c2c6d6]/35 focus:ring-0 focus:outline-none
                           focus:border-[#adc6ff]/50 transition-colors font-sans"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px]
                           text-[#c2c6d6]/50 hover:text-[#c2c6d6] transition-colors"
              >
                {showPw ? 'visibility_off' : 'visibility'}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg font-semibold text-sm flex items-center justify-center gap-2
                       mt-1 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #4d8eff 0%, #adc6ff 100%)', color: '#001a42' }}
          >
            {loading
              ? <><span className="w-4 h-4 border-2 border-[#001a42]/40 border-t-[#001a42] rounded-full animate-spin-slow" /> Authenticating…</>
              : <> Continue <span className="material-symbols-outlined text-[18px]">arrow_forward</span></>
            }
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10" />
          <span className="font-mono text-[10px] text-[#c2c6d6]/50 tracking-widest">OR</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Google SSO */}
        <button
          onClick={() => navigate('/dashboard')}
          className="w-full flex items-center justify-center gap-3 py-3 rounded-lg border border-white/10
                     bg-white/[0.03] hover:bg-white/[0.06] transition-colors font-medium text-sm text-[#e2e2e8]"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>

        <p className="text-center text-sm text-[#c2c6d6]">
          Don't have an account?{' '}
          <a href="#" className="text-[#adc6ff] font-medium hover:underline">Create account</a>
        </p>
      </div>

      {/* System status */}
      <div className="mt-8 flex items-center gap-2 font-mono text-[11px] text-[#c2c6d6]/50">
        <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse-dot" />
        All systems nominal
      </div>
    </div>
  )
}
