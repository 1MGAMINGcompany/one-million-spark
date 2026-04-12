-- Create the operator-logos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('operator-logos', 'operator-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access for logos
CREATE POLICY "Anyone can view operator logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'operator-logos');

-- Authenticated users can upload logos
CREATE POLICY "Authenticated users can upload operator logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'operator-logos');

-- Authenticated users can update their logos
CREATE POLICY "Authenticated users can update operator logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'operator-logos');

-- Authenticated users can delete their logos
CREATE POLICY "Authenticated users can delete operator logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'operator-logos');