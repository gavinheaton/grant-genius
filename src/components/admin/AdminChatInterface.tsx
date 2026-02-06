import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminChatMessage } from "./AdminChatMessage";
import { Send, Trash2, Database, AlertCircle, Activity } from "lucide-react";
import type { ChatMessage } from "@/hooks/useAdminAssistant";

interface AdminChatInterfaceProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onClearMessages: () => void;
}

const quickActions = [
  {
    label: "Failed Runs",
    icon: AlertCircle,
    message: "Show me all failed report runs from the last 24 hours with their error messages.",
  },
  {
    label: "System Stats",
    icon: Activity,
    message: "Give me an overview of system statistics for the past 7 days including success rates.",
  },
  {
    label: "Stalled Runs",
    icon: Database,
    message: "Are there any stalled runs that need attention? If so, list them and suggest what to do.",
  },
];

export function AdminChatInterface({
  messages,
  isLoading,
  onSendMessage,
  onClearMessages,
}: AdminChatInterfaceProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleQuickAction = (message: string) => {
    if (!isLoading) {
      onSendMessage(message);
    }
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg font-semibold">AI Assistant</CardTitle>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearMessages}
            className="text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0 p-0">
        {/* Messages area */}
        <ScrollArea className="flex-1 px-6" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Database className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">
                Grant Genius Admin Assistant
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                I can help you query the database, analyze failed runs, check system
                health, and manage report generation. Try one of the quick actions
                below or ask me anything!
              </p>
              
              {/* Quick actions */}
              <div className="flex flex-wrap gap-2 justify-center">
                {quickActions.map((action) => (
                  <Button
                    key={action.label}
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickAction(action.message)}
                    disabled={isLoading}
                    className="gap-2"
                  >
                    <action.icon className="h-4 w-4" />
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {messages.map((message, index) => (
                <AdminChatMessage key={index} message={message} />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Input area */}
        <div className="flex-shrink-0 border-t p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about report runs, query the database, or get system insights..."
              className="min-h-[60px] max-h-[120px] resize-none"
              disabled={isLoading}
            />
            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="self-end"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
