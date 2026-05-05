import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { 
  Trophy, 
  Zap, 
  Shield, 
  Target, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Search,
  ChevronRight,
  AlertCircle,
  BarChart2,
  Users,
  Calendar,
  Flame,
  Sparkles,
  Share2,
  Bookmark,
  Printer,
  Clock,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Filter,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell
} from 'recharts';
import { GoogleGenAI, Type } from "@google/genai";

import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  serverTimestamp,
  deleteDoc,
  doc
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './firebase';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const Skeleton = ({ className }: { className?: string }) => (
  <div className={`animate-pulse bg-white/5 rounded ${className}`} />
);

interface LiveMatch {
  teamA: string;
  teamB: string;
  teamACountryCode?: string;
  teamBCountryCode?: string;
  scoreA: string;
  scoreB: string;
  status: string;
  type: 'Live' | 'Upcoming' | 'Finished';
  venue: string;
  date: string;
  time: string;
  league?: string;
  sport?: string;
}

interface AnalysisResult {
  strongPillars: string[];
  weakPillars: string[];
  prediction: string;
  winProbability: number;
  winProbabilityB: number;
  winProbabilityReasoning: string;
  gameChanger: string;
  teamARank: string;
  teamBRank: string;
  teamAStrength: 'Strong' | 'Weak';
  teamBStrength: 'Strong' | 'Weak';
  strongerTeam: string;
  predictedScore: string;
  bettingAdvice: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  teamACountryCode: string;
  teamBCountryCode: string;
  pastResults: {date: string, result: string, score: string, opponent: string}[];
  playerRankings: {name: string, role: string, rating: number, grade: 'A' | 'B' | 'C', reason: string}[];
  h2hStats: {team_a_wins: number, team_b_wins: number, draws: number};
  h2hMatches: {date: string, winner: string, score: string, venue: string}[];
  tacticalInsight: string;
  keyMatchups: {playerA: string, playerB: string, description: string, probabilityA: number, reasoning: string}[];
  venueStats: {teamAWinRate: number, teamBWinRate: number, avgScore: string};
  radarStats: {subject: string, A: number, B: number}[];
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    const language = (window as any).appLanguage || 'bn';
    const t = {
      en: {
        somethingWentWrong: "Something went wrong",
        databaseError: "A database error occurred. Please try again later.",
        unexpectedError: "An unexpected error occurred.",
        reloadApp: "Reload Application"
      },
      bn: {
        somethingWentWrong: "কিছু ভুল হয়েছে",
        databaseError: "একটি ডাটাবেস ত্রুটি ঘটেছে। দয়া করে পরে আবার চেষ্টা করুন।",
        unexpectedError: "একটি অপ্রত্যাশিত ত্রুটি ঘটেছে।",
        reloadApp: "অ্যাপ্লিকেশন রিলোড করুন"
      }
    }[language as 'en' | 'bn'];

    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] flex items-center justify-center p-8">
          <div className="max-w-md w-full p-8 border border-red-500/20 bg-red-500/5 rounded-2xl text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold text-red-400">{t.somethingWentWrong}</h2>
            <p className="text-sm opacity-60">
              {this.state.error?.message.startsWith('{') 
                ? t.databaseError 
                : t.unexpectedError}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-red-500 text-white rounded-lg font-bold hover:bg-red-600 transition-colors"
            >
              {t.reloadApp}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Error Handling Utility for Firestore
const handleFirestoreError = (error: unknown, operationType: string, path: string | null) => {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

const POPULAR_LEAGUES: Record<string, string[]> = {
  Global: ["IPL", "BPL", "PSL", "Premier League", "La Liga", "Champions League", "NBA", "Wimbledon"],
  Cricket: ["IPL", "BPL", "PSL", "CPL", "Big Bash", "T20 World Cup", "Asia Cup", "ICC World Cup", "The Hundred", "LPL"],
  Football: ["Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "Champions League", "Europa League", "MLS", "Saudi Pro League", "ISL"],
  Tennis: ["Wimbledon", "US Open", "French Open", "Australian Open", "ATP Finals", "WTA Finals"],
  Basketball: ["NBA", "EuroLeague", "WNBA", "FIBA World Cup"]
};

// Match Card Component
const MatchCard = ({ match, t, setTeamA, setTeamB, setTeamACountryCode, setTeamBCountryCode }: { 
  match: LiveMatch, 
  t: any,
  setTeamA: (v: string) => void,
  setTeamB: (v: string) => void,
  setTeamACountryCode: (v: string) => void,
  setTeamBCountryCode: (v: string) => void
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    className="p-4 border border-white/10 bg-white/[0.02] rounded-2xl hover:bg-white/5 transition-all group relative overflow-hidden"
  >
    <div className="absolute top-0 right-0 p-2 z-10 flex flex-col items-end gap-1">
      <span className={`text-[7px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1 ${
        match.status.toLowerCase().includes('live') || match.status.includes('লাইভ') || match.status.includes('চলমান') 
          ? 'bg-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.6)]' 
          : 'bg-white/10 opacity-60'
      }`}>
        {(match.status.toLowerCase().includes('live') || match.status.includes('লাইভ') || match.status.includes('চলমান')) && (
          <span className="w-1 h-1 bg-white rounded-full animate-ping" />
        )}
        {match.status.replace('চলমান', 'লাইভ').replace('Upcoming', t.upcoming)}
      </span>
      {match.league && (
        <span className="text-[6px] font-mono font-bold uppercase tracking-widest bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-md opacity-40">
          {match.sport && <span className="text-[#F27D26] mr-1">{match.sport}:</span>}
          {match.league}
        </span>
      )}
    </div>
    
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-1">
      <div className="space-y-2 flex flex-col items-center flex-1 min-w-0 overflow-hidden">
        <div className="relative">
          <img 
            src={`https://tse2.mm.bing.net/th?q=${encodeURIComponent(match.teamA + ' ' + (match.league || '') + ' official logo')}&w=100&h=100&c=7&rs=1&p=0&dpr=3&pid=1.7&mkt=en-IN&adlt=moderate`}
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(match.teamA)}&backgroundColor=0f172a,1e293b,334155,f27d26&textColor=ffffff&fontWeight=700`; }}
            className="w-10 h-10 object-cover rounded-full border border-white/20 shadow-[0_4px_10px_rgba(0,0,0,0.5)] bg-white/5 p-0.5" 
            alt={match.teamA} 
            referrerPolicy="no-referrer" 
          />
          {match.teamACountryCode && (
            <img 
              src={`https://flagcdn.com/w80/${match.teamACountryCode}.png`} 
              className="w-4 h-3 object-cover rounded-[2px] border border-black/50 absolute -bottom-0.5 -right-0.5 shadow-sm" 
              alt="flag" 
              referrerPolicy="no-referrer" 
            />
          )}
        </div>
        <p className="text-[11px] font-black truncate w-full text-center px-1 break-words" title={match.teamA}>{match.teamA}</p>
        <p className="text-sm md:text-base font-mono font-black text-[#F27D26] break-words text-center w-full">
          {(match.scoreA === "0" || !match.scoreA) && match.type === 'Upcoming' ? t.upcoming : (match.scoreA || "0")}
        </p>
      </div>
      <div className="text-[8px] font-black italic opacity-20 px-1 shrink-0 uppercase flex flex-col items-center gap-1">
        <div className="w-[1px] h-4 bg-gradient-to-b from-transparent via-white/20 to-transparent"></div>
        {t.vs}
        <div className="w-[1px] h-4 bg-gradient-to-b from-transparent via-white/20 to-transparent"></div>
      </div>
      <div className="space-y-2 flex flex-col items-center flex-1 min-w-0 overflow-hidden">
        <div className="relative">
          <img 
            src={`https://tse2.mm.bing.net/th?q=${encodeURIComponent(match.teamB + ' ' + (match.league || '') + ' official logo')}&w=100&h=100&c=7&rs=1&p=0&dpr=3&pid=1.7&mkt=en-IN&adlt=moderate`}
            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(match.teamB)}&backgroundColor=0f172a,1e293b,334155,4A90E2&textColor=ffffff&fontWeight=700`; }}
            className="w-10 h-10 object-cover rounded-full border border-white/20 shadow-[0_4px_10px_rgba(0,0,0,0.5)] bg-white/5 p-0.5" 
            alt={match.teamB} 
            referrerPolicy="no-referrer" 
          />
          {match.teamBCountryCode && (
            <img 
              src={`https://flagcdn.com/w80/${match.teamBCountryCode}.png`} 
              className="w-4 h-3 object-cover rounded-[2px] border border-black/50 absolute -bottom-0.5 -right-0.5 shadow-sm" 
              alt="flag" 
              referrerPolicy="no-referrer" 
            />
          )}
        </div>
        <p className="text-[11px] font-black truncate w-full text-center px-1 break-words" title={match.teamB}>{match.teamB}</p>
        <p className="text-sm md:text-base font-mono font-black text-[#4A90E2] break-words text-center w-full">
          {(match.scoreB === "0" || !match.scoreB) && match.type === 'Upcoming' ? t.upcoming : (match.scoreB || "0")}
        </p>
      </div>
      </div>
      
      <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest gap-2">
          <span className="truncate flex-1 opacity-60" title={match.venue}>{match.venue || "TBD Venue"}</span>
          <span className="flex items-center gap-1 shrink-0 text-[#4A90E2] font-black bg-white/5 px-2 py-1 rounded-md">
            <Calendar className="w-3 h-3" />
            {match.date}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest">
          <span className="flex items-center gap-1 text-[#F27D26] font-black bg-white/5 px-2 py-1 rounded-md">
            <Clock className="w-3 h-3" />
            {match.time.includes(t.bst) ? match.time : `${match.time} ${t.bst}`}
          </span>
          <span className="text-[#F27D26] font-black">{match.status.replace('চলমান', 'লাইভ').replace('Upcoming', t.upcoming)}</span>
        </div>
      </div>
    </div>

    <button 
      onClick={() => {
        setTeamA(match.teamA);
        setTeamB(match.teamB);
        if (match.teamACountryCode) setTeamACountryCode(match.teamACountryCode.toLowerCase());
        if (match.teamBCountryCode) setTeamBCountryCode(match.teamBCountryCode.toLowerCase());
        const element = document.getElementById('match-setup-section');
        if (element) element.scrollIntoView({ behavior: 'smooth' });
      }}
      className="absolute inset-0 bg-[#F27D26]/0 group-hover:bg-[#F27D26]/5 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
    >
      <span className="bg-[#F27D26] text-white text-[10px] font-black px-4 py-2 rounded-full shadow-xl uppercase">{t.analyzeMatch}</span>
    </button>
  </motion.div>
);

function AppContent() {
  const [sportType, setSportType] = useState("Global");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [teamALast5, setTeamALast5] = useState("");
  const [teamBLast5, setTeamBLast5] = useState("");
  const [teamAKeyPlayers, setTeamAKeyPlayers] = useState("");
  const [teamBKeyPlayers, setTeamBKeyPlayers] = useState("");
  const [teamACountryCode, setTeamACountryCode] = useState("");
  const [teamBCountryCode, setTeamBCountryCode] = useState("");
  const [pitchCondition, setPitchCondition] = useState("Balanced");
  const [weather, setWeather] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCooldown, setIsCooldown] = useState(false);
  const [isGlobalQuotaExceeded, setIsGlobalQuotaExceeded] = useState(false);

  const [displayProb, setDisplayProb] = useState(0);
  const [displayProbB, setDisplayProbB] = useState(0);
  const [language, setLanguage] = useState<'bn' | 'en'>('bn');
  const [activeTab, setActiveTab] = useState<'analysis' | 'my-predictions'>('analysis');
  const [user, setUser] = useState<User | null>(null);
  const [savedPredictions, setSavedPredictions] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingSaved, setIsFetchingSaved] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    (window as any).appLanguage = language;
  }, [language]);
  const [lastAnalysisTimestamp, setLastAnalysisTimestamp] = useState<string | null>(null);

  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);
  const [isFetchingLive, setIsFetchingLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [lastAnalysisKey, setLastAnalysisKey] = useState<string | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<string>("All");
  const [isLeagueDropdownOpen, setIsLeagueDropdownOpen] = useState(false);
  const [isMatchFilterOpen, setIsMatchFilterOpen] = useState(false);
  const [matchFilter, setMatchFilter] = useState<string>("Live");

  const t = {
    en: {
      systemLive: "System Live",
      matchupAnalysis: "Matchup Analysis",
      liveScores: (sport: string) => `Live ${sport} Scores`,
      lastUpdated: "Last Updated",
      realTimeAiData: "Real-time AI Data (BST)",
      refresh: "Refresh Scores",
      updating: "Updating...",
      wait: "Wait...",
      quotaFull: "Quota Full",
      upcoming: "Upcoming",
      matchYetToStart: "Match Yet to Start",
      winProbAi: "Win Probability based on AI Analysis",
      lastAnalysis: "Analysis performed at",
      disclaimer: "AI prediction is based on past data only; it is not a guaranteed result.",
      analyzeMatch: "Analyze Match",
      analyzing: "Analyzing...",
      reset: "Reset",
      strongerTeam: "Stronger Team",
      bettingAdvice: "Pro Betting Verdict",
      risk: "Risk Level",
      tacticalAnalysis: "Tactical Masterclass",
      keyMatchups: "Key Tactical Matchups",
      strongPillars: "Strong Pillars",
      weakPillars: "Weak Pillars",
      aiConfidence: "AI Confidence Level",
      reliabilityScore: "Reliability Score",
      copy: "Copy",
      share: "Share",
      print: "Print",
      copied: "Copied!",
      error: "Error",
      noMatches: "No live matches found",
      trySearch: "Try searching for a specific team",
      venueStats: "Venue Stats",
      avgScore: "Avg Score at Venue",
      winRate: "Win Rate",
      matchupReasoning: "Matchup Reasoning",
      h2hHistory: "Direct Head-to-Head History",
      wins: "Wins",
      draws: "Draws",
      predictionReasoning: "Prediction Reasoning",
      gameChanger: "Game Changer",
      rank: "Rank",
      powerful: "POWERFUL",
      weak: "WEAK",
      elite: "Elite",
      balanced: "Balanced",
      underdog: "Underdog",
      low: "Low",
      medium: "Medium",
      high: "High",
      grade: "GRADE",
      role: "Role",
      rating: "Rating",
      reason: "Reason",
      vs: "vs",
      cricket: "Cricket",
      football: "Football",
      tennis: "Tennis",
      basketball: "Basketball",
      pitch: "Pitch/Venue",
      weather: "Weather",
      teamA: "Team A",
      teamB: "Team B",
      last5: "Last 5 Results",
      keyPlayers: "Key Players & Grades",
      autoFill: "Magic Auto-fill",
      autoFilling: "AI Magic in progress...",
      searchPlaceholder: "Search team...",
      quotaExceeded: "AI Quota Exceeded. Please try again in 10 minutes.",
      systemLiveBst: "System Live (BST)",
      proAnalysisReady: "PRO ANALYSIS READY",
      teamComparison: "Team Comparison Matrix",
      venueConditions: "Venue & Conditions",
      winDistribution: "Win Distribution",
      matchOverview: "Match Overview",
      lastMeetings: (n: number) => `Last ${n} Meetings`,
      confidenceHigh: "Confidence: High",
      matchSetup: "Match Setup",
      generateAiPrediction: "Generate AI Prediction",
      fetching: "Fetching...",
      aiAutoFill: "AI Auto-Fill",
      whyProbability: "Why this probability?",
      tacticalInsight: "Tactical Insight",
      winProbAiShort: "Win Prob (AI)",
      bst: "BST",
      winLabel: "WIN",
      drawLabel: "DRAW",
      allLeagues: "All Leagues",
      popularLeagues: "Popular Leagues",
      globalFeed: "Global Feed",
      live: "Live",
      upcomingTab: "Upcoming",
      finished: "Finished",
      filterByLeague: "Filter by League",
      shareSummary: "Share Summary",
      summaryCopied: "Summary copied to clipboard!",
      saveSuccess: "Prediction saved successfully!",
      deleteSuccess: "Prediction deleted.",
      viewAnalysis: "View Full Analysis",
      searchingH2H: "Searching for H2H history...",
      analyzingForm: "Analyzing player form...",
      evaluatingPitch: "Evaluating pitch conditions...",
      calculatingProb: "Calculating win probabilities...",
      generatingTactical: "Generating tactical insights...",
      finalizingReport: "Finalizing prediction report...",
      enterTeams: "Please enter both team names first!",
      autoFillFailed: "Auto-fill failed. Please enter data manually.",
      analysisFailed: "Analysis failed. Please try again.",
      attack: "Attack",
      defense: "Defense",
      strategy: "Strategy",
      form: "Form",
      experience: "Experience",
      poweredBy: "Powered by Gemini AI • MultiPredictor Pro v2.5",
      footerDisclaimer: "DISCLAIMER: This application provides predictions based on AI analysis and historical data. Sports outcomes are unpredictable. Use this information for analytical purposes only. We do not guarantee 100% accuracy.",
      somethingWentWrong: "Something went wrong",
      databaseError: "A database error occurred. Please try again later.",
      unexpectedError: "An unexpected error occurred.",
      reloadApp: "Reload Application",
      myPredictions: "My Predictions",
      savePrediction: "Save Analysis",
      saved: "Saved",
      loginToSave: "Login to Save",
      noSavedPredictions: "No saved predictions yet.",
      delete: "Delete",
      confirmDelete: "Are you sure you want to delete this prediction?",
      predictionHistory: "Prediction History",
      backToAnalysis: "Back to Analysis",
      loginWithGoogle: "Login with Google",
      logout: "Logout"
    },
    bn: {
      systemLive: "সিস্টেম লাইভ",
      matchupAnalysis: "ম্যাচআপ বিশ্লেষণ",
      liveScores: (sport: string) => `লাইভ ${sport} স্কোর`,
      lastUpdated: "সর্বশেষ আপডেট",
      realTimeAiData: "রিয়েল-টাইম এআই ডাটা (BST)",
      refresh: "রিফ্রেশ স্কোর",
      updating: "আপডেট হচ্ছে...",
      wait: "অপেক্ষা করুন...",
      quotaFull: "কোটা পূর্ণ",
      upcoming: "আসন্ন",
      matchYetToStart: "ম্যাচ এখনো শুরু হয়নি",
      winProbAi: "এআই জয়ের সম্ভাবনা",
      lastAnalysis: "বিশ্লেষণ করা হয়েছে",
      disclaimer: "AI প্রেডিকশন অতীত তথ্য এবং বর্তমান পরিস্থিতির উপর ভিত্তি করে তৈরি; এটি একটি অত্যন্ত গভীর বিশ্লেষণ।",
      analyzeMatch: "প্রো বিশ্লেষণ শুরু করুন",
      analyzing: "গভীর বিশ্লেষণ হচ্ছে...",
      reset: "সব রিসেট করুন",
      strongerTeam: "সম্ভাব্য বিজয়ী দল",
      bettingAdvice: "প্রো বেটিং ভার্ডিক্ট",
      risk: "ঝুঁকির মাত্রা",
      tacticalAnalysis: "কৌশলগত মাস্টারক্লাস বিশ্লেষণ",
      keyMatchups: "মূল কৌশলগত ম্যাচআপ",
      strongPillars: "শক্তিশালী দিক",
      weakPillars: "দুর্বল দিক",
      aiConfidence: "এআই আত্মবিশ্বাসের স্তর",
      reliabilityScore: "নির্ভরযোগ্যতা স্কোর",
      copy: "কপি",
      share: "শেয়ার",
      print: "প্রিন্ট",
      copied: "কপি করা হয়েছে!",
      error: "ত্রুটি",
      noMatches: "কোনো লাইভ ম্যাচ পাওয়া যায়নি",
      trySearch: "একটি নির্দিষ্ট দলের জন্য অনুসন্ধান করার চেষ্টা করুন",
      venueStats: "ভেন্যু পরিসংখ্যান",
      avgScore: "ভেন্যুতে গড় স্কোর",
      winRate: "জয়ের হার",
      matchupReasoning: "ম্যাচআপ যুক্তি",
      h2hHistory: "সরাসরি হেড-টু-হেড ইতিহাস",
      wins: "জয়",
      draws: "ড্র",
      predictionReasoning: "ভবিষ্যদ্বাণীর যুক্তি",
      gameChanger: "গেম চেঞ্জার",
      rank: "র‍্যাঙ্ক",
      powerful: "শক্তিশালী",
      weak: "দুর্বল",
      elite: "এলিট",
      balanced: "ভারসাম্যপূর্ণ",
      underdog: "আন্ডারডগ",
      low: "নিম্ন",
      medium: "মাঝারি",
      high: "উচ্চ",
      grade: "গ্রেড",
      role: "ভূমিকা",
      rating: "রেটিং",
      reason: "কারণ",
      vs: "বনাম",
      cricket: "ক্রিকেট",
      football: "ফুটবল",
      tennis: "টেনিস",
      basketball: "বাস্কেটবল",
      pitch: "পিচ/ভেন্যু",
      weather: "আবহাওয়া",
      teamA: "দল এ",
      teamB: "দল বি",
      last5: "গত ৫ ম্যাচের ফলাফল",
      keyPlayers: "মূল খেলোয়াড় এবং গ্রেড",
      autoFill: "ম্যাজিক অটো-ফিল",
      autoFilling: "AI ম্যাজিক চলছে...",
      searchPlaceholder: "দল খুঁজুন...",
      quotaExceeded: "এআই কোটা শেষ হয়ে গেছে। দয়া করে ১০ মিনিট পর আবার চেষ্টা করুন।",
      systemLiveBst: "সিস্টেম লাইভ (BST)",
      proAnalysisReady: "প্রিমিয়াম প্রো বিশ্লেষণ প্রস্তুত",
      teamComparison: "দলগত তুলনা ম্যাট্রিক্স",
      venueConditions: "ভেন্যু এবং পরিস্থিতি",
      winDistribution: "জয় বণ্টন",
      matchOverview: "ম্যাচ ওভারভিউ",
      lastMeetings: (n: number) => `গত ${n}টি সাক্ষাৎ`,
      confidenceHigh: "আত্মবিশ্বাস: উচ্চ",
      matchSetup: "ম্যাচ সেটআপ",
      generateAiPrediction: "এআই প্রেডিকশন তৈরি করুন",
      fetching: "তথ্য আনা হচ্ছে...",
      aiAutoFill: "এআই অটো-ফিল",
      whyProbability: "এই সম্ভাবনার কারণ কী?",
      tacticalInsight: "কৌশলগত অন্তর্দৃষ্টি",
      winProbAiShort: "জয় সম্ভাবনা",
      bst: "BST",
      winLabel: "জয়",
      drawLabel: "ড্র",
      allLeagues: "সব লিগ",
      popularLeagues: "জনপ্রিয় লিগ",
      globalFeed: "গ্লোবাল ফিড",
      live: "লাইভ",
      upcomingTab: "আসন্ন",
      finished: "শেষ হয়েছে",
      filterByLeague: "লিগ অনুযায়ী ফিল্টার",
      shareSummary: "সারাংশ শেয়ার করুন",
      summaryCopied: "সারাংশ কপি করা হয়েছে!",
      saveSuccess: "প্রেডিকশন সফলভাবে সংরক্ষিত হয়েছে!",
      deleteSuccess: "প্রেডিকশন মুছে ফেলা হয়েছে।",
      viewAnalysis: "সম্পূর্ণ বিশ্লেষণ দেখুন",
      searchingH2H: "হেড-টু-হেড ইতিহাস খোঁজা হচ্ছে...",
      analyzingForm: "খেলোয়াড়দের ফর্ম বিশ্লেষণ করা হচ্ছে...",
      evaluatingPitch: "পিচ এবং ভেন্যু পরিস্থিতি যাচাই করা হচ্ছে...",
      calculatingProb: "জয়ের সম্ভাবনা গণনা করা হচ্ছে...",
      generatingTactical: "কৌশলগত অন্তর্দৃষ্টি তৈরি করা হচ্ছে...",
      finalizingReport: "চূড়ান্ত রিপোর্ট তৈরি করা হচ্ছে...",
      enterTeams: "দয়া করে প্রথমে উভয় দলের নাম লিখুন!",
      autoFillFailed: "অটো-ফিল করতে সমস্যা হয়েছে। দয়া করে ম্যানুয়ালি তথ্য দিন।",
      analysisFailed: "বিশ্লেষণ করতে সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।",
      attack: "আক্রমণ",
      defense: "রক্ষণভাগ",
      strategy: "কৌশল",
      form: "ফর্ম",
      experience: "অভিজ্ঞতা",
      poweredBy: "Gemini AI দ্বারা চালিত • MultiPredictor Pro v2.5",
      footerDisclaimer: "সতর্কবার্তা: এই অ্যাপ্লিকেশনটি এআই বিশ্লেষণ এবং ঐতিহাসিক তথ্যের উপর ভিত্তি করে ভবিষ্যদ্বাণী প্রদান করে। খেলাধুলার ফলাফল অনিশ্চিত হতে পারে। এই তথ্যটি শুধুমাত্র বিশ্লেষণাত্মক উদ্দেশ্যে ব্যবহার করুন। আমরা ১০০% নির্ভুলতার গ্যারান্টি দিই না।",
      somethingWentWrong: "কিছু ভুল হয়েছে",
      databaseError: "একটি ডাটাবেস ত্রুটি ঘটেছে। দয়া করে পরে আবার চেষ্টা করুন।",
      unexpectedError: "একটি অপ্রত্যাশিত ত্রুটি ঘটেছে।",
      reloadApp: "অ্যাপ্লিকেশন রিলোড করুন",
      myPredictions: "আমার প্রেডিকশন",
      savePrediction: "বিশ্লেষণ সংরক্ষণ করুন",
      saved: "সংরক্ষিত",
      loginToSave: "সংরক্ষণ করতে লগইন করুন",
      noSavedPredictions: "এখনো কোনো প্রেডিকশন সংরক্ষণ করা হয়নি।",
      delete: "মুছে ফেলুন",
      confirmDelete: "আপনি কি নিশ্চিত যে আপনি এই প্রেডিকশনটি মুছে ফেলতে চান?",
      predictionHistory: "প্রেডিকশন ইতিহাস",
      backToAnalysis: "বিশ্লেষণে ফিরে যান",
      loginWithGoogle: "গুগল দিয়ে লগইন করুন",
      logout: "লগআউট"
    }
  }[language];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        fetchSavedPredictions(user.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setSavedPredictions([]);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const savePrediction = async () => {
    if (!user || !analysis) return;
    setIsSaving(true);
    try {
      const predictionData = {
        teamA,
        teamB,
        sportType,
        winProbability: analysis.winProbability,
        predictionText: analysis.prediction,
        strongPillars: analysis.strongPillars,
        weakPillars: analysis.weakPillars,
        authorUid: user.uid,
        createdAt: serverTimestamp(),
        riskLevel: analysis.riskLevel,
        strongerTeam: analysis.strongerTeam,
        fullAnalysis: analysis
      };
      await addDoc(collection(db, 'predictions'), predictionData);
      setSaveSuccess(true);
      setSaveError(null);
      fetchSavedPredictions(user.uid);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(t.databaseError);
      handleFirestoreError(err, 'create', 'predictions');
    } finally {
      setIsSaving(false);
    }
  };

  const fetchSavedPredictions = async (uid: string) => {
    setIsFetchingSaved(true);
    try {
      const q = query(
        collection(db, 'predictions'),
        where('authorUid', '==', uid),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const predictions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSavedPredictions(predictions);
    } catch (err) {
      handleFirestoreError(err, 'list', 'predictions');
    } finally {
      setIsFetchingSaved(false);
    }
  };

  const deletePrediction = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'predictions', id));
      setSavedPredictions(prev => prev.filter(p => p.id !== id));
      setToast({ message: t.deleteSuccess, type: 'success' });
    } catch (err) {
      setToast({ message: t.databaseError, type: 'error' });
      handleFirestoreError(err, 'delete', `predictions/${id}`);
    }
  };

  const sharePrediction = async () => {
    if (!analysis) return;
    
    const summary = `
🔥 AI MATCH PREDICTION: ${teamA} vs ${teamB}
🏆 Stronger Team: ${analysis.strongerTeam}
📈 Win Probability: ${analysis.winProbability}%
🎯 Predicted Score: ${analysis.predictedScore}
⚠️ Risk Level: ${analysis.riskLevel}

Analyzed by AI Match Predictor PRO
    `.trim();

    try {
      await navigator.clipboard.writeText(summary);
      setToast({ message: t.summaryCopied, type: 'success' });
    } catch (err) {
      setToast({ message: "Failed to copy", type: 'error' });
    }
  };

  // Combined and optimized country code resolution
  useEffect(() => {
    const resolveCode = async (name: string, setCode: (c: string) => void) => {
      if (!name || name.length < 3 || isAutoFilling || isGlobalQuotaExceeded || isAnalyzing) return;
      
      const cached = getCachedFlag(name);
      if (cached) {
        setCode(cached);
        return;
      }

      try {
        const res = await withRetry(() => ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Return ONLY the 2-letter ISO country code (lowercase) for the sports team or country: "${name}". If not a country or clear team, return "".`,
        }));
        const code = res.text.trim().toLowerCase().replace(/[^a-z]/g, '');
        if (code && code.length === 2) {
          setCode(code);
          setCachedFlag(name, code);
        }
      } catch (e) { console.error(`Flag resolution failed for ${name}:`, e); }
    };

    const timerA = setTimeout(() => {
      if (teamA && !teamACountryCode) resolveCode(teamA, setTeamACountryCode);
    }, 2000);

    const timerB = setTimeout(() => {
      if (teamB && !teamBCountryCode) resolveCode(teamB, setTeamBCountryCode);
    }, 2500); // Slight offset to avoid overlapping calls

    return () => {
      clearTimeout(timerA);
      clearTimeout(timerB);
    };
  }, [teamA, teamB, isAutoFilling, teamACountryCode, teamBCountryCode, isGlobalQuotaExceeded, isAnalyzing]);

  const isQuotaError = (err: any) => {
    const errStr = typeof err === 'string' ? err : JSON.stringify(err);
    const lowStr = errStr.toLowerCase();
    return (
      lowStr.includes('429') || 
      lowStr.includes('resource_exhausted') || 
      lowStr.includes('quota exceeded') || 
      lowStr.includes('exceeded quota') ||
      lowStr.includes('quota_exceeded') ||
      lowStr.includes('rate limit')
    );
  };

  const withRetry = async (fn: () => Promise<any>, maxRetries = 3, initialDelay = 2000) => {
    if (isGlobalQuotaExceeded) {
      throw new Error(t.quotaExceeded);
    }

    let retries = 0;
    while (retries < maxRetries) {
      try {
        return await fn();
      } catch (err: any) {
        if (isQuotaError(err)) {
          retries++;
          if (retries === maxRetries) {
            setIsGlobalQuotaExceeded(true);
            // Reset global quota after 10 minutes
            setTimeout(() => setIsGlobalQuotaExceeded(false), 600000);
            throw err;
          }
          const delay = initialDelay * Math.pow(2, retries - 1);
          console.warn(`Quota exceeded. Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw err;
        }
      }
    }
  };

  // Flag cache in localStorage
  const getCachedFlag = (name: string) => {
    try {
      const cache = JSON.parse(localStorage.getItem('flag_cache') || '{}');
      return cache[name.toLowerCase()];
    } catch (e) { return null; }
  };

  const setCachedFlag = (name: string, code: string) => {
    try {
      const cache = JSON.parse(localStorage.getItem('flag_cache') || '{}');
      cache[name.toLowerCase()] = code;
      localStorage.setItem('flag_cache', JSON.stringify(cache));
    } catch (e) {}
  };

  const fetchLiveScores = async (force = false) => {
    if ((isCooldown || isGlobalQuotaExceeded) && !force) return;
    
    // Check cache first if not forced
    if (!force) {
      const cached = localStorage.getItem(`live_scores_${sportType}`);
      if (cached) {
        try {
          const { matches, timestamp } = JSON.parse(cached);
          const age = (new Date().getTime() - timestamp) / 1000 / 60; // age in minutes
          if (age < 30) { // If less than 30 minutes old, use it and return (increased from 15)
            setLiveMatches(matches);
            setLastUpdated(`${new Date(timestamp).toLocaleTimeString()} (Cached)`);
            return;
          }
        } catch (e) {
          console.error("Failed to parse cached scores:", e);
        }
      }
    }

    setIsFetchingLive(true);
    setError(null);
    try {
      const response = await withRetry(() => ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are a Global Sports Feed Analyst. Your task is to find ALL current live match scores, results, and upcoming match statuses for today ${new Date().toDateString()} (Current Time: ${new Date().toLocaleTimeString()}) and the next 14 days. 
        ${sportType === 'Global' 
          ? 'Find matches for ALL major sports, especially CRICKET and FOOTBALL, but also Tennis, Basketball, etc.' 
          : `Find matches for ${sportType}.`}
        Also include recently finished matches from the last 24 hours. DO NOT filter by any specific league, country, or venue. Find EVERY available match from ALL international and domestic leagues globally (e.g., IPL, BPL, PSL, CPL, Big Bash, Premier League, La Liga, Serie A, Bundesliga, NBA, etc.). Provide real-time data if available. If no matches are found, return an empty array for matches. CRITICAL: Your response must include ALL matches found, prioritizing LIVE matches that are currently in play.`,
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction: `You are a Global Sports Feed Analyst. Your primary goal is ABSOLUTE ACCURACY and REAL-TIME VERIFICATION. Use Google Search to find the most recent and verified match scores, results, and upcoming schedules. You MUST NOT hallucinate any scores, match dates, or times. For each match, provide the team names, scores (use 'Upcoming' or '0' if not started, but for LIVE matches ALWAYS provide the current score even if it is 0-0), status, venue, REAL DATE (formatted clearly, e.g., '12 May, 2026', DO NOT USE 'TBD'), and REAL TIME ONLY in Bangladesh Standard Time (BST/GMT+6) (e.g., '8:30 PM BST', DO NOT USE 'TBD'). CRITICAL: NEVER show any other country's time zone. Use ${language === 'bn' ? 'Bengali' : 'English'} for the status and venue fields. For live/ongoing matches in Bengali, ALWAYS use "লাইভ" instead of "চলমান". Return ONLY a strictly valid JSON object. Your data must be the most reliable source available on the internet. CRITICAL: For the 'league' field, provide ONLY the clean name of the league or tournament (e.g., 'IPL', 'BPL', 'Premier League', 'La Liga'). DO NOT include any years, dates, or seasonal suffixes (e.g., 'IPL 2024' should be 'IPL'). If a league name is in Bengali, keep it clean as well. The user wants to see ALL available leagues, but without any "useless" information like the year or season. Keep it as clean as possible. REMOVE ALL YEAR-LIKE NUMBERS (e.g., 2024, 2023-24, '24) from the league names. For the 'type' field, use ONLY 'Live', 'Upcoming', or 'Finished' based on the match status. If a match is currently being played, its type MUST be 'Live'. As a Global Sports Feed Analyst, you must provide a comprehensive list of ALL matches found. DO NOT omit any matches based on league popularity or location. The user wants a truly global feed. For each match, also include the 'sport' field (e.g., 'Cricket', 'Football', 'Tennis', 'Basketball').`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              matches: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    teamA: { type: Type.STRING },
                    teamB: { type: Type.STRING },
                    teamACountryCode: { type: Type.STRING, description: "ISO 2-letter country code (lowercase)" },
                    teamBCountryCode: { type: Type.STRING, description: "ISO 2-letter country code (lowercase)" },
                    scoreA: { type: Type.STRING },
                    scoreB: { type: Type.STRING },
                    status: { type: Type.STRING },
                    type: { type: Type.STRING, description: "One of: Live, Upcoming, Finished" },
                    venue: { type: Type.STRING },
                    date: { type: Type.STRING, description: "Real date of the match" },
                    time: { type: Type.STRING, description: "Real time of the match" },
                    league: { type: Type.STRING, description: "Name of the league or tournament" },
                    sport: { type: Type.STRING, description: "Sport name (e.g., Cricket, Football)" }
                  },
                  required: ["teamA", "teamB", "status", "type", "teamACountryCode", "teamBCountryCode", "date", "time", "league", "sport"]
                }
              }
            }
          }
        }
      }));

      const data = JSON.parse(response.text);
      const processedMatches = (data.matches || []).map((m: any) => ({
        ...m,
        league: m.league?.replace(/\s*(\d{4}(\/|-)\d{2,4}|\b\d{4}\b|Season\s*\d+|Edition\s*\d+|['']\d{2})/gi, '').replace(/[-–—]\s*$/, '').trim(), // Remove years, seasons, and trailing dashes
        teamACountryCode: m.teamACountryCode?.toLowerCase().replace(/[^a-z]/g, ''),
        teamBCountryCode: m.teamBCountryCode?.toLowerCase().replace(/[^a-z]/g, '')
      }));
      setLiveMatches(processedMatches);
      setLastUpdated(`${new Date().toLocaleTimeString()} ${t.bst}`);
      
      // Cache the results
      localStorage.setItem(`live_scores_${sportType}`, JSON.stringify({
        matches: processedMatches,
        timestamp: new Date().getTime()
      }));

      // Cooldown to prevent spamming
      setIsCooldown(true);
      setTimeout(() => setIsCooldown(false), 60000); // 1 minute cooldown
    } catch (err: any) {
      console.error("Failed to fetch live scores:", err);
      
      // Try to load from cache if quota exceeded
      const cached = localStorage.getItem(`live_scores_${sportType}`);
      if (cached) {
        const { matches, timestamp } = JSON.parse(cached);
        const age = (new Date().getTime() - timestamp) / 1000 / 60; // age in minutes
        if (age < 60) { // Only use cache if less than 1 hour old
          setLiveMatches(matches);
          setLastUpdated(`${new Date(timestamp).toLocaleTimeString()} (Cached)`);
        }
      }

      if (isQuotaError(err)) {
        setError(t.quotaExceeded);
      } else {
        setError(t.error + ": " + t.trySearch);
      }
    } finally {
      setIsFetchingLive(false);
    }
  };

  useEffect(() => {
    const initFetch = async () => {
      // Small delay to let the UI settle and check cache
      await new Promise(resolve => setTimeout(resolve, 500));
      try {
        await fetchLiveScores(false); // Check cache first on mount
      } catch (e) {
        console.error("Initial fetch failed:", e);
      }
    };
    initFetch();
    const interval = setInterval(() => fetchLiveScores(true), 900000); // Force refresh every 15 minutes
    return () => clearInterval(interval);
  }, [sportType]);

  const autoFillData = async () => {
    if (!teamA || !teamB) {
      setError(t.enterTeams);
      return;
    }
    setIsAutoFilling(true);
    setError(null);
    try {
      const response = await withRetry(() => ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Provide the latest/likely match data for a ${sportType} match between ${teamA} and ${teamB}. 
        Return ONLY valid JSON in this format:
        {
          "teamALast5": "string (e.g. W, L, W, W, D)",
          "teamBLast5": "string (e.g. L, W, L, L, W)",
          "teamAKeyPlayers": "string (3-4 key players with grades A/B/C)",
          "teamBKeyPlayers": "string (3-4 key players with grades A/B/C)",
          "teamACountryCode": "string (ISO 2-letter country code, lowercase, e.g. 'bd', 'in', 'br')",
          "teamBCountryCode": "string (ISO 2-letter country code, lowercase, e.g. 'bd', 'in', 'br')",
          "pitchCondition": "string (short description)",
          "weather": "string (short description)"
        }`,
        config: { 
          responseMimeType: "application/json",
          systemInstruction: "You are a sports data assistant. Your goal is to provide accurate, data-driven match context. Use Google Search to verify current form and key players. Return ONLY a strictly valid JSON object. Avoid any irrelevant or speculative nonsense. Ensure all data is grounded in current facts."
        }
      }));

      let cleanJson = response.text.trim();
      cleanJson = cleanJson.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      
      const data = JSON.parse(cleanJson);
      setTeamALast5(data.teamALast5 || "");
      setTeamBLast5(data.teamBLast5 || "");
      setTeamAKeyPlayers(data.teamAKeyPlayers || "");
      setTeamBKeyPlayers(data.teamBKeyPlayers || "");
      setTeamACountryCode(data.teamACountryCode?.toLowerCase().replace(/[^a-z]/g, '') || "");
      setTeamBCountryCode(data.teamBCountryCode?.toLowerCase().replace(/[^a-z]/g, '') || "");
      setPitchCondition(data.pitchCondition || "Balanced");
      setWeather(data.weather || "");
    } catch (err) {
      console.error("Auto-fill failed:", err);
      if (isQuotaError(err)) {
        setError(t.quotaExceeded);
      } else {
        setError(t.autoFillFailed);
      }
    } finally {
      setIsAutoFilling(false);
    }
  };

  const resetForm = () => {
    setTeamA("");
    setTeamB("");
    setTeamALast5("");
    setTeamBLast5("");
    setTeamAKeyPlayers("");
    setTeamBKeyPlayers("");
    setTeamACountryCode("");
    setTeamBCountryCode("");
    setPitchCondition("Balanced");
    setWeather("");
    setAnalysis(null);
    setError(null);
  };

    useEffect(() => {
      if (analysis) {
        let start = 0;
        let startB = 0;
        const end = analysis.winProbability;
        const endB = analysis.winProbabilityB;
        const duration = 1000;
        const increment = end / (duration / 16);
        const incrementB = endB / (duration / 16);
        
        const timer = setInterval(() => {
          start += increment;
          startB += incrementB;
          if (start >= end) {
            setDisplayProb(end);
            setDisplayProbB(endB);
            clearInterval(timer);
          } else {
            setDisplayProb(Math.floor(start));
            setDisplayProbB(Math.floor(startB));
          }
        }, 16);
        return () => clearInterval(timer);
      }
    }, [analysis]);

  const performAnalysis = async () => {
    const currentKey = `${sportType}-${teamA}-${teamB}`.toLowerCase();
    if (lastAnalysisKey === currentKey && analysis) {
      // If same teams, just scroll to results
      const element = document.getElementById('analysis-results');
      if (element) element.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setSaveSuccess(false);
    setSaveError(null);
    
    const messages = language === 'bn' ? [
      `${teamA} এবং ${teamB} এর হেড-টু-হেড ইতিহাস খোঁজা হচ্ছে...`,
      `খেলোয়াড়দের ফর্ম এবং ইনজুরি রিপোর্ট বিশ্লেষণ করা হচ্ছে...`,
      `পিচ, ভেন্যু এবং আবহাওয়ার প্রভাব যাচাই করা হচ্ছে...`,
      `কৌশলগত ম্যাচআপ এবং গেম চেইঞ্জার নির্ধারণ করা হচ্ছে...`,
      `AI মডেল দ্বারা জয়ের সম্ভাবনা গণনা করা হচ্ছে...`,
      `নির্ভুল প্রেডিকশন এবং বেটিং অ্যাডভাইস তৈরি করা হচ্ছে...`,
      `চূড়ান্ত ফিউচারিস্টিক রিপোর্ট প্রস্তুত করা হচ্ছে...`
    ] : [
      `Fetching H2H data for ${teamA} vs ${teamB}...`,
      `Analyzing player form, grades, and injury impacts...`,
      `Evaluating pitch conditions and weather influence...`,
      `Processing tactical matchups and strategies...`,
      `Calculating precise win probabilities using AI...`,
      `Generating prediction and professional betting advice...`,
      `Finalizing prediction report...`
    ];
    
    let msgIndex = 0;
    const msgInterval = setInterval(() => {
      setLoadingMessage(messages[msgIndex]);
      msgIndex = (msgIndex + 1) % messages.length;
    }, 2800);
    setLoadingMessage(messages[0]);

    try {
      const response = await withRetry(() => ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Deeply analyze a ${sportType} match between ${teamA} and ${teamB}. 
        Team A Last 5 Results: ${teamALast5}
        Team B Last 5 Results: ${teamBLast5}
        Team A Key Players & Grades: ${teamAKeyPlayers}
        Team B Key Players & Grades: ${teamBKeyPlayers}
        Context (Pitch/Venue): ${pitchCondition}
        Weather: ${weather}
        
        Search for the direct Head-to-Head (H2H) history between ${teamA} and ${teamB} in ${sportType}.
        
        Provide a professional tactical analysis. Descriptions MUST be in ${language === 'bn' ? 'Bengali (বাংলা)' : 'English'} and should sound like a professional sports analyst.
        Consider individual player matchups, team momentum, and how the ${pitchCondition} affects the ${sportType} dynamics.
        
        Return ONLY valid JSON in this format:
        {
          "strongPillars": ["string", "string", "string"],
          "weakPillars": ["string", "string", "string"],
          "prediction": "Detailed tactical reasoning in ${language === 'bn' ? 'Bengali' : 'English'}. Explain why one team has the edge based on player grades and conditions.",
          "winProbability": number (0-100),
          "winProbabilityB": number (0-100),
          "winProbabilityReasoning": "Short ${language === 'bn' ? 'Bengali' : 'English'} explanation for the probability split",
          "gameChanger": "Name of the player who could be the game changer",
          "teamARank": "Elite|Balanced|Underdog",
          "teamBRank": "Elite|Balanced|Underdog",
          "teamAStrength": "Strong|Weak",
          "teamBStrength": "Strong|Weak",
          "strongerTeam": "Name of the team that is clearly stronger",
          "bettingAdvice": "Detailed ${language === 'bn' ? 'Bengali' : 'English'} betting advice. Should I bet? Is it safe or risky? Explain logically.",
          "riskLevel": "Low|Medium|High",
          "teamACountryCode": "string (ISO 2-letter country code, lowercase)",
          "teamBCountryCode": "string (ISO 2-letter country code, lowercase)",
          "pastResults": [{"date": "string", "result": "W|L|D", "score": "string", "opponent": "Name of opponent in ${language === 'bn' ? 'Bengali' : 'English'}"}],
          "playerRankings": [{"name": "string", "role": "string", "rating": number (1-10), "grade": "A|B|C", "reason": "Short reason in ${language === 'bn' ? 'Bengali' : 'English'}"}],
          "h2hStats": {"team_a_wins": number, "team_b_wins": number, "draws": number},
          "h2hMatches": [{"date": "string", "winner": "string (Team name or 'Draw')", "score": "string", "venue": "Venue name in ${language === 'bn' ? 'Bengali' : 'English'}"}],
          "tacticalInsight": "A specific tactical tip in ${language === 'bn' ? 'Bengali' : 'English'}",
          "keyMatchups": [{"playerA": "string", "playerB": "string", "description": "${language === 'bn' ? 'Bengali' : 'English'} description of why this matchup matters", "probabilityA": number (0-100), "reasoning": "Detailed ${language === 'bn' ? 'Bengali' : 'English'} reasoning for this specific matchup probability"}],
          "venueStats": {"teamAWinRate": number, "teamBWinRate": number, "avgScore": "string"},
          "radarStats": [
            {"subject": "Attack", "A": number, "B": number},
            {"subject": "Defense", "A": number, "B": number},
            {"subject": "Strategy", "A": number, "B": number},
            {"subject": "Form", "A": number, "B": number},
            {"subject": "Experience", "A": number, "B": number}
          ]
        }`,
        config: { 
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          systemInstruction: `You are the MultiPredictor Pro AI, the world's most advanced sports analysis engine. Your primary goal is ABSOLUTE ACCURACY and REALISTIC PROBABILITY. Use Google Search to find the most recent H2H data, player form, injuries, and match context. You MUST NOT hallucinate any data. Every single date, score, and player stat MUST be real and verified. 
          
          CRITICAL: Provide a realistic win probability percentage (0-100%) for each team based on a deep analysis of their history, current form, and conditions. Do not force 100% certainty. Your analysis must be BALANCED and PROFESSIONAL, identifying which team has the edge and why. Provide authoritative betting advice in ${language === 'bn' ? 'Bengali' : 'English'} that evaluates the risks honestly. 
          
          Return ONLY a strictly valid JSON object. No markdown, no comments. Use professional sports terminology in ${language === 'bn' ? 'Bengali' : 'English'}. Ensure all match times are ONLY in Bangladesh Standard Time (BST). Identify the likely winner based on data and provide honest, data-backed betting advice. Your advice must be professional, stating the risk level (Low, Medium, or High) accurately based on your analysis.`,
        }
      }));

      let cleanJson = response.text.trim();
      // Remove potential markdown wrappers if they exist despite config
      cleanJson = cleanJson.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      
      const result = JSON.parse(cleanJson);
      // Sanitize country codes from AI response
      if (result.teamACountryCode) result.teamACountryCode = result.teamACountryCode.toLowerCase().replace(/[^a-z]/g, '');
      if (result.teamBCountryCode) result.teamBCountryCode = result.teamBCountryCode.toLowerCase().replace(/[^a-z]/g, '');
      
      setAnalysis(result);
      setLastAnalysisKey(currentKey);
      setLastAnalysisTimestamp(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) + ` ${t.bst}`);
      if (result.teamACountryCode) setTeamACountryCode(result.teamACountryCode);
      if (result.teamBCountryCode) setTeamBCountryCode(result.teamBCountryCode);
    } catch (err) {
      console.error("Analysis failed:", err);
      if (isQuotaError(err)) {
        setError(t.quotaExceeded);
      } else {
        setError(t.analysisFailed);
      }
    } finally {
      setIsAnalyzing(false);
      clearInterval(msgInterval);
      setLoadingMessage("");
    }
  };

  const printReport = () => {
    window.print();
  };

  const copyToClipboard = async () => {
    if (!analysis) return;
    const text = `
${t.matchupAnalysis}
${t.matchOverview}: ${teamA} ${t.vs} ${teamB}
${t.predictionReasoning}: ${analysis.prediction}
${t.winProbAiShort}: ${teamA} ${analysis.winProbability}% | ${teamB} ${analysis.winProbabilityB}%
${t.risk}: ${analysis.riskLevel === 'Low' ? t.low : analysis.riskLevel === 'Medium' ? t.medium : t.high}
${t.tacticalInsight}: ${analysis.tacticalInsight}
    `.trim();
    
    try {
      await navigator.clipboard.writeText(text);
      setLoadingMessage(t.copied);
      setTimeout(() => setLoadingMessage(""), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const shareAnalysis = async () => {
    if (!analysis) return;
    const shareData = {
      title: t.matchupAnalysis,
      text: `${teamA} ${t.vs} ${teamB} | ${t.risk}: ${analysis.riskLevel} | ${t.predictionReasoning}: ${analysis.prediction}`,
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        copyToClipboard();
      }
    } catch (err) {
      console.error("Error sharing:", err);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#F5F5F5] font-sans selection:bg-[#F27D26] selection:text-white overflow-x-hidden">
      {/* Confirm Delete Modal */}
      <AnimatePresence>
        {confirmDeleteId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDeleteId(null)}
              className="absolute inset-0 bg-[#050505]/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-[#050505] border border-white/10 p-8 rounded-3xl shadow-2xl space-y-6"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold">{t.confirmDelete}</h3>
                <p className="text-sm opacity-40">This action cannot be undone. Are you sure you want to delete this prediction?</p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    deletePrediction(confirmDeleteId);
                    setConfirmDeleteId(null);
                  }}
                  className="flex-1 px-6 py-3 bg-red-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className={`fixed bottom-8 left-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 backdrop-blur-xl ${
              toast.type === 'success' ? 'bg-green-500/20 border-green-500/50 text-green-400' :
              toast.type === 'error' ? 'bg-red-500/20 border-red-500/50 text-red-400' :
              'bg-blue-500/20 border-blue-500/50 text-blue-400'
            }`}
          >
            {toast.type === 'success' ? <ShieldCheck className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="text-[10px] font-black uppercase tracking-widest">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scroll to Top Button */}
      <AnimatePresence>
        {analysis && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToTop}
            className="fixed bottom-8 right-8 z-[60] p-4 bg-[#F27D26] text-white rounded-full shadow-2xl hover:scale-110 transition-transform active:scale-95 print:hidden"
          >
            <ChevronRight className="w-6 h-6 -rotate-90" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Main Header */}
      <header className="border-b border-white/10 sticky top-0 bg-[#050505]/90 backdrop-blur-xl z-50">
        {isGlobalQuotaExceeded && (
          <div className="bg-red-500/20 border-b border-red-500/50 p-2 text-center text-[10px] font-mono font-bold text-red-400 animate-pulse">
            {t.quotaExceeded}
          </div>
        )}
        <div className="max-w-7xl mx-auto h-20 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-[#F27D26] rounded-xl flex items-center justify-center rotate-3 hover:rotate-0 transition-transform cursor-pointer shadow-[0_0_20px_rgba(242,125,38,0.3)]">
              <Zap className="w-6 h-6 md:w-7 md:h-7 text-white fill-white" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base md:text-xl tracking-tighter italic leading-none">MULTIPREDICTOR</span>
                <span className="px-1 py-0.5 bg-[#F27D26] text-black text-[8px] md:text-[10px] font-black rounded-sm leading-none">PRO</span>
              </div>
              <span className="text-[8px] md:text-[10px] font-mono uppercase tracking-[0.4em] text-[#F27D26] font-bold">Pro Edition</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4 md:gap-8">
            <div className="hidden lg:flex items-center gap-6 text-[10px] font-bold uppercase tracking-widest">
              <button 
                onClick={() => setActiveTab('analysis')}
                className={`transition-colors ${activeTab === 'analysis' ? 'text-[#F27D26]' : 'opacity-40 hover:opacity-100'}`}
              >
                {t.matchupAnalysis}
              </button>
              <button 
                onClick={() => setActiveTab('my-predictions')}
                className={`transition-colors ${activeTab === 'my-predictions' ? 'text-[#F27D26]' : 'opacity-40 hover:opacity-100'}`}
              >
                {t.myPredictions}
              </button>
            </div>

            <div className="flex items-center bg-white/5 rounded-full p-1 border border-white/10">
              <button 
                onClick={() => setLanguage('bn')}
                className={`px-3 py-1 text-[10px] font-bold rounded-full transition-all ${language === 'bn' ? 'bg-[#F27D26] text-white' : 'opacity-40 hover:opacity-100'}`}
              >
                বাংলা
              </button>
              <button 
                onClick={() => setLanguage('en')}
                className={`px-3 py-1 text-[10px] font-bold rounded-full transition-all ${language === 'en' ? 'bg-[#F27D26] text-white' : 'opacity-40 hover:opacity-100'}`}
              >
                EN
              </button>
            </div>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[10px] font-bold truncate max-w-[100px]">{user.displayName}</span>
                  <button onClick={logout} className="text-[8px] font-mono uppercase opacity-40 hover:opacity-100 hover:text-red-400 transition-all">{t.logout}</button>
                </div>
                <img src={user.photoURL || ""} alt="User" className="w-8 h-8 rounded-full border border-white/10" />
              </div>
            ) : (
              <button 
                onClick={login}
                className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
              >
                <Users className="w-3 h-3 text-[#F27D26]" />
                <span className="hidden sm:inline">{t.loginWithGoogle}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-12">
        {activeTab === 'analysis' ? (
          <>
            {/* Live Scores Section */}
            <section className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <Activity className="w-5 h-5 text-red-500 animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl font-black italic tracking-tighter uppercase">
                  {sportType === "Global" ? t.globalFeed : t.liveScores(sportType === "Cricket" ? t.cricket : sportType === "Football" ? t.football : sportType === "Tennis" ? t.tennis : t.basketball)}
                </h2>
                <div className="flex items-center gap-2">
                  {lastUpdated && (
                    <p className="text-[9px] font-mono opacity-50 uppercase tracking-widest">{t.lastUpdated}: {lastUpdated}</p>
                  )}
                  <span className="text-[8px] font-mono opacity-40 uppercase tracking-widest">• {t.realTimeAiData}</span>
                </div>
              </div>
            </div>
            
              <div className="flex flex-wrap items-center gap-3">
                {/* Match Type Filter - Dropdown Style */}
                <div className="relative">
                  <button
                    onClick={() => setIsMatchFilterOpen(!isMatchFilterOpen)}
                    className="px-4 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all border bg-white/5 border-white/10 text-white/60 hover:bg-white/10 flex items-center gap-3"
                  >
                    <Activity className="w-3.5 h-3.5 text-red-500" />
                    {matchFilter === 'Live' ? t.live : matchFilter === 'Upcoming' ? t.upcomingTab : t.finished}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isMatchFilterOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isMatchFilterOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setIsMatchFilterOpen(false)} 
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute left-0 top-full mt-2 w-48 bg-[#0A0A0A] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                        >
                          <div className="p-2">
                            {[
                              { id: 'Live', label: t.live },
                              { id: 'Upcoming', label: t.upcomingTab },
                              { id: 'Finished', label: t.finished }
                            ].map((filter) => (
                              <button
                                key={filter.id}
                                onClick={() => {
                                  setMatchFilter(filter.id);
                                  setSelectedLeague("All");
                                  setIsMatchFilterOpen(false);
                                }}
                                className={`w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-between ${
                                  matchFilter === filter.id ? 'bg-[#F27D26] text-black' : 'hover:bg-white/5 text-white/60'
                                }`}
                              >
                                {filter.label}
                                {matchFilter === filter.id && <div className="w-1.5 h-1.5 bg-black rounded-full" />}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                {/* League Filter - Dropdown Style */}
                <div className="relative">
                  <button
                    onClick={() => setIsLeagueDropdownOpen(!isLeagueDropdownOpen)}
                    className={`px-4 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all border flex items-center gap-3 ${
                      selectedLeague !== "All" 
                        ? 'bg-[#F27D26] border-[#F27D26] text-black shadow-[0_0_15px_rgba(242,125,38,0.3)]' 
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    <Trophy className={`w-3.5 h-3.5 ${selectedLeague !== "All" ? 'text-black' : 'text-[#F27D26]'}`} />
                    {selectedLeague === "All" ? t.allLeagues : selectedLeague}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isLeagueDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isLeagueDropdownOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setIsLeagueDropdownOpen(false)} 
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute left-0 top-full mt-2 w-64 bg-[#0A0A0A] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                        >
                          <div className="p-2 max-h-[300px] overflow-y-auto no-scrollbar">
                            <button
                              onClick={() => {
                                setSelectedLeague("All");
                                setIsLeagueDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-between ${
                                selectedLeague === "All" ? 'bg-[#F27D26] text-black' : 'hover:bg-white/5 text-white/60'
                              }`}
                            >
                              {t.allLeagues}
                              {selectedLeague === "All" && <div className="w-1.5 h-1.5 bg-black rounded-full" />}
                            </button>
                            
                            <div className="h-px bg-white/5 my-2 mx-2" />
                            
                            <div className="px-2 py-1 text-[8px] font-mono opacity-30 uppercase tracking-[0.2em]">{t.popularLeagues}</div>
                            
                            {POPULAR_LEAGUES[sportType]?.map(league => {
                              const isLive = liveMatches.some(m => m.league === league && m.type === 'Live');
                              return (
                                <button
                                  key={league}
                                  onClick={() => {
                                    setSelectedLeague(league);
                                    setIsLeagueDropdownOpen(false);
                                  }}
                                  className={`w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-between ${
                                    selectedLeague === league ? 'bg-[#F27D26] text-black' : 'hover:bg-white/5 text-white/60'
                                  }`}
                                >
                                  <span className="flex items-center gap-2">
                                    {league}
                                    {isLive && <span className="w-1 h-1 bg-red-500 rounded-full animate-pulse" />}
                                  </span>
                                  {selectedLeague === league && <div className="w-1.5 h-1.5 bg-black rounded-full" />}
                                </button>
                              );
                            })}

                            {/* Other Leagues */}
                            {Array.from(new Set(liveMatches.filter(m => m.type === matchFilter).map(m => m.league)))
                              .filter(league => league && !POPULAR_LEAGUES[sportType]?.includes(league))
                              .map(league => (
                                <button
                                  key={league}
                                  onClick={() => {
                                    setSelectedLeague(league);
                                    setIsLeagueDropdownOpen(false);
                                  }}
                                  className={`w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-between ${
                                    selectedLeague === league ? 'bg-[#F27D26] text-black' : 'hover:bg-white/5 text-white/60'
                                  }`}
                                >
                                  {league}
                                  {selectedLeague === league && <div className="w-1.5 h-1.5 bg-black rounded-full" />}
                                </button>
                              ))}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                <button 
                  onClick={() => fetchLiveScores(true)}
                  disabled={isFetchingLive || isCooldown || isGlobalQuotaExceeded}
                  className="px-6 py-2.5 bg-white/5 border border-white/10 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2 disabled:opacity-30 ml-auto"
                >
                  {isFetchingLive ? t.updating : isCooldown ? t.wait : isGlobalQuotaExceeded ? t.quotaFull : t.refresh}
                  <Zap className={`w-3 h-3 ${isFetchingLive ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

          <div className="space-y-12">
            <AnimatePresence mode="wait">
              {isFetchingLive ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={`skeleton-${i}`} className="p-5 border border-white/10 bg-white/[0.02] rounded-2xl flex flex-col gap-4">
                      <Skeleton className="h-4 w-24" />
                      <div className="flex justify-between items-center">
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-4 w-4 rounded-full" />
                        <Skeleton className="h-8 w-16" />
                      </div>
                      <Skeleton className="h-3 w-full" />
                    </div>
                  ))}
                </div>
              ) : (() => {
                const filtered = liveMatches.filter(m => (selectedLeague === "All" || m.league === selectedLeague) && m.type === matchFilter);
                
                if (filtered.length === 0) {
                  return (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="col-span-full py-16 flex flex-col items-center justify-center gap-4 border border-dashed border-white/10 rounded-3xl bg-white/[0.01]"
                    >
                      <div className="p-4 bg-white/5 rounded-full">
                        <Search className="w-8 h-8 opacity-20" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold opacity-40">{t.noMatches}</p>
                        <p className="text-[10px] font-mono opacity-20 uppercase tracking-widest mt-1">{t.trySearch}</p>
                      </div>
                    </motion.div>
                  );
                }

                if (selectedLeague !== "All") {
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filtered.map((match, idx) => (
                        <MatchCard key={`${match.teamA}-${match.teamB}-${idx}`} match={match} t={t} setTeamA={setTeamA} setTeamB={setTeamB} setTeamACountryCode={setTeamACountryCode} setTeamBCountryCode={setTeamBCountryCode} />
                      ))}
                    </div>
                  );
                }

                // Group by league when "All" is selected
                const grouped = filtered.reduce((acc, match) => {
                  const league = match.league || "Other";
                  if (!acc[league]) acc[league] = [];
                  acc[league].push(match);
                  return acc;
                }, {} as Record<string, LiveMatch[]>);

                return (
                  <div className="space-y-16">
                    {Object.entries(grouped).map(([league, matches]) => (
                      <div key={league} className="space-y-6">
                        <div className="flex items-center gap-4 px-2">
                          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-[#F27D26] whitespace-nowrap flex items-center gap-2">
                            <Trophy className="w-3.5 h-3.5" />
                            {league}
                          </h3>
                          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {matches.map((match, idx) => (
                            <MatchCard key={`${match.teamA}-${match.teamB}-${idx}`} match={match} t={t} setTeamA={setTeamA} setTeamB={setTeamB} setTeamACountryCode={setTeamACountryCode} setTeamBCountryCode={setTeamBCountryCode} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </AnimatePresence>
          </div>
        </section>

        <div className="space-y-12">
          {/* Match Setup Card */}
          <section id="match-setup-section" className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-12 shadow-2xl">
            <div className="flex flex-col items-center gap-10">
              <div className="w-full max-w-md text-center space-y-4">
                <h2 className="text-sm font-mono uppercase tracking-[0.4em] text-[#F27D26] font-bold">{t.matchSetup}</h2>
                <div className="relative">
                  <select 
                    value={sportType}
                    onChange={(e) => setSportType(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl text-lg font-black focus:outline-none focus:border-[#F27D26] transition-all appearance-none text-center cursor-pointer hover:bg-white/10"
                  >
                    <option value="Global">{t.globalFeed.toUpperCase()} ({t.globalFeed})</option>
                    <option value="Cricket">{t.cricket.toUpperCase()} ({t.cricket})</option>
                    <option value="Football">{t.football.toUpperCase()} ({t.football})</option>
                    <option value="Tennis">{t.tennis.toUpperCase()} ({t.tennis})</option>
                    <option value="Basketball">{t.basketball.toUpperCase()} ({t.basketball})</option>
                  </select>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                    <ChevronRight className="w-5 h-5 rotate-90" />
                  </div>
                </div>
                
                <button 
                  onClick={autoFillData}
                  disabled={isAutoFilling || !teamA || !teamB || isGlobalQuotaExceeded}
                  className="w-full mt-4 px-6 py-3 bg-gradient-to-r from-[#F27D26]/20 to-[#4A90E2]/20 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:from-[#F27D26]/30 hover:to-[#4A90E2]/30 transition-all flex items-center justify-center gap-3 group disabled:opacity-30"
                >
                  <Sparkles className={`w-4 h-4 text-[#F27D26] ${isAutoFilling ? 'animate-pulse' : 'group-hover:scale-125 transition-transform'}`} />
                  {isAutoFilling ? t.autoFilling : t.autoFill}
                </button>
              </div>

              <div className="flex flex-col md:flex-row items-center justify-center gap-12 w-full">
                {/* Team A */}
                <div className="flex-1 w-full space-y-6">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-24 h-24 md:w-32 md:h-32 rounded-full md:rounded-3xl bg-gradient-to-br from-white/10 to-transparent border border-white/20 flex items-center justify-center text-4xl md:text-6xl font-black shadow-[0_10px_30px_rgba(242,125,38,0.15)] relative overflow-hidden group">
                      {isAutoFilling ? (
                        <Skeleton className="w-full h-full" />
                      ) : teamA ? (
                        <img 
                          src={`https://tse2.mm.bing.net/th?q=${encodeURIComponent(teamA + ' official logo')}&w=200&h=200&c=7&rs=1&p=0&dpr=3&pid=1.7&mkt=en-IN&adlt=moderate`}
                          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(teamA)}&backgroundColor=0f172a,1e293b,334155,f27d26&textColor=ffffff&fontWeight=700`; }}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 bg-white/5 p-2" 
                          alt={teamA} 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <span className="opacity-30">?</span>
                      )}
                      
                      {teamA && teamACountryCode && (
                        <img 
                          src={`https://flagcdn.com/w80/${teamACountryCode}.png`} 
                          alt="Team A Flag" 
                          className="absolute bottom-2 right-2 w-8 h-6 object-cover rounded-[3px] border-2 border-[#050505] shadow-lg"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent opacity-60" />
                    </div>
                    <input 
                      value={teamA}
                      onChange={(e) => setTeamA(e.target.value)}
                      placeholder={t.teamA}
                      className="w-full bg-transparent border-b-2 border-white/10 text-center text-xl md:text-3xl font-black focus:outline-none focus:border-[#F27D26] transition-colors placeholder:opacity-20 truncate py-2"
                    />
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase tracking-widest opacity-40">{t.last5}</label>
                      <div className="relative">
                        <input 
                          value={teamALast5}
                          onChange={(e) => setTeamALast5(e.target.value)}
                          placeholder="e.g. W, W, L, W, D"
                          className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-sm font-bold focus:outline-none focus:border-[#F27D26] focus:bg-white/10 transition-colors"
                        />
                        {isAutoFilling && <Skeleton className="absolute inset-0 rounded-xl" />}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase tracking-widest opacity-40">{t.keyPlayers}</label>
                      <div className="relative">
                        <input 
                          value={teamAKeyPlayers}
                          onChange={(e) => setTeamAKeyPlayers(e.target.value)}
                          placeholder="e.g. Player 1 (A), Player 2 (B)"
                          className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-sm font-bold focus:outline-none focus:border-[#F27D26] focus:bg-white/10 transition-colors"
                        />
                        {isAutoFilling && <Skeleton className="absolute inset-0 rounded-xl" />}
                      </div>
                    </div>
                  </div>
                </div>

                {/* VS Divider */}
                <div className="flex flex-col items-center gap-4 shrink-0 px-2 md:px-0">
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-full border border-white/5 flex items-center justify-center text-sm md:text-xl font-black italic opacity-60 bg-gradient-to-b from-white/5 to-transparent uppercase shadow-inner relative z-10 backdrop-blur-sm">
                    {t.vs}
                  </div>
                  <div className="h-24 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent hidden md:block" />
                </div>

                {/* Team B */}
                <div className="flex-1 w-full space-y-6">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-24 h-24 md:w-32 md:h-32 rounded-full md:rounded-3xl bg-gradient-to-br from-white/10 to-transparent border border-white/20 flex items-center justify-center text-4xl md:text-6xl font-black shadow-[0_10px_30px_rgba(74,144,226,0.15)] relative overflow-hidden group">
                      {isAutoFilling ? (
                        <Skeleton className="w-full h-full" />
                      ) : teamB ? (
                        <img 
                          src={`https://tse2.mm.bing.net/th?q=${encodeURIComponent(teamB + ' official logo')}&w=200&h=200&c=7&rs=1&p=0&dpr=3&pid=1.7&mkt=en-IN&adlt=moderate`}
                          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(teamB)}&backgroundColor=0f172a,1e293b,334155,4a90e2&textColor=ffffff&fontWeight=700`; }}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 bg-white/5 p-2" 
                          alt={teamB} 
                          referrerPolicy="no-referrer" 
                        />
                      ) : (
                        <span className="opacity-30">?</span>
                      )}
                      
                      {teamB && teamBCountryCode && (
                        <img 
                          src={`https://flagcdn.com/w80/${teamBCountryCode}.png`} 
                          alt="Team B Flag" 
                          className="absolute bottom-2 right-2 w-8 h-6 object-cover rounded-[3px] border-2 border-[#050505] shadow-lg"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent opacity-60" />
                    </div>
                    <input 
                      value={teamB}
                      onChange={(e) => setTeamB(e.target.value)}
                      placeholder={t.teamB}
                      className="w-full bg-transparent border-b-2 border-white/10 text-center text-xl md:text-3xl font-black focus:outline-none focus:border-[#4A90E2] transition-colors placeholder:opacity-20 truncate py-2"
                    />
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase tracking-widest opacity-40">{t.last5}</label>
                      <div className="relative">
                        <input 
                          value={teamBLast5}
                          onChange={(e) => setTeamBLast5(e.target.value)}
                          placeholder="e.g. L, W, L, L, W"
                          className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-sm font-bold focus:outline-none focus:border-[#4A90E2] focus:bg-white/10 transition-colors"
                        />
                        {isAutoFilling && <Skeleton className="absolute inset-0 rounded-xl" />}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase tracking-widest opacity-40">{t.keyPlayers}</label>
                      <div className="relative">
                        <input 
                          value={teamBKeyPlayers}
                          onChange={(e) => setTeamBKeyPlayers(e.target.value)}
                          placeholder="e.g. Player 1 (A), Player 2 (C)"
                          className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-sm font-bold focus:outline-none focus:border-[#4A90E2] focus:bg-white/10 transition-colors"
                        />
                        {isAutoFilling && <Skeleton className="absolute inset-0 rounded-xl" />}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-widest opacity-40">{t.pitch}</label>
                  <input 
                    value={pitchCondition}
                    onChange={(e) => setPitchCondition(e.target.value)}
                    placeholder="e.g. Spin Friendly, Home Ground"
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-sm font-bold focus:outline-none focus:border-[#F27D26]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono uppercase tracking-widest opacity-40">{t.weather}</label>
                  <input 
                    value={weather}
                    onChange={(e) => setWeather(e.target.value)}
                    placeholder="e.g. Clear Sky, Rain Expected"
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-sm font-bold focus:outline-none focus:border-[#F27D26]"
                  />
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4 w-full max-w-4xl">
                <button 
                  onClick={() => performAnalysis()}
                  disabled={isAnalyzing || isAutoFilling || !teamA || !teamB || isGlobalQuotaExceeded}
                  className="flex-[2] group relative px-12 py-6 bg-[#F27D26] text-white font-black uppercase tracking-[0.2em] text-lg overflow-hidden transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-30 shadow-[0_20px_50px_rgba(242,125,38,0.3)] rounded-2xl min-h-[100px]"
                >
                  <span className="relative z-10 flex flex-col items-center justify-center h-full">
                    <div className="flex items-center gap-3">
                      {isAnalyzing ? <Activity className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
                      {isAnalyzing ? t.analyzing : t.generateAiPrediction}
                    </div>
                    {isAnalyzing && (
                      <div className="h-6 mt-2 flex items-center justify-center overflow-hidden w-full">
                        <AnimatePresence mode="wait">
                          <motion.span 
                            key={loadingMessage}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                            className="text-[10px] font-mono opacity-90 normal-case tracking-normal text-white text-center w-full block truncate px-4"
                          >
                            {loadingMessage}
                          </motion.span>
                        </AnimatePresence>
                      </div>
                    )}
                  </span>
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                </button>
                
                <button 
                  onClick={autoFillData}
                  disabled={isAutoFilling || isAnalyzing || !teamA || !teamB || isGlobalQuotaExceeded}
                  className="flex-1 px-8 py-6 bg-white/5 border border-white/10 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-white/10 transition-all flex items-center justify-center gap-2 disabled:opacity-30"
                >
                  {isAutoFilling ? <Activity className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 text-[#F27D26]" />}
                  {isAutoFilling ? t.fetching : t.aiAutoFill}
                </button>

                <button 
                  onClick={resetForm}
                  className="px-8 py-6 border border-white/10 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-white/5 transition-colors"
                >
                  {t.reset}
                </button>
              </div>
            </div>
          </section>

          {/* Results Section */}
          <div id="analysis-results">
            <AnimatePresence>
            {isAnalyzing && (
              <motion.div 
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -40 }}
                className="space-y-8"
              >
                <div className="p-8 border border-white/10 bg-white/[0.02] rounded-3xl space-y-6">
                  <div className="flex items-center gap-6">
                    <Skeleton className="w-32 h-32 rounded-2xl" />
                    <div className="space-y-3 flex-1">
                      <Skeleton className="w-24 h-4" />
                      <Skeleton className="w-full h-12" />
                      <div className="flex gap-4">
                        <Skeleton className="w-20 h-4" />
                        <Skeleton className="w-20 h-4" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-white/5">
                    <div className="space-y-4">
                      <Skeleton className="w-full h-24" />
                      <Skeleton className="w-full h-24" />
                    </div>
                    <Skeleton className="w-full h-full min-h-[300px]" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <Skeleton className="h-48" />
                  <Skeleton className="h-48" />
                  <Skeleton className="h-48" />
                </div>
              </motion.div>
            )}

            {analysis && !isAnalyzing && (
              <motion.div 
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8 print:p-0"
              >
                <div className="flex justify-between items-center mb-4 print:hidden">
                  <div>
                    <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t.matchupAnalysis}</h2>
                    {lastAnalysisTimestamp && (
                      <p className="text-[9px] font-mono opacity-40 uppercase tracking-widest mt-1">
                        {t.lastAnalysis}: {lastAnalysisTimestamp}
                      </p>
                    )}
                  </div>
                  <button 
                    onClick={printReport}
                    className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-xl font-bold text-xs hover:bg-white/10 transition-all"
                  >
                    <BarChart2 className="w-4 h-4 text-[#F27D26]" />
                    {t.print}
                  </button>
                </div>

                {/* Match Overview Card */}
                <div className="p-6 md:p-8 border border-white/10 bg-gradient-to-br from-[#F27D26]/10 to-transparent rounded-3xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Trophy className="w-32 h-32" />
                  </div>
                  <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="text-center md:text-left space-y-2 flex items-center gap-6">
                      <div className="flex items-center -space-x-4">
                        <div className="w-16 h-16 rounded-2xl border-2 border-[#050505] overflow-hidden shadow-xl rotate-[-6deg]">
                          <img src={`https://flagcdn.com/w160/${analysis.teamACountryCode}.png`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                        <div className="w-16 h-16 rounded-2xl border-2 border-[#050505] overflow-hidden shadow-xl rotate-[6deg] z-10">
                          <img src={`https://flagcdn.com/w160/${analysis.teamBCountryCode}.png`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-[#F27D26] font-bold">{t.matchOverview}</p>
                          <span className="px-2 py-0.5 bg-yellow-500 text-black text-[8px] font-black rounded-full animate-pulse">PRO ANALYSIS</span>
                        </div>
                      <h2 className="text-xl md:text-4xl font-black italic tracking-tighter break-words max-w-full overflow-hidden">
                        {teamA || "Team 1"} <span className="text-[#F27D26] opacity-40">{t.vs}</span> {teamB || "Team 2"}
                      </h2>
                      <div className="flex flex-wrap items-center gap-3 md:gap-4 opacity-60 text-[8px] md:text-xs font-bold uppercase tracking-widest overflow-hidden max-w-full">
                        <span className="flex items-center gap-1.5 md:gap-2 shrink-0"><Calendar className="w-3 h-3 md:w-4 md:h-4" /> {new Date().toLocaleDateString()}</span>
                        <span className="flex items-center gap-1.5 md:gap-2 shrink-0"><Target className="w-3 h-3 md:w-4 md:h-4" /> {sportType}</span>
                        <span className="flex items-center gap-1.5 md:gap-2 truncate max-w-[150px] md:max-w-none"><Activity className="w-3 h-3 md:w-4 md:h-4 shrink-0" /> {pitchCondition}</span>
                      </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={printReport}
                        className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors group"
                        title={t.print}
                      >
                        <Printer className="w-5 h-5 opacity-60 group-hover:opacity-100 transition-opacity" />
                      </button>
                      <button 
                        onClick={copyToClipboard}
                        className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors group"
                        title={t.copy}
                      >
                        <Copy className="w-5 h-5 opacity-60 group-hover:opacity-100 transition-opacity" />
                      </button>
                      <button 
                        onClick={shareAnalysis}
                        className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors group"
                        title={t.share}
                      >
                        <Share2 className="w-5 h-5 opacity-60 group-hover:opacity-100 transition-opacity" />
                      </button>
                      <button 
                        onClick={user ? savePrediction : login}
                        disabled={isSaving || saveSuccess}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs transition-all shadow-lg ${
                          saveSuccess 
                            ? 'bg-green-500 text-white' 
                            : 'bg-[#F27D26] text-white hover:scale-[1.05] active:scale-95'
                        } disabled:opacity-50`}
                      >
                        {isSaving ? (
                          <Activity className="w-4 h-4 animate-spin" />
                        ) : saveSuccess ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <ShieldCheck className="w-4 h-4" />
                        )}
                        {saveSuccess ? t.saved : user ? t.savePrediction : t.loginToSave}
                      </button>
                      {saveError && (
                        <p className="text-[10px] text-red-500 font-mono animate-pulse">{saveError}</p>
                      )}
                      <div className="hidden md:block px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-center">
                        <p className="text-[10px] font-black text-yellow-500 uppercase tracking-tighter">{t.proAnalysisReady}</p>
                      </div>
                    </div>
                  </div>
                </div>
                {/* H2H Detailed Section */}
                <div className="p-6 md:p-8 border border-white/10 bg-white/[0.02] rounded-3xl space-y-8">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-3">
                      <Users className="w-5 h-5 text-[#F27D26]" />
                      {t.h2hHistory}
                    </h3>
                    <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4 text-[9px] md:text-[10px] font-mono uppercase tracking-widest opacity-40">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#F27D26]" /> {teamA || "T1"} {t.wins}: {analysis.h2hStats.team_a_wins}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#4A90E2]" /> {teamB || "T2"} {t.wins}: {analysis.h2hStats.team_b_wins}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-white/20" /> {t.draws}: {analysis.h2hStats.draws}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* H2H Win Ratio Bar */}
                    <div className="space-y-4">
                      <p className="text-[10px] font-mono uppercase tracking-widest opacity-40">{t.winDistribution}</p>
                      <div className="h-12 w-full flex rounded-2xl overflow-hidden border border-white/5">
                        <div 
                          className="h-full bg-[#F27D26] flex items-center justify-center text-[10px] font-black italic"
                          style={{ width: `${(analysis.h2hStats.team_a_wins / (analysis.h2hStats.team_a_wins + analysis.h2hStats.team_b_wins + analysis.h2hStats.draws)) * 100}%` }}
                        >
                          {analysis.h2hStats.team_a_wins > 0 && `${Math.round((analysis.h2hStats.team_a_wins / (analysis.h2hStats.team_a_wins + analysis.h2hStats.team_b_wins + analysis.h2hStats.draws)) * 100)}%`}
                        </div>
                        <div 
                          className="h-full bg-white/10 flex items-center justify-center text-[10px] font-black italic"
                          style={{ width: `${(analysis.h2hStats.draws / (analysis.h2hStats.team_a_wins + analysis.h2hStats.team_b_wins + analysis.h2hStats.draws)) * 100}%` }}
                        >
                          {analysis.h2hStats.draws > 0 && `${Math.round((analysis.h2hStats.draws / (analysis.h2hStats.team_a_wins + analysis.h2hStats.team_b_wins + analysis.h2hStats.draws)) * 100)}%`}
                        </div>
                        <div 
                          className="h-full bg-[#4A90E2] flex items-center justify-center text-[10px] font-black italic"
                          style={{ width: `${(analysis.h2hStats.team_b_wins / (analysis.h2hStats.team_a_wins + analysis.h2hStats.team_b_wins + analysis.h2hStats.draws)) * 100}%` }}
                        >
                          {analysis.h2hStats.team_b_wins > 0 && `${Math.round((analysis.h2hStats.team_b_wins / (analysis.h2hStats.team_a_wins + analysis.h2hStats.team_b_wins + analysis.h2hStats.draws)) * 100)}%`}
                        </div>
                      </div>
                      <div className="flex justify-between text-[10px] font-mono opacity-40 uppercase">
                        <span>{teamA || "Team 1"}</span>
                        <span>{t.draws}</span>
                        <span>{teamB || "Team 2"}</span>
                      </div>
                    </div>

                    {/* H2H Match List */}
                    <div className="space-y-4 overflow-hidden">
                      <p className="text-[10px] font-mono uppercase tracking-widest opacity-40">{t.lastMeetings(analysis.h2hMatches.length)}</p>
                      <div className="space-y-3">
                        {analysis.h2hMatches.map((match, i) => (
                          <div key={`h2h-${match.date}-${i}`} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 text-xs gap-3 sm:gap-4 overflow-hidden">
                            <div className="flex flex-col min-w-0">
                              <span className="opacity-60 text-[9px] font-mono">{match.date}</span>
                              <span className="font-bold truncate max-w-full" title={match.venue}>{match.venue}</span>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                              <span className="font-mono font-black text-[#F27D26]">{match.score}</span>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase whitespace-nowrap ${
                                match.winner === teamA ? 'bg-[#F27D26]/20 text-[#F27D26]' : 
                                match.winner === teamB ? 'bg-[#4A90E2]/20 text-[#4A90E2]' : 
                                'bg-white/10 opacity-60'
                              }`}>
                                {match.winner === 'Draw' ? t.drawLabel : `${match.winner} ${t.winLabel}`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Win Probability Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className={`p-6 md:p-8 border rounded-3xl relative overflow-hidden group transition-all duration-500 ${
                      analysis.teamAStrength === 'Strong' 
                        ? 'border-green-500/30 bg-green-500/[0.02] shadow-[0_0_40px_rgba(34,197,94,0.05)]' 
                        : 'border-red-500/30 bg-red-500/[0.02] shadow-[0_0_40px_rgba(239,68,68,0.05)]'
                    }`}>
                      <div className={`absolute top-0 left-0 h-1 transition-all duration-1000 ${
                        analysis.teamAStrength === 'Strong' ? 'bg-green-500' : 'bg-red-500'
                      }`} style={{ width: `${displayProb}%` }} />
                      <div className="flex justify-between items-end">
                        <div>
                          {displayProb > displayProbB && (
                            <span className="px-2 py-0.5 bg-green-500 text-white text-[8px] font-black rounded-full mb-2 inline-block animate-pulse">PROBABLE WINNER</span>
                          )}
                          <p className="text-[10px] font-mono uppercase tracking-widest opacity-40 mb-1">{teamA || "Team 1"} {t.winRate}</p>
                          <p className="text-[8px] font-bold text-[#F27D26] uppercase mb-2">{t.winProbAi}</p>
                          <h2 className={`text-5xl md:text-7xl font-black italic tracking-tighter ${
                            analysis.teamAStrength === 'Strong' ? 'text-green-400' : 'text-red-400'
                          }`}>{displayProb}%</h2>
                          <div className="flex flex-wrap items-center gap-2 mt-4">
                            <span className={`text-[9px] md:text-[10px] font-bold px-2 py-1 rounded-lg break-words max-w-full ${
                              analysis.teamAStrength === 'Strong' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                            }`}>{t.rank}: {analysis.teamARank === 'Elite' ? t.elite : analysis.teamARank === 'Balanced' ? t.balanced : t.underdog}</span>
                            <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg ${
                              analysis.teamAStrength === 'Strong' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                              {analysis.teamAStrength === 'Strong' ? t.powerful : t.weak}
                            </span>
                          </div>
                        </div>
                        <Trophy className={`w-10 h-10 md:w-12 md:h-12 transition-opacity ${
                          analysis.teamAStrength === 'Strong' ? 'text-green-500 opacity-10 group-hover:opacity-30' : 'text-red-500 opacity-10 group-hover:opacity-30'
                        }`} />
                      </div>
                    </div>

                    <div className={`p-6 md:p-8 border rounded-3xl relative overflow-hidden group transition-all duration-500 ${
                      analysis.teamBStrength === 'Strong' 
                        ? 'border-green-500/30 bg-green-500/[0.02] shadow-[0_0_40px_rgba(34,197,94,0.05)]' 
                        : 'border-red-500/30 bg-red-500/[0.02] shadow-[0_0_40px_rgba(239,68,68,0.05)]'
                    }`}>
                      <div className={`absolute top-0 left-0 h-1 transition-all duration-1000 ${
                        analysis.teamBStrength === 'Strong' ? 'bg-green-500' : 'bg-red-500'
                      }`} style={{ width: `${displayProbB}%` }} />
                      <div className="flex justify-between items-end">
                        <div>
                          {displayProbB > displayProb && (
                            <span className="px-2 py-0.5 bg-green-500 text-white text-[8px] font-black rounded-full mb-2 inline-block animate-pulse">PROBABLE WINNER</span>
                          )}
                          <p className="text-[10px] font-mono uppercase tracking-widest opacity-40 mb-1">{teamB || "Team 2"} {t.winRate}</p>
                          <p className="text-[8px] font-bold text-[#4A90E2] uppercase mb-2">{t.winProbAi}</p>
                          <h2 className={`text-5xl md:text-7xl font-black italic tracking-tighter ${
                            analysis.teamBStrength === 'Strong' ? 'text-green-400' : 'text-red-400'
                          }`}>{displayProbB}%</h2>
                          <div className="flex flex-wrap items-center gap-2 mt-4">
                            <span className={`text-[9px] md:text-[10px] font-bold px-2 py-1 rounded-lg break-words max-w-full ${
                              analysis.teamBStrength === 'Strong' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                            }`}>{t.rank}: {analysis.teamBRank === 'Elite' ? t.elite : analysis.teamBRank === 'Balanced' ? t.balanced : t.underdog}</span>
                            <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg ${
                              analysis.teamBStrength === 'Strong' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                              {analysis.teamBStrength === 'Strong' ? t.powerful : t.weak}
                            </span>
                          </div>
                        </div>
                        <Trophy className={`w-10 h-10 md:w-12 md:h-12 transition-opacity ${
                          analysis.teamBStrength === 'Strong' ? 'text-green-500 opacity-10 group-hover:opacity-30' : 'text-red-500 opacity-10 group-hover:opacity-30'
                        }`} />
                      </div>
                    </div>
                  </div>
                  
                  {/* Analysis Report Text */}
                    <div className="p-6 md:p-8 border border-[#F27D26]/20 bg-[#F27D26]/5 rounded-3xl space-y-6 relative overflow-hidden">
                      <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#F27D26]/10 rounded-full blur-3xl" />
                      
                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-4 mb-8">
                        <button 
                          onClick={sharePrediction}
                          className="flex-1 md:flex-none px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2 group"
                        >
                          <Share2 className="w-4 h-4 text-[#F27D26] group-hover:scale-110 transition-transform" />
                          {t.shareSummary}
                        </button>
                        
                        {user && (
                          <button 
                            onClick={savePrediction}
                            disabled={isSaving || saveSuccess}
                            className={`flex-1 md:flex-none px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg ${
                              saveSuccess 
                                ? 'bg-green-500 text-white cursor-default' 
                                : 'bg-[#F27D26] text-white hover:scale-[1.02] active:scale-95'
                            }`}
                          >
                            {isSaving ? (
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : saveSuccess ? (
                              <ShieldCheck className="w-4 h-4" />
                            ) : (
                              <Bookmark className="w-4 h-4" />
                            )}
                            {saveSuccess ? t.saveSuccess : t.savePrediction}
                          </button>
                        )}
                      </div>

                      {/* Betting Recommendation Header */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-white/5 border border-white/10 rounded-2xl">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg shadow-lg ${
                            analysis.riskLevel === 'Low' ? 'bg-green-500 shadow-green-500/20' : 
                            analysis.riskLevel === 'Medium' ? 'bg-yellow-500 shadow-yellow-500/20' : 
                            'bg-red-500 shadow-red-500/20'
                          }`}>
                            <ShieldCheck className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-[10px] font-mono uppercase tracking-widest opacity-40">{t.strongerTeam}</p>
                            </div>
                            <h4 className="text-lg font-black text-green-400 uppercase tracking-tight">{analysis.strongerTeam}</h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                analysis.riskLevel === 'Low' ? 'bg-green-500/20 text-green-400' : 
                                analysis.riskLevel === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' : 
                                'bg-red-500/20 text-red-400'
                              }`}>{t.risk}: {analysis.riskLevel === 'Low' ? t.low : analysis.riskLevel === 'Medium' ? t.medium : t.high}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 md:max-w-xs">
                          <p className="text-[10px] font-mono uppercase tracking-widest opacity-40 mb-1">{t.bettingAdvice}</p>
                          <p className="text-xs font-bold text-white/80 leading-tight italic">"{analysis.bettingAdvice}"</p>
                        </div>
                      </div>
 
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#F27D26] rounded-lg shadow-lg shadow-[#F27D26]/20">
                          <Target className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="text-sm font-black uppercase tracking-widest">{t.tacticalAnalysis}</h3>
                      </div>
                    <p className="text-xl md:text-2xl font-serif italic leading-relaxed opacity-90 text-white/90 break-words whitespace-pre-wrap">
                      "{analysis.prediction}"
                    </p>
                    <div className="p-6 bg-[#F27D26]/10 rounded-2xl border border-[#F27D26]/30 shadow-inner">
                      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#F27D26] mb-3 font-black">{t.whyProbability}</p>
                      <p className="text-base md:text-lg font-serif italic font-bold text-white/90 leading-snug break-words whitespace-pre-wrap">{analysis.winProbabilityReasoning}</p>
                    </div>
                    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-[#F27D26] mb-2">{t.tacticalInsight}</p>
                      <p className="text-xs md:text-sm font-bold italic opacity-80 break-words">{analysis.tacticalInsight}</p>
                    </div>
                    <div className="pt-4 border-t border-white/5 flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] font-mono opacity-40 uppercase tracking-widest">{t.confidenceHigh}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3 h-3 text-[#F27D26]" />
                        <span className="text-[10px] font-mono opacity-40 uppercase tracking-widest">{t.gameChanger}: {analysis.gameChanger}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Radar Chart & Venue Stats */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 p-6 md:p-8 border border-white/10 bg-white/[0.02] rounded-3xl overflow-hidden">
                    <h3 className="text-sm font-black uppercase tracking-widest mb-8 flex items-center gap-3">
                      <Activity className="w-5 h-5 text-[#F27D26]" />
                      {t.teamComparison}
                    </h3>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={(analysis.radarStats || []).map(stat => ({
                          ...stat,
                          subject: stat.subject === 'Attack' ? t.attack : 
                                   stat.subject === 'Defense' ? t.defense : 
                                   stat.subject === 'Strategy' ? t.strategy : 
                                   stat.subject === 'Form' ? t.form : 
                                   stat.subject === 'Experience' ? t.experience : stat.subject
                        }))}>
                          <PolarGrid stroke="#ffffff10" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: '#ffffff40', fontSize: 10 }} />
                          <Radar
                            name={teamA || "Team 1"}
                            dataKey="A"
                            stroke="#F27D26"
                            fill="#F27D26"
                            fillOpacity={0.5}
                          />
                          <Radar
                            name={teamB || "Team 2"}
                            dataKey="B"
                            stroke="#4A90E2"
                            fill="#4A90E2"
                            fillOpacity={0.5}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#050505', border: '1px solid #ffffff10', borderRadius: '12px' }}
                            itemStyle={{ fontSize: '12px' }}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="p-6 md:p-8 border border-white/10 bg-white/[0.02] rounded-3xl space-y-8">
                    <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-[#F27D26]" />
                      {t.venueConditions}
                    </h3>
                    <div className="space-y-6">
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                        <p className="text-[10px] font-mono uppercase tracking-widest opacity-40 mb-2">{t.avgScore}</p>
                        <p className="text-2xl font-black">{analysis.venueStats.avgScore}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                          <p className="text-[10px] font-mono uppercase tracking-widest opacity-40 mb-2">{teamA || "T1"} {t.winRate}</p>
                          <p className="text-2xl font-black text-[#F27D26]">{analysis.venueStats.teamAWinRate}%</p>
                        </div>
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                          <p className="text-[10px] font-mono uppercase tracking-widest opacity-40 mb-2">{teamB || "T2"} {t.winRate}</p>
                          <p className="text-2xl font-black text-[#4A90E2]">{analysis.venueStats.teamBWinRate}%</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Key Matchups */}
                <div className="p-6 md:p-8 border border-white/10 bg-white/[0.02] rounded-3xl">
                  <h3 className="text-sm font-black uppercase tracking-widest mb-8 flex items-center gap-3">
                    <Flame className="w-5 h-5 text-[#F27D26]" />
                    {t.keyMatchups}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {analysis.keyMatchups.map((matchup, i) => (
                      <div key={`matchup-${i}`} className="p-6 bg-white/5 rounded-2xl border border-white/10 relative group overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-100 transition-opacity">
                          <Zap className="w-4 h-4 text-[#F27D26]" />
                        </div>
                        <div className="flex items-center gap-4 mb-4">
                          <div className="flex -space-x-3">
                            <div className="w-10 h-10 rounded-full bg-[#F27D26] border-2 border-[#050505] flex items-center justify-center font-bold text-xs">
                              {matchup.playerA[0]}
                            </div>
                            <div className="w-10 h-10 rounded-full bg-[#4A90E2] border-2 border-[#050505] flex items-center justify-center font-bold text-xs">
                              {matchup.playerB[0]}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold break-words">
                              {matchup.playerA} <span className="text-[#F27D26]">{t.vs}</span> {matchup.playerB}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-[#F27D26]" style={{ width: `${matchup.probabilityA}%` }} />
                              </div>
                              <span className="text-[10px] font-black text-[#F27D26] shrink-0">{matchup.probabilityA}%</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm opacity-80 italic leading-relaxed mb-3 break-words">
                          {matchup.description}
                        </p>
                        <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                          <p className="text-[8px] font-mono uppercase tracking-widest text-[#F27D26] mb-1">{t.matchupReasoning}</p>
                          <p className="text-[10px] font-bold italic opacity-70 leading-tight break-words">{matchup.reasoning}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>


                {/* Pillars & Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 overflow-hidden">
                  <div className="p-6 border border-white/10 bg-white/[0.02] rounded-2xl space-y-4 overflow-hidden">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-green-400 flex items-center gap-2">
                      <Shield className="w-4 h-4 shrink-0" />
                      <span className="truncate">{t.strongPillars}</span>
                    </h4>
                    <ul className="space-y-3">
                      {analysis.strongPillars.map((p, i) => (
                        <li key={`strong-${p}-${i}`} className="text-sm flex items-start gap-3 opacity-80 break-words">
                          <TrendingUp className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                          <span className="flex-1 min-w-0">{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-6 border border-white/10 bg-white/[0.02] rounded-2xl space-y-4 overflow-hidden">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-red-400 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span className="truncate">{t.weakPillars}</span>
                    </h4>
                    <ul className="space-y-3">
                      {analysis.weakPillars.map((p, i) => (
                        <li key={`weak-${p}-${i}`} className="text-sm flex items-start gap-3 opacity-80 break-words">
                          <TrendingDown className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <span className="flex-1 min-w-0">{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-6 border border-white/10 bg-white/[0.02] rounded-2xl space-y-4 overflow-hidden">
                    <h4 className="text-xs font-bold uppercase tracking-widest opacity-40 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#F27D26] shrink-0" />
                      <span className="truncate">{t.aiConfidence}</span>
                    </h4>
                    <div className="space-y-4">
                      <div className="flex justify-between items-end gap-2">
                        <span className="text-[10px] font-mono uppercase opacity-40 truncate">{t.reliabilityScore}</span>
                        <span className="text-xl font-black text-[#F27D26] shrink-0">{t.high}</span>
                      </div>
                      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#F27D26] to-[#4A90E2]" style={{ width: '85%' }} />
                      </div>
                      <p className="text-[9px] italic opacity-40 leading-tight break-words">
                        {t.disclaimer}
                      </p>
                    </div>
                  </div>
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
          </>
        ) : (
          <section className="space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t.myPredictions}</h2>
              <button 
                onClick={() => setActiveTab('analysis')}
                className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
                {t.backToAnalysis}
              </button>
            </div>

            {!user ? (
              <div className="p-12 border border-white/10 bg-white/[0.02] rounded-3xl text-center space-y-6">
                <Users className="w-16 h-16 text-[#F27D26] mx-auto opacity-20" />
                <div className="space-y-2">
                  <h3 className="text-xl font-bold">{t.loginToSave}</h3>
                  <p className="text-sm opacity-40 max-w-md mx-auto">
                    Login with your Google account to save your AI predictions and view your analysis history anytime.
                  </p>
                </div>
                <button 
                  onClick={login}
                  className="px-8 py-4 bg-[#F27D26] text-white rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] transition-all shadow-lg flex items-center gap-3 mx-auto"
                >
                  <Users className="w-5 h-5" />
                  {t.loginWithGoogle}
                </button>
              </div>
            ) : isFetchingSaved ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 rounded-3xl" />)}
              </div>
            ) : savedPredictions.length === 0 ? (
              <div className="p-12 border border-white/10 bg-white/[0.02] rounded-3xl text-center space-y-4">
                <Clock className="w-16 h-16 text-[#F27D26] mx-auto opacity-20" />
                <p className="text-sm opacity-40">{t.noSavedPredictions}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {savedPredictions.map((pred) => (
                  <motion.div 
                    key={pred.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-6 border border-white/10 bg-white/[0.02] rounded-3xl space-y-4 hover:bg-white/5 transition-all group relative"
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <p className="text-[8px] font-mono uppercase tracking-widest opacity-40">
                          {pred.createdAt?.toDate().toLocaleDateString()} • {pred.sportType}
                        </p>
                        <h4 className="font-black text-lg italic tracking-tighter uppercase truncate max-w-[180px]">
                          {pred.teamA} <span className="text-[#F27D26]">VS</span> {pred.teamB}
                        </h4>
                      </div>
                      <button 
                        onClick={() => setConfirmDeleteId(pred.id)}
                        className="p-2 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 rounded-lg transition-all"
                        title={t.delete}
                      >
                        <AlertCircle className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-[#F27D26] to-[#4A90E2]" 
                          style={{ width: `${pred.winProbability}%` }} 
                        />
                      </div>
                      <span className="text-sm font-black text-[#F27D26]">{pred.winProbability}%</span>
                    </div>

                    <p className="text-xs opacity-60 line-clamp-3 italic leading-relaxed">
                      {pred.predictionText}
                    </p>

                    <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                      <span className={`text-[8px] font-black uppercase px-2 py-1 rounded ${
                        pred.riskLevel === 'Low' ? 'bg-green-500/20 text-green-400' :
                        pred.riskLevel === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {t.risk}: {pred.riskLevel === 'Low' ? t.low : pred.riskLevel === 'Medium' ? t.medium : t.high}
                      </span>
                      <button 
                        onClick={() => {
                          setTeamA(pred.teamA);
                          setTeamB(pred.teamB);
                          setSportType(pred.sportType);
                          if (pred.fullAnalysis) {
                            setAnalysis(pred.fullAnalysis);
                          }
                          setActiveTab('analysis');
                          const element = document.getElementById('match-setup-section');
                          if (element) element.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="text-[10px] font-bold uppercase tracking-widest text-[#F27D26] hover:underline"
                      >
                        {t.viewAnalysis}
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
      <footer className="border-t border-white/10 p-8 space-y-4">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] opacity-40">
            {t.poweredBy}
          </p>
          <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl">
            <p className="text-[9px] font-bold opacity-20 leading-relaxed uppercase tracking-widest">
              {t.footerDisclaimer}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
