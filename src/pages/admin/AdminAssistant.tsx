import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminChatInterface } from "@/components/admin/AdminChatInterface";
import { useAdminAssistant } from "@/hooks/useAdminAssistant";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert, Loader2 } from "lucide-react";

export default function AdminAssistant() {
  const { isLoading: authLoading, isSuperAdmin } = useAdminAuth();
  const { messages, isLoading, sendMessage, clearMessages } = useAdminAssistant();

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            The AI Assistant is only available to Super Admins. Please contact your
            administrator if you believe you should have access.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] p-6">
      <AdminChatInterface
        messages={messages}
        isLoading={isLoading}
        onSendMessage={sendMessage}
        onClearMessages={clearMessages}
      />
    </div>
  );
}
