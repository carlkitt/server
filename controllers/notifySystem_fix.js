// ── REPLACE your existing notifySystem with this fixed version ──────────────
// The original uses `mongoose` without requiring it, which would crash.
// This version handles the missing system user gracefully.

exports.notifySystem = async (recipientId, message) => {
  try {
    // Use recipient as actor for system messages (same approach as notifyProfileCompletion)
    await exports.createNotification(
      recipientId,
      recipientId,   // no system user needed
      'system',
      message
    );
  } catch (error) {
    console.error('Error creating system notification:', error);
  }
};