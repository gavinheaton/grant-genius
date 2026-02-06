import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { Bot, User, Loader2 } from "lucide-react";
import type { ChatMessage } from "@/hooks/useAdminAssistant";

interface AdminChatMessageProps {
  message: ChatMessage;
}

export function AdminChatMessage({ message }: AdminChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 p-4 rounded-lg",
        isUser ? "bg-muted/50" : "bg-background"
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser ? "bg-primary" : "bg-secondary"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary-foreground" />
        ) : (
          <Bot className="h-4 w-4 text-secondary-foreground" />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">
            {isUser ? "You" : "Grant Genius Assistant"}
          </span>
          <span className="text-xs text-muted-foreground">
            {message.timestamp.toLocaleTimeString()}
          </span>
        </div>
        
        {message.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Thinking...</span>
          </div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              components={{
                // Custom table styling
                table: ({ children }) => (
                  <div className="overflow-x-auto my-4">
                    <table className="min-w-full divide-y divide-border border border-border rounded-md">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-muted/50">{children}</thead>
                ),
                th: ({ children }) => (
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-3 py-2 text-sm whitespace-nowrap">
                    {children}
                  </td>
                ),
                tr: ({ children }) => (
                  <tr className="border-b border-border last:border-0">
                    {children}
                  </tr>
                ),
                // Code block styling
                code: ({ className, children, ...props }) => {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code
                        className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code
                      className={cn(
                        "block p-3 rounded-md bg-muted overflow-x-auto text-sm font-mono",
                        className
                      )}
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => (
                  <pre className="bg-muted rounded-md overflow-hidden my-4">
                    {children}
                  </pre>
                ),
                // Blockquote styling for errors/warnings
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-amber-500 pl-4 my-4 italic text-muted-foreground">
                    {children}
                  </blockquote>
                ),
                // List styling
                ul: ({ children }) => (
                  <ul className="list-disc pl-6 my-2 space-y-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-6 my-2 space-y-1">{children}</ol>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
