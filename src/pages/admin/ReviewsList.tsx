import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import { Loader2, Eye } from "lucide-react";
import { format } from "date-fns";

export default function ReviewsList() {
  const navigate = useNavigate();

  const { data: reviews, isLoading } = useQuery({
    queryKey: ["pending-reviews"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("report_reviews" as any)
        .select(`
          id,
          step_number,
          status,
          reviewer_user_id,
          created_at,
          report_id
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Fetch report details for each review
      const reviewsWithDetails = await Promise.all(
        ((data as any[]) || []).map(async (review: any) => {
          const { data: report } = await supabase
            .from("reports")
            .select(`
              id,
              application:applications!inner(
                title,
                grant_version:grant_versions!inner(
                  grant:grants!inner(name)
                )
              )
            `)
            .eq("id", review.report_id)
            .maybeSingle();

          const app = (report?.application as any);
          const gv = app?.grant_version as any;
          const grant = Array.isArray(gv?.grant) ? gv.grant[0] : gv?.grant;

          return {
            ...review,
            application_title: app?.title || "Untitled",
            grant_name: grant?.name || "Unknown",
          };
        })
      );

      return reviewsWithDetails;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Report Reviews</h1>
        <p className="text-muted-foreground mt-1">Review and approve reports before they are sent to users</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {reviews && reviews.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application</TableHead>
                  <TableHead>Grant</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((review: any) => (
                  <TableRow key={review.id}>
                    <TableCell className="font-medium">{review.application_title}</TableCell>
                    <TableCell>{review.grant_name}</TableCell>
                    <TableCell>Step {review.step_number}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          review.status === "approved"
                            ? "default"
                            : review.status === "in_progress"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {review.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(review.created_at), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/admin/reviews/${review.id}`)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        {review.status === "approved" ? "View" : "Review"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No reviews found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
