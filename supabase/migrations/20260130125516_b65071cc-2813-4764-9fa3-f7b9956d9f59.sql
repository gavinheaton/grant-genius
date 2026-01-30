-- Step 1: Add UNIQUE constraint on profiles.user_id (if not already present)
-- This is required for it to be a valid FK target
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);

-- Step 2: Add foreign key from applications.user_id to profiles.user_id
-- This enables PostgREST to resolve: applications!inner(..., profiles:user_id(email))
ALTER TABLE public.applications
ADD CONSTRAINT applications_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id)
ON DELETE CASCADE;