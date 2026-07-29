import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Plus, Check, Trash2, Circle, CheckCircle2, 
  Calendar as CalendarIcon, ChevronDown, ChevronUp, 
  Target, Layers, Ruler, AlertCircle, Clock, Bell,
  LogIn, LogOut, User as UserIcon, Edit3,
  Percent, BarChart2, Home, List as ListIcon,
  ChevronLeft, ChevronRight, Calendar, Sparkles
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
  linkedDailyGoalId?: string;
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
  period?: 'day' | 'week' | 'month' | 'year';
  parentGoalId?: string;
  parentSubtaskId?: string;
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

type ViewMode = 'daily' | 'major-goals' | 'stats' | 'calendar';
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
  const [isBacklogExpanded, setIsBacklogExpanded] = useState(false);
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

  const [showMajorGoalsModal, setShowMajorGoalsModal] = useState(false);
  const [majorGoalsPeriod, setMajorGoalsPeriod] = useState<'week' | 'month' | 'year'>('week');
  const [newMajorGoalText, setNewMajorGoalText] = useState("");
  const [newMajorGoalDeadline, setNewMajorGoalDeadline] = useState("");
  const [newMajorGoalWeight, setNewMajorGoalWeight] = useState("33");

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
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editActivity, setEditActivity] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [showWeightWarning, setShowWeightWarning] = useState(false);
  const [warningGoalId, setWarningGoalId] = useState<string | null>(null);
  const [promotingSubtask, setPromotingSubtask] = useState<{ goalId: string; sub: SubTask; parentGoal: Goal } | null>(null);

  const startEditSchedule = (item: any) => {
    setEditingScheduleId(item.id);
    setEditActivity(item.activity);
    setEditStartTime(item.startTime);
    setEditEndTime(item.endTime || "");
  };

  const cancelEditSchedule = () => {
    setEditingScheduleId(null);
  };

  const updateScheduleItem = async () => {
    if (!user || !editingScheduleId || !editActivity || !editStartTime) return;
    try {
      const scheduleRef = doc(db, "schedules", editingScheduleId);
      await updateDoc(scheduleRef, {
        activity: editActivity,
        startTime: editStartTime,
        endTime: editEndTime,
        updatedAt: serverTimestamp(),
      });
      setEditingScheduleId(null);
    } catch (err) {
      console.error("Failed to update schedule item", err);
    }
  };

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

  useEffect(() => {
    const maxVal = getPeriodDaysCount(majorGoalsPeriod, selectedDate) * 100;
    setNewMajorGoalWeight(String(Math.min(100, maxVal)));
  }, [majorGoalsPeriod, selectedDate]);

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

    const subtaskUnsubscribes: Record<string, () => void> = {};

    const unsubscribeGoals = onSnapshot(q, (snapshot) => {
      const goalsList: Goal[] = [];
      snapshot.forEach((goalDoc) => {
        goalsList.push({ id: goalDoc.id, ...goalDoc.data(), subtasks: [] } as Goal);
      });
      
      setGoals(prev => {
        return goalsList.map(newGoal => {
          const existingGoal = prev.find(g => g.id === newGoal.id);
          return {
            ...newGoal,
            subtasks: existingGoal ? existingGoal.subtasks : []
          };
        });
      });
      setLoading(false);

      // Clean up subtask listeners for removed goals
      const currentGoalIds = new Set(goalsList.map(g => g.id));
      Object.keys(subtaskUnsubscribes).forEach((goalId) => {
        if (!currentGoalIds.has(goalId)) {
          subtaskUnsubscribes[goalId]();
          delete subtaskUnsubscribes[goalId];
        }
      });

      // Attach subtask listeners for new goals
      goalsList.forEach((goal) => {
        if (!subtaskUnsubscribes[goal.id]) {
          const subQ = query(
            collection(db, `goals/${goal.id}/subtasks`), 
            where("userId", "==", user.uid),
            orderBy("createdAt", "asc")
          );
          subtaskUnsubscribes[goal.id] = onSnapshot(subQ, (subSnapshot) => {
            const subtasks: SubTask[] = [];
            subSnapshot.forEach(subDoc => {
              subtasks.push({ id: subDoc.id, ...subDoc.data() } as SubTask);
            });
            
            setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, subtasks } : g));
          }, (error) => handleFirestoreError(error, 'list', `goals/${goal.id}/subtasks`));
        }
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
      Object.values(subtaskUnsubscribes).forEach(unsub => unsub());
      unsubscribeSchedules();
    };
  }, [user]);

  // Automatically complete parent goal when all subtasks are completed
  useEffect(() => {
    if (!user || goals.length === 0) return;

    goals.forEach(async (goal) => {
      if (goal.subtasks && goal.subtasks.length > 0 && !goal.completed) {
        const allCompleted = goal.subtasks.every(s => s.completed);
        if (allCompleted) {
          try {
            await updateDoc(doc(db, "goals", goal.id), { completed: true });
          } catch (err) {
            console.error("Failed to auto-complete goal", goal.id, err);
          }
        }
      }
    });
  }, [goals, user]);

  const login = () => signInWithPopup(auth, googleProvider);
  const logout = () => signOut(auth);

  const getWeekStartDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(d);
    start.setDate(diff);
    return start.toISOString().split('T')[0];
  };

  const getDaysOfWeek = (mondayStr: string) => {
    const days = [];
    const weekdays = ['Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'Chủ Nhật'];
    const parts = mondayStr.split('-');
    const monday = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const formattedDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      days.push({
        date: dateStr,
        label: i === 6 ? `Chủ Nhật (${formattedDate})` : `Thứ ${weekdays[i]} (${formattedDate})`
      });
    }
    return days;
  };

  const getFormattedDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
    return dateStr;
  };

  const getMonthStartDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  };

  const getYearStartDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-01-01`;
  };

  const getPeriodDaysCount = (period: 'week' | 'month' | 'year', dateStr: string) => {
    const d = new Date(dateStr);
    if (period === 'week') {
      return 7;
    }
    if (period === 'month') {
      const year = d.getFullYear();
      const month = d.getMonth() + 1; // 1-indexed
      return new Date(year, month, 0).getDate();
    }
    if (period === 'year') {
      const year = d.getFullYear();
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      return isLeap ? 366 : 365;
    }
    return 1;
  };

  const addMajorGoal = async (period: 'week' | 'month' | 'year', text: string, deadline: string, weight: string) => {
    if (!text.trim() || !user) return;

    const periodDate = period === 'week' ? getWeekStartDate(selectedDate) :
                       period === 'month' ? getMonthStartDate(selectedDate) :
                       getYearStartDate(selectedDate);

    const periodGoals = goals.filter(g => g.period === period && g.date === periodDate);

    if (periodGoals.length >= 3) {
      alert(`Bạn chỉ nên đặt tối đa 3 dự án mỗi ${period === 'week' ? 'tuần' : period === 'month' ? 'tháng' : 'năm'} để đạt hiệu quả cao nhất.`);
      return;
    }

    const maxPoints = getPeriodDaysCount(period, selectedDate) * 100;
    const parsedWeight = parseFloat(weight) || 0;
    if (parsedWeight < 0 || parsedWeight > maxPoints) {
      alert(`Số điểm của dự án phải nằm trong khoảng từ 0 đến ${maxPoints} điểm (số ngày * 100).`);
      return;
    }

    try {
      await addDoc(collection(db, "goals"), {
        text: text,
        deadline: deadline || null,
        weight: parsedWeight,
        completed: false,
        userId: user.uid,
        date: periodDate,
        period: period,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to add major goal", err);
    }
  };

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
      if (g.period && g.period !== 'day') return false;
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
    const dateGoals = goals.filter(g => isGoalInDate(g, selectedDate) && (!g.period || g.period === 'day'));

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
        period: 'day',
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
      const goalToToggle = goals.find(g => g.id === id);
      const targetCompleted = !completed;
      
      await updateDoc(doc(db, "goals", id), { completed: targetCompleted });
      
      // If it is a daily goal linked to a parent subtask, sync completion status
      if (goalToToggle?.parentGoalId && goalToToggle?.parentSubtaskId) {
        try {
          await updateDoc(doc(db, `goals/${goalToToggle.parentGoalId}/subtasks`, goalToToggle.parentSubtaskId), {
            completed: targetCompleted
          });
        } catch (e) {
          console.error("Could not sync to parent subtask", e);
        }
      }
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
      const goalToEdit = goals.find(g => g.id === id);
      const parsedWeight = parseFloat(editGoalWeight) || 0;
      if (goalToEdit && goalToEdit.period && goalToEdit.period !== 'day') {
        const maxPoints = getPeriodDaysCount(goalToEdit.period, goalToEdit.date || selectedDate) * 100;
        if (parsedWeight < 0 || parsedWeight > maxPoints) {
          alert(`Số điểm của dự án phải nằm trong khoảng từ 0 đến ${maxPoints} điểm (số ngày * 100).`);
          return;
        }
      }
      await updateDoc(doc(db, "goals", id), {
        text: editGoalText,
        deadline: editGoalDeadline || null,
        weight: parsedWeight,
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
      const goalToDelete = goals.find(g => g.id === id);
      await deleteDoc(doc(db, "goals", id));
      
      // If it has a parent subtask, clear its linkedDailyGoalId
      if (goalToDelete?.parentGoalId && goalToDelete?.parentSubtaskId) {
        try {
          await updateDoc(doc(db, `goals/${goalToDelete.parentGoalId}/subtasks`, goalToDelete.parentSubtaskId), {
            linkedDailyGoalId: null
          });
        } catch (e) {
          console.error("Could not clear linked subtask reference", e);
        }
      }
    } catch (err) {
      console.error("Failed to delete goal", err);
    }
  };

  const addSubtask = async (goalId: string, skipWarning = false) => {
    if (!subtaskText.trim() || !user) return;

    try {
      const parentGoal = goals.find(g => g.id === goalId);
      if (!parentGoal) return;
      const parentWeight = parentGoal.weight || 0;
      const maxAllowed = Math.min(100, parentWeight);

      const parsedWeight = parseFloat(subtaskWeight);
      const finalWeight = isNaN(parsedWeight) ? 0 : parsedWeight;

      if (finalWeight < 0) {
        alert("Số điểm không thể nhỏ hơn 0.");
        return;
      }

      if (finalWeight > maxAllowed) {
        alert(`Số điểm của hạng mục con không được vượt quá tổng số điểm dự án (${parentWeight} đ) và không được vượt quá 100 đ.`);
        return;
      }

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
      // Removed setAddingSubtaskTo(null) to keep the subtask form open as it's part of the planning process
    } catch (err) {
      console.error("Failed to add subtask", err);
    }
  };

  const toggleSubtask = async (goalId: string, subtaskId: string, completed: boolean) => {
    try {
      const targetCompleted = !completed;
      await updateDoc(doc(db, `goals/${goalId}/subtasks`, subtaskId), { completed: targetCompleted });
      
      // If this subtask is linked to a daily goal, sync completion status
      const parentGoal = goals.find(g => g.id === goalId);
      const subtaskToToggle = parentGoal?.subtasks.find(s => s.id === subtaskId);
      if (subtaskToToggle?.linkedDailyGoalId) {
        try {
          await updateDoc(doc(db, "goals", subtaskToToggle.linkedDailyGoalId), {
            completed: targetCompleted
          });
        } catch (e) {
          console.error("Could not sync to linked daily goal", e);
        }
      }
    } catch (err) {
      console.error("Failed to toggle subtask", err);
    }
  };

  const deleteSubtask = async (goalId: string, subtaskId: string) => {
    try {
      const parentGoal = goals.find(g => g.id === goalId);
      const subtaskToDelete = parentGoal?.subtasks.find(s => s.id === subtaskId);
      
      await deleteDoc(doc(db, `goals/${goalId}/subtasks`, subtaskId));
      
      // If this subtask was linked to a daily goal, delete that daily goal too to keep things tidy
      if (subtaskToDelete?.linkedDailyGoalId) {
        try {
          await deleteDoc(doc(db, "goals", subtaskToDelete.linkedDailyGoalId));
        } catch (e) {
          console.error("Could not delete linked daily goal", e);
        }
      }
    } catch (err) {
      console.error("Failed to delete subtask", err);
    }
  };

  const executePromoteSubtaskToDailyGoal = async (goalId: string, sub: SubTask, targetDate: string) => {
    if (!user) return;

    // RULE OF 3 CHECK: Only count goals for the selected targetDate
    const dateGoals = goals.filter(g => isGoalInDate(g, targetDate) && (!g.period || g.period === 'day'));

    if (dateGoals.length >= 3) {
      alert(`Ngày ${targetDate} đã có 3 mục tiêu ngày. Vui lòng hoàn thành hoặc xóa bớt để có thể chuyển hạng mục này thành mục tiêu ngày.`);
      return;
    }

    try {
      // 1. If this subtask already has a linkedDailyGoalId, we can check if it exists and delete/update it
      if (sub.linkedDailyGoalId) {
        try {
          await deleteDoc(doc(db, "goals", sub.linkedDailyGoalId));
        } catch (e) {
          console.error("Could not delete previous linked goal", e);
        }
      }

      // 2. Add as a daily goal for the targetDate with reference links
      const newGoalRef = await addDoc(collection(db, "goals"), {
        text: sub.text,
        deadline: sub.deadline || null,
        weight: sub.weight || 33.3,
        completed: sub.completed,
        userId: user.uid,
        date: targetDate,
        period: 'day',
        parentGoalId: goalId,
        parentSubtaskId: sub.id,
        createdAt: serverTimestamp()
      });

      // 3. Update the subtask to store the linked daily goal reference
      await updateDoc(doc(db, `goals/${goalId}/subtasks`, sub.id), {
        linkedDailyGoalId: newGoalRef.id
      });
      
      alert(`Đã dời và liên kết hạng mục thành công thành mục tiêu ngày cho ngày ${targetDate}!`);
      setPromotingSubtask(null);
    } catch (err) {
      console.error("Failed to promote subtask", err);
      alert(`Có lỗi xảy ra: ${err instanceof Error ? err.message : String(err)}`);
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
      // Removed setIsAddingSchedule(false) to keep the form open as per user request
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
      const parentGoal = goals.find(g => g.id === goalId);
      if (!parentGoal) return;
      const parentWeight = parentGoal.weight || 0;
      const maxAllowed = Math.min(100, parentWeight);

      const parsedWeight = parseFloat(editSubtaskWeight);
      const finalWeight = isNaN(parsedWeight) ? 0 : parsedWeight;

      if (finalWeight < 0) {
        alert("Số điểm không thể nhỏ hơn 0.");
        return;
      }

      if (finalWeight > maxAllowed) {
        alert(`Số điểm của hạng mục con không được vượt quá tổng số điểm dự án (${parentWeight} đ) và không được vượt quá 100 đ.`);
        return;
      }

      await updateDoc(doc(db, `goals/${goalId}/subtasks`, subtaskId), {
        text: editSubtaskText,
        deadline: editSubtaskDeadline || null,
        workloadValue: editSubtaskWorkload ? parseFloat(editSubtaskWorkload) : null,
        workloadUnit: editSubtaskUnit || null,
        weight: finalWeight,
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

  const calculateDayScore = (dateStr: string) => {
    const dailyGoals = goals.filter(g => isGoalInDate(g, dateStr) && (!g.period || g.period === 'day'));
    if (dailyGoals.length === 0) return 0;
    const score = dailyGoals.reduce((sum, g) => {
      const goalProgress = calculateGoalProgress(g);
      return sum + (goalProgress / 100 * (g.weight || 0));
    }, 0);
    return Math.min(100, Math.round(score));
  };

  const calculateOverallProgress = () => {
    return calculateDayScore(selectedDate);
  };

  const getPeriodDays = () => {
    const now = new Date();
    const days: string[] = [];

    if (statsPeriod === 'day') {
      days.push(now.toISOString().split('T')[0]);
      return days;
    }

    if (statsPeriod === 'week') {
      const day = now.getDay();
      const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(now);
      start.setDate(diffToMonday);
      start.setHours(0, 0, 0, 0);
      
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push(d.toISOString().split('T')[0]);
      }
      return days;
    }

    if (statsPeriod === 'month') {
      const year = now.getFullYear();
      const month = now.getMonth();
      const numDays = new Date(year, month + 1, 0).getDate();
      for (let i = 1; i <= numDays; i++) {
        const d = new Date(year, month, i);
        days.push(d.toISOString().split('T')[0]);
      }
      return days;
    }

    if (statsPeriod === 'year') {
      const year = now.getFullYear();
      const startOfYear = new Date(year, 0, 1);
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      const numDays = isLeap ? 366 : 365;
      for (let i = 0; i < numDays; i++) {
        const d = new Date(startOfYear);
        d.setDate(startOfYear.getDate() + i);
        days.push(d.toISOString().split('T')[0]);
      }
      return days;
    }

    return days;
  };

  const getBarChartData = () => {
    const periodDays = getPeriodDays();
    
    if (statsPeriod === 'day') {
      const todayGoals = getFilteredGoals();
      return todayGoals.map(g => ({
        name: g.text.length > 12 ? g.text.substring(0, 10) + '...' : g.text,
        'Đạt được': Math.round(calculateGoalProgress(g) / 100 * g.weight),
        'Tối đa': g.weight
      }));
    }
    
    if (statsPeriod === 'week') {
      return periodDays.map(d => {
        const dateObj = new Date(d);
        const dayLabel = dateObj.toLocaleDateString('vi-VN', { weekday: 'short' });
        return {
          name: dayLabel,
          'Điểm đạt được': calculateDayScore(d),
          'Điểm tối đa': 100
        };
      });
    }
    
    if (statsPeriod === 'month') {
      return periodDays.map(d => {
        const dateObj = new Date(d);
        const dayLabel = `${dateObj.getDate()}`;
        return {
          name: dayLabel,
          'Điểm đạt được': calculateDayScore(d),
          'Điểm tối đa': 100
        };
      });
    }
    
    if (statsPeriod === 'year') {
      const now = new Date();
      const year = now.getFullYear();
      const monthData = [];
      for (let m = 0; m < 12; m++) {
        const dateObj = new Date(year, m, 1);
        const monthLabel = dateObj.toLocaleDateString('vi-VN', { month: 'short' });
        const numDays = new Date(year, m + 1, 0).getDate();
        let monthScore = 0;
        
        for (let i = 1; i <= numDays; i++) {
          const dStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
          monthScore += calculateDayScore(dStr);
        }
        
        const maxMonthScore = numDays * 100;
        monthData.push({
          name: monthLabel,
          'Điểm đạt được': monthScore,
          'Điểm tối đa': maxMonthScore
        });
      }
      return monthData;
    }
    
    return [];
  };

  const overallProgress = calculateOverallProgress();

  const periodDays = getPeriodDays();
  const totalScore = periodDays.reduce((sum, d) => sum + calculateDayScore(d), 0);
  const maxScore = periodDays.length * 100;
  const remainingScore = Math.max(0, maxScore - totalScore);
  const pieData = [
    { name: 'Điểm đạt được', value: totalScore },
    { name: 'Điểm chưa đạt', value: remainingScore }
  ];

  const currentDailyGoals = goals.filter(g => isGoalInDate(g, selectedDate) && (!g.period || g.period === 'day'));
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
      <div className="min-h-screen bg-gradient-to-br from-indigo-50/80 via-sky-50/60 to-amber-50/80 flex items-center justify-center p-6 font-sans relative overflow-hidden">
        {/* Background SVG Grid Pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-30 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <defs>
            <pattern id="dot-pattern" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.5" className="fill-indigo-300" />
            </pattern>
            <linearGradient id="svg-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#dot-pattern)" />
        </svg>

        {/* Ambient SVG Decorative Floating Shapes */}
        <div className="absolute top-10 left-10 w-72 h-72 bg-indigo-400/20 rounded-full blur-[90px] pointer-events-none animate-pulse"></div>
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-amber-300/25 rounded-full blur-[100px] pointer-events-none"></div>
        <div className="absolute top-1/3 right-1/4 w-60 h-60 bg-sky-300/20 rounded-full blur-[80px] pointer-events-none"></div>

        {/* Floating Decorative SVG Accent Items */}
        <motion.div 
          initial={{ y: -10, opacity: 0 }} 
          animate={{ y: [0, -12, 0], opacity: 1 }} 
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-16 left-1/4 hidden md:flex items-center gap-2 bg-white/80 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-lg border border-indigo-100/60 text-xs font-black text-indigo-900 pointer-events-none"
        >
          <span className="text-base">🎯</span> Big 3 Goals
        </motion.div>

        <motion.div 
          initial={{ y: 10, opacity: 0 }} 
          animate={{ y: [0, 12, 0], opacity: 1 }} 
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-20 right-1/4 hidden md:flex items-center gap-2 bg-white/80 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-lg border border-emerald-100/60 text-xs font-black text-emerald-900 pointer-events-none"
        >
          <span className="text-base">⚡</span> 100% Tập trung
        </motion.div>

        {/* Decorative Wave SVG */}
        <svg className="absolute bottom-0 left-0 w-full opacity-20 pointer-events-none" viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg">
          <path fill="#6366f1" fillOpacity="1" d="M0,192L48,197.3C96,203,192,213,288,192C384,171,480,117,576,112C672,107,768,149,864,176C960,203,1056,213,1152,197.3C1248,181,1344,139,1392,117.3L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
        </svg>

        {/* Login Card */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-md w-full bg-white/90 backdrop-blur-xl rounded-[2.5rem] p-8 md:p-10 shadow-2xl shadow-indigo-500/10 text-center border border-white/80 relative z-10"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-100/80 via-indigo-100/80 to-emerald-100/80 px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-indigo-900 mb-6 border border-indigo-200/50 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Năng lượng mới cho mỗi ngày
          </div>

          {/* Logo Icon with SVG decorative ring */}
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute -inset-2 bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400 rounded-[2rem] blur-md opacity-60 animate-pulse"></div>
            <div className="relative w-20 h-20 bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-500 rounded-[1.8rem] flex items-center justify-center shadow-xl shadow-indigo-500/30">
              <Target className="text-white transform hover:rotate-12 transition-transform" size={40} />
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight bg-gradient-to-r from-indigo-900 via-indigo-700 to-slate-900 bg-clip-text text-transparent">
            DayFlow
          </h1>
          <p className="text-slate-600 mb-8 leading-relaxed text-sm md:text-base font-medium px-2">
            Tập trung vào <span className="font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">3 mục tiêu quan trọng nhất</span> mỗi ngày. Bắt đầu hành trình chinh phục ngay bây giờ!
          </p>

          {/* Login Button with Google Logo */}
          <button 
            onClick={login}
            className="w-full bg-gradient-to-r from-indigo-600 via-indigo-600 to-sky-600 text-white py-4 px-6 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 hover:from-indigo-700 hover:to-sky-700 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-xl shadow-indigo-500/25 cursor-pointer group"
          >
            <svg className="w-5 h-5 bg-white p-0.5 rounded-full shrink-0 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span className="[text-shadow:_0_1px_2px_rgba(0,0,0,0.2)]">Đăng nhập với Google</span>
          </button>

          <p className="mt-6 text-[11px] text-slate-400 font-semibold flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
            Đồng bộ dữ liệu an toàn trên đám mây
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1e293b] font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <div className="max-w-3xl mx-auto px-4 py-4 md:px-6 md:py-8">
        {/* Header */}
        <header className="mb-4 md:mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-7 h-7 md:w-9 md:h-9 bg-indigo-600 rounded-lg md:rounded-xl flex items-center justify-center shadow-md shadow-indigo-100">
                <Target className="text-white w-3.5 h-3.5 md:w-5 md:h-5" />
              </div>
              <h1 className="text-lg md:text-xl font-extrabold tracking-tight text-slate-900">DayFlow</h1>
            </div>
            <div className="flex items-center gap-1.5 md:gap-2">
              <button 
                onClick={() => setViewMode('daily')}
                className={`p-1.5 md:p-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${viewMode === 'daily' ? "bg-indigo-600 text-white shadow-lg" : "bg-white text-slate-400 border border-slate-100 hover:bg-slate-50"}`}
                title="Hàng ngày"
              >
                <Home className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                <span className="hidden md:inline font-black text-[10px] md:text-[11px] uppercase tracking-wider">Hàng ngày</span>
              </button>
              <button 
                onClick={() => {
                  setViewMode('major-goals');
                  setAddingSubtaskTo(null);
                  setEditingGoalId(null);
                }}
                className={`p-1.5 md:p-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${viewMode === 'major-goals' ? "bg-indigo-600 text-white shadow-lg" : "bg-white text-slate-400 border border-slate-100 hover:bg-slate-50"}`}
                title="Dự án Tuần / Tháng / Năm"
              >
                <Layers className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                <span className="hidden md:inline font-black text-[10px] md:text-[11px] uppercase tracking-wider">Dự án</span>
              </button>
              <button 
                onClick={() => setViewMode('stats')}
                className={`p-1.5 md:p-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${viewMode === 'stats' ? "bg-indigo-600 text-white shadow-lg" : "bg-white text-slate-400 border border-slate-100 hover:bg-slate-50"}`}
                title="Thống kê"
              >
                <BarChart2 className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                <span className="hidden md:inline font-black text-[10px] md:text-[11px] uppercase tracking-wider">Thống kê</span>
              </button>
              <button 
                onClick={() => setViewMode('calendar')}
                className={`p-1.5 md:p-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${viewMode === 'calendar' ? "bg-indigo-600 text-white shadow-lg" : "bg-white text-slate-400 border border-slate-100 hover:bg-slate-50"}`}
                title="Lịch"
              >
                <Calendar className="w-4 h-4 md:w-[18px] md:h-[18px]" />
                <span className="hidden md:inline font-black text-[10px] md:text-[11px] uppercase tracking-wider">Lịch</span>
              </button>

              <div className="hidden sm:flex flex-col items-end mx-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {selectedDate === new Date().toISOString().split('T')[0] ? "Hôm nay" : "Đang xem"}
                </span>
                <span className="text-sm font-bold text-slate-700">{new Date(selectedDate).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              </div>
              <button 
                onClick={logout}
                className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-red-500 hover:border-red-100 transition-all shadow-sm cursor-pointer"
                title="Đăng xuất"
              >
                <LogOut className="w-[16px] h-[16px] md:w-[18px] md:h-[18px]" />
              </button>
            </div>
          </div>

          {/* Compact Progress Card */}
          <div className="bg-indigo-600 rounded-2xl p-4 md:p-5 shadow-lg shadow-indigo-100/50 text-white relative overflow-hidden">
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="shrink-0">
                <p className="text-indigo-100 text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] mb-0.5 opacity-80">Điểm số trong ngày</p>
                <p className="text-xl md:text-2xl font-black">{Math.round(overallProgress)}/100 <span className="text-indigo-200 text-xs font-bold">Điểm đạt được</span></p>
              </div>
              <div className="flex-grow max-w-md w-full h-2.5 bg-indigo-950/20 rounded-full overflow-hidden backdrop-blur-md p-0.5">
                <motion.div 
                   className="h-full bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.6)]"
                   initial={{ width: 0 }}
                   animate={{ width: `${overallProgress}%` }}
                   transition={{ duration: 1.5, ease: [0.34, 1.56, 0.64, 1] }}
                />
              </div>
            </div>
            <div className="absolute -right-16 -bottom-16 w-36 h-36 bg-indigo-500/20 rounded-full blur-[40px]"></div>
          </div>
        </header>

        {/* Conditional Content based on viewMode */}
        {viewMode === 'daily' ? (
          <div>
            {/* Add Goal Section (Pushed to the very top of the content area) */}
            {loading ? (
              <div className="py-6 flex flex-col items-center justify-center text-slate-300 gap-3">
                <div className="w-6 h-6 border-3 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-center">Đang tải...</p>
              </div>
            ) : currentDailyGoals.length < 3 ? (
              <form onSubmit={addGoal} className="bg-white p-4 md:p-5 rounded-2xl md:rounded-3xl shadow-lg shadow-slate-200/40 border border-slate-100 mb-4 md:mb-5 transform hover:scale-[1.005] transition-transform duration-300">
                <h3 className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-[0.25em] mb-2.5 flex items-center gap-2">
                  <Plus className="text-indigo-600 w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={3} /> Thiết lập Big 3
                </h3>
                <div className="flex flex-col sm:flex-row gap-3 items-stretch">
                  <div className="flex-grow">
                    <input
                      type="text"
                      value={newGoalText}
                      onChange={(e) => setNewGoalText(e.target.value)}
                      placeholder="Mục tiêu lớn nhất hôm nay..."
                      className="w-full bg-slate-50 border-2 border-indigo-100/70 rounded-xl px-4 py-3 md:px-5 md:py-4 text-sm md:text-base font-bold text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 shadow-[0_0_10px_rgba(99,102,241,0.05)] focus:shadow-[0_0_20px_rgba(99,102,241,0.25)] transition-all placeholder:text-slate-300 outline-none"
                    />
                  </div>
                  <div className="flex gap-3 items-center shrink-0">
                    <div className="flex items-center gap-2 bg-slate-50 px-4 py-3 md:px-5 md:py-4 rounded-xl text-slate-500 text-xs md:text-sm font-bold border-2 border-slate-100 focus-within:border-indigo-500 focus-within:shadow-[0_0_15px_rgba(99,102,241,0.2)] focus-within:bg-white transition-all h-full">
                      <Target className="text-indigo-500 w-3.5 h-3.5" />
                      <input 
                        type="number" 
                        value={newGoalWeight}
                        onChange={(e) => setNewGoalWeight(e.target.value)}
                        placeholder="Điểm"
                        className="bg-transparent border-none focus:ring-0 p-0 text-xs md:text-sm font-bold w-10 text-center outline-none"
                      />
                      <span className="text-slate-500 font-bold text-xs">điểm</span>
                    </div>
                    <button
                      type="submit"
                      disabled={!newGoalText.trim()}
                      className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 bg-[#03ad9f] text-white px-5 md:px-7 py-3 md:py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-[#028f83] hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg shadow-[#03ad9f]/30 hover:shadow-[#03ad9f]/50 border border-[#028f83]/30 disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none h-full group cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-teal-100 group-hover:rotate-12 transition-transform" />
                      <span className="[text-shadow:_0_1px_2px_rgba(0,0,0,0.3)]">Bắt đầu</span>
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="bg-indigo-50/50 border border-indigo-100/50 p-3 md:p-4 rounded-xl md:rounded-2xl mb-4 md:mb-5 flex items-center gap-3 text-indigo-900">
                <Target className="text-indigo-600 shrink-0 w-4 h-4 md:w-5 md:h-5" />
                <p className="text-[11px] md:text-xs font-bold leading-relaxed tracking-tight">"Sự tập trung là lời từ chối với hàng nghìn ý tưởng tốt khác." - Hãy hoàn thành 3 mục tiêu này!</p>
              </div>
            )}

            {/* Date Navigation for Daily View */}
            <div className="flex items-center justify-between mb-4 bg-white p-2.5 rounded-xl md:rounded-2xl border border-slate-100 shadow-sm">
              <button 
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() - 1);
                  setSelectedDate(d.toISOString().split('T')[0]);
                }}
                className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-all"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex items-center gap-2">
                <CalendarIcon size={16} className="text-indigo-500" />
                <span className="font-black text-xs md:text-sm text-slate-700 tracking-tight">
                  {new Date(selectedDate).toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <button 
                onClick={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() + 1);
                  setSelectedDate(d.toISOString().split('T')[0]);
                }}
                className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-all"
              >
                <ChevronRight size={18} />
              </button>
            </div>

        {/* Goals List */}
        <div className="space-y-6 md:space-y-8">
          {/* Backlog Section */}
          {(() => {
            const backlogGoals = goals.filter(g => {
              if (g.completed) return false;
              if (g.period && g.period !== 'day') return false;
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
                className="bg-amber-50/50 border-2 border-amber-100/50 rounded-2xl p-4 mb-5"
              >
                <div 
                  onClick={() => setIsBacklogExpanded(!isBacklogExpanded)}
                  className="flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center gap-2 md:gap-3">
                    <AlertCircle className="text-amber-500 w-4.5 h-4.5 shrink-0" />
                    <h3 className="text-[11px] md:text-xs font-black text-amber-700 uppercase tracking-widest flex items-center gap-1.5 select-none">
                      Mục tiêu tồn đọng 
                      <span className="bg-amber-100/80 text-amber-700 px-2 py-0.5 rounded-full text-[9px] font-black">
                        {backlogGoals.length}
                      </span>
                    </h3>
                  </div>
                  <div className="text-amber-600 group-hover:text-amber-700 transition-colors p-1">
                    {isBacklogExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                <AnimatePresence>
                  {isBacklogExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0, marginTop: 0 }}
                      animate={{ height: "auto", opacity: 1, marginTop: 12 }}
                      exit={{ height: 0, opacity: 0, marginTop: 0 }}
                      className="overflow-hidden space-y-3"
                    >
                      {backlogGoals.map(goal => {
                        const isExpanded = expandedGoalId === goal.id;
                        return (
                          <div key={goal.id} className="bg-white/60 rounded-xl border border-amber-100 shadow-sm overflow-hidden transition-all">
                            <div 
                              onClick={() => setExpandedGoalId(isExpanded ? null : goal.id)}
                              className="flex items-center justify-between p-3 cursor-pointer hover:bg-amber-50/30 transition-colors"
                            >
                              <div className="flex items-center gap-2 overflow-hidden flex-grow min-w-0 pr-2">
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs md:text-sm font-bold text-slate-700 truncate">{goal.text}</span>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[8px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-bold shrink-0">{goal.date}</span>
                                    {goal.subtasks && goal.subtasks.length > 0 && (
                                      <span className="text-[8px] text-slate-400 font-bold">
                                        {goal.subtasks.filter((s: any) => s.completed).length}/{goal.subtasks.length} hạng mục
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2 shrink-0">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveGoalToCurrentDate(goal.id);
                                  }}
                                  className="flex items-center gap-1 bg-amber-500 text-white px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-amber-600 transition-all shadow-sm shadow-amber-200 shrink-0"
                                  title="Chuyển sang hôm nay"
                                >
                                  <CalendarIcon size={10} />
                                  <span className="hidden sm:inline">Chuyển sang hôm nay</span>
                                  <span className="sm:hidden">Hôm nay</span>
                                </button>
                                <div className="text-slate-400 p-0.5">
                                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </div>
                              </div>
                            </div>

                            {/* Expanded details */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="bg-amber-50/20 border-t border-amber-100/50 p-3 space-y-2.5"
                                >
                                  {goal.deadline && (
                                    <div className="flex items-center gap-1.5 text-[8px] font-black text-amber-600 uppercase tracking-widest w-fit bg-amber-100/30 px-2 py-0.5 rounded-full">
                                      <Clock size={9} />
                                      <span>Hạn chót: {new Date(goal.deadline).toLocaleString('vi-VN', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                  )}
                                  
                                  {goal.subtasks && goal.subtasks.length > 0 ? (
                                    <div className="space-y-2">
                                      <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Danh sách hạng mục:</h4>
                                      {goal.subtasks.map((sub: any) => (
                                        <div key={sub.id} className="flex items-center gap-2.5 bg-white/80 p-2 rounded-lg border border-slate-100 text-[11px]">
                                          <button 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleSubtask(goal.id, sub.id, sub.completed);
                                            }} 
                                            className={`transform active:scale-75 transition-all shrink-0 ${sub.completed ? "text-emerald-500" : "text-slate-300 hover:text-emerald-400"}`}
                                          >
                                            {sub.completed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                                          </button>
                                          <span className={`font-bold ${sub.completed ? "text-slate-400 line-through" : "text-slate-700"}`}>
                                            {sub.text}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-[9px] text-slate-400 italic">Mục tiêu này chưa có hạng mục chi tiết.</p>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
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
                                <Target size={12} className="text-indigo-500" />
                                <input 
                                  type="number" 
                                  value={editGoalWeight}
                                  onChange={(e) => setEditGoalWeight(e.target.value)}
                                  className="bg-transparent border-none focus:ring-0 p-0 text-[10px] md:text-xs font-bold w-12"
                                />
                                <span>điểm</span>
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
                            <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl text-slate-700 border-2 border-transparent focus-within:border-indigo-100 transition-all" title={`Tối đa ${Math.min(100, goal.weight || 100)} điểm`}>
                              <Target className="text-indigo-500 w-4 h-4 md:w-[18px] md:h-[18px]" />
                              <input type="number" placeholder={`Điểm (tối đa ${Math.min(100, goal.weight || 100)})`} value={subtaskWeight} onChange={(e) => setSubtaskWeight(e.target.value)} className="bg-transparent border-none w-full focus:ring-0 p-0 font-bold text-sm md:text-base" min="0" max={Math.min(100, goal.weight || 100)}/>
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
                                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl text-slate-700 border border-slate-100" title={`Tối đa ${Math.min(100, goal.weight || 100)} điểm`}>
                                    <Target size={14} className="text-indigo-500" />
                                    <input type="number" value={editSubtaskWeight} onChange={(e) => setEditSubtaskWeight(e.target.value)} className="bg-transparent border-none w-full focus:ring-0 p-0 font-bold text-xs" placeholder={`Điểm (tối đa ${Math.min(100, goal.weight || 100)})`}/>
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
                                  <p className={`font-bold text-sm md:text-lg tracking-tight truncate-mobile ${sub.completed ? "text-slate-300 line-through font-normal" : "text-slate-700"}`}>{sub.text}</p>
                                  {(sub.weight > 0 || sub.workloadValue || sub.deadline) && (
                                    <div className="flex flex-wrap gap-2 md:gap-4 mt-1">
                                      {sub.weight > 0 && (
                                        <div className="flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                                          <Target size={8} className="text-indigo-500" /> {sub.weight} đ
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
              <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden">
                {currentDailySchedules.map((item, index) => (
                  <motion.div 
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`relative flex items-center gap-4 md:gap-8 p-5 md:p-6 transition-all ${index !== currentDailySchedules.length - 1 ? "border-b border-slate-50" : ""} ${item.completed ? "bg-emerald-50/20" : "hover:bg-slate-50/50"} group`}
                  >
                    {/* Checkbox / Bullet */}
                    <button 
                      onClick={() => toggleScheduleItem(item.id, item.completed)}
                      className={`z-10 w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center transition-all shrink-0 ${item.completed ? "bg-emerald-500 text-white shadow-lg shadow-emerald-100" : "bg-slate-50 text-slate-300 border border-slate-100 hover:bg-indigo-50 hover:text-indigo-500"}`}
                    >
                      {item.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                    </button>

                    <div className="flex-grow flex items-center justify-between gap-4">
                      {editingScheduleId === item.id ? (
                        <div className="flex-grow flex flex-col md:flex-row gap-3">
                          <input 
                            type="text" 
                            value={editActivity}
                            onChange={(e) => setEditActivity(e.target.value)}
                            className="flex-grow bg-slate-50 border border-indigo-100 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Tên hoạt động..."
                          />
                          <div className="flex gap-2">
                            <input 
                              type="time" 
                              value={editStartTime}
                              onChange={(e) => setEditStartTime(e.target.value)}
                              className="bg-slate-50 border border-indigo-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <input 
                              type="time" 
                              value={editEndTime}
                              onChange={(e) => setEditEndTime(e.target.value)}
                              className="bg-slate-50 border border-indigo-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={updateScheduleItem}
                              className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700"
                            >
                              Lưu
                            </button>
                            <button 
                              onClick={cancelEditSchedule}
                              className="bg-slate-100 text-slate-500 px-4 py-2 rounded-xl text-sm font-black hover:bg-slate-200"
                            >
                              Hủy
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <h4 className={`text-sm md:text-lg font-black tracking-tight ${item.completed ? "text-slate-400 line-through font-bold" : "text-slate-900"}`}>
                              {item.activity}
                            </h4>
                            <div className="flex items-center gap-2 text-[10px] md:text-xs font-black text-indigo-500 uppercase tracking-widest">
                              <Clock size={12} />
                              <span>{item.startTime} - {item.endTime}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => startEditSchedule(item)}
                              className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-indigo-500 transition-all"
                              title="Chỉnh sửa"
                            >
                              <Edit3 size={18} />
                            </button>
                            <button 
                              onClick={() => deleteScheduleItem(item.id)}
                              className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-500 transition-all"
                              title="Xóa"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    ) : viewMode === 'major-goals' ? (
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Page Header */}
        <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-slate-100 shadow-xl shadow-slate-200/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Layers className="text-indigo-600 w-5 h-5 md:w-6 md:h-6" /> Dự án kỳ hạn
            </h2>
            <p className="text-slate-400 text-xs font-bold mt-1">Định hướng tầm nhìn dự án cho tuần, tháng và năm</p>
          </div>

          {/* Period Tabs inside header card for tighter integration */}
          <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl md:rounded-2xl shrink-0">
            {(['week', 'month', 'year'] as const).map((period) => {
              const label = period === 'week' ? 'Tuần này' : period === 'month' ? 'Tháng này' : 'Năm nay';
              const isActive = majorGoalsPeriod === period;
              return (
                <button
                  key={period}
                  onClick={() => {
                    setMajorGoalsPeriod(period);
                    setAddingSubtaskTo(null);
                    setEditingGoalId(null);
                  }}
                  className={`px-3 py-1.5 md:px-5 md:py-2.5 rounded-lg md:rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${
                    isActive 
                      ? 'bg-white text-indigo-600 shadow-sm font-extrabold' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Goals Section for current period */}
        {(() => {
          const periodDate = majorGoalsPeriod === 'week' ? getWeekStartDate(selectedDate) :
                             majorGoalsPeriod === 'month' ? getMonthStartDate(selectedDate) :
                             getYearStartDate(selectedDate);
          const periodGoals = goals.filter(g => g.period === majorGoalsPeriod && g.date === periodDate);
          const label = majorGoalsPeriod === 'week' ? `Tuần hiện tại (bắt đầu từ ${periodDate})` :
                        majorGoalsPeriod === 'month' ? `Tháng hiện tại (${periodDate.substring(0, 7)})` :
                        `Năm hiện tại (${periodDate.substring(0, 4)})`;

          return (
            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{label}</span>
                <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">{periodGoals.length} / 3 dự án</span>
              </div>

              {/* Add Goal Form if < 3 */}
              {periodGoals.length < 3 ? (
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newMajorGoalText.trim()) return;
                    await addMajorGoal(majorGoalsPeriod, newMajorGoalText, newMajorGoalDeadline, newMajorGoalWeight);
                    setNewMajorGoalText("");
                    setNewMajorGoalDeadline("");
                  }}
                  className="bg-white rounded-3xl p-5 md:p-6 border border-slate-100 shadow-xl shadow-slate-200/20 space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-indigo-500 animate-spin" style={{ animationDuration: '6s' }} />
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                      Thêm dự án {majorGoalsPeriod === 'week' ? 'tuần' : majorGoalsPeriod === 'month' ? 'tháng' : 'năm'} mới ({periodGoals.length}/3)
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={newMajorGoalText}
                      onChange={(e) => setNewMajorGoalText(e.target.value)}
                      placeholder={`Dự án ${majorGoalsPeriod === 'week' ? 'tuần' : majorGoalsPeriod === 'month' ? 'tháng' : 'năm'} tiếp theo...`}
                      className="flex-grow bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                    />
                    <div className="flex gap-2">
                      <div 
                        className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl text-slate-500 text-xs font-bold border border-slate-100 focus-within:border-indigo-500 transition-all"
                        title={`Số điểm linh hoạt từ 0 đến ${getPeriodDaysCount(majorGoalsPeriod, selectedDate) * 100} điểm`}
                      >
                        <Target className="text-indigo-500 w-3.5 h-3.5" />
                        <input 
                          type="number" 
                          value={newMajorGoalWeight}
                          onChange={(e) => setNewMajorGoalWeight(e.target.value)}
                          placeholder="Điểm"
                          min="0"
                          max={getPeriodDaysCount(majorGoalsPeriod, selectedDate) * 100}
                          className="bg-transparent border-none focus:ring-0 p-0 text-xs font-bold w-12 text-center outline-none"
                        />
                        <span className="text-slate-400 text-xs">/{getPeriodDaysCount(majorGoalsPeriod, selectedDate) * 100} đ</span>
                      </div>
                      <button
                        type="submit"
                        disabled={!newMajorGoalText.trim()}
                        className="bg-indigo-600 text-white px-5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                      >
                        Thêm
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-center">
                  <p className="text-xs font-bold text-amber-700 flex items-center justify-center gap-1.5">
                    <AlertCircle size={14} /> Bạn đã đặt tối đa 3 dự án cho {majorGoalsPeriod === 'week' ? 'tuần' : majorGoalsPeriod === 'month' ? 'tháng' : 'năm'} này.
                  </p>
                </div>
              )}

              {/* Goals List */}
              <div className="space-y-4">
                {periodGoals.length === 0 ? (
                  <div className="bg-white rounded-3xl border border-dashed border-slate-200 py-12 text-center text-slate-400">
                    <p className="text-sm font-bold">Chưa có dự án nào được khởi tạo cho kỳ này.</p>
                    <p className="text-xs mt-1">Hãy bắt đầu thiết lập dự án mới để định hướng và theo dõi tiến độ!</p>
                  </div>
                ) : (
                  periodGoals.map((goal) => {
                    const isExpanded = expandedGoalId === goal.id;
                    const maxWeightVal = getPeriodDaysCount(goal.period || 'week', goal.date || selectedDate) * 100;
                    return (
                      <div 
                        key={goal.id}
                        className={`bg-white rounded-3xl border border-slate-100 p-6 shadow-xl shadow-slate-200/20 transition-all duration-300 ${
                          isExpanded ? "ring-4 ring-indigo-500/5 border-indigo-100" : ""
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          {/* Checkbox circle with percentage */}
                          <div className="mt-0.5 flex-shrink-0 cursor-pointer" onClick={() => toggleGoal(goal.id, goal.completed)}>
                            <div className="w-10 h-10 flex items-center justify-center relative">
                              <svg className="w-full h-full transform -rotate-90">
                                <circle cx="50%" cy="50%" r="40%" className="stroke-slate-100 fill-none" strokeWidth="8%" />
                                <motion.circle
                                  cx="50%"
                                  cy="50%"
                                  r="40%"
                                  className={`${goal.completed ? "stroke-emerald-500" : "stroke-indigo-600"} fill-none`}
                                  strokeWidth="8%"
                                  strokeLinecap="round"
                                  initial={{ pathLength: 0 }}
                                  animate={{ pathLength: calculateGoalProgress(goal) / 100 }}
                                  transition={{ duration: 1 }}
                                />
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className={`text-[8px] font-black ${goal.completed ? "text-emerald-600" : "text-indigo-600"}`}>
                                  {Math.round(calculateGoalProgress(goal))}%
                                </span>
                              </div>
                              {goal.completed && (
                                <div className="absolute -top-1 -right-1 bg-emerald-500 text-white p-0.5 rounded-full border border-white">
                                  <Check size={6} strokeWidth={4} />
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Goal Text / Edit field */}
                          <div className="flex-grow min-w-0">
                            {editingGoalId === goal.id ? (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={editGoalText}
                                  onChange={(e) => setEditGoalText(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-900 focus:outline-none"
                                  autoFocus
                                />
                                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 w-fit">
                                  <Target size={12} className="text-indigo-500" />
                                  <input 
                                    type="number" 
                                    value={editGoalWeight}
                                    onChange={(e) => setEditGoalWeight(e.target.value)}
                                    className="bg-transparent border-none focus:ring-0 p-0 text-xs font-bold w-12 text-center outline-none"
                                    min="0"
                                    max={maxWeightVal}
                                  />
                                  <span className="text-slate-400 text-xs">/{maxWeightVal} đ</span>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => saveEditGoal(goal.id)} className="bg-indigo-600 text-white px-3 py-1 rounded-lg text-[10px] font-bold cursor-pointer">Lưu</button>
                                  <button onClick={() => setEditingGoalId(null)} className="bg-slate-200 text-slate-600 px-3 py-1 rounded-lg text-[10px] font-bold cursor-pointer">Hủy</button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <h3 className={`text-sm md:text-base font-black leading-snug break-words ${goal.completed ? "text-slate-300 line-through font-medium" : "text-slate-900"}`}>
                                  {goal.text}
                                </h3>
                                <div className="flex items-center gap-3 mt-1.5 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                                  <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full text-[8px] font-black">{goal.weight} điểm</span>
                                  <span>{goal.subtasks?.length || 0} hạng mục</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Action Buttons */}
                          {editingGoalId !== goal.id && (
                            <div className="flex gap-1.5 shrink-0">
                              <button 
                                onClick={() => {
                                  setEditingGoalId(goal.id);
                                  setEditGoalText(goal.text);
                                  setEditGoalWeight(goal.weight?.toString() || "");
                                  setEditGoalDate(goal.date);
                                }}
                                className="p-1 bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg border border-slate-100 transition-colors cursor-pointer"
                              >
                                <Edit3 size={12} />
                              </button>
                              <button 
                                onClick={() => setExpandedGoalId(isExpanded ? null : goal.id)}
                                className={`p-1 rounded-lg border transition-all cursor-pointer ${
                                  isExpanded ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100"
                                }`}
                              >
                                <Layers size={12} />
                              </button>
                              <button 
                                onClick={() => deleteGoal(goal.id)}
                                className="p-1 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg border border-slate-100 transition-colors cursor-pointer"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Subtasks under the Goal */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden mt-4 pt-4 border-t border-slate-100 space-y-3"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                  <Layers size={10} className="text-indigo-500" /> Hạng mục chi tiết
                                </span>
                                <button
                                  onClick={() => setAddingSubtaskTo(addingSubtaskTo === goal.id ? null : goal.id)}
                                  className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer"
                                >
                                  {addingSubtaskTo === goal.id ? 'Đóng' : '+ Thêm mới'}
                                </button>
                              </div>

                              {/* Add subtask inline input */}
                              {addingSubtaskTo === goal.id && (
                                <div className="bg-slate-50 p-3 rounded-xl border border-indigo-50 space-y-3">
                                  <input
                                    type="text"
                                    value={subtaskText}
                                    onChange={(e) => setSubtaskText(e.target.value)}
                                    placeholder="Tên hạng mục..."
                                    className="w-full font-bold text-slate-900 border-none bg-white rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-100 outline-none font-sans"
                                  />
                                  <div className="flex gap-2">
                                    <div className="flex items-center gap-1 bg-white px-2.5 py-1.5 rounded-lg border border-slate-100 text-slate-500 text-[10px] font-bold flex-1">
                                      <Target size={12} className="text-indigo-500" />
                                      <input 
                                        type="number" 
                                        placeholder={`Điểm (tối đa ${Math.min(100, goal.weight || 100)})`}
                                        value={subtaskWeight} 
                                        onChange={(e) => setSubtaskWeight(e.target.value)} 
                                        className="bg-transparent border-none w-full focus:ring-0 p-0 text-[10px] font-bold outline-none font-sans"
                                        min="0"
                                        max={Math.min(100, goal.weight || 100)}
                                      />
                                    </div>
                                    <button 
                                      onClick={() => addSubtask(goal.id, true)}
                                      className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-indigo-700 transition-all cursor-pointer"
                                    >
                                      Thêm
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Subtasks List */}
                              <div className="space-y-2">
                                {!goal.subtasks || goal.subtasks.length === 0 ? (
                                  <p className="text-[10px] text-slate-400 italic py-1">Chưa có hạng mục con nào.</p>
                                ) : (
                                  goal.subtasks.map((sub) => {
                                    const linkedGoal = sub.linkedDailyGoalId ? goals.find(g => g.id === sub.linkedDailyGoalId) : null;
                                    return (
                                      <div key={sub.id} className="flex items-center justify-between bg-slate-50/50 p-2.5 rounded-xl border border-slate-100/50 hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-2 flex-grow min-w-0 pr-2">
                                          <button 
                                            onClick={() => toggleSubtask(goal.id, sub.id, sub.completed)}
                                            className={`transform active:scale-75 transition-all shrink-0 cursor-pointer ${sub.completed ? "text-emerald-500" : "text-slate-300 hover:text-emerald-400"}`}
                                          >
                                            {sub.completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                                          </button>
                                          <span className={`text-xs font-bold truncate ${sub.completed ? "text-slate-300 line-through font-normal" : "text-slate-700"}`}>
                                            {sub.text}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          {sub.weight > 0 && (
                                            <span className="text-[8px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider">{sub.weight} đ</span>
                                          )}
                                          {linkedGoal && (
                                            <span 
                                              className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-black flex items-center gap-1 shrink-0 font-sans cursor-default"
                                              title={`Mục tiêu ngày: ${linkedGoal.date}`}
                                            >
                                              <CalendarIcon size={9} />
                                              <span>{getFormattedDate(linkedGoal.date)}</span>
                                            </span>
                                          )}
                                          <button 
                                            onClick={() => setPromotingSubtask({ goalId: goal.id, sub, parentGoal: goal })}
                                            className={`p-0.5 cursor-pointer transition-colors ${linkedGoal ? "text-indigo-600 hover:text-indigo-800" : "text-slate-300 hover:text-indigo-600"}`}
                                            title={linkedGoal ? `Đã lên lịch ngày ${getFormattedDate(linkedGoal.date)}. Nhấp để xếp lại lịch.` : "Xếp lịch (Chuyển thành mục tiêu ngày)"}
                                          >
                                            <CalendarIcon size={11} />
                                          </button>
                                          <button 
                                            onClick={() => deleteSubtask(goal.id, sub.id)}
                                            className="text-slate-300 hover:text-red-500 p-0.5 cursor-pointer"
                                          >
                                            <Trash2 size={10} />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })()}
      </motion.div>
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
                    Điểm số {statsPeriod === 'day' ? 'Hôm nay' : statsPeriod === 'week' ? 'Trong tuần' : statsPeriod === 'month' ? 'Trong tháng' : 'Trong năm'}
                  </h3>
                  <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">Dựa trên điểm số tích lũy</p>
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
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        <Cell fill="#03ad9f" stroke="none" />
                        <Cell fill="#F1F5F9" stroke="none" />
                      </Pie>
                      <Tooltip formatter={(value) => [`${value} điểm`]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                    <span className="text-2xl md:text-3xl font-black text-slate-900">
                      {totalScore}/{maxScore}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Điểm số</span>
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
                        <span>Điểm số: {goal.weight} điểm</span>
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
                   <Target size={20} /> Biểu đồ điểm số ({statsPeriod === 'day' ? 'Hôm nay' : statsPeriod === 'week' ? 'Tuần này' : statsPeriod === 'month' ? 'Tháng này' : 'Năm nay'})
                 </h4>
                 <div className="h-64">
                   <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={getBarChartData()}>
                       <XAxis dataKey="name" stroke="#818CF8" fontSize={10} />
                       <YAxis stroke="#818CF8" fontSize={10} />
                       <Tooltip 
                         cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} 
                         contentStyle={{ backgroundColor: '#1E1B4B', border: 'none', borderRadius: '12px', fontSize: '12px' }}
                         formatter={(value, name, props) => {
                           const maxVal = props.payload['Điểm tối đa'] || props.payload['Tối đa'] || 100;
                           return [`${value} / ${maxVal} điểm`, name];
                         }}
                       />
                       <Bar 
                         dataKey={statsPeriod === 'day' ? "Đạt được" : "Điểm đạt được"} 
                         fill="#03ad9f" 
                         radius={[6, 6, 0, 0]} 
                         barSize={24} 
                       />
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
            className="bg-white rounded-2xl p-4 md:p-6 border border-slate-100 shadow-xl shadow-slate-200/40"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl">
                  <Calendar size={20} />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-extrabold text-slate-900 tracking-tight">Lịch trình</h3>
                  <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">
                    {calendarMonth.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button 
                  onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                  className="p-1.5 hover:bg-slate-50 rounded-lg border border-slate-100 text-slate-400 transition-all"
                >
                  <ChevronLeft size={16} />
                </button>
                <button 
                   onClick={() => setCalendarMonth(new Date())}
                   className="px-3 py-1.5 hover:bg-slate-50 rounded-lg border border-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-400 transition-all"
                >
                  Hôm nay
                </button>
                <button 
                  onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                  className="p-1.5 hover:bg-slate-50 rounded-lg border border-slate-100 text-slate-400 transition-all"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 mb-2">
              {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
                <div key={d} className="text-center text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">{d}</div>
              ))}
              {Array.from({ length: (new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() || 7) - 1 }).map((_, i) => (
                <div key={`empty-${i}`} className="h-10 md:h-14"></div>
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
                    className={`h-10 md:h-14 border border-slate-50 relative flex flex-col items-center justify-center transition-all group overflow-hidden ${
                      isSelected ? "bg-indigo-50/50" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className={`text-xs md:text-sm font-black transition-all ${
                      isToday ? "text-indigo-600" : isSelected ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"
                    }`}>
                      {day}
                    </span>
                    {isToday && <div className="w-1 h-1 bg-indigo-600 rounded-full mt-0.5"></div>}
                    <div className="mt-1 flex gap-0.5">
                      {dayGoals.map((g, idx) => (
                        <div key={idx} className={`w-1 h-1 rounded-full ${g.completed ? "bg-emerald-500" : "bg-indigo-300"}`}></div>
                      ))}
                    </div>
                    {isSelected && <div className="absolute left-0 top-0 w-0.5 h-full bg-indigo-600"></div>}
                  </button>
                );
              })}
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              <div className="flex gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-indigo-300 rounded-full"></div>
                  <span>Đang thực hiện</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
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

          {promotingSubtask && (
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
                className="bg-white rounded-[2rem] p-6 md:p-8 max-w-md w-full shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto"
              >
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                  <CalendarIcon className="text-indigo-600" size={32} />
                </div>
                
                <h3 className="text-xl font-black text-slate-900 text-center mb-1">
                  Sắp xếp ngày thực hiện
                </h3>
                <p className="text-slate-400 text-xs text-center font-bold uppercase tracking-widest mb-6 font-sans">
                  Chuyển hạng mục con thành mục tiêu ngày
                </p>

                <div className="bg-slate-50 rounded-2xl p-4 mb-6 space-y-2 text-left">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block font-sans">Mục tiêu gốc</span>
                    <span className="text-xs font-bold text-slate-500">{promotingSubtask.parentGoal.text}</span>
                  </div>
                  <div className="border-t border-slate-100 pt-2">
                    <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider block font-sans">Hạng mục con cần chuyển</span>
                    <span className="text-sm font-extrabold text-slate-800">{promotingSubtask.sub.text}</span>
                  </div>
                </div>

                <div className="mb-6">
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider text-left mb-3 font-sans">
                    Chọn một ngày trong tuần ({getWeekStartDate(promotingSubtask.parentGoal.date)} - {(() => {
                      const d = new Date(getWeekStartDate(promotingSubtask.parentGoal.date));
                      d.setDate(d.getDate() + 6);
                      return d.toISOString().split('T')[0];
                    })()})
                  </h4>
                  
                  <div className="grid grid-cols-1 gap-2 max-h-[240px] overflow-y-auto pr-1">
                    {getDaysOfWeek(getWeekStartDate(promotingSubtask.parentGoal.date)).map((day) => {
                      const dayGoalsCount = goals.filter(g => isGoalInDate(g, day.date) && (!g.period || g.period === 'day')).length;
                      const isFull = dayGoalsCount >= 3;
                      
                      return (
                        <button
                          key={day.date}
                          disabled={isFull}
                          onClick={() => executePromoteSubtaskToDailyGoal(promotingSubtask.goalId, promotingSubtask.sub, day.date)}
                          className={`p-3.5 rounded-xl text-left border transition-all flex items-center justify-between ${
                            isFull 
                              ? "bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed text-slate-400" 
                              : "border-slate-100 hover:border-indigo-600 hover:bg-indigo-50/10 cursor-pointer text-slate-800"
                          }`}
                        >
                          <div className="text-left">
                            <span className="text-xs font-black block">{day.label}</span>
                            <span className="text-[10px] font-bold text-slate-400">{day.date}</span>
                          </div>
                          <div className="text-right shrink-0">
                            {isFull ? (
                              <span className="text-[9px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-black uppercase tracking-wider font-sans">Đầy (3/3)</span>
                            ) : (
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider font-sans ${
                                dayGoalsCount === 0 
                                  ? "bg-emerald-50 text-emerald-600" 
                                  : "bg-indigo-50 text-indigo-600"
                              }`}>
                                {dayGoalsCount}/3 mục tiêu
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={() => setPromotingSubtask(null)}
                    className="w-full bg-white text-slate-400 py-4 rounded-xl font-black uppercase tracking-widest text-xs border border-slate-100 hover:bg-slate-50 transition-all font-sans cursor-pointer"
                  >
                    Hủy bỏ
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
