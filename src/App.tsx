import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plus, Check, Trash2, Circle, CheckCircle2, 
  Calendar as CalendarIcon, ChevronDown, ChevronUp, 
  Target, Layers, Ruler, AlertCircle, Clock, Bell,
  LogIn, LogOut, User as UserIcon, Edit3,
  Percent, BarChart2, Home, List as ListIcon,
  ChevronLeft, ChevronRight, Calendar
} from "lucide-react";
import { 
  ResponsiveContainer, PieChart, Pie, Cell, 
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend
} from 'recharts';
import { 
  auth, db, googleProvider, signInWithPopup, signOut,
  collection, addDoc, updateDoc, deleteDoc, doc, 
  query, where, onSnapshot, orderBy, serverTimestamp, Timestamp
} from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

interface SubTask {
  id: string;
  goalId: string;
  text: string;
  deadline: string | null;
  workloadValue: number | null;
  workloadUnit: string | null;
  weight: number;
  completed: boolean;
  userId: string;
}

interface Goal {
  id: string;
  text: string;
  deadline: string | null;
  weight: number;
  completed: boolean;
  createdAt: any;
  date: string; // YYYY-MM-DD
  userId: string;
  subtasks: SubTask[];
}

interface ScheduleItem {
  id: string;
  activity: string;
  startTime: string;
  endTime: string;
  completed: boolean;
  date: string;
  userId: string;
  createdAt: any;
}

type ViewMode = 'daily' | 'stats' | 'calendar';
type StatsPeriod = 'day' | 'week' | 'month' | 'year';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [newGoalText, setNewGoalText] = useState("");
  const [newGoalDeadline, setNewGoalDeadline] = useState("");
  const [newGoalWeight, setNewGoalWeight] = useState("33");
  const [loading, setLoading] = useState(true);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('day');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  
  // Subtask form state
  const [addingSubtaskTo, setAddingSubtaskTo] = useState<string | null>(null);
  const [subtaskText, setSubtaskText] = useState("");
  const [subtaskDeadline, setSubtaskDeadline] = useState("");
  const [subtaskWorkload, setSubtaskWorkload] = useState("");
  const [subtaskUnit, setSubtaskUnit] = useState("");
  const [subtaskWeight, setSubtaskWeight] = useState("0");

  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editGoalText, setEditGoalText] = useState("");
  const [editGoalDeadline, setEditGoalDeadline] = useState("");
  const [editGoalWeight, setEditGoalWeight] = useState("");
  const [editGoalDate, setEditGoalDate] = useState("");

  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editSubtaskText, setEditSubtaskText] = useState("");
  const [editSubtaskDeadline, setEditSubtaskDeadline] = useState("");
  const [editSubtaskWorkload, setEditSubtaskWorkload] = useState("");
  const [editSubtaskUnit, setEditSubtaskUnit] = useState("");
  const [editSubtaskWeight, setEditSubtaskWeight] = useState("");

  // Schedule form state
  const [isAddingSchedule, setIsAddingSchedule] = useState(false);
  const [newActivity, setNewActivity] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndTime, setNewEndTime] = useState("");

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    if ("Notification" in window) {
      setNotificationsEnabled(Notification.permission === "granted");
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      alert("Trình duyệt của bạn không hỗ trợ thông báo.");
      return;
    }
    
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNotificationsEnabled(true);
      new Notification("DayFlow", {
        body: "Tuyệt vời! Bạn sẽ nhận được lời nhắc cho lịch trình của mình.",
        icon: "/favicon.ico"
      });
    }
  };

  // Background check for notifications
  useEffect(() => {
    if (!notificationsEnabled || schedules.length === 0) return;

    const interval = setInterval(() => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      schedules.forEach(item => {
        if (!item.completed && item.startTime === currentTime && item.date === selectedDate) {
          // Prevent multiple notifications for the same minute
          const lastNotified = localStorage.getItem(`notified_${item.id}`);
          if (lastNotified !== currentTime) {
            new Notification("Nhắc nhở lịch trình", {
              body: `Đã đến giờ: ${item.activity} (${item.startTime})`,
              icon: "/favicon.ico"
            });
            localStorage.setItem(`notified_${item.id}`, currentTime);
          }
        }
      });
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [notificationsEnabled, schedules, selectedDate]);
  const [isIframe, setIsIframe] = useState(false);
  const [showWeightWarning, setShowWeightWarning] = useState(false);
  const [warningGoalId, setWarningGoalId] = useState<string | null>(null);

  useEffect(() => {
    setIsIframe(window.self !== window.top);
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setGoals([]);
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // Helper to handle and log Firestore errors for debugging
  const handleFirestoreError = (error: any, operationType: string, path: string) => {
    const errInfo = {
      error: error?.message || String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
      },
      operationType,
      path
    };
    console.error('Firestore Error:', JSON.stringify(errInfo));
  };

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    const q = query(
      collection(db, "goals"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribeGoals = onSnapshot(q, (snapshot) => {
      const goalsList: Goal[] = [];
      snapshot.forEach((goalDoc) => {
        goalsList.push({ id: goalDoc.id, ...goalDoc.data(), subtasks: [] } as Goal);
      });
      
      setGoals(goalsList);
      setLoading(false);

      // Manage subtask listeners
      goalsList.forEach((goal) => {
        const subQ = query(
          collection(db, `goals/${goal.id}/subtasks`), 
          where("userId", "==", user.uid),
          orderBy("createdAt", "asc")
        );
        onSnapshot(subQ, (subSnapshot) => {
          const subtasks: SubTask[] = [];
          subSnapshot.forEach(subDoc => {
            subtasks.push({ id: subDoc.id, ...subDoc.data() } as SubTask);
          });
          
          setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, subtasks } : g));
        }, (error) => handleFirestoreError(error, 'list', `goals/${goal.id}/subtasks`));
      });
    }, (error) => handleFirestoreError(error, 'list', 'goals'));

    const sq = query(
      collection(db, "schedules"),
      where("userId", "==", user.uid),
      orderBy("startTime", "asc")
    );

    const unsubscribeSchedules = onSnapshot(sq, (snapshot) => {
      const scheduleList: ScheduleItem[] = [];
      snapshot.forEach((docSnap) => {
        scheduleList.push({ id: docSnap.id, ...docSnap.data() } as ScheduleItem);
      });
      setSchedules(scheduleList);
    }, (error) => handleFirestoreError(error, 'list', 'schedules'));

    return () => {
      unsubscribeGoals();
      unsubscribeSchedules();
    };
  }, [user]);

  const login = () => signInWithPopup(auth, googleProvider);
  const logout = () => signOut(auth);

  const isGoalInDate = (g: Goal, dateStr: string) => {
    if (g.date === dateStr) return true;
    if (!g.date && g.createdAt) {
      const createdAtDate = g.createdAt instanceof Timestamp ? g.createdAt.toDate() : 
                        (typeof g.createdAt === 'string' ? new Date(g.createdAt) : new Date());
      return createdAtDate.toISOString().split('T')[0] === dateStr;
    }
    return false;
  };

  const getFilteredGoals = () => {
    const now = new Date();
    const start = new Date(now);
    
    if (statsPeriod === 'day') {
      start.setHours(0, 0, 0, 0);
    } else if (statsPeriod === 'week') {
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
    } else if (statsPeriod === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    } else if (statsPeriod === 'year') {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
    }

    return goals.filter(g => {
      let gDateStr = g.date;
      if (!gDateStr && g.createdAt) {
        const d = g.createdAt instanceof Timestamp ? g.createdAt.toDate() : 
                  (typeof g.createdAt === 'string' ? new Date(g.createdAt) : new Date());
        gDateStr = d.toISOString().split('T')[0];
      }
      const gDate = new Date(gDateStr || new Date());
      gDate.setHours(0, 0, 0, 0);
      return gDate >= start;
    });
  };

  const addGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalText.trim() || !user) return;

    // RULE OF 3 CHECK: Only count goals for the selected date
    const dateGoals = goals.filter(g => isGoalInDate(g, selectedDate));

    if (dateGoals.length >= 3) {
      alert("Bạn chỉ nên đặt tối đa 3 mục tiêu lớn mỗi ngày để đạt hiệu quả cao nhất.");
      return;
    }

    try {
      await addDoc(collection(db, "goals"), {
        text: newGoalText,
        deadline: newGoalDeadline || null,
        weight: parseFloat(newGoalWeight) || 33.3,
        completed: false,
        userId: user.uid,
        date: selectedDate,
        createdAt: serverTimestamp()
      });
      
      setNewGoalText("");
      setNewGoalDeadline("");
      setNewGoalWeight("33");
    } catch (err) {
      console.error("Failed to add goal", err);
    }
  };

  const toggleGoal = async (id: string, completed: boolean) => {
    try {
      await updateDoc(doc(db, "goals", id), { completed: !completed });
    } catch (err) {
      console.error("Failed to toggle goal", err);
    }
  };

  const startEditingGoal = (goal: Goal) => {
    setEditingGoalId(goal.id);
    setEditGoalText(goal.text);
    setEditGoalDeadline(goal.deadline || "");
    setEditGoalWeight(goal.weight?.toString() || "");
    
    // Fallback to createdAt date if date field is missing
    let gDate = goal.date;
    if (!gDate && goal.createdAt) {
      const d = goal.createdAt instanceof Timestamp ? goal.createdAt.toDate() : 
                (typeof goal.createdAt === 'string' ? new Date(goal.createdAt) : new Date());
      gDate = d.toISOString().split('T')[0];
    }
    setEditGoalDate(gDate || selectedDate);
  };

  const saveEditGoal = async (id: string) => {
    if (!editGoalText.trim()) return;
    try {
      await updateDoc(doc(db, "goals", id), {
        text: editGoalText,
        deadline: editGoalDeadline || null,
        weight: parseFloat(editGoalWeight) || 0,
        date: editGoalDate
      });
      setEditingGoalId(null);
    } catch (err) {
      console.error("Failed to update goal", err);
    }
  };

  const moveGoalToCurrentDate = async (id: string) => {
    try {
      await updateDoc(doc(db, "goals", id), {
        date: selectedDate
      });
    } catch (err) {
      console.error("Failed to move goal", err);
    }
  };

  const deleteGoal = async (id: string) => {
    if (!confirm("Xóa mục tiêu này và tất cả hạng mục con?")) return;
    try {
      await deleteDoc(doc(db, "goals", id));
    } catch (err) {
      console.error("Failed to delete goal", err);
    }
  };

  const addSubtask = async (goalId: string, skipWarning = false) => {
    if (!subtaskText.trim() || !user) return;

    if (!skipWarning && (subtaskWeight === "0" || subtaskWeight === "")) {
      setWarningGoalId(goalId);
      setShowWeightWarning(true);
      return;
    }

    try {
      // Calculate remaining weight for subtasks if user hasn't specified
      const currentSubtasks = goals.find(g => g.id === goalId)?.subtasks || [];
      const totalWeightUsed = currentSubtasks.reduce((sum, s) => sum + (s.weight || 0), 0);
      const defaultWeight = Math.max(0, 100 - totalWeightUsed);
      const finalWeight = (subtaskWeight === "0" || subtaskWeight === "") ? defaultWeight : parseFloat(subtaskWeight);

      await addDoc(collection(db, `goals/${goalId}/subtasks`), {
        goalId,
        text: subtaskText,
        deadline: subtaskDeadline || null,
        workloadValue: subtaskWorkload ? parseFloat(subtaskWorkload) : null,
        workloadUnit: subtaskUnit || null,
        weight: finalWeight,
        completed: false,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      
      setSubtaskText("");
      setSubtaskDeadline("");
      setSubtaskWorkload("");
      setSubtaskUnit("");
      setSubtaskWeight("0");
      setAddingSubtaskTo(null);
    } catch (err) {
      console.error("Failed to add subtask", err);
    }
  };

  const toggleSubtask = async (goalId: string, subtaskId: string, completed: boolean) => {
    try {
      await updateDoc(doc(db, `goals/${goalId}/subtasks`, subtaskId), { completed: !completed });
    } catch (err) {
      console.error("Failed to toggle subtask", err);
    }
  };

  const deleteSubtask = async (goalId: string, subtaskId: string) => {
    try {
      await deleteDoc(doc(db, `goals/${goalId}/subtasks`, subtaskId));
    } catch (err) {
      console.error("Failed to delete subtask", err);
    }
  };

  const addScheduleItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActivity.trim() || !newStartTime || !newEndTime || !user) return;

    try {
      await addDoc(collection(db, "schedules"), {
        activity: newActivity,
        startTime: newStartTime,
        endTime: newEndTime,
        completed: false,
        userId: user.uid,
        date: selectedDate,
        createdAt: serverTimestamp()
      });
      
      setNewActivity("");
      setNewStartTime("");
      setNewEndTime("");
      setIsAddingSchedule(false);
    } catch (err) {
      console.error("Failed to add schedule item", err);
    }
  };

  const toggleScheduleItem = async (id: string, completed: boolean) => {
    try {
      await updateDoc(doc(db, "schedules", id), { completed: !completed });
    } catch (err) {
      console.error("Failed to toggle schedule item", err);
    }
  };

  const deleteScheduleItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, "schedules", id));
    } catch (err) {
      console.error("Failed to delete schedule item", err);
    }
  };

  const startEditingSubtask = (sub: SubTask) => {
    setEditingSubtaskId(sub.id);
    setEditSubtaskText(sub.text);
    setEditSubtaskDeadline(sub.deadline || "");
    setEditSubtaskWorkload(sub.workloadValue?.toString() || "");
    setEditSubtaskUnit(sub.workloadUnit || "");
    setEditSubtaskWeight(sub.weight?.toString() || "");
  };

  const saveEditSubtask = async (goalId: string, subtaskId: string) => {
    if (!editSubtaskText.trim()) return;
    try {
      await updateDoc(doc(db, `goals/${goalId}/subtasks`, subtaskId), {
        text: editSubtaskText,
        deadline: editSubtaskDeadline || null,
        workloadValue: editSubtaskWorkload ? parseFloat(editSubtaskWorkload) : null,
        workloadUnit: editSubtaskUnit || null,
        weight: parseFloat(editSubtaskWeight) || 0,
      });
      setEditingSubtaskId(null);
    } catch (err) {
      console.error("Failed to update subtask", err);
    }
  };

  const calculateGoalProgress = (goal: Goal) => {
    if (goal.completed) return 100;
    if (goal.subtasks.length === 0) return 0;
    const totalWeights = goal.subtasks.reduce((sum, s) => sum + (s.weight || 1), 0);
    const completedWeights = goal.subtasks.reduce((sum, s) => sum + (s.completed ? (s.weight || 1) : 0), 0);
    return totalWeights === 0 ? 0 : (completedWeights / totalWeights) * 100;
  };

  const calculateOverallProgress = () => {
    const dailyGoals = goals.filter(g => isGoalInDate(g, selectedDate));
    if (dailyGoals.length === 0) return 0;
    const totalGoalWeights = dailyGoals.reduce((sum, g) => sum + (g.weight || 1), 0);
    const weightedProgress = dailyGoals.reduce((sum, g) => {
      const goalProgress = calculateGoalProgress(g);
      return sum + (goalProgress * (g.weight || 1) / 100);
    }, 0);
    return totalGoalWeights === 0 ? 0 : (weightedProgress / totalGoalWeights) * 100;
  };

  const overallProgress = calculateOverallProgress();

  const currentDailyGoals = goals.filter(g => isGoalInDate(g, selectedDate));
  const currentDailySchedules = schedules.filter(s => s.date === selectedDate);

  const [activeQuoteIndex, setActiveQuoteIndex] = useState(0);
  const quotes = [
    {
      name: "Steve Jobs",
      title: "Co-founder Apple",
      initials: "SJ",
      text: "\"Hãy coi hôm nay là ngày cuối cùng của cuộc đời bạn đi.\"",
      color: "bg-slate-900",
      accent: "bg-indigo-500/10"
    },
    {
      name: "Elon Musk",
      title: "Visionary Entrepreneur",
      initials: "EM",
      text: "\"1% nỗ lực hôm nay là thành công lớn mai sau.\"",
      color: "bg-indigo-600",
      accent: "bg-white/10"
    },
    {
      name: "Bill Gates",
      title: "Co-founder Microsoft",
      initials: "BG",
      text: "\"Kiên nhẫn là yếu tố quan trọng của thành công.\"",
      color: "bg-emerald-600",
      accent: "bg-white/10"
    },
    {
      name: "Chung Ju-yung",
      title: "Founder of Hyundai Group",
      initials: "CJY",
      text: "\"Không bao giờ là thất bại, tất cả chỉ là thử thách.\"",
      color: "bg-amber-600",
      accent: "bg-white/10"
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveQuoteIndex((prev) => (prev + 1) % quotes.length);
    }, 10000);
    return () => clearInterval(timer);
  }, [quotes.length]);

  if (!user) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-indigo-100 text-center border border-slate-100">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-indigo-200">
            <Target className="text-white" size={40} />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 mb-4 tracking-tight">DayFlow</h1>
          <p className="text-slate-500 mb-10 leading-relaxed font-medium">
            Tập trung vào 3 mục tiêu quan trọng nhất mỗi ngày. Đăng nhập để bắt đầu hành trình của bạn.
          </p>
          <button 
            onClick={login}
            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
          >
            <LogIn size={20} />
            Đăng nhập với Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1e293b] font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <div className="max-w-3xl mx-auto px-4 py-8 md:px-6 md:py-16">
        {/* Header */}
        <header className="mb-8 md:mb-12">
          <div className="flex items-center justify-between mb-6 md:mb-8">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="w-8 h-8 md:w-12 md:h-12 bg-indigo-600 rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
                <Target className="text-white w-4 h-4 md:w-6 md:h-6" />
              </div>
              <h1 className="text-xl md:text-3xl font-extrabold tracking-tight text-slate-900">DayFlow</h1>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <button 
                onClick={() => setViewMode('daily')}
                className={`p-1.5 md:p-2 rounded-xl transition-all ${viewMode === 'daily' ? "bg-indigo-600 text-white shadow-lg" : "bg-white text-slate-400 border border-slate-100"}`}
              >
                <Home className="w-4 h-4 md:w-[18px] md:h-[18px]" />
              </button>
              <button 
                onClick={() => setViewMode('stats')}
                className={`p-1.5 md:p-2 rounded-xl transition-all ${viewMode === 'stats' ? "bg-indigo-600 text-white shadow-lg" : "bg-white text-slate-400 border border-slate-100"}`}
              >
                <BarChart2 className="w-4 h-4 md:w-[18px] md:h-[18px]" />
              </button>
              <button 
                onClick={() => setViewMode('calendar')}
                className={`p-1.5 md:p-2 rounded-xl transition-all ${viewMode === 'calendar' ? "bg-indigo-600 text-white shadow-lg" : "bg-white text-slate-400 border border-slate-100"}`}
              >
                <Calendar className="w-4 h-4 md:w-[18px] md:h-[18px]" />
              </button>

              {!notificationsEnabled && (
                <button 
                  onClick={requestNotificationPermission}
                  className="p-1.5 md:p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 animate-pulse transition-all hover:bg-amber-100"
                  title="Bật thông báo nhắc nhở"
                >
                  <Bell className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                </button>
              )}
              <div className="hidden sm:flex flex-col items-end mx-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {selectedDate === new Date().toISOString().split('T')[0] ? "Hôm nay" : "Đang xem"}
                </span>
                <span className="text-sm font-bold text-slate-700">{new Date(selectedDate).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              </div>
              <button 
                onClick={logout}
                className="p-2.5 md:p-3 bg-white border border-slate-200 rounded-xl md:rounded-2xl text-slate-400 hover:text-red-500 hover:border-red-100 transition-all shadow-sm"
                title="Đăng xuất"
              >
                <LogOut className="w-[18px] h-[18px] md:w-5 md:h-5" />
              </button>
            </div>
          </div>

          {/* Progress Card */}
          <div className="bg-indigo-600 rounded-[1.5rem] md:rounded-[2.5rem] p-5 md:p-8 shadow-2xl shadow-indigo-100 text-white relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-3 md:mb-6">
                <div>
                  <p className="text-indigo-100 text-[9px] md:text-xs font-black uppercase tracking-[0.3em] mb-1 md:mb-2 opacity-80">Hiệu suất tổng thể</p>
                  <p className="text-2xl md:text-4xl font-black">{Math.round(overallProgress)}% <span className="text-indigo-200 text-xs md:text-base font-bold">Hoàn thành</span></p>
                </div>
                <div className="text-3xl md:text-5xl font-black opacity-30">#3</div>
              </div>
              <div className="h-2 md:h-4 bg-indigo-900/20 rounded-full overflow-hidden backdrop-blur-md p-0.5 md:p-1">
                <motion.div 
                   className="h-full bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,0.6)]"
                   initial={{ width: 0 }}
                   animate={{ width: `${overallProgress}%` }}
                   transition={{ duration: 1.5, ease: [0.34, 1.56, 0.64, 1] }}
                />
              </div>
            </div>
            <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-indigo-500/30 rounded-full blur-[80px]"></div>
            <div className="absolute -left-10 -top-10 w-40 h-40 bg-white/5 rounded-full blur-[40px]"></div>
          </div>
        </header>

        {/* Conditional Content based on viewMode */}
        {viewMode === 'daily' ? (
          <div>
            {/* Date Navigation for Daily View */}
            <div className="flex items-center justify-between mb-8 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
              <button 
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() - 1);
                  setSelectedDate(d.toISOString().split('T')[0]);
                }}
                className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-indigo-600 transition-all"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="flex items-center gap-3">
                <CalendarIcon size={18} className="text-indigo-500" />
                <span className="font-black text-slate-700 tracking-tight">
                  {new Date(selectedDate).toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <button 
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() + 1);
                  setSelectedDate(d.toISOString().split('T')[0]);
                }}
                className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-indigo-600 transition-all"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Add Goal Section */}
            {loading ? (
           <div className="py-12 md:py-20 flex flex-col items-center justify-center text-slate-300 gap-4">
              <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <p className="text-xs md:text-sm font-bold uppercase tracking-widest text-center">Đang tải dữ liệu...</p>
           </div>
        ) : currentDailyGoals.length < 3 ? (
          <form onSubmit={addGoal} className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 mb-8 md:mb-12 transform hover:scale-[1.01] transition-transform duration-500">
            <h3 className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-[0.25em] mb-4 md:mb-6 flex items-center gap-2 md:gap-3">
              <Plus className="text-indigo-600 w-4 h-4 md:w-[18px] md:h-[18px]" strokeWidth={3} /> Thiết lập Big 3
            </h3>
            <div className="space-y-4 md:space-y-6">
              <input
                type="text"
                value={newGoalText}
                onChange={(e) => setNewGoalText(e.target.value)}
                placeholder="Mục tiêu lớn nhất hôm nay..."
                className="w-full bg-slate-50 border-none rounded-xl md:rounded-2xl px-5 py-3.5 md:px-6 md:py-5 text-base md:text-xl font-bold text-slate-900 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-300"
              />
              <div className="flex flex-wrap gap-3 md:gap-4 items-center">
                <div className="flex items-center gap-2 md:gap-3 bg-slate-50 px-4 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl text-slate-500 text-xs md:text-sm font-bold border border-slate-100">
                  <Percent className="text-indigo-500 w-3.5 h-3.5 md:w-4 md:h-4" />
                  <input 
                    type="number" 
                    value={newGoalWeight}
                    onChange={(e) => setNewGoalWeight(e.target.value)}
                    placeholder="Tỷ trọng %"
                    className="bg-transparent border-none focus:ring-0 p-0 text-xs md:text-sm font-bold w-16"
                  />
                  <span className="text-slate-300">%</span>
                </div>
                <button
                  type="submit"
                  disabled={!newGoalText.trim()}
                  className="w-full sm:w-auto sm:ml-auto bg-slate-900 text-white px-8 md:px-10 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-xs md:text-sm uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50"
                >
                  Bắt đầu
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="bg-indigo-50/50 border-2 border-indigo-100/50 p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] mb-8 md:mb-12 flex items-center gap-4 text-indigo-900">
            <Target className="text-indigo-600 shrink-0 w-5 h-5 md:w-6 md:h-6" />
            <p className="text-xs md:text-sm font-bold leading-relaxed tracking-tight underline decoration-indigo-200 underline-offset-4">"Sự tập trung là lời từ chối với hàng nghìn ý tưởng tốt khác." - Hãy hoàn thành 3 mục tiêu này!</p>
          </div>
        )}

        {/* Goals List */}
        <div className="space-y-6 md:space-y-8">
          {/* Backlog Section */}
          {(() => {
            const backlogGoals = goals.filter(g => {
              if (g.completed) return false;
              let gDateStr = g.date;
              if (!gDateStr && g.createdAt) {
                const d = g.createdAt instanceof Timestamp ? g.createdAt.toDate() : 
                          (typeof g.createdAt === 'string' ? new Date(g.createdAt) : new Date());
                gDateStr = d.toISOString().split('T')[0];
              }
              return gDateStr < selectedDate;
            });

            if (backlogGoals.length === 0) return null;

            return (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-amber-50/50 border-2 border-amber-100/50 rounded-[2rem] p-6 mb-8"
              >
                <div className="flex items-center gap-3 mb-4">
                  <AlertCircle className="text-amber-500 w-5 h-5" />
                  <h3 className="text-sm font-black text-amber-700 uppercase tracking-widest">Mục tiêu tồn đọng ({backlogGoals.length})</h3>
                </div>
                <div className="space-y-3">
                  {backlogGoals.map(goal => (
                    <div key={goal.id} className="flex items-center justify-between bg-white/60 p-4 rounded-2xl border border-amber-100 shadow-sm">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                        <span className="text-sm font-bold text-slate-700 truncate">{goal.text}</span>
                        <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold shrink-0">{goal.date}</span>
                      </div>
                      <button 
                        onClick={() => moveGoalToCurrentDate(goal.id)}
                        className="flex items-center gap-2 bg-amber-500 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-amber-600 transition-all shadow-sm shadow-amber-200"
                      >
                        <CalendarIcon size={12} /> Chuyển sang hôm nay
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })()}

          <AnimatePresence mode="popLayout">
            {currentDailyGoals.map((goal) => (
              <motion.div
                key={goal.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`bg-white rounded-[2rem] md:rounded-[2.5rem] border-2 shadow-xl md:shadow-2xl shadow-slate-200/40 overflow-hidden transition-all duration-500 ${
                  expandedGoalId === goal.id ? "ring-4 ring-indigo-500/5 border-indigo-100" : "border-transparent"
                }`}
              >
                <div className="p-6 md:p-8">
                  <div className="flex items-start gap-4 md:gap-6">
                    <div className="mt-1 flex-shrink-0 relative group cursor-pointer" onClick={() => toggleGoal(goal.id, goal.completed)}>
                      <div className="w-12 h-12 md:w-16 md:h-16 flex items-center justify-center relative">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle
                            cx="50%"
                            cy="50%"
                            r="40%"
                            className="stroke-slate-100 fill-none"
                            strokeWidth="8%"
                          />
                          <motion.circle
                            cx="50%"
                            cy="50%"
                            r="40%"
                            className={`${goal.completed ? "stroke-emerald-500" : "stroke-indigo-600"} fill-none`}
                            strokeWidth="8%"
                            strokeLinecap="round"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: calculateGoalProgress(goal) / 100 }}
                            transition={{ duration: 1, ease: "easeOut" }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className={`text-[9px] md:text-xs font-black ${goal.completed ? "text-emerald-600" : "text-indigo-600"}`}>
                            {Math.round(calculateGoalProgress(goal))}%
                          </span>
                        </div>
                      </div>
                      
                      {/* Interactive checkmark on hover when incomplete */}
                      {!goal.completed && calculateGoalProgress(goal) < 100 && (
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-white/80 rounded-full flex items-center justify-center transition-opacity border-2 border-indigo-100">
                          <Check className="text-indigo-600" size={14} />
                        </div>
                      )}
                      {goal.completed && (
                        <div className="absolute -top-1 -right-1 bg-emerald-500 text-white p-1 rounded-full shadow-lg border-2 border-white">
                          <Check size={8} strokeWidth={4} />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-grow">
                      <div className="flex justify-between items-start">
                        {editingGoalId === goal.id ? (
                          <div className="flex-grow space-y-3 pr-2 md:pr-4">
                            <input
                              type="text"
                              value={editGoalText}
                              onChange={(e) => setEditGoalText(e.target.value)}
                              className="w-full bg-slate-50 border-2 border-indigo-100 rounded-xl px-4 py-2 text-base md:text-lg font-bold text-slate-900 focus:outline-none"
                              autoFocus
                            />
                            <div className="flex flex-wrap gap-2">
                              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl text-slate-500 text-[10px] md:text-xs font-bold border border-slate-100 w-fit">
                                <CalendarIcon size={12} className="text-indigo-500" />
                                <input 
                                  type="date" 
                                  value={editGoalDate}
                                  onChange={(e) => setEditGoalDate(e.target.value)}
                                  className="bg-transparent border-none focus:ring-0 p-0 text-[10px] md:text-xs font-bold"
                                />
                              </div>
                              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl text-slate-500 text-[10px] md:text-xs font-bold border border-slate-100 w-fit">
                                <Clock size={12} className="text-indigo-500" />
                                <input 
                                  type="datetime-local" 
                                  value={editGoalDeadline}
                                  onChange={(e) => setEditGoalDeadline(e.target.value)}
                                  className="bg-transparent border-none focus:ring-0 p-0 text-[10px] md:text-xs font-bold"
                                />
                              </div>
                              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl text-slate-500 text-[10px] md:text-xs font-bold border border-slate-100 w-fit">
                                <Percent size={12} className="text-indigo-500" />
                                <input 
                                  type="number" 
                                  value={editGoalWeight}
                                  onChange={(e) => setEditGoalWeight(e.target.value)}
                                  className="bg-transparent border-none focus:ring-0 p-0 text-[10px] md:text-xs font-bold w-12"
                                />
                                <span>%</span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => saveEditGoal(goal.id)} className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-[10px] md:text-xs font-bold hover:bg-indigo-700">Lưu</button>
                              <button onClick={() => setEditingGoalId(null)} className="bg-slate-200 text-slate-600 px-4 py-1.5 rounded-lg text-[10px] md:text-xs font-bold hover:bg-slate-300">Hủy</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <h2 className={`text-base md:text-2xl font-black tracking-tight leading-tight transition-all duration-500 ${
                              goal.completed ? "text-slate-300 line-through font-medium" : "text-slate-900"
                            }`}>
                              {goal.text}
                            </h2>
                            <div className="flex gap-1 md:gap-2 ml-2">
                              <button onClick={() => startEditingGoal(goal)} className="p-1.5 md:p-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg md:rounded-xl transition-all shadow-sm">
                                <Edit3 className="w-3.5 h-3.5 md:w-5 md:h-5" />
                              </button>
                              <button onClick={() => setExpandedGoalId(expandedGoalId === goal.id ? null : goal.id)} className={`p-1.5 md:p-2 rounded-lg md:rounded-xl border transition-all ${expandedGoalId === goal.id ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200" : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100"}`}>
                                {expandedGoalId === goal.id ? <ChevronUp className="w-3.5 h-3.5 md:w-5 md:h-5" /> : <ChevronDown className="w-3.5 h-3.5 md:w-5 md:h-5" />}
                              </button>
                              <button onClick={() => deleteGoal(goal.id)} className="p-1.5 md:p-2 bg-red-50 text-red-500 border border-red-100 rounded-lg md:rounded-xl transition-all shadow-sm">
                                <Trash2 className="w-3.5 h-3.5 md:w-5 md:h-5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                      
                      {(!editingGoalId || editingGoalId !== goal.id) && (
                        <div className="mt-4 flex flex-wrap gap-4 items-center">
                          {goal.deadline && (
                            <div className="flex items-center gap-2 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                              <Clock size={12} className="text-indigo-500" />
                              <span>Deadline: {new Date(goal.deadline).toLocaleString('vi-VN', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-3">
                             <div className="flex -space-x-1.5 md:-space-x-2">
                                {goal.subtasks.map((s, i) => (
                                  <div key={i} className={`w-2.5 h-2.5 md:w-3 md:h-3 rounded-full border-2 border-white ${s.completed ? "bg-emerald-500" : "bg-slate-200"}`}></div>
                                ))}
                             </div>
                             <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">{goal.subtasks.length} Hạng mục</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedGoalId === goal.id && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="bg-slate-50/70 border-t-2 border-slate-50 p-6 md:p-8"
                    >
                      <div className="flex items-center justify-between mb-6 md:mb-8">
                        <h3 className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2">
                          <Layers className="text-indigo-600 w-3.5 h-3.5 md:w-4 md:h-4" /> Chi tiết hạng mục
                        </h3>
                        <button 
                          onClick={() => setAddingSubtaskTo(addingSubtaskTo === goal.id ? null : goal.id)}
                          className="bg-white border-2 border-indigo-500 text-indigo-600 px-4 py-1.5 md:px-5 md:py-2 rounded-lg md:rounded-xl text-[10px] md:text-xs font-black uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all shadow-sm"
                        >
                          {addingSubtaskTo === goal.id ? "Đóng" : "+ Thêm mới"}
                        </button>
                      </div>

                      {addingSubtaskTo === goal.id && (
                        <motion.div className="bg-white p-5 md:p-6 rounded-2xl md:rounded-3xl border-2 border-indigo-100 shadow-xl mb-6 md:mb-8 space-y-4 md:space-y-5">
                          <input
                            type="text"
                            value={subtaskText}
                            onChange={(e) => setSubtaskText(e.target.value)}
                            placeholder="Tên hạng mục..."
                            className="w-full font-bold text-slate-900 border-none bg-slate-50 rounded-xl md:rounded-2xl px-4 py-3 md:px-5 md:py-4 focus:ring-4 focus:ring-indigo-100 text-sm md:text-base"
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                            <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl text-slate-700 border-2 border-transparent focus-within:border-indigo-100 transition-all">
                              <Ruler className="text-indigo-500 w-4 h-4 md:w-[18px] md:h-[18px]" />
                              <input type="number" placeholder="Khối lượng" value={subtaskWorkload} onChange={(e) => setSubtaskWorkload(e.target.value)} className="bg-transparent border-none w-full focus:ring-0 p-0 font-bold text-sm md:text-base"/>
                            </div>
                            <input type="text" placeholder="Đơn vị" value={subtaskUnit} onChange={(e) => setSubtaskUnit(e.target.value)} className="bg-slate-50 border-none rounded-xl md:rounded-2xl px-4 py-2.5 md:px-5 md:py-3 font-bold text-slate-700 focus:ring-4 focus:ring-indigo-100 text-sm md:text-base"/>
                            <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl text-slate-700 border-2 border-transparent focus-within:border-indigo-100 transition-all">
                              <Percent className="text-indigo-500 w-4 h-4 md:w-[18px] md:h-[18px]" />
                              <input type="number" placeholder="Tỷ trọng %" value={subtaskWeight} onChange={(e) => setSubtaskWeight(e.target.value)} className="bg-transparent border-none w-full focus:ring-0 p-0 font-bold text-sm md:text-base"/>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 bg-slate-50 px-4 py-2.5 md:px-5 md:py-3 rounded-xl md:rounded-2xl text-slate-700 border-2 border-transparent focus-within:border-indigo-100 transition-all">
                            <Clock className="text-indigo-500 w-4 h-4 md:w-[18px] md:h-[18px]" />
                            <input type="datetime-local" value={subtaskDeadline} onChange={(e) => setSubtaskDeadline(e.target.value)} className="bg-transparent border-none w-full focus:ring-0 p-0 font-bold text-sm md:text-base"/>
                          </div>
                          <button onClick={() => addSubtask(goal.id)} className="w-full bg-slate-900 text-white py-3.5 md:py-4 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-xs md:text-sm hover:bg-indigo-600 transition-all">Xác nhận hạng mục</button>
                        </motion.div>
                      )}

                      <div className="space-y-3 md:space-y-4">
                        {goal.subtasks.map(sub => (
                          <div key={sub.id} className="group flex items-center gap-4 md:gap-5 bg-white p-4 md:p-5 rounded-[1.2rem] md:rounded-[1.5rem] border-2 border-indigo-50 border-l-4 border-l-indigo-400 hover:border-indigo-200 hover:border-l-indigo-600 shadow-sm hover:shadow-md transition-all">
                            {editingSubtaskId === sub.id ? (
                              <div className="w-full space-y-3">
                                <input
                                  type="text"
                                  value={editSubtaskText}
                                  onChange={(e) => setEditSubtaskText(e.target.value)}
                                  className="w-full font-bold text-slate-900 border-none bg-slate-50 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-100 text-sm md:text-base"
                                  autoFocus
                                />
                                <div className="grid grid-cols-3 gap-3">
                                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl text-slate-700 border border-slate-100">
                                    <Ruler size={14} className="text-indigo-500" />
                                    <input type="number" value={editSubtaskWorkload} onChange={(e) => setEditSubtaskWorkload(e.target.value)} className="bg-transparent border-none w-full focus:ring-0 p-0 font-bold text-xs" placeholder="KL"/>
                                  </div>
                                  <input type="text" value={editSubtaskUnit} onChange={(e) => setEditSubtaskUnit(e.target.value)} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5 font-bold text-slate-700 focus:ring-2 focus:ring-indigo-100 text-xs" placeholder="Đơn vị"/>
                                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl text-slate-700 border border-slate-100">
                                    <Percent size={14} className="text-indigo-500" />
                                    <input type="number" value={editSubtaskWeight} onChange={(e) => setEditSubtaskWeight(e.target.value)} className="bg-transparent border-none w-full focus:ring-0 p-0 font-bold text-xs" placeholder="Tỷ trọng %"/>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl text-slate-700 border border-slate-100">
                                  <Clock size={14} className="text-indigo-500" />
                                  <input type="datetime-local" value={editSubtaskDeadline} onChange={(e) => setEditSubtaskDeadline(e.target.value)} className="bg-transparent border-none w-full focus:ring-0 p-0 font-bold text-xs"/>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => saveEditSubtask(goal.id, sub.id)} className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-bold">Lưu</button>
                                  <button onClick={() => setEditingSubtaskId(null)} className="bg-slate-200 text-slate-600 px-4 py-1.5 rounded-lg text-[10px] font-bold">Hủy</button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <button onClick={() => toggleSubtask(goal.id, sub.id, sub.completed)} className={`transform active:scale-75 transition-all ${sub.completed ? "text-emerald-500" : "text-slate-100 hover:text-emerald-400"}`}>
                                  {sub.completed ? <CheckCircle2 className="w-5 h-5 md:w-7 md:h-7" /> : <Circle className="w-5 h-5 md:w-7 md:h-7" />}
                                </button>
                                <div className="flex-grow min-w-0">
                                  <p className={`font-bold text-sm md:text-lg tracking-tight truncate-mobile ${sub.completed ? "text-slate-300 line-through" : "text-slate-700"}`}>{sub.text}</p>
                                  {(sub.workloadValue || sub.deadline) && (
                                    <div className="flex flex-wrap gap-2 md:gap-4 mt-1">
                                      {sub.weight > 0 && (
                                        <div className="flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                                          <Percent size={8} /> {sub.weight}%
                                        </div>
                                      )}
                                      {sub.workloadValue && (
                                        <div className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                                          <Ruler size={8} /> {sub.workloadValue} {sub.workloadUnit}
                                        </div>
                                      )}
                                      {sub.deadline && (
                                        <div className="flex items-center gap-1 text-slate-400 text-[8px] md:text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                                          <Clock size={8} /> {new Date(sub.deadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-1 transition-all opacity-100 sm:opacity-0 group-hover:opacity-100">
                                  <button onClick={() => startEditingSubtask(sub)} className="p-1.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-lg transition-all shadow-sm">
                                    <Edit3 className="w-3 h-3 md:w-[18px] md:h-[18px]" />
                                  </button>
                                  <button onClick={() => deleteSubtask(goal.id, sub.id)} className="p-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg transition-all shadow-sm">
                                    <Trash2 className="w-3 h-3 md:w-[18px] md:h-[18px]" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Schedule / Day Planner Section */}
        <section className="mt-12 md:mt-20">
          <div className="flex items-center justify-between mb-6 md:mb-10">
            <h2 className="text-xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <Clock className="text-indigo-600" size={24} /> Lịch trình trong ngày
            </h2>
            <button 
              onClick={() => setIsAddingSchedule(!isAddingSchedule)}
              className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all border border-indigo-100"
            >
              {isAddingSchedule ? "Đóng" : "Lên kế hoạch"}
            </button>
          </div>

          <AnimatePresence>
            {isAddingSchedule && (
              <motion.form 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                onSubmit={addScheduleItem}
                className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl mb-8 overflow-hidden"
              >
                <div className="space-y-4">
                  <input
                    type="text"
                    value={newActivity}
                    onChange={(e) => setNewActivity(e.target.value)}
                    placeholder="Bạn sẽ làm gì? (ví dụ: Tập thể dục, Họp team...)"
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 font-bold text-slate-900 focus:ring-4 focus:ring-indigo-100 placeholder:text-slate-300"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Bắt đầu</label>
                      <input 
                        type="time" 
                        value={newStartTime}
                        onChange={(e) => setNewStartTime(e.target.value)}
                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-4 focus:ring-indigo-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Kết thúc</label>
                      <input 
                        type="time" 
                        value={newEndTime}
                        onChange={(e) => setNewEndTime(e.target.value)}
                        className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 font-bold text-slate-700 focus:ring-4 focus:ring-indigo-100"
                      />
                    </div>
                  </div>
                  <button 
                    type="submit"
                    className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-600 transition-all shadow-xl shadow-indigo-100"
                  >
                    Xác nhận thời gian
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          <div className="relative space-y-6">
            {/* Vertical Line */}
            {currentDailySchedules.length > 0 && (
              <div className="absolute left-6 top-2 bottom-2 w-0.5 bg-slate-100 hidden md:block" />
            )}

            {currentDailySchedules.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-200 rounded-[2rem] p-12 text-center">
                <Clock className="mx-auto text-slate-200 mb-4" size={40} />
                <p className="text-slate-400 font-bold text-sm tracking-tight">Chưa có lịch trình cho ngày này.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {currentDailySchedules.map((item, index) => (
                  <motion.div 
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`relative flex items-center gap-4 md:gap-8 bg-white p-5 rounded-[1.5rem] md:rounded-[2rem] border shadow-sm group transition-all ${item.completed ? "border-emerald-100 bg-emerald-50/20" : "border-slate-100 hover:border-indigo-100 hover:shadow-md"}`}
                  >
                    {/* Checkbox / Bullet */}
                    <button 
                      onClick={() => toggleScheduleItem(item.id, item.completed)}
                      className={`z-10 w-12 h-12 rounded-2xl flex items-center justify-center transition-all shrink-0 ${item.completed ? "bg-emerald-500 text-white shadow-lg shadow-emerald-100" : "bg-slate-50 text-slate-300 border border-slate-100 hover:bg-indigo-50 hover:text-indigo-500"}`}
                    >
                      {item.completed ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                    </button>

                    <div className="flex-grow flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <h4 className={`text-sm md:text-lg font-black tracking-tight ${item.completed ? "text-slate-400 line-through font-bold" : "text-slate-900"}`}>
                          {item.activity}
                        </h4>
                        <div className="flex items-center gap-2 text-[10px] md:text-xs font-black text-indigo-500 uppercase tracking-widest">
                          <Clock size={12} />
                          <span>{item.startTime} - {item.endTime}</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => deleteScheduleItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all absolute top-2 right-2 md:relative md:top-0 md:right-0"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    ) : viewMode === 'stats' ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Period Selector */}
            <div className="flex bg-white p-1.5 md:p-2 rounded-2xl md:rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/40 w-full md:w-fit">
              {[
                { id: 'day', label: 'Ngày' },
                { id: 'week', label: 'Tuần' },
                { id: 'month', label: 'Tháng' },
                { id: 'year', label: 'Năm' }
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setStatsPeriod(p.id as StatsPeriod)}
                  className={`flex-1 md:flex-none px-6 md:px-8 py-2 md:py-3 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${
                    statsPeriod === p.id 
                    ? "bg-slate-900 text-white shadow-xl shadow-slate-200" 
                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-[2.5rem] p-8 md:p-10 border border-slate-100 shadow-2xl shadow-slate-200/40">
              <div className="flex items-center justify-between mb-10">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
                    Hiệu suất {statsPeriod === 'day' ? 'Hôm nay' : statsPeriod === 'week' ? 'Trong tuần' : statsPeriod === 'month' ? 'Trong tháng' : 'Trong năm'}
                  </h3>
                  <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">Dựa trên tỷ trọng công việc</p>
                </div>
                <div className="bg-indigo-50 text-indigo-600 p-4 rounded-3xl">
                  <BarChart2 size={32} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
                <div className="h-64 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={getFilteredGoals().length > 0 ? getFilteredGoals().map(g => ({ name: g.text, value: g.weight || 1 })) : [{ name: 'Không có dữ liệu', value: 1 }]}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {getFilteredGoals().length > 0 ? getFilteredGoals().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={[ '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6' ][index % 5]} stroke="none" />
                        )) : <Cell fill="#F1F5F9" stroke="none" />}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                    <span className="text-3xl font-black text-slate-900">
                      {getFilteredGoals().length > 0 
                        ? Math.round(
                            getFilteredGoals().reduce((acc, goal) => acc + (calculateGoalProgress(goal) * (goal.weight / 100)), 0) / 
                            (getFilteredGoals().reduce((acc, goal) => acc + goal.weight, 0) / 100 || 1)
                          ) 
                        : 0}%
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trung bình</span>
                  </div>
                </div>

                <div className="space-y-6 max-h-[300px] overflow-y-auto pr-2">
                  {getFilteredGoals().length > 0 ? getFilteredGoals().map((goal, idx) => (
                    <div key={goal.id} className="space-y-2">
                      <div className="flex justify-between items-end">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${[ 'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500', 'bg-violet-500' ][idx % 5]}`}></div>
                          <span className="text-sm font-bold text-slate-700 truncate max-w-[150px]">{goal.text}</span>
                        </div>
                        <span className="text-xs font-black text-slate-400">{Math.round(calculateGoalProgress(goal))}%</span>
                      </div>
                      <div className="h-2 bg-slate-50 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${[ 'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500', 'bg-violet-500' ][idx % 5]}`} 
                          style={{ width: `${calculateGoalProgress(goal)}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                        <span>Tỷ trọng: {goal.weight}%</span>
                        <span>{new Date(goal.createdAt instanceof Timestamp ? goal.createdAt.toDate() : goal.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="flex flex-col items-center justify-center py-10 text-slate-300 italic text-sm">
                      <ListIcon size={32} className="mb-3 opacity-20" />
                      Chưa có mục tiêu cho giai đoạn này
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-indigo-900 rounded-[2.5rem] p-8 md:p-10 text-white relative overflow-hidden">
               <div className="relative z-10">
                 <h4 className="text-lg font-black tracking-tight mb-6 flex items-center gap-3 text-indigo-200">
                   <Target size={20} /> Phân tích hoàn thành ({getFilteredGoals().length} mục tiêu)
                 </h4>
                 <div className="h-64">
                   <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={getFilteredGoals().map(g => ({
                       name: g.text.length > 10 ? g.text.substring(0, 8) + '...' : g.text,
                       'Đã hoàn thành': Math.round(calculateGoalProgress(g)),
                       'Chưa hoàn thành': 100 - Math.round(calculateGoalProgress(g))
                     }))} layout="vertical">
                       <XAxis type="number" hide />
                       <YAxis dataKey="name" type="category" stroke="#818CF8" fontSize={10} width={80} />
                       <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: '#1E1B4B', border: 'none', borderRadius: '12px', fontSize: '12px' }} />
                       <Bar dataKey="Đã hoàn thành" stackId="a" fill="#F8FAFC" radius={[0, 0, 0, 0]} barSize={20} />
                       <Bar dataKey="Chưa hoàn thành" stackId="a" fill="#4F46E5" radius={[0, 10, 10, 0]} barSize={20} />
                     </BarChart>
                   </ResponsiveContainer>
                 </div>
               </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2.5rem] p-8 md:p-10 border border-slate-100 shadow-2xl shadow-slate-200/40"
          >
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-4">
                <div className="bg-indigo-50 text-indigo-600 p-3 rounded-2xl">
                  <Calendar size={24} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Lịch trình</h3>
                  <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">
                    {calendarMonth.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                  className="p-2 hover:bg-slate-50 rounded-xl border border-slate-100 text-slate-400 transition-all"
                >
                  <ChevronLeft size={20} />
                </button>
                <button 
                   onClick={() => setCalendarMonth(new Date())}
                   className="px-4 py-2 hover:bg-slate-50 rounded-xl border border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-all"
                >
                  Hôm nay
                </button>
                <button 
                  onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                  className="p-2 hover:bg-slate-50 rounded-xl border border-slate-100 text-slate-400 transition-all"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 mb-4">
              {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
                <div key={d} className="text-center text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2">{d}</div>
              ))}
              {Array.from({ length: (new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() || 7) - 1 }).map((_, i) => (
                <div key={`empty-${i}`} className="h-16 md:h-24"></div>
              ))}
              {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayGoals = goals.filter(g => isGoalInDate(g, dateStr));
                const isToday = dateStr === new Date().toISOString().split('T')[0];
                const isSelected = dateStr === selectedDate;

                return (
                  <button
                    key={day}
                    onClick={() => {
                      setSelectedDate(dateStr);
                      setViewMode('daily');
                    }}
                    className={`h-16 md:h-24 border border-slate-50 relative flex flex-col items-center justify-center transition-all group overflow-hidden ${
                      isSelected ? "bg-indigo-50/50" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className={`text-base md:text-xl font-black transition-all ${
                      isToday ? "text-indigo-600" : isSelected ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"
                    }`}>
                      {day}
                    </span>
                    {isToday && <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full mt-1"></div>}
                    <div className="mt-2 flex gap-0.5 md:gap-1">
                      {dayGoals.map((g, idx) => (
                        <div key={idx} className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${g.completed ? "bg-emerald-500" : "bg-indigo-300"}`}></div>
                      ))}
                    </div>
                    {isSelected && <div className="absolute left-0 top-0 w-1 h-full bg-indigo-600"></div>}
                  </button>
                );
              })}
            </div>
            
            <div className="mt-8 pt-8 border-t border-slate-50 flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-widest">
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-indigo-300 rounded-full"></div>
                  <span>Đang thực hiện</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                  <span>Đã xong</span>
                </div>
              </div>
              <div>{new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate()} ngày</div>
            </div>
          </motion.div>
        )}

        {/* Inspiration Slider Section */}
        <section className="mt-12 md:mt-20">
          <h2 className="text-xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3 mb-8 md:mb-12">
             Cảm hứng mỗi ngày
          </h2>
          <div className="relative h-[250px] md:h-[350px]">
            <AnimatePresence mode="wait">
              <motion.div 
                key={activeQuoteIndex}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                className={`absolute inset-0 overflow-hidden ${quotes[activeQuoteIndex].color} rounded-[2rem] md:rounded-[3rem] p-8 md:p-12 text-white shadow-2xl shadow-indigo-100 flex flex-col justify-center`}
              >
                <div className={`absolute top-0 right-0 w-64 h-64 ${quotes[activeQuoteIndex].accent} rounded-full -mr-20 -mt-20 blur-3xl`}></div>
                <div className="relative z-10">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-white/10 rounded-2xl flex items-center justify-center font-black text-xl md:text-2xl border border-white/20">
                      {quotes[activeQuoteIndex].initials}
                    </div>
                    <div>
                      <h4 className="font-black text-base md:text-lg tracking-tight">{quotes[activeQuoteIndex].name}</h4>
                      <p className="text-white/60 text-[10px] md:text-xs font-black uppercase tracking-widest">{quotes[activeQuoteIndex].title}</p>
                    </div>
                  </div>
                  <p className="text-lg md:text-3xl font-bold leading-tight italic mb-8 max-w-2xl">
                    {quotes[activeQuoteIndex].text}
                  </p>
                  <div className="flex gap-2">
                    {quotes.map((_, i) => (
                      <div 
                        key={i} 
                        className={`h-1.5 rounded-full transition-all duration-500 ${i === activeQuoteIndex ? "w-8 bg-white" : "w-2 bg-white/20"}`}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        <section className="mt-12 md:mt-20 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
           <div className="bg-white p-5 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30">
              <div className="w-8 h-8 md:w-12 md:h-12 bg-indigo-50 rounded-xl md:rounded-2xl flex items-center justify-center mb-3 md:mb-6">
                <Target className="text-indigo-600 w-4 h-4 md:w-6 md:h-6" />
              </div>
              <h4 className="text-sm md:text-lg font-black text-slate-900 mb-1.5 md:mb-2">Quy tắc Số 3</h4>
              <p className="text-slate-500 text-[11px] md:text-sm leading-relaxed font-medium">Bằng cách giới hạn 3 mục tiêu, bộ não của bạn sẽ ưu tiên những việc thực sự mang lại kết quả lớn nhất.</p>
           </div>
           <div className="bg-white p-5 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30">
              <div className="w-8 h-8 md:w-12 md:h-12 bg-emerald-50 rounded-xl md:rounded-2xl flex items-center justify-center mb-3 md:mb-6">
                <Layers className="text-emerald-600 w-4 h-4 md:w-6 md:h-6" />
              </div>
              <h4 className="text-sm md:text-lg font-black text-slate-900 mb-1.5 md:mb-2">Chia nhỏ để thắng</h4>
              <p className="text-slate-500 text-[11px] md:text-sm leading-relaxed font-medium">Các hạng mục nhỏ giúp công việc bớt đáng sợ hơn và tạo động lực liên tục khi bạn tích hoàn thành.</p>
           </div>
        </section>

        <footer className="mt-16 md:mt-24 pb-8 md:pb-12 text-center text-slate-300">
           <div className="inline-flex items-center gap-2 md:gap-3 text-[8px] md:text-[10px] uppercase font-bold tracking-[0.4em] bg-white px-6 md:px-8 py-2 md:py-3 rounded-full border border-slate-100 shadow-sm">
             <Target size={14} className="animate-pulse" />
             <span>DayFlow Cloud Edition</span>
           </div>
        </footer>

        {/* Weight Warning Modal */}
        <AnimatePresence>
          {showWeightWarning && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl border border-slate-100"
              >
                <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                  <Percent className="text-amber-500" size={32} />
                </div>
                <h3 className="text-xl font-black text-slate-900 text-center mb-3">Thiếu tỷ trọng</h3>
                <p className="text-slate-500 text-sm text-center font-medium leading-relaxed mb-8">
                  Bạn chưa nhập tỷ trọng % cho hạng mục này. Hệ thống sẽ tự động tính toán tỷ trọng còn lại (thường là 100% nếu là mục đầu tiên). 
                  Bạn có muốn tiếp tục không?
                </p>
                <div className="space-y-3">
                  <button 
                    onClick={() => {
                      if (warningGoalId) {
                        addSubtask(warningGoalId, true);
                        setShowWeightWarning(false);
                        setWarningGoalId(null);
                      }
                    }}
                    className="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all font-sans"
                  >
                    Tiếp tục tự động
                  </button>
                  <button 
                    onClick={() => {
                      setShowWeightWarning(false);
                      setWarningGoalId(null);
                    }}
                    className="w-full bg-white text-slate-400 py-4 rounded-xl font-black uppercase tracking-widest text-xs border border-slate-100 hover:bg-slate-50 transition-all font-sans"
                  >
                    Quay lại chỉnh sửa
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
