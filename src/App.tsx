import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NewApplication from "./pages/NewApplication";
import ApplicationWorkspace from "./pages/ApplicationWorkspace";
import NotFound from "./pages/NotFound";

// Admin pages
import { AdminLayout } from "./components/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import Grants from "./pages/admin/Grants";
import GrantCreate from "./pages/admin/GrantCreate";
import GrantEdit from "./pages/admin/GrantEdit";
import Users from "./pages/admin/Users";
import UserDetail from "./pages/admin/UserDetail";
import EmailTemplates from "./pages/admin/EmailTemplates";
import EmailLogs from "./pages/admin/EmailLogs";
import AuditLogs from "./pages/admin/AuditLogs";
import PDFTemplates from "./pages/admin/PDFTemplates";
import PromptBundles from "./pages/admin/PromptBundles";
import PromptBundleEdit from "./pages/admin/PromptBundleEdit";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/applications/new" element={<NewApplication />} />
          <Route path="/applications/:id" element={<ApplicationWorkspace />} />
          
          {/* Admin routes */}
          <Route path="/admin" element={<AdminLayout><AdminDashboard /></AdminLayout>} />
          <Route path="/admin/grants" element={<AdminLayout><Grants /></AdminLayout>} />
          <Route path="/admin/grants/new" element={<AdminLayout><GrantCreate /></AdminLayout>} />
          <Route path="/admin/grants/:id" element={<AdminLayout><GrantEdit /></AdminLayout>} />
          <Route path="/admin/users" element={<AdminLayout><Users /></AdminLayout>} />
          <Route path="/admin/users/:id" element={<AdminLayout><UserDetail /></AdminLayout>} />
          <Route path="/admin/emails" element={<AdminLayout><EmailTemplates /></AdminLayout>} />
          <Route path="/admin/emails/logs" element={<AdminLayout><EmailLogs /></AdminLayout>} />
          <Route path="/admin/pdf-templates" element={<AdminLayout><PDFTemplates /></AdminLayout>} />
          <Route path="/admin/prompt-bundles" element={<AdminLayout><PromptBundles /></AdminLayout>} />
          <Route path="/admin/prompt-bundles/:id" element={<AdminLayout><PromptBundleEdit /></AdminLayout>} />
          <Route path="/admin/audit-logs" element={<AdminLayout><AuditLogs /></AdminLayout>} />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
