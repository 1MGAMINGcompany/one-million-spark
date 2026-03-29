CREATE POLICY "Public read access for fighter photos" ON storage.objects FOR SELECT USING (bucket_id = 'fighter-photos');

CREATE POLICY "Service role upload for fighter photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'fighter-photos');

CREATE POLICY "Service role update for fighter photos" ON storage.objects FOR UPDATE USING (bucket_id = 'fighter-photos');