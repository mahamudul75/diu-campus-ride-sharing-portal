export function shouldIncrementUnreadChatCount(params: {
  currentUserId: number;
  senderId: number;
  incomingConversationId: number;
  activeConversationId: number | null;
}): boolean {
  if (params.senderId === params.currentUserId) return false;
  if (
    params.activeConversationId !== null &&
    params.incomingConversationId === params.activeConversationId
  ) {
    return false;
  }
  return true;
}
