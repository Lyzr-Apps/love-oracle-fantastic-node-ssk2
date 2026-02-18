'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { FaHeart, FaHeartbeat, FaComments, FaUser, FaUsers, FaCog, FaSignOutAlt, FaPaperPlane, FaEdit, FaToggleOn, FaToggleOff, FaChartLine, FaStar, FaHistory } from 'react-icons/fa'
import { IoMdChatbubbles } from 'react-icons/io'
import { MdAdminPanelSettings } from 'react-icons/md'
import { BsStars, BsShieldLock } from 'react-icons/bs'

// ============================================================
// CONSTANTS
// ============================================================
const COMPATIBILITY_AGENT_ID = '6995c39b4ceab2f8e142b743'
const PREDICTION_AGENT_ID = '6995c39b7137f607943cfd12'
const CHAT_AGENT_ID = '6995c39c30dee8e278c88eb0'

// ============================================================
// TYPES
// ============================================================
interface User {
  id: string
  name: string
  password: string
  registeredAt: string
  lastActive: string
}

interface CompatibilityResult {
  match_percentage: number
  compatibility_level: string
  advice: string
  strengths: string
  areas_to_work_on: string
}

interface PredictionResult {
  short_term_prediction: string
  long_term_prediction: string
  potential_challenges: string
  emotional_trajectory: string
  key_advice: string
  overall_outlook: string
}

interface Relationship {
  id: string
  userId: string
  userName: string
  partnerName: string
  compatibility: CompatibilityResult | null
  prediction: PredictionResult | null
  override: boolean
  createdAt: string
}

interface ChatMessage {
  id: string
  sender: 'user' | 'specialist'
  text: string
  timestamp: string
  sentiment?: string
  topic?: string
}

type AppView = 'auth' | 'dashboard' | 'chat' | 'history' | 'admin-login' | 'admin'
type AdminTab = 'users' | 'relationships' | 'chats' | 'settings'

// ============================================================
// HELPERS
// ============================================================
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return dateStr
  }
}

function safeGetLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function safeSetLS(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota errors
  }
}

function parseAgentResult(result: Record<string, unknown> | string | undefined): Record<string, unknown> {
  if (!result) return {}
  if (typeof result === 'string') {
    try { return JSON.parse(result) } catch { return { text: result } }
  }
  return result as Record<string, unknown>
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part)
}

// ============================================================
// CIRCULAR PROGRESS COMPONENT
// ============================================================
function CircularProgress({ percentage, size = 160 }: { percentage: number; size?: number }) {
  const [animatedPct, setAnimatedPct] = useState(0)
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (animatedPct / 100) * circumference

  useEffect(() => {
    setAnimatedPct(0)
    const timer = setTimeout(() => {
      setAnimatedPct(percentage)
    }, 100)
    return () => clearTimeout(timer)
  }, [percentage])

  const getColor = (pct: number) => {
    if (pct >= 80) return 'hsl(346, 77%, 50%)'
    if (pct >= 60) return 'hsl(330, 65%, 45%)'
    if (pct >= 40) return 'hsl(350, 40%, 55%)'
    return 'hsl(350, 20%, 60%)'
  }

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="hsl(350, 25%, 88%)" strokeWidth={strokeWidth} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={getColor(animatedPct)} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-foreground">{animatedPct}%</span>
        <span className="text-xs text-muted-foreground">Match</span>
      </div>
    </div>
  )
}

// ============================================================
// HEART LOADING ANIMATION
// ============================================================
function HeartLoading({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
      <FaHeartbeat className="w-8 h-8 text-primary animate-pulse" />
      <p className="text-sm text-muted-foreground">{text || 'Analyzing...'}</p>
    </div>
  )
}

// ============================================================
// TYPING INDICATOR
// ============================================================
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <div className="w-2 h-2 rounded-full bg-primary animate-bounce" />
      <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0.15s' }} />
      <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0.3s' }} />
    </div>
  )
}

// ============================================================
// AUTH SCREEN
// ============================================================
function AuthScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    setError('')
    if (!name.trim() || !password.trim()) {
      setError('Please fill in all fields')
      return
    }
    const users: User[] = safeGetLS('lovematch_users', [])

    if (mode === 'register') {
      if (users.find(u => u.name.toLowerCase() === name.trim().toLowerCase())) {
        setError('Username already exists')
        return
      }
      const newUser: User = {
        id: generateId(),
        name: name.trim(),
        password: password,
        registeredAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
      }
      users.push(newUser)
      safeSetLS('lovematch_users', users)
      safeSetLS('lovematch_current_user', newUser)
      onLogin(newUser)
    } else {
      const found = users.find(u => u.name.toLowerCase() === name.trim().toLowerCase() && u.password === password)
      if (!found) {
        setError('Invalid username or password')
        return
      }
      found.lastActive = new Date().toISOString()
      safeSetLS('lovematch_users', users)
      safeSetLS('lovematch_current_user', found)
      onLogin(found)
    }
  }

  return (
    <div className="gradient-bg min-h-screen flex items-center justify-center p-4">
      <Card className="glass-card w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <FaHeart className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-serif">LoveMatch</CardTitle>
          <CardDescription>Discover your relationship compatibility</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={(v) => { setMode(v as 'login' | 'register'); setError('') }}>
            <TabsList className="w-full mb-4">
              <TabsTrigger value="login" className="flex-1">Login</TabsTrigger>
              <TabsTrigger value="register" className="flex-1">Register</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-name">Username</Label>
                <Input id="login-name" placeholder="Enter your username" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-pass">Password</Label>
                <Input id="login-pass" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
              </div>
            </TabsContent>
            <TabsContent value="register" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reg-name">Username</Label>
                <Input id="reg-name" placeholder="Choose a username" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-pass">Password</Label>
                <Input id="reg-pass" type="password" placeholder="Choose a password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} />
              </div>
            </TabsContent>
          </Tabs>
          {error && <p className="text-sm text-destructive mt-3 text-center">{error}</p>}
        </CardContent>
        <CardFooter>
          <Button onClick={handleSubmit} className="w-full gap-2">
            <FaHeart className="w-4 h-4" />
            {mode === 'login' ? 'Login' : 'Create Account'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

// ============================================================
// USER NAVBAR
// ============================================================
function UserNavbar({ currentView, onNavigate, userName, onLogout }: { currentView: AppView; onNavigate: (v: AppView) => void; userName: string; onLogout: () => void }) {
  return (
    <div className="glass-card border-b border-border sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FaHeart className="w-5 h-5 text-primary" />
          <span className="font-serif font-semibold text-lg text-foreground">LoveMatch</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant={currentView === 'dashboard' ? 'default' : 'ghost'} size="sm" onClick={() => onNavigate('dashboard')} className="gap-1.5">
            <FaHeartbeat className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
          <Button variant={currentView === 'chat' ? 'default' : 'ghost'} size="sm" onClick={() => onNavigate('chat')} className="gap-1.5">
            <IoMdChatbubbles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chat</span>
          </Button>
          <Button variant={currentView === 'history' ? 'default' : 'ghost'} size="sm" onClick={() => onNavigate('history')} className="gap-1.5">
            <FaHistory className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">History</span>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 hidden sm:inline-flex">
            <FaUser className="w-3 h-3" /> {userName}
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('admin-login')} className="text-muted-foreground">
            <MdAdminPanelSettings className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onLogout} className="text-muted-foreground">
            <FaSignOutAlt className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// COMPATIBILITY DISPLAY
// ============================================================
function CompatibilityDisplay({ result, prediction, onGetPrediction, loadingPrediction }: { result: CompatibilityResult; prediction: PredictionResult | null; onGetPrediction: () => void; loadingPrediction: boolean }) {
  const levelColor = (level: string) => {
    const l = level?.toLowerCase() || ''
    if (l.includes('soulmate')) return 'bg-primary text-primary-foreground'
    if (l.includes('strong')) return 'bg-accent text-accent-foreground'
    if (l.includes('growing')) return 'bg-secondary text-secondary-foreground'
    if (l.includes('budding')) return 'bg-muted text-muted-foreground'
    return 'bg-muted text-muted-foreground'
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-4">
        <CircularProgress percentage={result?.match_percentage ?? 0} />
        <Badge className={levelColor(result?.compatibility_level ?? '')}>
          <FaStar className="w-3 h-3 mr-1" /> {result?.compatibility_level ?? 'Unknown'}
        </Badge>
      </div>

      <Separator />

      <div className="space-y-4">
        <div>
          <h4 className="font-semibold text-sm flex items-center gap-1.5 mb-2">
            <FaHeart className="w-3.5 h-3.5 text-primary" /> Advice
          </h4>
          <div className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">
            {renderMarkdown(result?.advice ?? '')}
          </div>
        </div>
        <div>
          <h4 className="font-semibold text-sm flex items-center gap-1.5 mb-2">
            <BsStars className="w-3.5 h-3.5 text-primary" /> Strengths
          </h4>
          <div className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">
            {renderMarkdown(result?.strengths ?? '')}
          </div>
        </div>
        <div>
          <h4 className="font-semibold text-sm flex items-center gap-1.5 mb-2">
            <FaChartLine className="w-3.5 h-3.5 text-accent" /> Areas to Work On
          </h4>
          <div className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">
            {renderMarkdown(result?.areas_to_work_on ?? '')}
          </div>
        </div>
      </div>

      <Separator />

      {!prediction && !loadingPrediction && (
        <Button onClick={onGetPrediction} className="w-full gap-2" variant="outline">
          <BsStars className="w-4 h-4" /> View Future Prediction
        </Button>
      )}

      {loadingPrediction && <HeartLoading text="Predicting your future..." />}

      {prediction && <PredictionDisplay prediction={prediction} />}
    </div>
  )
}

// ============================================================
// PREDICTION DISPLAY
// ============================================================
function PredictionDisplay({ prediction }: { prediction: PredictionResult }) {
  const trajectoryIcon = (t: string) => {
    const tl = t?.toLowerCase() || ''
    if (tl.includes('rising')) return <FaChartLine className="w-4 h-4 text-green-600" />
    if (tl.includes('deepening')) return <FaHeart className="w-4 h-4 text-primary" />
    if (tl.includes('transformative')) return <BsStars className="w-4 h-4 text-accent" />
    return <FaHeartbeat className="w-4 h-4 text-muted-foreground" />
  }

  const outlookBadge = (o: string) => {
    const ol = o?.toLowerCase() || ''
    if (ol.includes('very promising')) return 'bg-green-100 text-green-800 border-green-200'
    if (ol.includes('promising')) return 'bg-blue-100 text-blue-800 border-blue-200'
    if (ol.includes('needs attention')) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    return 'bg-orange-100 text-orange-800 border-orange-200'
  }

  const timelineItems = [
    { label: 'Short-Term Prediction', value: prediction?.short_term_prediction ?? '', icon: <FaChartLine className="w-4 h-4 text-primary" /> },
    { label: 'Long-Term Prediction', value: prediction?.long_term_prediction ?? '', icon: <FaStar className="w-4 h-4 text-accent" /> },
    { label: 'Potential Challenges', value: prediction?.potential_challenges ?? '', icon: <FaHeartbeat className="w-4 h-4 text-destructive" /> },
    { label: 'Key Advice', value: prediction?.key_advice ?? '', icon: <BsStars className="w-4 h-4 text-primary" /> },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <BsStars className="w-5 h-5 text-primary" /> Future Prediction
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">{trajectoryIcon(prediction?.emotional_trajectory ?? '')}<span className="text-xs font-medium">{prediction?.emotional_trajectory ?? ''}</span></div>
          <Badge variant="outline" className={outlookBadge(prediction?.overall_outlook ?? '')}>{prediction?.overall_outlook ?? 'N/A'}</Badge>
        </div>
      </div>

      <div className="space-y-3">
        {timelineItems.map((item, idx) => (
          <div key={idx} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">{item.icon}</div>
              {idx < timelineItems.length - 1 && <div className="w-0.5 flex-1 bg-border mt-1" />}
            </div>
            <div className="flex-1 pb-4">
              <p className="text-sm font-semibold mb-1">{item.label}</p>
              <div className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3">
                {renderMarkdown(item.value)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// USER DASHBOARD
// ============================================================
function UserDashboard({ user, aiEnabled }: { user: User; aiEnabled: boolean }) {
  const [yourName, setYourName] = useState('')
  const [partnerName, setPartnerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingPrediction, setLoadingPrediction] = useState(false)
  const [currentRelId, setCurrentRelId] = useState<string | null>(null)
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [error, setError] = useState('')
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  useEffect(() => {
    const allRels: Relationship[] = safeGetLS('lovematch_relationships', [])
    const userRels = allRels.filter(r => r.userId === user.id)
    setRelationships(userRels)
    if (userRels.length > 0) {
      setCurrentRelId(userRels[userRels.length - 1].id)
    }
  }, [user.id])

  const currentRel = relationships.find(r => r.id === currentRelId) || null

  const handleCheckCompatibility = async () => {
    if (!yourName.trim() || !partnerName.trim()) {
      setError('Please enter both names')
      return
    }
    setError('')
    setLoading(true)
    setActiveAgentId(COMPATIBILITY_AGENT_ID)

    const relId = generateId()
    const newRel: Relationship = {
      id: relId,
      userId: user.id,
      userName: yourName.trim(),
      partnerName: partnerName.trim(),
      compatibility: null,
      prediction: null,
      override: false,
      createdAt: new Date().toISOString(),
    }

    if (aiEnabled) {
      try {
        const result = await callAIAgent(
          `Analyze the compatibility between ${yourName.trim()} and ${partnerName.trim()}. Provide match percentage, compatibility level, advice, strengths, and areas to work on.`,
          COMPATIBILITY_AGENT_ID,
          { user_id: user.id, session_id: `compat-${user.id}` }
        )
        if (result.success && result.response?.result) {
          const data = parseAgentResult(result.response.result as Record<string, unknown> | string)
          newRel.compatibility = {
            match_percentage: typeof data.match_percentage === 'number' ? data.match_percentage : parseInt(String(data.match_percentage || '0'), 10),
            compatibility_level: String(data.compatibility_level || 'Growing Connection'),
            advice: String(data.advice || ''),
            strengths: String(data.strengths || ''),
            areas_to_work_on: String(data.areas_to_work_on || ''),
          }
        } else {
          setError('Could not get compatibility result. Please try again.')
        }
      } catch {
        setError('An error occurred. Please try again.')
      }
    } else {
      // AI disabled - leave as pending
      newRel.compatibility = null
    }

    const allRels: Relationship[] = safeGetLS('lovematch_relationships', [])
    allRels.push(newRel)
    safeSetLS('lovematch_relationships', allRels)
    const userRels = allRels.filter(r => r.userId === user.id)
    setRelationships(userRels)
    setCurrentRelId(relId)
    setLoading(false)
    setActiveAgentId(null)
  }

  const handleGetPrediction = async () => {
    if (!currentRel?.compatibility) return
    setLoadingPrediction(true)
    setActiveAgentId(PREDICTION_AGENT_ID)

    try {
      const result = await callAIAgent(
        `Generate a future relationship prediction for ${currentRel.userName} and ${currentRel.partnerName}. Their compatibility level is ${currentRel.compatibility.compatibility_level} at ${currentRel.compatibility.match_percentage}%. Provide short-term prediction, long-term prediction, potential challenges, emotional trajectory, key advice, and overall outlook.`,
        PREDICTION_AGENT_ID,
        { user_id: user.id, session_id: `predict-${user.id}` }
      )
      if (result.success && result.response?.result) {
        const data = parseAgentResult(result.response.result as Record<string, unknown> | string)
        const pred: PredictionResult = {
          short_term_prediction: String(data.short_term_prediction || ''),
          long_term_prediction: String(data.long_term_prediction || ''),
          potential_challenges: String(data.potential_challenges || ''),
          emotional_trajectory: String(data.emotional_trajectory || 'Steady'),
          key_advice: String(data.key_advice || ''),
          overall_outlook: String(data.overall_outlook || 'Promising'),
        }
        const allRels: Relationship[] = safeGetLS('lovematch_relationships', [])
        const idx = allRels.findIndex(r => r.id === currentRel.id)
        if (idx >= 0) {
          allRels[idx].prediction = pred
          safeSetLS('lovematch_relationships', allRels)
          const userRels = allRels.filter(r => r.userId === user.id)
          setRelationships(userRels)
        }
      }
    } catch {
      // Silently handle
    }
    setLoadingPrediction(false)
    setActiveAgentId(null)
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-serif font-bold text-foreground flex items-center justify-center gap-2">
          <FaHeartbeat className="w-6 h-6 text-primary" /> Compatibility Check
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Enter your names and discover your love compatibility</p>
      </div>

      <Card className="glass-card shadow-lg">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <Label htmlFor="your-name">Your Name</Label>
              <Input id="your-name" placeholder="Enter your name" value={yourName} onChange={(e) => setYourName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="partner-name">Partner&apos;s Name</Label>
              <Input id="partner-name" placeholder="Enter partner's name" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive mb-3">{error}</p>}
          <Button onClick={handleCheckCompatibility} disabled={loading} className="w-full gap-2">
            {loading ? <><FaHeartbeat className="w-4 h-4 animate-pulse" /> Analyzing...</> : <><FaHeart className="w-4 h-4" /> Check Compatibility</>}
          </Button>
          {!aiEnabled && (
            <p className="text-xs text-muted-foreground text-center mt-2 flex items-center justify-center gap-1">
              <FaToggleOff className="w-3 h-3" /> AI is currently in manual mode. Admin will review your request.
            </p>
          )}
        </CardContent>
      </Card>

      {loading && <HeartLoading text="Analyzing your compatibility..." />}

      {currentRel && !loading && (
        <Card className="glass-card shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FaHeart className="w-5 h-5 text-primary" />
              {currentRel.userName} & {currentRel.partnerName}
            </CardTitle>
            <CardDescription>Analysis from {formatDate(currentRel.createdAt)}</CardDescription>
          </CardHeader>
          <CardContent>
            {currentRel.compatibility ? (
              <CompatibilityDisplay result={currentRel.compatibility} prediction={currentRel.prediction ?? null} onGetPrediction={handleGetPrediction} loadingPrediction={loadingPrediction} />
            ) : (
              <div className="text-center py-8">
                <FaHeartbeat className="w-10 h-10 text-muted-foreground mx-auto mb-3 animate-pulse" />
                <p className="text-muted-foreground font-medium">Pending - Awaiting Analysis</p>
                <p className="text-xs text-muted-foreground mt-1">The admin will review and provide your compatibility results</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {relationships.length > 1 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FaHistory className="w-4 h-4 text-muted-foreground" /> Previous Analyses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {relationships.filter(r => r.id !== currentRelId).reverse().map(rel => (
                <button key={rel.id} onClick={() => setCurrentRelId(rel.id)} className="w-full text-left p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{rel.userName} & {rel.partnerName}</span>
                    {rel.compatibility ? (
                      <Badge variant="secondary">{rel.compatibility.match_percentage}%</Badge>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(rel.createdAt)}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent Status */}
      <Card className="glass-card">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Powered by AI Agents</span>
            <Badge variant={aiEnabled ? 'default' : 'outline'} className="text-xs">
              {aiEnabled ? <><FaToggleOn className="w-3 h-3 mr-1" /> AI Active</> : <><FaToggleOff className="w-3 h-3 mr-1" /> Manual Mode</>}
            </Badge>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className={`flex items-center gap-1 ${activeAgentId === COMPATIBILITY_AGENT_ID ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${activeAgentId === COMPATIBILITY_AGENT_ID ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40'}`} />
              Compatibility
            </div>
            <div className={`flex items-center gap-1 ${activeAgentId === PREDICTION_AGENT_ID ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${activeAgentId === PREDICTION_AGENT_ID ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40'}`} />
              Prediction
            </div>
            <div className={`flex items-center gap-1 ${activeAgentId === CHAT_AGENT_ID ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${activeAgentId === CHAT_AGENT_ID ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40'}`} />
              Love Specialist
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// CHAT SCREEN
// ============================================================
function ChatScreen({ user, aiEnabled }: { user: User; aiEnabled: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sessionId = `chat-${user.id}`

  useEffect(() => {
    const allChats: Record<string, ChatMessage[]> = safeGetLS('lovematch_chats', {})
    const userMsgs = allChats[user.id]
    if (Array.isArray(userMsgs)) {
      setMessages(userMsgs)
    }
  }, [user.id])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, sending])

  // Poll for admin replies (when AI is off)
  useEffect(() => {
    if (aiEnabled) return
    const interval = setInterval(() => {
      const allChats: Record<string, ChatMessage[]> = safeGetLS('lovematch_chats', {})
      const userMsgs = allChats[user.id]
      if (Array.isArray(userMsgs) && userMsgs.length !== messages.length) {
        setMessages(userMsgs)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [aiEnabled, user.id, messages.length])

  const handleSend = async () => {
    if (!input.trim()) return
    const msgText = input.trim()
    setInput('')

    const userMsg: ChatMessage = {
      id: generateId(),
      sender: 'user',
      text: msgText,
      timestamp: new Date().toISOString(),
    }

    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    saveChats(updatedMessages)
    setSending(true)

    if (aiEnabled) {
      try {
        const result = await callAIAgent(
          msgText,
          CHAT_AGENT_ID,
          { user_id: user.id, session_id: sessionId }
        )
        if (result.success && result.response?.result) {
          const data = parseAgentResult(result.response.result as Record<string, unknown> | string)
          const specialistMsg: ChatMessage = {
            id: generateId(),
            sender: 'specialist',
            text: String(data.response_text || data.text || data.message || 'I am here for you. Could you tell me more?'),
            timestamp: new Date().toISOString(),
            sentiment: String(data.sentiment || ''),
            topic: String(data.topic || ''),
          }
          const withReply = [...updatedMessages, specialistMsg]
          setMessages(withReply)
          saveChats(withReply)
        }
      } catch {
        // Silently handle errors
      }
    }
    // If AI disabled, message is stored and admin can reply
    setSending(false)
  }

  const saveChats = (msgs: ChatMessage[]) => {
    const allChats: Record<string, ChatMessage[]> = safeGetLS('lovematch_chats', {})
    allChats[user.id] = msgs
    safeSetLS('lovematch_chats', allChats)
  }

  return (
    <div className="max-w-3xl mx-auto h-[calc(100vh-64px)] flex flex-col">
      {/* Chat Header */}
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
        <Badge variant={aiEnabled ? 'default' : 'outline'} className="text-xs">
          {aiEnabled ? 'AI' : 'Manual'}
        </Badge>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <FaComments className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-muted-foreground font-medium">Start a conversation with your Love Specialist</p>
            <p className="text-xs text-muted-foreground">Ask about relationships, love, communication, or anything on your heart</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] ${msg.sender === 'user' ? 'order-1' : 'order-1'}`}>
              {msg.sender === 'specialist' && (
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <FaHeart className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-xs text-muted-foreground">Love Specialist</span>
                </div>
              )}
              <div className={`rounded-2xl px-4 py-2.5 shadow-sm ${msg.sender === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-card border border-border rounded-bl-md'}`}>
                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              </div>
              <div className="flex items-center gap-2 mt-1 px-1">
                <span className="text-[10px] text-muted-foreground">{formatDate(msg.timestamp)}</span>
                {msg.sender === 'specialist' && msg.sentiment && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1">{msg.sentiment}</Badge>
                )}
                {msg.sender === 'specialist' && msg.topic && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1">{msg.topic}</Badge>
                )}
              </div>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl rounded-bl-md shadow-sm">
              <TypingIndicator />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="glass-card border-t p-4">
        <div className="flex gap-2">
          <Input placeholder="Type your message..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }} disabled={sending} className="flex-1" />
          <Button onClick={handleSend} disabled={sending || !input.trim()} size="icon">
            <FaPaperPlane className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// CHAT HISTORY SCREEN
// ============================================================
function HistoryScreen({ user }: { user: User }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])

  useEffect(() => {
    const allChats: Record<string, ChatMessage[]> = safeGetLS('lovematch_chats', {})
    const userMsgs = allChats[user.id]
    if (Array.isArray(userMsgs)) {
      setMessages(userMsgs)
    }
  }, [user.id])

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <h2 className="text-xl font-serif font-bold flex items-center gap-2">
        <FaHistory className="w-5 h-5 text-primary" /> Chat History
      </h2>

      {messages.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <FaComments className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No conversations yet</p>
            <p className="text-xs text-muted-foreground mt-1">Start chatting with your Love Specialist to see history here</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card">
          <CardContent className="pt-4">
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-3 pr-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%]`}>
                      <div className={`rounded-2xl px-4 py-2.5 ${msg.sender === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-secondary rounded-bl-md'}`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 block px-1">{formatDate(msg.timestamp)}</span>
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

// ============================================================
// ADMIN LOGIN
// ============================================================
function AdminLoginScreen({ onLogin, onBack }: { onLogin: () => void; onBack: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = () => {
    if (username === 'FAIRIN' && password === '123456123456') {
      safeSetLS('lovematch_admin_logged_in', true)
      onLogin()
    } else {
      setError('Invalid admin credentials')
    }
  }

  return (
    <div className="gradient-bg min-h-screen flex items-center justify-center p-4">
      <Card className="glass-card w-full max-w-sm shadow-xl">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <BsShieldLock className="w-8 h-8 text-accent" />
          </div>
          <CardTitle className="text-xl font-serif">Admin Access</CardTitle>
          <CardDescription>LoveMatch Administration Panel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-user">Username</Label>
            <Input id="admin-user" placeholder="Admin username" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-pass">Password</Label>
            <Input id="admin-pass" type="password" placeholder="Admin password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
          </div>
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button onClick={handleLogin} className="w-full gap-2">
            <BsShieldLock className="w-4 h-4" /> Login
          </Button>
          <Button variant="ghost" size="sm" onClick={onBack} className="w-full text-muted-foreground">
            Back to App
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

// ============================================================
// ADMIN DASHBOARD
// ============================================================
function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<AdminTab>('users')
  const [users, setUsers] = useState<User[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [allChats, setAllChats] = useState<Record<string, ChatMessage[]>>({})
  const [aiEnabled, setAiEnabled] = useState(true)
  const [editRel, setEditRel] = useState<Relationship | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [replyUserId, setReplyUserId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')

  // Override form state
  const [overridePercentage, setOverridePercentage] = useState('')
  const [overrideLevel, setOverrideLevel] = useState('')
  const [overrideAdvice, setOverrideAdvice] = useState('')
  const [overrideStrengths, setOverrideStrengths] = useState('')
  const [overrideAreas, setOverrideAreas] = useState('')
  const [overrideShortTerm, setOverrideShortTerm] = useState('')
  const [overrideLongTerm, setOverrideLongTerm] = useState('')
  const [overrideChallenges, setOverrideChallenges] = useState('')
  const [overrideTrajectory, setOverrideTrajectory] = useState('')
  const [overrideKeyAdvice, setOverrideKeyAdvice] = useState('')
  const [overrideOutlook, setOverrideOutlook] = useState('')

  const loadData = useCallback(() => {
    setUsers(safeGetLS('lovematch_users', []))
    setRelationships(safeGetLS('lovematch_relationships', []))
    setAllChats(safeGetLS('lovematch_chats', {}))
    setAiEnabled(safeGetLS('lovematch_ai_enabled', true))
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [loadData])

  const handleToggleAI = (checked: boolean) => {
    setAiEnabled(checked)
    safeSetLS('lovematch_ai_enabled', checked)
  }

  const openEditDialog = (rel: Relationship) => {
    setEditRel(rel)
    setOverridePercentage(String(rel.compatibility?.match_percentage ?? ''))
    setOverrideLevel(rel.compatibility?.compatibility_level ?? '')
    setOverrideAdvice(rel.compatibility?.advice ?? '')
    setOverrideStrengths(rel.compatibility?.strengths ?? '')
    setOverrideAreas(rel.compatibility?.areas_to_work_on ?? '')
    setOverrideShortTerm(rel.prediction?.short_term_prediction ?? '')
    setOverrideLongTerm(rel.prediction?.long_term_prediction ?? '')
    setOverrideChallenges(rel.prediction?.potential_challenges ?? '')
    setOverrideTrajectory(rel.prediction?.emotional_trajectory ?? '')
    setOverrideKeyAdvice(rel.prediction?.key_advice ?? '')
    setOverrideOutlook(rel.prediction?.overall_outlook ?? '')
    setEditDialogOpen(true)
  }

  const saveOverride = () => {
    if (!editRel) return
    const allRels: Relationship[] = safeGetLS('lovematch_relationships', [])
    const idx = allRels.findIndex(r => r.id === editRel.id)
    if (idx < 0) return

    allRels[idx].compatibility = {
      match_percentage: parseInt(overridePercentage || '0', 10),
      compatibility_level: overrideLevel || 'Growing Connection',
      advice: overrideAdvice,
      strengths: overrideStrengths,
      areas_to_work_on: overrideAreas,
    }
    allRels[idx].override = true

    if (overrideShortTerm || overrideLongTerm) {
      allRels[idx].prediction = {
        short_term_prediction: overrideShortTerm,
        long_term_prediction: overrideLongTerm,
        potential_challenges: overrideChallenges,
        emotional_trajectory: overrideTrajectory || 'Steady',
        key_advice: overrideKeyAdvice,
        overall_outlook: overrideOutlook || 'Promising',
      }
    }

    safeSetLS('lovematch_relationships', allRels)
    setRelationships(allRels)
    setEditDialogOpen(false)
    setEditRel(null)
  }

  const handleAdminReply = (userId: string) => {
    if (!replyText.trim()) return
    const chats: Record<string, ChatMessage[]> = safeGetLS('lovematch_chats', {})
    if (!Array.isArray(chats[userId])) {
      chats[userId] = []
    }
    chats[userId].push({
      id: generateId(),
      sender: 'specialist',
      text: replyText.trim(),
      timestamp: new Date().toISOString(),
      sentiment: 'supportive',
      topic: 'general',
    })
    safeSetLS('lovematch_chats', chats)
    setAllChats({ ...chats })
    setReplyText('')
    setReplyUserId(null)
  }

  const getUserName = (userId: string): string => {
    const u = users.find(u => u.id === userId)
    return u?.name || userId
  }

  const sidebarItems: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
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
          {sidebarItems.map(item => (
            <button key={item.key} onClick={() => setActiveTab(item.key)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === item.key ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-secondary'}`}>
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onLogout} className="w-full gap-2 text-muted-foreground">
            <FaSignOutAlt className="w-3.5 h-3.5" /> Logout
          </Button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-serif font-bold flex items-center gap-2">
                <FaUsers className="w-5 h-5 text-primary" /> Registered Users
              </h2>
              <Badge variant="secondary">{users.length} users</Badge>
            </div>
            <Card className="glass-card">
              <CardContent className="pt-4">
                {users.length === 0 ? (
                  <div className="text-center py-8">
                    <FaUser className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground">No registered users yet</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Registered</TableHead>
                        <TableHead>Last Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map(u => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                                <FaUser className="w-3 h-3 text-primary" />
                              </div>
                              {u.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(u.registeredAt)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(u.lastActive)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Relationships Tab */}
        {activeTab === 'relationships' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-serif font-bold flex items-center gap-2">
                <FaHeart className="w-5 h-5 text-primary" /> Compatibility Entries
              </h2>
              <Badge variant="secondary">{relationships.length} entries</Badge>
            </div>
            <Card className="glass-card">
              <CardContent className="pt-4">
                {relationships.length === 0 ? (
                  <div className="text-center py-8">
                    <FaHeart className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground">No compatibility entries yet</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Couple</TableHead>
                        <TableHead>Match %</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead>Override</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {relationships.map(rel => (
                        <TableRow key={rel.id}>
                          <TableCell className="font-medium">{rel.userName} & {rel.partnerName}</TableCell>
                          <TableCell>
                            {rel.compatibility ? (
                              <Badge variant="default">{rel.compatibility.match_percentage}%</Badge>
                            ) : (
                              <Badge variant="outline">Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{rel.compatibility?.compatibility_level ?? 'N/A'}</TableCell>
                          <TableCell>
                            {rel.override ? (
                              <Badge variant="secondary" className="text-xs">
                                <FaEdit className="w-2.5 h-2.5 mr-1" /> Overridden
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Original</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(rel.createdAt)}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => openEditDialog(rel)} className="gap-1">
                              <FaEdit className="w-3 h-3" /> Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Chats Tab */}
        {activeTab === 'chats' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-serif font-bold flex items-center gap-2">
                <IoMdChatbubbles className="w-5 h-5 text-primary" /> All Conversations
              </h2>
              <Badge variant={aiEnabled ? 'default' : 'outline'}>
                {aiEnabled ? 'AI Responding' : 'Manual Replies'}
              </Badge>
            </div>
            {Object.keys(allChats).length === 0 ? (
              <Card className="glass-card">
                <CardContent className="py-12 text-center">
                  <FaComments className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">No conversations yet</p>
                </CardContent>
              </Card>
            ) : (
              Object.entries(allChats).map(([userId, msgs]) => {
                const safeMsgs = Array.isArray(msgs) ? msgs : []
                return (
                  <Card key={userId} className="glass-card">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <FaUser className="w-3.5 h-3.5 text-primary" /> {getUserName(userId)}
                        </CardTitle>
                        <Badge variant="secondary" className="text-xs">{safeMsgs.length} messages</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-48">
                        <div className="space-y-2 pr-4">
                          {safeMsgs.slice(-10).map(msg => (
                            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${msg.sender === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                                {msg.text}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                      {!aiEnabled && (
                        <div className="mt-3 pt-3 border-t border-border">
                          {replyUserId === userId ? (
                            <div className="flex gap-2">
                              <Input placeholder="Type admin reply..." value={replyText} onChange={(e) => setReplyText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAdminReply(userId) }} className="flex-1 text-sm" />
                              <Button size="sm" onClick={() => handleAdminReply(userId)}>
                                <FaPaperPlane className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setReplyUserId(null); setReplyText('') }}>Cancel</Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setReplyUserId(userId)} className="w-full gap-2">
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

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            <h2 className="text-xl font-serif font-bold flex items-center gap-2">
              <FaCog className="w-5 h-5 text-primary" /> Settings
            </h2>
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">AI Agent Control</CardTitle>
                <CardDescription>Toggle AI-powered responses on or off globally</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3">
                    {aiEnabled ? (
                      <FaToggleOn className="w-6 h-6 text-primary" />
                    ) : (
                      <FaToggleOff className="w-6 h-6 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium text-sm">AI Responses</p>
                      <p className="text-xs text-muted-foreground">
                        {aiEnabled ? 'Agents are actively responding to user queries' : 'Manual mode - admin replies to chat, results await override'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={aiEnabled ? 'default' : 'outline'} className="text-xs">
                      {aiEnabled ? 'Active' : 'Disabled'}
                    </Badge>
                    <Switch checked={aiEnabled} onCheckedChange={handleToggleAI} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Agent Information</CardTitle>
                <CardDescription>AI agents powering LoveMatch</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-2">
                    <FaHeartbeat className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Compatibility Analyst</p>
                      <p className="text-xs text-muted-foreground font-mono">{COMPATIBILITY_AGENT_ID}</p>
                    </div>
                  </div>
                  <Badge variant={aiEnabled ? 'default' : 'outline'} className="text-xs">{aiEnabled ? 'Ready' : 'Off'}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-2">
                    <BsStars className="w-4 h-4 text-accent" />
                    <div>
                      <p className="text-sm font-medium">Prediction Agent</p>
                      <p className="text-xs text-muted-foreground font-mono">{PREDICTION_AGENT_ID}</p>
                    </div>
                  </div>
                  <Badge variant={aiEnabled ? 'default' : 'outline'} className="text-xs">{aiEnabled ? 'Ready' : 'Off'}</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-2">
                    <IoMdChatbubbles className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Love Specialist Chat</p>
                      <p className="text-xs text-muted-foreground font-mono">{CHAT_AGENT_ID}</p>
                    </div>
                  </div>
                  <Badge variant={aiEnabled ? 'default' : 'outline'} className="text-xs">{aiEnabled ? 'Ready' : 'Off'}</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-lg bg-secondary/50">
                    <p className="text-2xl font-bold text-primary">{users.length}</p>
                    <p className="text-xs text-muted-foreground">Users</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-secondary/50">
                    <p className="text-2xl font-bold text-accent">{relationships.length}</p>
                    <p className="text-xs text-muted-foreground">Analyses</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-secondary/50">
                    <p className="text-2xl font-bold text-foreground">
                      {Object.values(allChats).reduce((sum, msgs) => sum + (Array.isArray(msgs) ? msgs.length : 0), 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Messages</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Edit/Override Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FaEdit className="w-4 h-4 text-primary" /> Edit Compatibility
            </DialogTitle>
            <DialogDescription>
              Override results for {editRel?.userName ?? ''} & {editRel?.partnerName ?? ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Match Percentage (0-100)</Label>
                <Input type="number" min="0" max="100" value={overridePercentage} onChange={(e) => setOverridePercentage(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Compatibility Level</Label>
                <Input value={overrideLevel} onChange={(e) => setOverrideLevel(e.target.value)} placeholder="e.g. Soulmates, Strong Bond" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Advice</Label>
              <Textarea value={overrideAdvice} onChange={(e) => setOverrideAdvice(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Strengths</Label>
              <Textarea value={overrideStrengths} onChange={(e) => setOverrideStrengths(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Areas to Work On</Label>
              <Textarea value={overrideAreas} onChange={(e) => setOverrideAreas(e.target.value)} rows={3} />
            </div>
            <Separator />
            <p className="text-sm font-semibold text-muted-foreground">Prediction (optional)</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Short-Term Prediction</Label>
                <Textarea value={overrideShortTerm} onChange={(e) => setOverrideShortTerm(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Long-Term Prediction</Label>
                <Textarea value={overrideLongTerm} onChange={(e) => setOverrideLongTerm(e.target.value)} rows={2} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Potential Challenges</Label>
              <Textarea value={overrideChallenges} onChange={(e) => setOverrideChallenges(e.target.value)} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Emotional Trajectory</Label>
                <Input value={overrideTrajectory} onChange={(e) => setOverrideTrajectory(e.target.value)} placeholder="e.g. Rising, Steady" />
              </div>
              <div className="space-y-2">
                <Label>Overall Outlook</Label>
                <Input value={overrideOutlook} onChange={(e) => setOverrideOutlook(e.target.value)} placeholder="e.g. Very Promising" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Key Advice</Label>
              <Textarea value={overrideKeyAdvice} onChange={(e) => setOverrideKeyAdvice(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveOverride} className="gap-2">
              <FaEdit className="w-3 h-3" /> Save Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// SAMPLE DATA
// ============================================================
function loadSampleData() {
  const sampleUsers: User[] = [
    { id: 'sample-1', name: 'Alex', password: 'demo', registeredAt: '2025-01-15T10:30:00Z', lastActive: '2025-02-10T14:20:00Z' },
    { id: 'sample-2', name: 'Jordan', password: 'demo', registeredAt: '2025-01-20T08:15:00Z', lastActive: '2025-02-09T09:45:00Z' },
    { id: 'sample-3', name: 'Taylor', password: 'demo', registeredAt: '2025-02-01T16:00:00Z', lastActive: '2025-02-10T11:30:00Z' },
  ]

  const sampleRelationships: Relationship[] = [
    {
      id: 'rel-1', userId: 'sample-1', userName: 'Alex', partnerName: 'Jamie',
      compatibility: { match_percentage: 87, compatibility_level: 'Soulmates', advice: 'Your connection is deeply rooted in mutual understanding and shared values. Continue nurturing open communication and celebrate your unique bond.', strengths: 'Exceptional emotional attunement, shared life goals, natural chemistry, and complementary communication styles.', areas_to_work_on: 'Be mindful of taking each other for granted during comfortable periods. Keep the spark alive with intentional quality time.' },
      prediction: { short_term_prediction: 'The next few months will bring exciting growth opportunities. Expect deeper conversations and shared adventures that strengthen your bond.', long_term_prediction: 'A lasting partnership built on trust and mutual respect. Major milestones are on the horizon as you grow together.', potential_challenges: 'External pressures from work or family may test your patience. Remember to face challenges as a team.', emotional_trajectory: 'Rising', key_advice: 'Continue prioritizing open communication and never stop learning about each other.', overall_outlook: 'Very Promising' },
      override: false, createdAt: '2025-02-05T12:00:00Z'
    },
    {
      id: 'rel-2', userId: 'sample-2', userName: 'Jordan', partnerName: 'Casey',
      compatibility: { match_percentage: 72, compatibility_level: 'Strong Bond', advice: 'You share a solid foundation with room for growth. Focus on understanding each other\'s love languages to deepen your connection.', strengths: 'Strong intellectual compatibility, shared sense of humor, and mutual respect for personal boundaries.', areas_to_work_on: 'Work on expressing emotions more openly. Sometimes silence can be misinterpreted as disinterest.' },
      prediction: null, override: false, createdAt: '2025-02-08T15:30:00Z'
    },
    {
      id: 'rel-3', userId: 'sample-3', userName: 'Taylor', partnerName: 'Morgan',
      compatibility: null, prediction: null, override: false, createdAt: '2025-02-10T10:00:00Z'
    },
  ]

  const sampleChats: Record<string, ChatMessage[]> = {
    'sample-1': [
      { id: 'c1', sender: 'user', text: 'My partner and I have been arguing about finances lately. How can we handle this better?', timestamp: '2025-02-10T10:00:00Z' },
      { id: 'c2', sender: 'specialist', text: 'Financial discussions can be challenging, but they are also an opportunity to deepen your trust and teamwork. I recommend setting aside a calm, dedicated time each week to discuss finances together. Start by sharing your individual money values and goals, then work toward a shared vision. Remember, it is not about who is right - it is about finding a path forward together.', timestamp: '2025-02-10T10:01:00Z', sentiment: 'anxious', topic: 'conflict' },
      { id: 'c3', sender: 'user', text: 'That makes sense. We just have very different spending habits.', timestamp: '2025-02-10T10:05:00Z' },
      { id: 'c4', sender: 'specialist', text: 'Different spending habits are very common in relationships! The key is creating a system that respects both perspectives. Consider a "yours, mine, ours" approach - keep some individual spending autonomy while contributing to shared goals. This honors both your independence and your partnership.', timestamp: '2025-02-10T10:06:00Z', sentiment: 'hopeful', topic: 'communication' },
    ],
    'sample-2': [
      { id: 'c5', sender: 'user', text: 'How do I know if my partner truly loves me?', timestamp: '2025-02-09T09:00:00Z' },
      { id: 'c6', sender: 'specialist', text: 'Love shows itself in many ways, and not always in the grand gestures we see in movies. Look for consistency, effort, and genuine care in their actions. Do they respect your boundaries? Do they show up for you during difficult times? True love is often found in the small, everyday moments of choosing each other, again and again.', timestamp: '2025-02-09T09:01:00Z', sentiment: 'confused', topic: 'trust' },
    ],
  }

  safeSetLS('lovematch_users', sampleUsers)
  safeSetLS('lovematch_relationships', sampleRelationships)
  safeSetLS('lovematch_chats', sampleChats)
}

function clearSampleData() {
  safeSetLS('lovematch_users', [])
  safeSetLS('lovematch_relationships', [])
  safeSetLS('lovematch_chats', {})
}

// ============================================================
// MAIN PAGE
// ============================================================
export default function Page() {
  const [appView, setAppView] = useState<AppView>('auth')
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [aiEnabled, setAiEnabled] = useState(true)
  const [sampleDataOn, setSampleDataOn] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
    const savedUser = safeGetLS<User | null>('lovematch_current_user', null)
    const savedAI = safeGetLS<boolean>('lovematch_ai_enabled', true)
    const adminLoggedIn = safeGetLS<boolean>('lovematch_admin_logged_in', false)

    setAiEnabled(savedAI)

    if (adminLoggedIn) {
      setAppView('admin')
    } else if (savedUser) {
      setCurrentUser(savedUser)
      setAppView('dashboard')
    }
  }, [])

  // Poll for AI setting changes
  useEffect(() => {
    if (!hydrated) return
    const interval = setInterval(() => {
      const val = safeGetLS<boolean>('lovematch_ai_enabled', true)
      setAiEnabled(val)
    }, 3000)
    return () => clearInterval(interval)
  }, [hydrated])

  const handleLogin = (user: User) => {
    setCurrentUser(user)
    setAppView('dashboard')
  }

  const handleLogout = () => {
    setCurrentUser(null)
    if (typeof window !== 'undefined') {
      localStorage.removeItem('lovematch_current_user')
    }
    setAppView('auth')
  }

  const handleAdminLogout = () => {
    safeSetLS('lovematch_admin_logged_in', false)
    const savedUser = safeGetLS<User | null>('lovematch_current_user', null)
    if (savedUser) {
      setCurrentUser(savedUser)
      setAppView('dashboard')
    } else {
      setAppView('auth')
    }
  }

  const handleToggleSampleData = (checked: boolean) => {
    setSampleDataOn(checked)
    if (checked) {
      loadSampleData()
    } else {
      clearSampleData()
    }
  }

  if (!hydrated) {
    return (
      <div className="gradient-bg min-h-screen flex items-center justify-center">
        <HeartLoading text="Loading LoveMatch..." />
      </div>
    )
  }

  // Auth Screen
  if (appView === 'auth') {
    return (
      <div className="relative">
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
          <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground">Sample Data</Label>
          <Switch id="sample-toggle" checked={sampleDataOn} onCheckedChange={handleToggleSampleData} />
        </div>
        <AuthScreen onLogin={handleLogin} />
      </div>
    )
  }

  // Admin Login
  if (appView === 'admin-login') {
    return <AdminLoginScreen onLogin={() => setAppView('admin')} onBack={() => { if (currentUser) setAppView('dashboard'); else setAppView('auth') }} />
  }

  // Admin Dashboard
  if (appView === 'admin') {
    return <AdminDashboard onLogout={handleAdminLogout} />
  }

  // User Views - redirect to auth if no user
  if (!currentUser) {
    return <AuthScreen onLogin={handleLogin} />
  }

  return (
    <div className="gradient-bg min-h-screen">
      {/* Sample Data Toggle */}
      <div className="fixed top-[76px] right-4 z-50 flex items-center gap-2 glass-card rounded-full px-3 py-1.5 shadow-sm">
        <Label htmlFor="sample-toggle-main" className="text-xs text-muted-foreground cursor-pointer">Sample Data</Label>
        <Switch id="sample-toggle-main" checked={sampleDataOn} onCheckedChange={handleToggleSampleData} />
      </div>

      <UserNavbar currentView={appView} onNavigate={setAppView} userName={currentUser.name} onLogout={handleLogout} />

      {appView === 'dashboard' && <UserDashboard user={currentUser} aiEnabled={aiEnabled} />}
      {appView === 'chat' && <ChatScreen user={currentUser} aiEnabled={aiEnabled} />}
      {appView === 'history' && <HistoryScreen user={currentUser} />}
    </div>
  )
}
