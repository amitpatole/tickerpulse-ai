import Header from '@/components/layout/Header';
import ChatPanel from '@/components/chat/ChatPanel';

export default function ChatPage() {
  return (
    <div className="flex h-screen flex-col">
      <Header title="AI Chat" subtitle="Conversational interface for stock data and research" />
      <div className="flex-1 overflow-hidden">
        <ChatPanel />
      </div>
    </div>
  );
}
