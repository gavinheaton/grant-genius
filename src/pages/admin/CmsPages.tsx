import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Eye, EyeOff, Menu, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  useAllCmsPages,
  useCreateCmsPage,
  useUpdateCmsPage,
  useDeleteCmsPage,
  generateSlug,
  CmsPage,
  CmsPageInsert,
} from "@/hooks/useCmsPages";
import { useAuth } from "@/hooks/useAuth";

interface PageFormData {
  title: string;
  slug: string;
  content_html: string;
  is_published: boolean;
  show_in_menu: boolean;
  show_in_footer: boolean;
  menu_order: number;
  requires_auth: boolean;
  meta_description: string;
}

const defaultFormData: PageFormData = {
  title: "",
  slug: "",
  content_html: "",
  is_published: false,
  show_in_menu: false,
  show_in_footer: false,
  menu_order: 0,
  requires_auth: false,
  meta_description: "",
};

export default function CmsPages() {
  const { user } = useAuth();
  const { data: pages, isLoading } = useAllCmsPages();
  const createPage = useCreateCmsPage();
  const updatePage = useUpdateCmsPage();
  const deletePage = useDeleteCmsPage();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<CmsPage | null>(null);
  const [deletePageId, setDeletePageId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PageFormData>(defaultFormData);
  const [autoSlug, setAutoSlug] = useState(true);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isDialogOpen && editingPage) {
      setFormData({
        title: editingPage.title,
        slug: editingPage.slug,
        content_html: editingPage.content_html || "",
        is_published: editingPage.is_published,
        show_in_menu: editingPage.show_in_menu,
        show_in_footer: editingPage.show_in_footer,
        menu_order: editingPage.menu_order,
        requires_auth: editingPage.requires_auth,
        meta_description: editingPage.meta_description || "",
      });
      setAutoSlug(false);
    } else if (!isDialogOpen) {
      setFormData(defaultFormData);
      setEditingPage(null);
      setAutoSlug(true);
    }
  }, [isDialogOpen, editingPage]);

  // Auto-generate slug from title
  useEffect(() => {
    if (autoSlug && formData.title) {
      setFormData((prev) => ({ ...prev, slug: generateSlug(prev.title) }));
    }
  }, [formData.title, autoSlug]);

  const handleSubmit = async () => {
    if (!formData.title || !formData.slug) return;

    const pageData: CmsPageInsert = {
      ...formData,
      created_by: user?.id || null,
    };

    if (editingPage) {
      await updatePage.mutateAsync({ id: editingPage.id, updates: pageData });
    } else {
      await createPage.mutateAsync(pageData);
    }
    setIsDialogOpen(false);
  };

  const handleEdit = (page: CmsPage) => {
    setEditingPage(page);
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (deletePageId) {
      await deletePage.mutateAsync(deletePageId);
      setDeletePageId(null);
    }
  };

  const isPending = createPage.isPending || updatePage.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CMS Pages</h1>
          <p className="text-muted-foreground">
            Manage static pages like Privacy Policy, Terms of Service, etc.
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Page
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Pages</CardTitle>
          <CardDescription>
            Click on a page to edit it, or use the actions menu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : pages?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No pages yet. Create your first page to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages?.map((page) => (
                  <TableRow
                    key={page.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleEdit(page)}
                  >
                    <TableCell className="font-medium">{page.title}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-sm">
                      /page/{page.slug}
                    </TableCell>
                    <TableCell>
                      {page.is_published ? (
                        <Badge variant="default">
                          <Eye className="h-3 w-3 mr-1" />
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <EyeOff className="h-3 w-3 mr-1" />
                          Draft
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {page.show_in_menu && (
                          <Badge variant="outline" className="text-xs">
                            <Menu className="h-3 w-3 mr-1" />
                            Menu
                          </Badge>
                        )}
                        {page.show_in_footer && (
                          <Badge variant="outline" className="text-xs">
                            Footer
                          </Badge>
                        )}
                        {page.requires_auth && (
                          <Badge variant="outline" className="text-xs">
                            Auth
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{page.menu_order}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`/page/${page.slug}`, "_blank");
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(page);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletePageId(page.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editingPage ? "Edit Page" : "Create New Page"}
            </DialogTitle>
            <DialogDescription>
              {editingPage
                ? "Update the page content and settings."
                : "Create a new static page with Markdown content."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="Privacy Policy"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">URL Slug</Label>
                <div className="flex gap-2">
                  <div className="flex items-center text-sm text-muted-foreground">
                    /page/
                  </div>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => {
                      setAutoSlug(false);
                      setFormData((prev) => ({
                        ...prev,
                        slug: e.target.value,
                      }));
                    }}
                    placeholder="privacy-policy"
                    className="font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meta_description">
                Meta Description (for SEO)
              </Label>
              <Textarea
                id="meta_description"
                value={formData.meta_description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    meta_description: e.target.value,
                  }))
                }
                placeholder="A brief description of the page for search engines..."
                rows={2}
              />
            </div>

            <Tabs defaultValue="edit" className="w-full">
              <TabsList>
                <TabsTrigger value="edit">Edit (Markdown)</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="edit" className="mt-2">
                <Textarea
                  value={formData.content_html}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      content_html: e.target.value,
                    }))
                  }
                  placeholder="# Page Title

Write your content here using Markdown...

## Section Header

- Bullet point 1
- Bullet point 2

**Bold text** and *italic text* are supported."
                  className="min-h-[300px] font-mono text-sm"
                />
              </TabsContent>
              <TabsContent value="preview" className="mt-2">
                <ScrollArea className="h-[300px] w-full rounded-md border p-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{formData.content_html}</ReactMarkdown>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-medium">Visibility Settings</h4>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="is_published">Published</Label>
                    <p className="text-sm text-muted-foreground">
                      Make this page visible to users
                    </p>
                  </div>
                  <Switch
                    id="is_published"
                    checked={formData.is_published}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, is_published: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="requires_auth">Requires Login</Label>
                    <p className="text-sm text-muted-foreground">
                      Only logged-in users can view
                    </p>
                  </div>
                  <Switch
                    id="requires_auth"
                    checked={formData.requires_auth}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, requires_auth: checked }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium">Navigation Settings</h4>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="show_in_menu">Show in Header Menu</Label>
                    <p className="text-sm text-muted-foreground">
                      Display link in the navigation bar
                    </p>
                  </div>
                  <Switch
                    id="show_in_menu"
                    checked={formData.show_in_menu}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, show_in_menu: checked }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="show_in_footer">Show in Footer</Label>
                    <p className="text-sm text-muted-foreground">
                      Display link in the page footer
                    </p>
                  </div>
                  <Switch
                    id="show_in_footer"
                    checked={formData.show_in_footer}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, show_in_footer: checked }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="menu_order">Menu Order</Label>
                  <Input
                    id="menu_order"
                    type="number"
                    value={formData.menu_order}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        menu_order: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="w-24"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending
                ? "Saving..."
                : editingPage
                ? "Update Page"
                : "Create Page"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletePageId}
        onOpenChange={() => setDeletePageId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Page</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this page? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
