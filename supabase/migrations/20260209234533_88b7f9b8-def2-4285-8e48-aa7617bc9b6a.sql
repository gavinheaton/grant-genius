
-- prompt_bundles: drop old super_admin-only policies, create admin-level ones
DROP POLICY "Super admins can delete prompt bundles" ON public.prompt_bundles;
DROP POLICY "Super admins can insert prompt bundles" ON public.prompt_bundles;
DROP POLICY "Super admins can update prompt bundles" ON public.prompt_bundles;

CREATE POLICY "Admins can delete prompt bundles" ON public.prompt_bundles FOR DELETE USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert prompt bundles" ON public.prompt_bundles FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update prompt bundles" ON public.prompt_bundles FOR UPDATE USING (is_admin(auth.uid()));

-- prompt_bundle_steps: drop old super_admin-only policies, create admin-level ones
DROP POLICY "Super admins can delete prompt bundle steps" ON public.prompt_bundle_steps;
DROP POLICY "Super admins can insert prompt bundle steps" ON public.prompt_bundle_steps;
DROP POLICY "Super admins can update prompt bundle steps" ON public.prompt_bundle_steps;

CREATE POLICY "Admins can delete prompt bundle steps" ON public.prompt_bundle_steps FOR DELETE USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert prompt bundle steps" ON public.prompt_bundle_steps FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update prompt bundle steps" ON public.prompt_bundle_steps FOR UPDATE USING (is_admin(auth.uid()));
