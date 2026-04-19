import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

const db = new Database("tasks.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    deadline DATETIME,
    completed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sub_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    deadline DATETIME,
    workload_value REAL,
    workload_unit TEXT,
    completed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/goals", (req, res) => {
    try {
      const goals = db.prepare("SELECT * FROM goals ORDER BY created_at DESC").all();
      const goalsWithSubtasks = goals.map(goal => {
        const subtasks = db.prepare("SELECT * FROM sub_tasks WHERE goal_id = ?").all(goal.id);
        return { ...goal, subtasks };
      });
      res.json(goalsWithSubtasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch goals" });
    }
  });

  app.post("/api/goals", (req, res) => {
    const { text, deadline } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });
    
    try {
      // Check limit for today
      const today = new Date().toISOString().split('T')[0];
      const count = db.prepare("SELECT COUNT(*) as total FROM goals WHERE date(created_at) = date('now')").get().total;
      
      if (count >= 3) {
        return res.status(400).json({ error: "Bạn chỉ nên đặt tối đa 3 mục tiêu lớn mỗi ngày." });
      }

      const info = db.prepare("INSERT INTO goals (text, deadline) VALUES (?, ?)").run(text, deadline);
      const newGoal = db.prepare("SELECT * FROM goals WHERE id = ?").get(info.lastInsertRowid);
      res.status(201).json({ ...newGoal, subtasks: [] });
    } catch (error) {
      res.status(500).json({ error: "Failed to create goal" });
    }
  });

  app.post("/api/sub_tasks", (req, res) => {
    const { goal_id, text, deadline, workload_value, workload_unit } = req.body;
    try {
      const info = db.prepare("INSERT INTO sub_tasks (goal_id, text, deadline, workload_value, workload_unit) VALUES (?, ?, ?, ?, ?)")
        .run(goal_id, text, deadline, workload_value, workload_unit);
      const newSubtask = db.prepare("SELECT * FROM sub_tasks WHERE id = ?").get(info.lastInsertRowid);
      res.status(201).json(newSubtask);
    } catch (error) {
      res.status(500).json({ error: "Failed to create sub-task" });
    }
  });

  app.patch("/api/goals/:id", (req, res) => {
    const { id } = req.params;
    const { completed, text, deadline } = req.body;
    try {
      if (text !== undefined) db.prepare("UPDATE goals SET text = ? WHERE id = ?").run(text, id);
      if (completed !== undefined) db.prepare("UPDATE goals SET completed = ? WHERE id = ?").run(completed ? 1 : 0, id);
      if (deadline !== undefined) db.prepare("UPDATE goals SET deadline = ? WHERE id = ?").run(deadline, id);
      
      const updatedGoal = db.prepare("SELECT * FROM goals WHERE id = ?").get(id);
      const subtasks = db.prepare("SELECT * FROM sub_tasks WHERE goal_id = ?").all(id);
      res.json({ ...updatedGoal, subtasks });
    } catch (error) {
      res.status(500).json({ error: "Failed to update goal" });
    }
  });

  app.patch("/api/sub_tasks/:id", (req, res) => {
    const { id } = req.params;
    const { completed } = req.body;
    try {
      db.prepare("UPDATE sub_tasks SET completed = ? WHERE id = ?").run(completed ? 1 : 0, id);
      const updatedSubtask = db.prepare("SELECT * FROM sub_tasks WHERE id = ?").get(id);
      res.json(updatedSubtask);
    } catch (error) {
      res.status(500).json({ error: "Failed to update sub-task" });
    }
  });

  app.delete("/api/goals/:id", (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("DELETE FROM goals WHERE id = ?").run(id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete goal" });
    }
  });

  app.delete("/api/sub_tasks/:id", (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("DELETE FROM sub_tasks WHERE id = ?").run(id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete sub-task" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
