-- Create speaker-zips storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('speaker-zips', 'speaker-zips', false);

-- Storage RLS: professors can upload to their own folder
CREATE POLICY "professors_upload_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'speaker-zips'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage RLS: professors can read their own files
CREATE POLICY "professors_read_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'speaker-zips'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Storage RLS: professors can delete their own files
CREATE POLICY "professors_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'speaker-zips'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
