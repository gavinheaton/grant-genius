import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Search, ChevronDown, ChevronRight, RotateCw, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

export default function EmailLogs() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [resendingId, setResendingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: emails, isLoading } = useQuery({
    queryKey: ["admin-email-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_outbox")
        .select(`
          *,
          email_events (
            id,
            event_type,
            event_data_json,
            created_at
          )
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
  });

  const filteredEmails = emails?.filter((email) => {
    const matchesSearch =
      email.to_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      email.template_key.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || email.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const handleResend = async (emailId: string) => {
    setResendingId(emailId);
    try {
      const { data, error } = await supabase.functions.invoke("resend-email", {
        body: { emailOutboxId: emailId },
      });

      if (error) throw error;

      toast({
        title: "Email resent",
        description: "The email has been queued for delivery.",
      });

      queryClient.invalidateQueries({ queryKey: ["admin-email-logs"] });
    } catch (err) {
      toast({
        title: "Resend failed",
        description: err instanceof Error ? err.message : "Failed to resend email",
        variant: "destructive",
      });
    } finally {
      setResendingId(null);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "delivered":
        return "default";
      case "sent":
        return "secondary";
      case "bounced":
      case "failed":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Email Logs</h1>
        <p className="text-muted-foreground mt-1">
          View email delivery history and events
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by email or template..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="bounced">Bounced</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  Loading email logs...
                </TableCell>
              </TableRow>
            ) : filteredEmails?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  No emails found
                </TableCell>
              </TableRow>
            ) : (
              filteredEmails?.map((email) => (
                <Collapsible key={email.id} asChild>
                  <>
                    <TableRow>
                      <TableCell>
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleRow(email.id)}
                            disabled={!email.email_events?.length}
                          >
                            {expandedRows.has(email.id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      </TableCell>
                      <TableCell className="font-medium">
                        {email.to_email}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {email.template_key}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {email.subject || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(email.status)}>
                          {email.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {email.sent_at
                          ? format(new Date(email.sent_at), "MMM d, HH:mm")
                          : format(new Date(email.created_at), "MMM d, HH:mm")}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResend(email.id)}
                          disabled={resendingId === email.id}
                          title="Resend email"
                        >
                          {resendingId === email.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCw className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                    <CollapsibleContent asChild>
                      <TableRow className="bg-muted/50">
                        <TableCell colSpan={7}>
                          <div className="py-2 pl-12">
                            <p className="text-sm font-medium mb-2">Events</p>
                            {email.email_events?.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No events recorded
                              </p>
                            ) : (
                              <div className="space-y-1">
                                {email.email_events?.map((event: any) => (
                                  <div
                                    key={event.id}
                                    className="flex items-center gap-4 text-sm"
                                  >
                                    <Badge variant="outline" className="text-xs">
                                      {event.event_type}
                                    </Badge>
                                    <span className="text-muted-foreground">
                                      {format(
                                        new Date(event.created_at),
                                        "MMM d, yyyy HH:mm:ss"
                                      )}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
