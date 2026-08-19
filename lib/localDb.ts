import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

let db: any = null;
let useFallback = false;
let inMemoryPosts: any[] = [];
let inMemoryTests: Record<string, any> = {};
let inMemoryProgress: Record<string, any> = {};

try {
  const SQLite = require('expo-sqlite');
  db = SQLite.openDatabaseSync('kanelflow.db');
  
  // 1. Messages / Community Posts table & Indexes
  db.execSync(`
    CREATE TABLE IF NOT EXISTS community_posts (
      id TEXT PRIMARY KEY,
      author_id TEXT,
      author_name TEXT,
      category TEXT,
      text TEXT,
      created_at TEXT,
      likes INTEGER,
      comments TEXT,
      liked INTEGER,
      liked_by TEXT,
      viewed_by_count INTEGER,
      media_url TEXT,
      media_local_path TEXT,
      file_url TEXT,
      file_name TEXT,
      target_batches TEXT,
      author_avatar TEXT,
      is_edited INTEGER
    );
  `);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_posts_author ON community_posts(author_id);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_posts_created ON community_posts(created_at);`);

  // Ensure media_local_path column exists for existing tables
  try {
    db.execSync(`ALTER TABLE community_posts ADD COLUMN media_local_path TEXT;`);
  } catch (e) {
    // Column already exists, ignore
  }

  // 2. Local Tests Table (NoSQL JSONB payload cache for 0ms test start)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS local_tests (
      test_id TEXT PRIMARY KEY,
      title TEXT,
      subject TEXT,
      batch_name TEXT,
      data_json TEXT,
      is_completed INTEGER DEFAULT 0,
      updated_at TEXT
    );
  `);

  // 3. Test Progress Table (Local ACID attempt buffer before Supabase sync)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS test_progress (
      test_id TEXT PRIMARY KEY,
      student_id TEXT,
      answers_json TEXT,
      time_logs_json TEXT,
      score INTEGER,
      total_questions INTEGER,
      synced INTEGER DEFAULT 0,
      updated_at TEXT
    );
  `);

  // 4. AI Chat History Table (stores chat messages up to 30 days)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS ai_chat_history (
      id TEXT PRIMARY KEY,
      chat_id TEXT,
      role TEXT,
      text TEXT,
      test_data_json TEXT,
      created_at TEXT
    );
  `);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_chat_session ON ai_chat_history(chat_id);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_chat_created ON ai_chat_history(created_at);`);

  // 5. Peer Chat Messages Table (local cache for WhatsApp architecture)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS local_peer_messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT,
      receiver_id TEXT,
      text TEXT,
      created_at TEXT,
      is_read INTEGER DEFAULT 0,
      delivered INTEGER DEFAULT 0
    );
  `);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_peer_msg_sender ON local_peer_messages(sender_id);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_peer_msg_receiver ON local_peer_messages(receiver_id);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_peer_msg_created ON local_peer_messages(created_at);`);

  // Ensure new columns exist for local_peer_messages (Migrations)
  try { db.execSync(`ALTER TABLE local_peer_messages ADD COLUMN delivered INTEGER DEFAULT 0;`); } catch (e) {}
  try { db.execSync(`ALTER TABLE local_peer_messages ADD COLUMN reply_to_id TEXT DEFAULT NULL;`); } catch (e) {}
  try { db.execSync(`ALTER TABLE local_peer_messages ADD COLUMN is_deleted_for_me INTEGER DEFAULT 0;`); } catch (e) {}
  try { db.execSync(`ALTER TABLE local_peer_messages ADD COLUMN is_deleted_for_everyone INTEGER DEFAULT 0;`); } catch (e) {}

  // Auto-clean records older than 30 days
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    db.execSync(`DELETE FROM ai_chat_history WHERE created_at < '${thirtyDaysAgo}';`);
  } catch (e) {}
} catch (e) {
  console.warn('Native SQLite module not available, falling back to AsyncStorage/In-Memory store:', e);
  useFallback = true;
  
  // Initialize inMemoryPosts from AsyncStorage in background
  AsyncStorage.getItem('@kanelflow_local_posts_cache').then(data => {
    if (data) {
      try {
        inMemoryPosts = JSON.parse(data);
      } catch (_) {}
    }
  }).catch(_ => {});
}

export function savePostsToLocal(posts: any[]) {
  if (useFallback) {
    inMemoryPosts = posts;
    AsyncStorage.setItem('@kanelflow_local_posts_cache', JSON.stringify(posts)).catch(err => {
      console.warn('Failed to save posts to AsyncStorage fallback:', err);
    });
    return;
  }

  db.withTransactionSync(() => {
    const statement = db.prepareSync(`
      INSERT OR REPLACE INTO community_posts (
        id, author_id, author_name, category, text, created_at, likes, comments, liked, liked_by, viewed_by_count, media_url, media_local_path, file_url, file_name, target_batches, author_avatar, is_edited
      ) VALUES (
        $id, $author_id, $author_name, $category, $text, $created_at, $likes, $comments, $liked, $liked_by, $viewed_by_count, $media_url, $media_local_path, $file_url, $file_name, $target_batches, $author_avatar, $is_edited
      );
    `);
    try {
      for (const post of posts) {
        statement.executeSync({
          $id: String(post.id),
          $author_id: post.author_id || '',
          $author_name: post.author || post.author_name || '',
          $category: post.category || 'announcement',
          $text: post.text || '',
          $created_at: post.timestamp || post.created_at || new Date().toISOString(),
          $likes: Number(post.likes || 0),
          $comments: JSON.stringify(post.comments || []),
          $liked: post.liked ? 1 : 0,
          $liked_by: JSON.stringify(post.liked_by || []),
          $viewed_by_count: Number(post.viewed_by_count || 0),
          $media_url: post.media_url || null,
          $media_local_path: post.media_local_path || null,
          $file_url: post.file_url || null,
          $file_name: post.file_name || null,
          $target_batches: JSON.stringify(post.target_batches || []),
          $author_avatar: post.author_avatar || null,
          $is_edited: post.is_edited ? 1 : 0,
        });
      }
    } finally {
      statement.finalizeSync();
    }
  });
}

export function updateMediaLocalPointer(postId: string, localPath: string) {
  if (useFallback) return;
  try {
    db.runSync('UPDATE community_posts SET media_local_path = ? WHERE id = ?', [localPath, String(postId)]);
  } catch (e) {
    console.warn('Failed to update media_local_path in SQLite:', e);
  }
}

export function getPostsFromLocal(): any[] {
  if (useFallback) {
    return inMemoryPosts;
  }

  const rows = db.getAllSync('SELECT * FROM community_posts ORDER BY created_at DESC');
  return rows.map((row: any) => {
    let comments = [];
    try {
      comments = JSON.parse(row.comments || '[]');
    } catch (_) {}

    let liked_by = [];
    try {
      liked_by = JSON.parse(row.liked_by || '[]');
    } catch (_) {}

    let target_batches = [];
    try {
      target_batches = JSON.parse(row.target_batches || '[]');
    } catch (_) {}

    return {
      id: String(row.id),
      author_id: row.author_id,
      author: row.author_name,
      category: row.category,
      text: row.text,
      timestamp: row.created_at,
      likes: Number(row.likes || 0),
      comments: comments,
      liked: row.liked === 1,
      liked_by: liked_by,
      viewed_by_count: Number(row.viewed_by_count || 0),
      media_url: row.media_url,
      media_local_path: row.media_local_path,
      file_url: row.file_url,
      file_name: row.file_name,
      target_batches: target_batches,
      author_avatar: row.author_avatar,
      is_edited: row.is_edited === 1,
    };
  });
}

// --- Local Tests NoSQL JSONB Operations ---
export function saveTestToLocal(testId: string, testData: any) {
  if (!testId || !testData) return;
  if (useFallback || !db) {
    inMemoryTests[testId] = testData;
    AsyncStorage.setItem(`@local_test_${testId}`, JSON.stringify(testData)).catch(() => {});
    return;
  }
  try {
    const tId = String(testId || '');
    const title = String(testData?.title || '');
    const subject = String(testData?.subject || '');
    const batchName = String(testData?.batch_name || '');
    const jsonPayload = JSON.stringify(testData || {});
    const nowStr = new Date().toISOString();

    db.runSync(
      `INSERT OR REPLACE INTO local_tests (test_id, title, subject, batch_name, data_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tId, title, subject, batchName, jsonPayload, nowStr]
    );
  } catch (e) {
    console.warn('Failed to save test to SQLite:', e);
  }
}

export function getTestFromLocal(testId: string): any | null {
  if (!testId) return null;
  if (useFallback || !db) {
    return inMemoryTests[testId] || null;
  }
  try {
    const row = db.getFirstSync('SELECT * FROM local_tests WHERE test_id = ?', [String(testId)]);
    if (row && row.data_json) {
      return JSON.parse(row.data_json);
    }
  } catch (e) {
    console.warn('Failed to read test from SQLite:', e);
  }
  return null;
}

// --- Local Test Attempt Progress Buffer ---
export function saveTestProgressToLocal(
  testId: string,
  studentId: string,
  answers: any,
  timeLogs: any,
  score: number,
  totalQuestions: number,
  synced: boolean = false
) {
  if (!testId) return;
  if (useFallback || !db) {
    const key = `${testId}_${studentId}`;
    inMemoryProgress[key] = { testId, studentId, answers, timeLogs, score, totalQuestions, synced };
    AsyncStorage.setItem(`@local_progress_${key}`, JSON.stringify(inMemoryProgress[key])).catch(() => {});
    return;
  }
  try {
    const tId = String(testId || '');
    const sId = String(studentId || '');
    const ansJson = JSON.stringify(answers || {});
    const timeJson = JSON.stringify(timeLogs || {});
    const nowStr = new Date().toISOString();

    db.runSync(
      `INSERT OR REPLACE INTO test_progress (test_id, student_id, answers_json, time_logs_json, score, total_questions, synced, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tId,
        sId,
        ansJson,
        timeJson,
        Number(score || 0),
        Number(totalQuestions || 0),
        synced ? 1 : 0,
        nowStr
      ]
    );
  } catch (e) {
    console.warn('Failed to save test progress to SQLite:', e);
  }
}

export function getUnsyncedTestProgress(): any[] {
  if (useFallback) return [];
  try {
    const rows = db.getAllSync('SELECT * FROM test_progress WHERE synced = 0');
    return rows.map((r: any) => ({
      test_id: r.test_id,
      student_id: r.student_id,
      answers: JSON.parse(r.answers_json || '{}'),
      time_logs: JSON.parse(r.time_logs_json || '{}'),
      score: r.score,
      total_questions: r.total_questions
    }));
  } catch (e) {
    console.warn('Failed to fetch unsynced test progress:', e);
    return [];
  }
}

export function markTestProgressSynced(testId: string) {
  if (useFallback) return;
  try {
    db.runSync('UPDATE test_progress SET synced = 1 WHERE test_id = ?', [String(testId)]);
  } catch (e) {
    console.warn('Failed to mark test progress synced:', e);
  }
}

export function clearLocalPosts() {
  if (useFallback) {
    inMemoryPosts = [];
    AsyncStorage.removeItem('@kanelflow_local_posts_cache').catch(_ => {});
    return;
  }
  db.execSync('DELETE FROM community_posts');
}

export function saveChatMessageToLocal(chatId: string, role: 'user' | 'model', text: string, testData: any) {
  if (useFallback) return;
  try {
    const id = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const testDataJson = testData ? JSON.stringify(testData) : null;
    const nowStr = new Date().toISOString();
    db.runSync(
      `INSERT INTO ai_chat_history (id, chat_id, role, text, test_data_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, chatId, role, text, testDataJson, nowStr]
    );
  } catch (e) {
    console.warn('Failed to save AI chat message to SQLite:', e);
  }
}

export function getChatHistoryFromLocal(chatId: string): any[] {
  if (useFallback) return [];
  try {
    const rows = db.getAllSync(
      `SELECT * FROM ai_chat_history WHERE chat_id = ? ORDER BY created_at ASC`,
      [chatId]
    );
    return rows.map((r: any) => ({
      role: r.role,
      text: r.text,
      testData: r.test_data_json ? JSON.parse(r.test_data_json) : null
    }));
  } catch (e) {
    console.warn('Failed to get AI chat history from SQLite:', e);
    return [];
  }
}

export function getChatSessionsFromLocal(): any[] {
  if (useFallback) return [];
  try {
    // Return unique chat sessions with their latest message info
    const rows = db.getAllSync(`
      SELECT chat_id, MAX(created_at) as last_activity, text 
      FROM ai_chat_history 
      GROUP BY chat_id 
      ORDER BY last_activity DESC
    `);
    return rows.map((r: any) => ({
      chatId: r.chat_id,
      lastActivity: r.last_activity,
      snippet: r.text ? (r.text.substring(0, 30) + (r.text.length > 30 ? '...' : '')) : 'New Conversation'
    }));
  } catch (e) {
    console.warn('Failed to get AI chat sessions from SQLite:', e);
    return [];
  }
}

export function deleteChatSessionFromLocal(chatId: string) {
  if (useFallback) return;
  try {
    db.runSync('DELETE FROM ai_chat_history WHERE chat_id = ?', [chatId]);
  } catch (e) {
    console.warn('Failed to delete chat session from SQLite:', e);
  }
}

export function savePeerMessageToLocal(msg: { id: string | number; sender_id: string; receiver_id: string; text: string; created_at: string; is_read?: boolean; delivered?: boolean; reply_to_id?: string | null; is_deleted_for_me?: boolean; is_deleted_for_everyone?: boolean }) {
  if (useFallback || !db) return;
  try {
    const id = String(msg.id);
    const sender = String(msg.sender_id);
    const receiver = String(msg.receiver_id);
    const text = String(msg.text || '');
    const createdAt = String(msg.created_at);
    const isRead = msg.is_read ? 1 : 0;
    const delivered = msg.delivered ? 1 : 0;
    const replyToId = msg.reply_to_id ? String(msg.reply_to_id) : null;
    const isDeletedMe = msg.is_deleted_for_me ? 1 : 0;
    const isDeletedEveryone = msg.is_deleted_for_everyone ? 1 : 0;

    db.runSync(
      `INSERT OR REPLACE INTO local_peer_messages (id, sender_id, receiver_id, text, created_at, is_read, delivered, reply_to_id, is_deleted_for_me, is_deleted_for_everyone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, sender, receiver, text, createdAt, isRead, delivered, replyToId, isDeletedMe, isDeletedEveryone]
    );
  } catch (e) {
    console.warn('Failed to save peer message to SQLite:', e);
  }
}

export function getPeerMessagesFromLocal(userId: string, peerId: string): any[] {
  if (useFallback || !db) return [];
  try {
    const rows = db.getAllSync(
      `SELECT * FROM local_peer_messages 
       WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
       ORDER BY created_at ASC`,
      [userId, peerId, peerId, userId]
    );
    return rows.map((r: any) => ({
      id: isNaN(Number(r.id)) ? r.id : Number(r.id),
      sender_id: r.sender_id,
      receiver_id: r.receiver_id,
      text: r.text,
      created_at: r.created_at,
      is_read: r.is_read === 1,
      is_delivered: r.delivered === 1,
      reply_to_id: r.reply_to_id,
      is_deleted_for_me: r.is_deleted_for_me === 1,
      is_deleted_for_everyone: r.is_deleted_for_everyone === 1,
    }));
  } catch (e) {
    console.warn('Failed to get peer messages from SQLite:', e);
    return [];
  }
}

export function getAllPeerMessagesFromLocal(userId: string): any[] {
  if (useFallback || !db) return [];
  try {
    const rows = db.getAllSync(
      `SELECT * FROM local_peer_messages 
       WHERE (sender_id = ? OR receiver_id = ?) AND is_deleted_for_me = 0
       ORDER BY created_at ASC`,
      [userId, userId]
    );
    return rows.map((r: any) => ({
      id: isNaN(Number(r.id)) ? r.id : Number(r.id),
      sender_id: r.sender_id,
      receiver_id: r.receiver_id,
      text: r.text,
      created_at: r.created_at,
      is_read: r.is_read === 1,
      is_delivered: r.delivered === 1,
      reply_to_id: r.reply_to_id,
      is_deleted_for_me: r.is_deleted_for_me === 1,
      is_deleted_for_everyone: r.is_deleted_for_everyone === 1,
    }));
  } catch (e) {
    console.warn('Failed to get all peer messages from SQLite:', e);
    return [];
  }
}

export function markPeerMessageDelivered(msgId: string | number) {
  if (useFallback || !db) return;
  try {
    db.runSync(
      `UPDATE local_peer_messages SET delivered = 1 WHERE id = ?`,
      [String(msgId)]
    );
  } catch (e) {
    console.warn('Failed to mark message as delivered in SQLite:', e);
  }
}

export function markPeerMessagesAsReadInLocal(senderId: string, receiverId: string) {
  if (useFallback || !db) return;
  try {
    db.runSync(
      `UPDATE local_peer_messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?`,
      [senderId, receiverId]
    );
  } catch (e) {
    console.warn('Failed to mark local peer messages as read:', e);
  }
}

export function updatePeerMessageReadStatusInLocal(msgId: string | number, isRead: boolean) {
  if (useFallback || !db) return;
  try {
    db.runSync(
      `UPDATE local_peer_messages SET is_read = ? WHERE id = ?`,
      [isRead ? 1 : 0, String(msgId)]
    );
  } catch (e) {
    console.warn('Failed to update local message read status:', e);
  }
}

export function deletePeerMessageFromLocal(msgId: string | number, forEveryone: boolean = false) {
  if (useFallback || !db) return;
  try {
    if (forEveryone) {
      db.runSync('UPDATE local_peer_messages SET is_deleted_for_everyone = 1 WHERE id = ?', [String(msgId)]);
    } else {
      db.runSync('UPDATE local_peer_messages SET is_deleted_for_me = 1 WHERE id = ?', [String(msgId)]);
    }
  } catch (e) {
    console.warn('Failed to delete peer message from SQLite:', e);
  }
}

export function deleteAllPeerMessagesFromLocal(userId: string, peerId: string) {
  if (useFallback || !db) return;
  try {
    db.runSync(
      `DELETE FROM local_peer_messages 
       WHERE (sender_id = ? AND receiver_id = ?) 
          OR (sender_id = ? AND receiver_id = ?)`,
      [userId, peerId, peerId, userId]
    );
  } catch (e) {
    console.warn('Failed to delete all peer messages from SQLite:', e);
  }
}

export function getPeerMessagesUnreadCount(userId: string): number {
  if (useFallback || !db) return 0;
  try {
    const row = db.getFirstSync(
      `SELECT COUNT(*) as count FROM local_peer_messages 
       WHERE receiver_id = ? AND is_read = 0`,
      [userId]
    );
    return row ? (row.count || 0) : 0;
  } catch (e) {
    console.warn('Failed to get peer unread count from SQLite:', e);
    return 0;
  }
}

export function closeDatabase() {
  if (db && !useFallback) {
    try {
      db.closeSync();
      console.log('Database connection closed successfully.');
    } catch (e) {
      console.warn('Failed to close database:', e);
    } finally {
      db = null;
    }
  }
}

export async function runBackgroundCacheCleanup() {
  try {
    // We are keeping text messages forever (WhatsApp architecture).
    // Text takes very little space (1 million messages = ~50MB).

    // 2. Clean Image Cache Directory older than 7 days
    const cacheDir = FileSystem.cacheDirectory;
    if (cacheDir) {
      const dirInfo = await FileSystem.readDirectoryAsync(cacheDir);
      const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
      
      for (const file of dirInfo) {
        if (file.startsWith('img_')) { // Target our cached images
          const fileUri = `${cacheDir}${file}`;
          const fileInfo = await FileSystem.getInfoAsync(fileUri);
          if (fileInfo.exists && fileInfo.modificationTime) {
            // modificationTime is in seconds from epoch on mobile
            if (fileInfo.modificationTime * 1000 < sevenDaysAgoMs) {
               await FileSystem.deleteAsync(fileUri, { idempotent: true });
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Background cleanup failed:', err);
  }
}
