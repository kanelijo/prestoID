import firestore from '@react-native-firebase/firestore';

/**
 * MOCKS FIRESTORE & BIGQUERY TELEMETRY SERVICE
 * 
 * 1. Real-time Live Exam Heartbeat & Proctoring Telemetry
 * 2. Instant Peer Presence Tracker
 * 3. CBT Granular Event Logger (Streams to BigQuery)
 */

export interface LiveExamTelemetry {
  testId: string;
  studentId: string;
  studentName: string;
  currentQuestionIndex: number;
  totalAnswered: number;
  timeRemainingSeconds: number;
  batteryLevel?: number;
  networkStatus?: 'online' | 'offline';
  lastHeartbeat: number;
  isCompleted?: boolean;
}

export interface CBTTelemetryEvent {
  eventId: string;
  testId: string;
  studentId: string;
  studentName?: string;
  batchId?: string;
  subject?: string;
  eventType: 
    | 'TEST_START' 
    | 'QUESTION_VIEW' 
    | 'OPTION_SELECT' 
    | 'OPTION_CHANGE' 
    | 'QUESTION_FLAG' 
    | 'QUESTION_CLEAR'
    | 'TEST_SUBMIT' 
    | 'DISCONNECTION';
  questionId?: string;
  questionNumber?: number;
  selectedOptionIndex?: number | null;
  previousOptionIndex?: number | null;
  
  // ─── COGNITIVE & PSYCHOLOGICAL SIGNALS ───
  timeSpentOnQuestionSeconds?: number;
  remainingTimeSeconds?: number;
  hesitationTimeMs?: number;               // Milliseconds elapsed before first touch/interaction
  optionFlipCount?: number;                // Times student toggled/switched choices on this question
  isRevisit?: boolean;                     // Did the student come back to review this question?
  isEgoTrap?: boolean;                     // Flagged if student spent > 3x average question time
  rapidGuessDetected?: boolean;            // Answered calculation in < 4s (guessing behavior)
  answerReversalType?: 'NONE' | 'CORRECT_TO_WRONG' | 'WRONG_TO_CORRECT' | 'WRONG_TO_WRONG';
  examProgressRatio?: number;              // 0.0 (start) to 1.0 (end) to detect stamina/fatigue curve
  
  timestamp: number;
}

export interface UserPresence {
  userId: string;
  isOnline: boolean;
  lastActive: number;
  currentScreen?: string;
}

// ─── 1. LIVE EXAM TELEMETRY (For Live Proctoring & Real-time Sync) ───

/**
 * Updates or creates the student's live heartbeat during a CBT exam.
 */
export async function sendExamHeartbeat(telemetry: LiveExamTelemetry): Promise<void> {
  try {
    const docRef = firestore()
      .collection('live_exam_sessions')
      .doc(telemetry.testId)
      .collection('examinees')
      .doc(telemetry.studentId);

    await docRef.set(
      {
        ...telemetry,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.warn('[Firestore] Failed to send exam heartbeat:', error);
  }
}

/**
 * Real-time listener for Admin to monitor all students currently taking a live test.
 */
export function subscribeToLiveExaminees(
  testId: string,
  onUpdate: (examinees: LiveExamTelemetry[]) => void,
  onError?: (error: Error) => void
): () => void {
  const unsubscribe = firestore()
    .collection('live_exam_sessions')
    .doc(testId)
    .collection('examinees')
    .onSnapshot(
      snapshot => {
        if (!snapshot) return;
        const examinees: LiveExamTelemetry[] = [];
        snapshot.forEach(doc => {
          examinees.push(doc.data() as LiveExamTelemetry);
        });
        onUpdate(examinees);
      },
      err => {
        console.warn('[Firestore] Error listening to live examinees:', err);
        if (onError) onError(err);
      }
    );

  return unsubscribe;
}

// ─── 2. CBT TELEMETRY EVENTS (Automatically Streamed to BigQuery) ───

/**
 * Logs a high-resolution CBT interaction event into Firestore.
 * This collection can be hooked directly to Google BigQuery via Firebase Extension
 * ("Stream Collections to BigQuery") for deep AI analytics.
 */
export async function logCBTTelemetryForBigQuery(event: CBTTelemetryEvent): Promise<void> {
  try {
    const docId = event.eventId || `${event.testId}_${event.studentId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await firestore()
      .collection('cbt_telemetry_events')
      .doc(docId)
      .set({
        ...event,
        serverTimestamp: firestore.FieldValue.serverTimestamp(),
      });
  } catch (error) {
    console.warn('[Firestore] Failed to log CBT BigQuery event:', error);
  }
}

// ─── 3. PEER PRESENCE TRACKER ───

/**
 * Updates a user's real-time online/offline presence status.
 */
export async function setUserOnlinePresence(
  userId: string,
  isOnline: boolean,
  currentScreen?: string
): Promise<void> {
  try {
    await firestore()
      .collection('user_presence')
      .doc(userId)
      .set(
        {
          userId,
          isOnline,
          currentScreen: currentScreen || null,
          lastActive: Date.now(),
          updatedAt: firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  } catch (error) {
    console.warn('[Firestore] Failed to update presence:', error);
  }
}

/**
 * Listens to a peer's live presence status.
 */
export function subscribeToUserPresence(
  userId: string,
  onUpdate: (presence: UserPresence | null) => void
): () => void {
  return firestore()
    .collection('user_presence')
    .doc(userId)
    .onSnapshot(doc => {
      if (doc && doc.exists) {
        onUpdate(doc.data() as UserPresence);
      } else {
        onUpdate(null);
      }
    });
}
