-- Supabase V2 Schema (3-Table Architecture)

-- ==========================================
-- 1. COACHINGS TABLE (The Businesses)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.coachings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    coaching_name TEXT NOT NULL,
    coaching_id TEXT UNIQUE NOT NULL, -- Format: 3 letters + 4 random (e.g. ALP-X7B2)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies for coachings
ALTER TABLE public.coachings ENABLE ROW LEVEL SECURITY;

-- Admins can manage their own coaching
DROP POLICY IF EXISTS "Admins can manage their coaching" ON public.coachings;
CREATE POLICY "Admins can manage their coaching" 
    ON public.coachings 
    FOR ALL 
    USING (auth.uid() = admin_id);

-- Anyone can read coaching info (needed for claiming profile)
DROP POLICY IF EXISTS "Anyone can view coachings" ON public.coachings;
CREATE POLICY "Anyone can view coachings" 
    ON public.coachings 
    FOR SELECT 
    USING (true);


-- ==========================================
-- 2. PROFILES TABLE (The People)
-- ==========================================
-- Since profiles might already exist, we use ALTER TABLE to add our new columns.
-- If the table does not exist, you will need to create it first, but typically
-- Supabase creates it or we can create it explicitly:

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Now add our new architecture columns safely:
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS role TEXT CHECK (role IN ('admin', 'student')),
    ADD COLUMN IF NOT EXISTS coaching_id UUID REFERENCES public.coachings(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS device_id TEXT,
    ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS claimed BOOLEAN DEFAULT false;

-- RLS Policies for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can manage their own profile
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;
CREATE POLICY "Users can manage their own profile" 
    ON public.profiles 
    FOR ALL 
    USING (auth.uid() = id);

-- Admins can view/manage profiles in their coaching
DROP POLICY IF EXISTS "Admins can manage coaching profiles" ON public.profiles;
CREATE POLICY "Admins can manage coaching profiles" 
    ON public.profiles 
    FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.coachings c 
            WHERE c.id = profiles.coaching_id 
            AND c.admin_id = auth.uid()
        )
    );

-- Students can view other profiles in their coaching (e.g. for community)
DROP POLICY IF EXISTS "Users can view profiles in same coaching" ON public.profiles;
CREATE POLICY "Anyone can view profiles" 
    ON public.profiles 
    FOR SELECT 
    USING (auth.role() = 'authenticated');


-- ==========================================
-- 3. TRIGGERS
-- ==========================================
-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, role)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'name', 'Unknown User'),
        COALESCE(new.raw_user_meta_data->>'role', 'student')
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
