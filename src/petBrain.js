const MOOD_MODE = {
  calm: "standby",
  curious: "curious",
  working: "thinking",
  engaged: "listening",
  pleased: "speaking",
  alert: "thinking",
};

const EVENT_MOOD = {
  "user-message": ["curious", 7000],
  thinking: ["working", 12000],
  "assistant-response": ["engaged", 6500],
  "action-success": ["pleased", 8500],
  "action-error": ["alert", 9000],
};

export function createPetState(now = Date.now()) {
  return {
    mood: "calm",
    visualMode: "standby",
    energy: 0.82,
    boredom: 0.2,
    lastInteraction: now,
    moodUntil: 0,
    activityLabel: "IDLE",
  };
}

export function advancePet(state, event = {}) {
  const now = Number.isFinite(event.now) ? event.now : Date.now();
  const next = { ...state };
  if (event.type === "tick") {
    const idleSeconds = Math.max(0, (now - next.lastInteraction) / 1000);
    next.boredom = Math.min(1, next.boredom + 0.012);
    next.energy = Math.min(1, next.energy + 0.006);
    if (next.moodUntil <= now) {
      next.mood = idleSeconds > 180 && next.boredom > 0.68 ? "curious" : "calm";
      next.activityLabel = next.mood === "curious" ? "LOOKING AROUND" : "IDLE";
    }
  } else {
    const [mood, duration] = EVENT_MOOD[event.type] || ["curious", 5000];
    next.mood = mood;
    next.moodUntil = now + duration;
    next.lastInteraction = now;
    next.boredom = 0.08;
    next.energy = Math.max(0.25, next.energy - (event.type === "thinking" ? 0.012 : 0.004));
    next.activityLabel = ({
      "user-message": "USER INTERACTION",
      thinking: "PROCESSING",
      "assistant-response": "RESPONDING",
      "action-success": "TASK COMPLETE",
      "action-error": "NEEDS ATTENTION",
    })[event.type] || "ACTIVE";
  }
  next.visualMode = MOOD_MODE[next.mood] || "standby";
  return next;
}
