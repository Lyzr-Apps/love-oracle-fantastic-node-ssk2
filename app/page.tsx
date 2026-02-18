'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  FaHeart, FaHeartbeat, FaComments, FaUser, FaUsers,
  FaCog, FaSignOutAlt, FaPaperPlane, FaEdit,
  FaToggleOn, FaToggleOff, FaChartLine, FaStar, FaHistory
} from 'react-icons/fa'
import { IoMdChatbubbles } from 'react-icons/io'
import { MdAdminPanelSettings } from 'react-icons/md'
import { BsStars, BsShieldLock } from 'react-icons/bs'

/* ─── Agent IDs ─── */
const COMPAT_ID = '6995c39b4ceab2f8e142b743'
const PREDICT_ID = '6995c39b7137f607943cfd12'
const CHAT_ID = '6995c39c30dee8e278c88eb0'

/* ─── Types ─── */
interface User { id: string; name: string; password: string; registeredAt: string; lastActive: string }
interface CompatResult { match_percentage: number; compatibility_level: string; advice: string; strengths: string; areas_to_work_on: string }
interface PredResult { short_term_prediction: string; long_term_prediction: string; potential_challenges: string; emotional_trajectory: string; key_advice: string; overall_outlook: string }
interface Relationship { id: string; userId: string; userName: string; partnerName: string; compatibility: CompatResult | null; prediction: PredResult | null; override: boolean; createdAt: string }
interface ChatMsg { id: string; sender: 'user' | 'specialist'; text: string; timestamp: string; sentiment?: string; topic?: string }
type View = 'auth' | 'dashboard' | 'chat' | 'history' | 'admin-login' | 'admin'
type ATab = 'users' | 'relationships' | 'chats' | 'settings'

/* ─── Helpers ─── */
const mkid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9)

function fmt(d: string): string {
  if (!d) return 'N/A'
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch (_e) { return d }
}

function getLS<T>(k: string, fb: T): T {
  if (typeof window === 'undefined') return fb
  try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb }
  catch (_e) { return fb }
}

function setLS(k: string, v: unknown) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(k, JSON.stringify(v)) }
  catch (_e) { /* quota */ }
}

function parseResult(r: any): Record<string, any> {
  if (!r) return {}
  if (typeof r === 'string') {
    try { return JSON.parse(r) }
    catch (_e) { return { text: r } }
  }
  return r
}

/* ─── Circular Progress ─── */
function CircleProgress({ pct, sz = 160 }: { pct: number; sz?: number }) {
  const [val, setVal] = useState(0)
  const sw = 10
  const rad = (sz - sw) / 2
  const circ = 2 * Math.PI * rad
  const off = circ - (val / 100) * circ
  const col = val >= 80 ? 'hsl(346,77%,50%)' : val >= 60 ? 'hsl(330,65%,45%)' : val >= 40 ? 'hsl(350,40%,55%)' : 'hsl(350,20%,60%)'

  useEffect(() => {
    setVal(0)
    const t = setTimeout(() => setVal(pct), 100)
    return () => clearTimeout(t)
  }, [pct])

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={sz} height={sz} className="transform -rotate-90">
        <circle cx={sz / 2} cy={sz / 2} r={rad} stroke="hsl(350,25%,88%)" strokeWidth={sw} fill="none" />
        <circle cx={sz / 2} cy={sz / 2} r={rad} stroke={col} strokeWidth={sw} fill="none"
          strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold">{val}%</span>
        <span className="text-xs text-muted-foreground">Match</span>
      </div>
    </div>
  )
}

function Pulse({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
      <FaHeartbeat className="w-8 h-8 text-primary animate-pulse" />
      <p className="text-sm text-muted-foreground">{text || 'Analyzing...'}</p>
    </div>
  )
}

function Dots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0s' }} />
      <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0.15s' }} />
      <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0.3s' }} />
    </div>
  )
}

function SectionBlock({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div>
      <h4 className="font-semibold text-sm flex items-center gap-1.5 mb-2">{icon} {title}</h4>
      <div className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">{text}</div>
    </div>
  )
}

/* ─────────────────── MAIN EXPORT ─────────────────── */
export default function Page() {
  const [view, setView] = useState<View>('auth')
  const [user, setUser] = useState<User | null>(null)
  const [aiOn, setAiOn] = useState(true)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const u = getLS<User | null>('lovematch_current_user', null)
    const ai = getLS<boolean>('lovematch_ai_enabled', true)
    const adm = getLS<boolean>('lovematch_admin_logged_in', false)
    setAiOn(ai)
    if (adm) { setView('admin') }
    else if (u) { setUser(u); setView('dashboard') }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    const iv = setInterval(() => setAiOn(getLS('lovematch_ai_enabled', true)), 3000)
    return () => clearInterval(iv)
  }, [ready])

  const login = (u: User) => { setUser(u); setView('dashboard') }
  const logout = () => {
    setUser(null)
    if (typeof window !== 'undefined') localStorage.removeItem('lovematch_current_user')
    setView('auth')
  }
  const admOut = () => {
    setLS('lovematch_admin_logged_in', false)
    const u = getLS<User | null>('lovematch_current_user', null)
    if (u) { setUser(u); setView('dashboard') } else setView('auth')
  }

  if (!ready) {
    return (
      <div className="gradient-bg min-h-screen flex items-center justify-center">
        <Pulse text="Loading LoveMatch..." />
      </div>
    )
  }

  if (view === 'auth') return <AuthScreen onLogin={login} />
  if (view === 'admin-login') return <AdminLoginScreen onLogin={() => setView('admin')} onBack={() => user ? setView('dashboard') : setView('auth')} />
  if (view === 'admin') return <AdminDash onLogout={admOut} />
  if (!user) return <AuthScreen onLogin={login} />

  return (
    <div className="gradient-bg min-h-screen">
      <NavBar cur={view} go={setView} name={user.name} out={logout} />
      {view === 'dashboard' && <DashboardView user={user} aiOn={aiOn} />}
      {view === 'chat' && <ChatView user={user} aiOn={aiOn} />}
      {view === 'history' && <HistoryView user={user} />}
    </div>
  )
}

/* ─── Auth ─── */
function AuthScreen({ onLogin }: { onLogin: (u: User) => void }) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')

  const go = () => {
    setErr('')
    if (!name.trim() || !pw.trim()) { setErr('Please fill in all fields'); return }
    const users: User[] = getLS('lovematch_users', [])
    if (tab === 'register') {
      if (users.find(u => u.name.toLowerCase() === name.trim().toLowerCase())) { setErr('Username already exists'); return }
      const nu: User = { id: mkid(), name: name.trim(), password: pw, registeredAt: new Date().toISOString(), lastActive: new Date().toISOString() }
      users.push(nu)
      setLS('lovematch_users', users)
      setLS('lovematch_current_user', nu)
      onLogin(nu)
    } else {
      const f = users.find(u => u.name.toLowerCase() === name.trim().toLowerCase() && u.password === pw)
      if (!f) { setErr('Invalid credentials'); return }
      f.lastActive = new Date().toISOString()
      setLS('lovematch_users', users)
      setLS('lovematch_current_user', f)
      onLogin(f)
    }
  }

  return (
    <div className="gradient-bg min-h-screen flex items-center justify-center p-4">
      <Card className="glass-card w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2"><FaHeart className="w-8 h-8 text-primary" /></div>
          <CardTitle className="text-2xl font-serif">LoveMatch</CardTitle>
          <CardDescription>Discover your relationship compatibility</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 mb-4">
            <Button variant={tab === 'login' ? 'default' : 'outline'} className="flex-1" onClick={() => { setTab('login'); setErr('') }}>Login</Button>
            <Button variant={tab === 'register' ? 'default' : 'outline'} className="flex-1" onClick={() => { setTab('register'); setErr('') }}>Register</Button>
          </div>
          <div className="space-y-2">
            <Label>Username</Label>
            <Input placeholder="Enter username" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" placeholder="Enter password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
          </div>
          {err && <p className="text-sm text-destructive text-center">{err}</p>}
        </CardContent>
        <CardFooter>
          <Button onClick={go} className="w-full gap-2">
            <FaHeart className="w-4 h-4" />
            {tab === 'login' ? 'Login' : 'Create Account'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

/* ─── Nav ─── */
function NavBar({ cur, go, name, out }: { cur: View; go: (v: View) => void; name: string; out: () => void }) {
  return (
    <div className="glass-card border-b border-border sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FaHeart className="w-5 h-5 text-primary" />
          <span className="font-serif font-semibold text-lg">LoveMatch</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant={cur === 'dashboard' ? 'default' : 'ghost'} size="sm" onClick={() => go('dashboard')} className="gap-1.5">
            <FaHeartbeat className="w-3.5 h-3.5" /><span className="hidden sm:inline">Dashboard</span>
          </Button>
          <Button variant={cur === 'chat' ? 'default' : 'ghost'} size="sm" onClick={() => go('chat')} className="gap-1.5">
            <IoMdChatbubbles className="w-3.5 h-3.5" /><span className="hidden sm:inline">Chat</span>
          </Button>
          <Button variant={cur === 'history' ? 'default' : 'ghost'} size="sm" onClick={() => go('history')} className="gap-1.5">
            <FaHistory className="w-3.5 h-3.5" /><span className="hidden sm:inline">History</span>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 hidden sm:inline-flex"><FaUser className="w-3 h-3" /> {name}</Badge>
          <Button variant="ghost" size="sm" onClick={() => go('admin-login')}><MdAdminPanelSettings className="w-4 h-4 text-muted-foreground" /></Button>
          <Button variant="ghost" size="sm" onClick={out}><FaSignOutAlt className="w-4 h-4 text-muted-foreground" /></Button>
        </div>
      </div>
    </div>
  )
}

/* ─── Dashboard ─── */
function DashboardView({ user, aiOn }: { user: User; aiOn: boolean }) {
  const [yn, setYn] = useState('')
  const [pn, setPn] = useState('')
  const [busy, setBusy] = useState(false)
  const [predBusy, setPredBusy] = useState(false)
  const [relId, setRelId] = useState<string | null>(null)
  const [rels, setRels] = useState<Relationship[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    const all: Relationship[] = getLS('lovematch_relationships', [])
    const mine = all.filter(r => r.userId === user.id)
    setRels(mine)
    if (mine.length > 0) setRelId(mine[mine.length - 1].id)
  }, [user.id])

  useEffect(() => {
    const iv = setInterval(() => {
      const all: Relationship[] = getLS('lovematch_relationships', [])
      setRels(all.filter(r => r.userId === user.id))
    }, 4000)
    return () => clearInterval(iv)
  }, [user.id])

  const cur = rels.find(r => r.id === relId) || null

  const check = async () => {
    if (!yn.trim() || !pn.trim()) { setErr('Please enter both names'); return }
    setErr('')
    setBusy(true)
    const rid = mkid()
    const nr: Relationship = { id: rid, userId: user.id, userName: yn.trim(), partnerName: pn.trim(), compatibility: null, prediction: null, override: false, createdAt: new Date().toISOString() }

    if (aiOn) {
      try {
        const res = await callAIAgent(
          `Analyze the compatibility between ${yn.trim()} and ${pn.trim()}. Provide match percentage, compatibility level, advice, strengths, and areas to work on.`,
          COMPAT_ID, { user_id: user.id, session_id: `compat-${user.id}` }
        )
        if (res.success && res.response?.result) {
          const d = parseResult(res.response.result)
          nr.compatibility = {
            match_percentage: typeof d.match_percentage === 'number' ? d.match_percentage : parseInt(String(d.match_percentage || '0'), 10),
            compatibility_level: String(d.compatibility_level || 'Growing Connection'),
            advice: String(d.advice || ''),
            strengths: String(d.strengths || ''),
            areas_to_work_on: String(d.areas_to_work_on || '')
          }
        } else {
          setErr('Could not get result. Please try again.')
        }
      } catch (_e) {
        setErr('An error occurred. Please try again.')
      }
    }

    const all: Relationship[] = getLS('lovematch_relationships', [])
    all.push(nr)
    setLS('lovematch_relationships', all)
    setRels(all.filter(r => r.userId === user.id))
    setRelId(rid)
    setBusy(false)
  }

  const predict = async () => {
    if (!cur?.compatibility) return
    setPredBusy(true)
    try {
      const res = await callAIAgent(
        `Generate a future relationship prediction for ${cur.userName} and ${cur.partnerName}. Their compatibility level is ${cur.compatibility.compatibility_level} at ${cur.compatibility.match_percentage}%. Provide short-term prediction, long-term prediction, potential challenges, emotional trajectory, key advice, and overall outlook.`,
        PREDICT_ID, { user_id: user.id, session_id: `pred-${user.id}` }
      )
      if (res.success && res.response?.result) {
        const d = parseResult(res.response.result)
        const pred: PredResult = {
          short_term_prediction: String(d.short_term_prediction || ''),
          long_term_prediction: String(d.long_term_prediction || ''),
          potential_challenges: String(d.potential_challenges || ''),
          emotional_trajectory: String(d.emotional_trajectory || 'Steady'),
          key_advice: String(d.key_advice || ''),
          overall_outlook: String(d.overall_outlook || 'Promising')
        }
        const all: Relationship[] = getLS('lovematch_relationships', [])
        const idx = all.findIndex(r => r.id === cur.id)
        if (idx >= 0) {
          all[idx].prediction = pred
          setLS('lovematch_relationships', all)
          setRels(all.filter(r => r.userId === user.id))
        }
      }
    } catch (_e) { /* silent */ }
    setPredBusy(false)
  }

  const levelBg = (l: string) => {
    const lo = (l || '').toLowerCase()
    if (lo.includes('soulmate')) return 'bg-primary text-primary-foreground'
    if (lo.includes('strong')) return 'bg-accent text-accent-foreground'
    return 'bg-secondary text-secondary-foreground'
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="text-center mb-4">
        <h1 className="text-2xl font-serif font-bold flex items-center justify-center gap-2">
          <FaHeartbeat className="w-6 h-6 text-primary" /> Compatibility Check
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Enter your names and discover your love compatibility</p>
      </div>

      <Card className="glass-card shadow-lg">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <Label>Your Name</Label>
              <Input placeholder="Enter your name" value={yn} onChange={e => setYn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Partner&apos;s Name</Label>
              <Input placeholder="Enter partner's name" value={pn} onChange={e => setPn(e.target.value)} />
            </div>
          </div>
          {err && <p className="text-sm text-destructive mb-3">{err}</p>}
          <Button onClick={check} disabled={busy} className="w-full gap-2">
            {busy ? <><FaHeartbeat className="w-4 h-4 animate-pulse" /> Analyzing...</> : <><FaHeart className="w-4 h-4" /> Check Compatibility</>}
          </Button>
          {!aiOn && (
            <p className="text-xs text-muted-foreground text-center mt-2 flex items-center justify-center gap-1">
              <FaToggleOff className="w-3 h-3" /> Manual mode - Admin will review your request.
            </p>
          )}
        </CardContent>
      </Card>

      {busy && <Pulse text="Analyzing your compatibility..." />}

      {cur && !busy && (
        <Card className="glass-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FaHeart className="w-5 h-5 text-primary" /> {cur.userName} & {cur.partnerName}
            </CardTitle>
            <CardDescription>Analysis from {fmt(cur.createdAt)}</CardDescription>
          </CardHeader>
          <CardContent>
            {cur.compatibility ? (
              <div className="space-y-6">
                <div className="flex flex-col items-center gap-4">
                  <CircleProgress pct={cur.compatibility.match_percentage} />
                  <Badge className={levelBg(cur.compatibility.compatibility_level)}>
                    <FaStar className="w-3 h-3 mr-1" /> {cur.compatibility.compatibility_level}
                  </Badge>
                </div>
                <Separator />
                <div className="space-y-4">
                  <SectionBlock icon={<FaHeart className="w-3.5 h-3.5 text-primary" />} title="Advice" text={cur.compatibility.advice} />
                  <SectionBlock icon={<BsStars className="w-3.5 h-3.5 text-primary" />} title="Strengths" text={cur.compatibility.strengths} />
                  <SectionBlock icon={<FaChartLine className="w-3.5 h-3.5 text-accent" />} title="Areas to Work On" text={cur.compatibility.areas_to_work_on} />
                </div>
                <Separator />
                {!cur.prediction && !predBusy && (
                  <Button onClick={predict} className="w-full gap-2" variant="outline">
                    <BsStars className="w-4 h-4" /> View Future Prediction
                  </Button>
                )}
                {predBusy && <Pulse text="Predicting your future..." />}
                {cur.prediction && <PredCard p={cur.prediction} />}
              </div>
            ) : (
              <div className="text-center py-8">
                <FaHeartbeat className="w-10 h-10 text-muted-foreground mx-auto mb-3 animate-pulse" />
                <p className="text-muted-foreground font-medium">Pending - Awaiting Analysis</p>
                <p className="text-xs text-muted-foreground mt-1">The admin will review and provide your results</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {rels.length > 1 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FaHistory className="w-4 h-4 text-muted-foreground" /> Previous Analyses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rels.filter(r => r.id !== relId).reverse().map(rel => (
                <button key={rel.id} onClick={() => setRelId(rel.id)} className="w-full text-left p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{rel.userName} & {rel.partnerName}</span>
                    {rel.compatibility ? <Badge variant="secondary">{rel.compatibility.match_percentage}%</Badge> : <Badge variant="outline">Pending</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{fmt(rel.createdAt)}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ─── Prediction Card ─── */
function PredCard({ p }: { p: PredResult }) {
  const trajIcon = (t: string) => {
    const tl = (t || '').toLowerCase()
    if (tl.includes('rising')) return <FaChartLine className="w-4 h-4 text-green-600" />
    if (tl.includes('deepening')) return <FaHeart className="w-4 h-4 text-primary" />
    if (tl.includes('transformative')) return <BsStars className="w-4 h-4 text-accent" />
    return <FaHeartbeat className="w-4 h-4 text-muted-foreground" />
  }
  const outlookCl = (o: string) => {
    const ol = (o || '').toLowerCase()
    if (ol.includes('very promising')) return 'bg-green-100 text-green-800'
    if (ol.includes('promising')) return 'bg-blue-100 text-blue-800'
    if (ol.includes('needs attention')) return 'bg-yellow-100 text-yellow-800'
    return 'bg-orange-100 text-orange-800'
  }
  const items = [
    { label: 'Short-Term Prediction', val: p.short_term_prediction, icon: <FaChartLine className="w-4 h-4 text-primary" /> },
    { label: 'Long-Term Prediction', val: p.long_term_prediction, icon: <FaStar className="w-4 h-4 text-accent" /> },
    { label: 'Potential Challenges', val: p.potential_challenges, icon: <FaHeartbeat className="w-4 h-4 text-destructive" /> },
    { label: 'Key Advice', val: p.key_advice, icon: <BsStars className="w-4 h-4 text-primary" /> },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <BsStars className="w-5 h-5 text-primary" /> Future Prediction
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">{trajIcon(p.emotional_trajectory)}<span className="text-xs font-medium">{p.emotional_trajectory}</span></div>
          <Badge variant="outline" className={outlookCl(p.overall_outlook)}>{p.overall_outlook}</Badge>
        </div>
      </div>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">{item.icon}</div>
              {i < items.length - 1 && <div className="w-0.5 flex-1 bg-border mt-1" />}
            </div>
            <div className="flex-1 pb-4">
              <p className="text-sm font-semibold mb-1">{item.label}</p>
              <div className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">{item.val}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Chat ─── */
function ChatView({ user, aiOn }: { user: User; aiOn: boolean }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [inp, setInp] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sid = `chat-${user.id}`

  useEffect(() => {
    const all: Record<string, ChatMsg[]> = getLS('lovematch_chats', {})
    if (Array.isArray(all[user.id])) setMsgs(all[user.id])
  }, [user.id])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTo(0, scrollRef.current.scrollHeight)
  }, [msgs, sending])

  useEffect(() => {
    if (aiOn) return
    const iv = setInterval(() => {
      const all: Record<string, ChatMsg[]> = getLS('lovematch_chats', {})
      if (Array.isArray(all[user.id]) && all[user.id].length !== msgs.length) setMsgs(all[user.id])
    }, 3000)
    return () => clearInterval(iv)
  }, [aiOn, user.id, msgs.length])

  const save = (m: ChatMsg[]) => {
    const all: Record<string, ChatMsg[]> = getLS('lovematch_chats', {})
    all[user.id] = m
    setLS('lovematch_chats', all)
  }

  const send = async () => {
    if (!inp.trim()) return
    const txt = inp.trim()
    setInp('')
    const um: ChatMsg = { id: mkid(), sender: 'user', text: txt, timestamp: new Date().toISOString() }
    const upd = [...msgs, um]
    setMsgs(upd)
    save(upd)
    setSending(true)

    if (aiOn) {
      try {
        const res = await callAIAgent(txt, CHAT_ID, { user_id: user.id, session_id: sid })
        if (res.success && res.response?.result) {
          const d = parseResult(res.response.result)
          const sm: ChatMsg = {
            id: mkid(), sender: 'specialist',
            text: String(d.response_text || d.text || d.message || 'I am here for you. Could you tell me more?'),
            timestamp: new Date().toISOString(),
            sentiment: String(d.sentiment || ''),
            topic: String(d.topic || '')
          }
          const wr = [...upd, sm]
          setMsgs(wr)
          save(wr)
        }
      } catch (_e) { /* silent */ }
    }
    setSending(false)
  }

  return (
    <div className="max-w-3xl mx-auto h-[calc(100vh-64px)] flex flex-col">
      <div className="glass-card border-b p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <FaHeart className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Love Specialist</h3>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-muted-foreground">Online</span>
          </div>
        </div>
        <Badge variant={aiOn ? 'default' : 'outline'} className="text-xs">{aiOn ? 'AI' : 'Manual'}</Badge>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {msgs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <FaComments className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-muted-foreground font-medium">Start a conversation with your Love Specialist</p>
            <p className="text-xs text-muted-foreground">Ask about relationships, love, communication, or anything on your heart</p>
          </div>
        )}
        {msgs.map(m => (
          <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[80%]">
              {m.sender === 'specialist' && (
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <FaHeart className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-xs text-muted-foreground">Love Specialist</span>
                </div>
              )}
              <div className={`rounded-2xl px-4 py-2.5 shadow-sm ${m.sender === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-card border border-border rounded-bl-md'}`}>
                <p className="text-sm whitespace-pre-wrap">{m.text}</p>
              </div>
              <div className="flex items-center gap-2 mt-1 px-1">
                <span className="text-[10px] text-muted-foreground">{fmt(m.timestamp)}</span>
                {m.sender === 'specialist' && m.sentiment && <Badge variant="outline" className="text-[10px] h-4 px-1">{m.sentiment}</Badge>}
                {m.sender === 'specialist' && m.topic && <Badge variant="outline" className="text-[10px] h-4 px-1">{m.topic}</Badge>}
              </div>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl rounded-bl-md shadow-sm"><Dots /></div>
          </div>
        )}
      </div>

      <div className="glass-card border-t p-4">
        <div className="flex gap-2">
          <Input placeholder="Type your message..." value={inp} onChange={e => setInp(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} disabled={sending} className="flex-1" />
          <Button onClick={send} disabled={sending || !inp.trim()} size="icon"><FaPaperPlane className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  )
}

/* ─── History ─── */
function HistoryView({ user }: { user: User }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  useEffect(() => {
    const all: Record<string, ChatMsg[]> = getLS('lovematch_chats', {})
    if (Array.isArray(all[user.id])) setMsgs(all[user.id])
  }, [user.id])

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <h2 className="text-xl font-serif font-bold flex items-center gap-2">
        <FaHistory className="w-5 h-5 text-primary" /> Chat History
      </h2>
      {msgs.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <FaComments className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No conversations yet</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card">
          <CardContent className="pt-4">
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-3 pr-4">
                {msgs.map(m => (
                  <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[80%]">
                      <div className={`rounded-2xl px-4 py-2.5 ${m.sender === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-secondary rounded-bl-md'}`}>
                        <p className="text-sm whitespace-pre-wrap">{m.text}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 block px-1">{fmt(m.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ─── Admin Login ─── */
function AdminLoginScreen({ onLogin, onBack }: { onLogin: () => void; onBack: () => void }) {
  const [un, setUn] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')

  const go = () => {
    if (un === 'FAIRIN' && pw === '123456123456') {
      setLS('lovematch_admin_logged_in', true)
      onLogin()
    } else {
      setErr('Invalid admin credentials')
    }
  }

  return (
    <div className="gradient-bg min-h-screen flex items-center justify-center p-4">
      <Card className="glass-card w-full max-w-sm shadow-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2"><BsShieldLock className="w-8 h-8 text-accent" /></div>
          <CardTitle className="text-xl font-serif">Admin Access</CardTitle>
          <CardDescription>LoveMatch Administration Panel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Username</Label>
            <Input placeholder="Admin username" value={un} onChange={e => setUn(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" placeholder="Admin password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
          </div>
          {err && <p className="text-sm text-destructive text-center">{err}</p>}
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button onClick={go} className="w-full gap-2"><BsShieldLock className="w-4 h-4" /> Login</Button>
          <Button variant="ghost" size="sm" onClick={onBack} className="w-full text-muted-foreground">Back to App</Button>
        </CardFooter>
      </Card>
    </div>
  )
}

/* ─── Admin Dashboard ─── */
function AdminDash({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<ATab>('users')
  const [users, setUsers] = useState<User[]>([])
  const [rels, setRels] = useState<Relationship[]>([])
  const [chats, setChats] = useState<Record<string, ChatMsg[]>>({})
  const [aiOn, setAiOn] = useState(true)
  const [editRel, setEditRel] = useState<Relationship | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [replyUid, setReplyUid] = useState<string | null>(null)
  const [replyTxt, setReplyTxt] = useState('')

  const [oPct, setOPct] = useState('')
  const [oLvl, setOLvl] = useState('')
  const [oAdv, setOAdv] = useState('')
  const [oStr, setOStr] = useState('')
  const [oArea, setOArea] = useState('')
  const [oStp, setOStp] = useState('')
  const [oLtp, setOLtp] = useState('')
  const [oChl, setOChl] = useState('')
  const [oTrj, setOTrj] = useState('')
  const [oKad, setOKad] = useState('')
  const [oOut, setOOut] = useState('')

  const load = useCallback(() => {
    setUsers(getLS('lovematch_users', []))
    setRels(getLS('lovematch_relationships', []))
    setChats(getLS('lovematch_chats', {}))
    setAiOn(getLS('lovematch_ai_enabled', true))
  }, [])

  useEffect(() => { load(); const iv = setInterval(load, 5000); return () => clearInterval(iv) }, [load])

  const toggleAI = (v: boolean) => { setAiOn(v); setLS('lovematch_ai_enabled', v) }

  const openEdit = (r: Relationship) => {
    setEditRel(r)
    setOPct(String(r.compatibility?.match_percentage ?? ''))
    setOLvl(r.compatibility?.compatibility_level ?? '')
    setOAdv(r.compatibility?.advice ?? '')
    setOStr(r.compatibility?.strengths ?? '')
    setOArea(r.compatibility?.areas_to_work_on ?? '')
    setOStp(r.prediction?.short_term_prediction ?? '')
    setOLtp(r.prediction?.long_term_prediction ?? '')
    setOChl(r.prediction?.potential_challenges ?? '')
    setOTrj(r.prediction?.emotional_trajectory ?? '')
    setOKad(r.prediction?.key_advice ?? '')
    setOOut(r.prediction?.overall_outlook ?? '')
    setEditOpen(true)
  }

  const saveEdit = () => {
    if (!editRel) return
    const all: Relationship[] = getLS('lovematch_relationships', [])
    const idx = all.findIndex(r => r.id === editRel.id)
    if (idx < 0) return
    all[idx].compatibility = {
      match_percentage: parseInt(oPct || '0', 10),
      compatibility_level: oLvl || 'Growing Connection',
      advice: oAdv, strengths: oStr, areas_to_work_on: oArea
    }
    all[idx].override = true
    if (oStp || oLtp) {
      all[idx].prediction = {
        short_term_prediction: oStp, long_term_prediction: oLtp,
        potential_challenges: oChl, emotional_trajectory: oTrj || 'Steady',
        key_advice: oKad, overall_outlook: oOut || 'Promising'
      }
    }
    setLS('lovematch_relationships', all)
    setRels(all)
    setEditOpen(false)
    setEditRel(null)
  }

  const adminReply = (userId: string) => {
    if (!replyTxt.trim()) return
    const c: Record<string, ChatMsg[]> = getLS('lovematch_chats', {})
    if (!Array.isArray(c[userId])) c[userId] = []
    c[userId].push({ id: mkid(), sender: 'specialist', text: replyTxt.trim(), timestamp: new Date().toISOString(), sentiment: 'supportive', topic: 'general' })
    setLS('lovematch_chats', c)
    setChats({ ...c })
    setReplyTxt('')
    setReplyUid(null)
  }

  const getName = (id: string) => users.find(u => u.id === id)?.name || id

  const sideItems: { key: ATab; label: string; icon: React.ReactNode }[] = [
    { key: 'users', label: 'Users', icon: <FaUsers className="w-4 h-4" /> },
    { key: 'relationships', label: 'Relationships', icon: <FaHeart className="w-4 h-4" /> },
    { key: 'chats', label: 'Chats', icon: <IoMdChatbubbles className="w-4 h-4" /> },
    { key: 'settings', label: 'Settings', icon: <FaCog className="w-4 h-4" /> },
  ]

  return (
    <div className="gradient-bg min-h-screen flex">
      {/* Sidebar */}
      <div className="w-56 glass-card border-r border-border min-h-screen flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <MdAdminPanelSettings className="w-6 h-6 text-accent" />
            <span className="font-serif font-semibold text-sm">Admin Panel</span>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {sideItems.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${tab === t.key ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-secondary'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onLogout} className="w-full gap-2 text-muted-foreground">
            <FaSignOutAlt className="w-3.5 h-3.5" /> Logout
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {tab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-serif font-bold flex items-center gap-2"><FaUsers className="w-5 h-5 text-primary" /> Registered Users</h2>
              <Badge variant="secondary">{users.length} users</Badge>
            </div>
            <Card className="glass-card">
              <CardContent className="pt-4">
                {users.length === 0 ? (
                  <div className="text-center py-8"><FaUser className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" /><p className="text-muted-foreground">No registered users yet</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b"><th className="text-left py-2 px-3 font-medium">Name</th><th className="text-left py-2 px-3 font-medium">Registered</th><th className="text-left py-2 px-3 font-medium">Last Active</th></tr></thead>
                      <tbody>
                        {users.map(u => (
                          <tr key={u.id} className="border-b last:border-0">
                            <td className="py-2 px-3"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center"><FaUser className="w-3 h-3 text-primary" /></div>{u.name}</div></td>
                            <td className="py-2 px-3 text-muted-foreground">{fmt(u.registeredAt)}</td>
                            <td className="py-2 px-3 text-muted-foreground">{fmt(u.lastActive)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'relationships' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-serif font-bold flex items-center gap-2"><FaHeart className="w-5 h-5 text-primary" /> Compatibility Entries</h2>
              <Badge variant="secondary">{rels.length} entries</Badge>
            </div>
            <Card className="glass-card">
              <CardContent className="pt-4">
                {rels.length === 0 ? (
                  <div className="text-center py-8"><FaHeart className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" /><p className="text-muted-foreground">No entries yet</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b"><th className="text-left py-2 px-3 font-medium">Couple</th><th className="text-left py-2 px-3 font-medium">Match</th><th className="text-left py-2 px-3 font-medium">Level</th><th className="text-left py-2 px-3 font-medium">Status</th><th className="text-left py-2 px-3 font-medium">Action</th></tr></thead>
                      <tbody>
                        {rels.map(r => (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="py-2 px-3 font-medium">{r.userName} & {r.partnerName}</td>
                            <td className="py-2 px-3">{r.compatibility ? <Badge>{r.compatibility.match_percentage}%</Badge> : <Badge variant="outline">Pending</Badge>}</td>
                            <td className="py-2 px-3">{r.compatibility?.compatibility_level || 'N/A'}</td>
                            <td className="py-2 px-3">{r.override ? <Badge variant="secondary" className="text-xs"><FaEdit className="w-2.5 h-2.5 mr-1" />Overridden</Badge> : <span className="text-xs text-muted-foreground">Original</span>}</td>
                            <td className="py-2 px-3"><Button size="sm" variant="outline" onClick={() => openEdit(r)} className="gap-1"><FaEdit className="w-3 h-3" /> Edit</Button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'chats' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-serif font-bold flex items-center gap-2"><IoMdChatbubbles className="w-5 h-5 text-primary" /> All Conversations</h2>
              <Badge variant={aiOn ? 'default' : 'outline'}>{aiOn ? 'AI Responding' : 'Manual Replies'}</Badge>
            </div>
            {Object.keys(chats).length === 0 ? (
              <Card className="glass-card">
                <CardContent className="py-12 text-center">
                  <FaComments className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">No conversations yet</p>
                </CardContent>
              </Card>
            ) : (
              Object.entries(chats).map(([userId, ms]) => {
                const safe = Array.isArray(ms) ? ms : []
                return (
                  <Card key={userId} className="glass-card">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2"><FaUser className="w-3.5 h-3.5 text-primary" /> {getName(userId)}</CardTitle>
                        <Badge variant="secondary" className="text-xs">{safe.length} messages</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-48">
                        <div className="space-y-2 pr-4">
                          {safe.slice(-10).map(m => (
                            <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${m.sender === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>{m.text}</div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                      {!aiOn && (
                        <div className="mt-3 pt-3 border-t border-border">
                          {replyUid === userId ? (
                            <div className="flex gap-2">
                              <Input placeholder="Type admin reply..." value={replyTxt} onChange={e => setReplyTxt(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') adminReply(userId) }} className="flex-1 text-sm" />
                              <Button size="sm" onClick={() => adminReply(userId)}><FaPaperPlane className="w-3 h-3" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => { setReplyUid(null); setReplyTxt('') }}>Cancel</Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setReplyUid(userId)} className="w-full gap-2">
                              <FaPaperPlane className="w-3 h-3" /> Reply as Love Specialist
                            </Button>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div className="space-y-4">
            <h2 className="text-xl font-serif font-bold flex items-center gap-2"><FaCog className="w-5 h-5 text-primary" /> Settings</h2>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">AI Agent Control</CardTitle>
                <CardDescription>Toggle AI-powered responses on or off globally</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3">
                    {aiOn ? <FaToggleOn className="w-6 h-6 text-primary" /> : <FaToggleOff className="w-6 h-6 text-muted-foreground" />}
                    <div>
                      <p className="font-medium text-sm">AI Responses</p>
                      <p className="text-xs text-muted-foreground">{aiOn ? 'Agents are actively responding' : 'Manual mode - you are the Love Specialist'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={aiOn ? 'default' : 'outline'} className="text-xs">{aiOn ? 'Active' : 'Disabled'}</Badge>
                    <Switch checked={aiOn} onCheckedChange={toggleAI} />
                  </div>
                </div>
                {!aiOn && (
                  <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-sm text-destructive font-medium">Manual mode active - reply to chats in the Chats tab.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Agent Information</CardTitle>
                <CardDescription>AI agents powering LoveMatch</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { name: 'Compatibility Analyst', id: COMPAT_ID, icon: <FaHeartbeat className="w-4 h-4 text-primary" /> },
                  { name: 'Prediction Agent', id: PREDICT_ID, icon: <BsStars className="w-4 h-4 text-accent" /> },
                  { name: 'Love Specialist Chat', id: CHAT_ID, icon: <IoMdChatbubbles className="w-4 h-4 text-primary" /> },
                ].map(a => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <div className="flex items-center gap-2">
                      {a.icon}
                      <div>
                        <p className="text-sm font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{a.id}</p>
                      </div>
                    </div>
                    <Badge variant={aiOn ? 'default' : 'outline'} className="text-xs">{aiOn ? 'Ready' : 'Off'}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader><CardTitle className="text-base">Statistics</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-lg bg-secondary/50">
                    <p className="text-2xl font-bold text-primary">{users.length}</p>
                    <p className="text-xs text-muted-foreground">Users</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-secondary/50">
                    <p className="text-2xl font-bold text-accent">{rels.length}</p>
                    <p className="text-xs text-muted-foreground">Analyses</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-secondary/50">
                    <p className="text-2xl font-bold">{Object.values(chats).reduce((s, m) => s + (Array.isArray(m) ? m.length : 0), 0)}</p>
                    <p className="text-xs text-muted-foreground">Messages</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Edit Override Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FaEdit className="w-4 h-4 text-primary" /> Edit Compatibility</DialogTitle>
            <DialogDescription>Override results for {editRel?.userName} & {editRel?.partnerName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Match % (0-100)</Label><Input type="number" min={0} max={100} value={oPct} onChange={e => setOPct(e.target.value)} /></div>
              <div className="space-y-2"><Label>Level</Label><Input value={oLvl} onChange={e => setOLvl(e.target.value)} placeholder="e.g. Soulmates" /></div>
            </div>
            <div className="space-y-2"><Label>Advice</Label><Textarea value={oAdv} onChange={e => setOAdv(e.target.value)} rows={3} /></div>
            <div className="space-y-2"><Label>Strengths</Label><Textarea value={oStr} onChange={e => setOStr(e.target.value)} rows={3} /></div>
            <div className="space-y-2"><Label>Areas to Work On</Label><Textarea value={oArea} onChange={e => setOArea(e.target.value)} rows={3} /></div>
            <Separator />
            <p className="text-sm font-semibold text-muted-foreground">Prediction (optional)</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Short-Term</Label><Textarea value={oStp} onChange={e => setOStp(e.target.value)} rows={2} /></div>
              <div className="space-y-2"><Label>Long-Term</Label><Textarea value={oLtp} onChange={e => setOLtp(e.target.value)} rows={2} /></div>
            </div>
            <div className="space-y-2"><Label>Challenges</Label><Textarea value={oChl} onChange={e => setOChl(e.target.value)} rows={2} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Trajectory</Label><Input value={oTrj} onChange={e => setOTrj(e.target.value)} placeholder="e.g. Rising" /></div>
              <div className="space-y-2"><Label>Outlook</Label><Input value={oOut} onChange={e => setOOut(e.target.value)} placeholder="e.g. Very Promising" /></div>
            </div>
            <div className="space-y-2"><Label>Key Advice</Label><Textarea value={oKad} onChange={e => setOKad(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} className="gap-2"><FaEdit className="w-3 h-3" /> Save Override</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
