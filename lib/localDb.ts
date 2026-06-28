import AsyncStorage from '@react-native-async-storage/async-storage';

let db: any = null;
let useFallback = false;
let inMemoryPosts: any[] = [];

try {
  const SQLite = require('expo-sqlite');
  db = SQLite.openDatabaseSync('kanelflow.db');
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
      file_url TEXT,
      file_name TEXT,
      target_batches TEXT,
      author_avatar TEXT,
      is_edited INTEGER
    );
  `);
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
        id, author_id, author_name, category, text, created_at, likes, comments, liked, liked_by, viewed_by_count, media_url, file_url, file_name, target_batches, author_avatar, is_edited
      ) VALUES (
        $id, $author_id, $author_name, $category, $text, $created_at, $likes, $comments, $liked, $liked_by, $viewed_by_count, $media_url, $file_url, $file_name, $target_batches, $author_avatar, $is_edited
      );
    `);
    try {
      for (const post of posts) {
        statement.executeSync({
          $id: String(post.id),
          $author_id: post.author_id || '',
          $author_name: post.author || '',
          $category: post.category || 'announcement',
          $text: post.text || '',
          $created_at: post.timestamp || new Date().toISOString(),
          $likes: Number(post.likes || 0),
          $comments: JSON.stringify(post.comments || []),
          $liked: post.liked ? 1 : 0,
          $liked_by: JSON.stringify(post.liked_by || []),
          $viewed_by_count: Number(post.viewed_by_count || 0),
          $media_url: post.media_url || null,
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
      file_url: row.file_url,
      file_name: row.file_name,
      target_batches: target_batches,
      author_avatar: row.author_avatar,
      is_edited: row.is_edited === 1,
    };
  });
}

export function clearLocalPosts() {
  if (useFallback) {
    inMemoryPosts = [];
    AsyncStorage.removeItem('@kanelflow_local_posts_cache').catch(_ => {});
    return;
  }
  db.execSync('DELETE FROM community_posts');
}
