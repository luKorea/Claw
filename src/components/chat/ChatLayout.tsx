import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

export function ChatLayout() {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <ChatHeader />
      <MessageList />
      <MessageInput />
    </div>
  );
}
